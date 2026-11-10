// Event-triggered re-checks. Atlassian `avi:*:updated` events land here; eligible content is pushed
// onto the `citecheck-recheck` queue and the `consumer` re-verifies it and writes an audit record.
// Everything external is injected (`actions` / `store` / `client` / `queue` / `audit`), so tests run
// on fakes only; @forge/events and @forge/kvs are imported lazily when nothing was injected.

import { createStore } from '../handlers/store.js';
import { createAuditStore } from '../audit/auditStore.js';

export const RECHECK_QUEUE_KEY = 'citecheck-recheck';
export const DEBOUNCE_MS = 60_000;
export const LEGAL_REVIEW_LABEL = 'legal-review';

function str(v) {
  return v == null ? null : String(v).trim() || null;
}

/** HTTP status from an error (status/statusCode prop or "HTTP 404" in the message); 0 when unknown. */
function statusOf(err) {
  const raw = err?.status ?? err?.statusCode ?? String(err?.message ?? '').match(/HTTP (\d{3})/)?.[1];
  const n = Number(raw);
  return Number.isFinite(n) && n >= 400 && n < 600 ? n : 0;
}

/**
 * @param {{ actions?: object, store?: object, client?: object, queue?: object, audit?: object,
 *          now?: () => Date, ownAccount?: string }} opts
 *   actions: reuse src/handlers/actions.js (verifyContent). store: src/handlers/store.js (getResult).
 *   client: src/handlers/atlassian.js (getConfluenceLabels / getJiraLabels). queue: { push(items) }.
 *   audit: src/audit/auditStore.js (record). now: injectable clock. ownAccount: the app's own
 *   atlassianId, used to skip self-inflicted Jira events.
 */
export function createEventHandlers(opts = {}) {
  const actions = opts.actions ?? null;
  const client = opts.client ?? null;
  const nowFn = opts.now ?? (() => new Date());
  const ownAccountDefault = str(opts.ownAccount);
  let injectedQueue = opts.queue ?? null;
  let injectedStore = opts.store ?? null;
  let injectedAudit = opts.audit ?? null;

  /** Lazy default queue: @forge/events is only imported when nothing was injected. */
  const resolveQueue = async () => {
    if (injectedQueue) return injectedQueue;
    const { Queue } = await import('@forge/events');
    injectedQueue = new Queue({ key: RECHECK_QUEUE_KEY });
    return injectedQueue;
  };
  const resolveStore = async () => {
    if (!injectedStore) injectedStore = createStore();
    return injectedStore;
  };
  const resolveAudit = async () => {
    if (!injectedAudit) injectedAudit = createAuditStore();
    return injectedAudit;
  };

  async function labelsOf(kind, arg) {
    const fn = kind === 'confluence' ? client?.getConfluenceLabels : client?.getJiraLabels;
    if (typeof fn !== 'function') return [];
    try {
      return (await fn.call(client, arg)) ?? [];
    } catch {
      return []; // unreadable labels must not break the trigger; eligibility can still come from prev result
    }
  }

  async function prevResult(product, id) {
    const store = await resolveStore();
    return typeof store?.getResult === 'function' ? store.getResult(product, id) : null;
  }

  /** Skip when verified within the last 60 s, or when this exact version was already verified. */
  function duplicateOf(prev, version) {
    if (prev?.verifiedAt) {
      const age = nowFn().getTime() - new Date(prev.verifiedAt).getTime();
      if (age >= 0 && age < DEBOUNCE_MS) return 'debounced';
    }
    if (version != null && prev?.version != null && String(prev.version) === String(version)) {
      return 'duplicate-version';
    }
    return null;
  }

  async function enqueue(product, id, version, reason) {
    const queue = await resolveQueue();
    await queue.push([{ body: { product, id, version, reason } }]);
    return { queued: true, reason };
  }

  return {
    /** `avi:confluence:updated:page` → queue a re-check when labelled legal-review or previously verified. */
    async onConfluenceUpdated(event) {
      const id = str(event?.content?.id);
      if (!id) return { queued: false, reason: 'missing-content-id' };
      const version = event?.content?.version?.number ?? null;
      const labels = await labelsOf('confluence', id);
      const byLabel = labels.includes(LEGAL_REVIEW_LABEL);
      const prev = await prevResult('confluence', id);
      if (!byLabel && !prev) return { queued: false, reason: 'not-eligible' };
      const dup = duplicateOf(prev, version);
      if (dup) return { queued: false, reason: dup };
      return enqueue('confluence', id, version, byLabel ? 'legal-review-label' : 'previous-result');
    },

    /**
     * `avi:jira:updated:issue` → queue a re-check when labelled legal-review or previously verified.
     * Skips our own writes (changelog touching only labels/comment) and our own account's events.
     */
    async onJiraUpdated(event, context = {}) {
      const key = str(event?.issue?.key);
      if (!key) return { queued: false, reason: 'missing-issue-key' };
      const own = str(context.ownAccount ?? context.appAccountId ?? context.accountId ?? ownAccountDefault);
      const actor = str(event?.atlassianId);
      if (actor && own && actor === own) return { queued: false, reason: 'own-event' };

      const items = Array.isArray(event?.changelog?.items) ? event.changelog.items : [];
      const touched = items.map((i) => i?.field).filter(Boolean);
      if (touched.length && touched.every((f) => f === 'labels' || f === 'comment')) {
        return { queued: false, reason: 'own-write' };
      }

      const fields = event?.issue?.fields ?? {};
      const labels = Array.isArray(fields.labels) ? fields.labels : await labelsOf('jira', key);
      const byLabel = Array.isArray(labels) && labels.includes(LEGAL_REVIEW_LABEL);
      const version = event?.version ?? event?.issue?.version ?? fields.version ?? null;
      const prev = await prevResult('jira', key);
      if (!byLabel && !prev) return { queued: false, reason: 'not-eligible' };
      const dup = duplicateOf(prev, version);
      if (dup) return { queued: false, reason: dup };
      return enqueue('jira', key, version, byLabel ? 'legal-review-label' : 'previous-result');
    },

    /**
     * Queue consumer: re-run verifyContent for the queued item, stamp the version onto the stored
     * result, and record an audit entry. 4xx → { ok:false, error }; 5xx → rethrow for platform retry.
     */
    async consumer(event) {
      const body = event?.body ?? event?.payload ?? event ?? {};
      const product = str(body.product) ?? (body.contentId ? 'confluence' : body.issueKey ? 'jira' : null);
      const id = str(body.id) ?? str(body.contentId) ?? str(body.issueKey);
      if (!product || !id || !actions) return { ok: false, error: 'NO_TARGET' };
      const store = await resolveStore();
      const audit = await resolveAudit();
      try {
        const payload = product === 'jira' ? { issueKey: id } : { contentId: id };
        // the actions record the audit entry themselves when they own an audit store
        const result = await actions.verifyContent(payload, { trigger: 'event' });
        if (body.version != null) {
          // store version on the result so later triggers can dedup on it
          await store.saveResult(product, id, { ...result, version: body.version }, str(body.accountId));
        }
        if (actions.recordsAudit !== true) {
          await audit.record({
            product,
            id,
            accountId: str(body.accountId),
            verifiedAt: result?.verifiedAt ?? nowFn().toISOString(),
            summary: result?.summary ?? { total: 0, flagged: 0, verified: 0, unverifiable: 0 },
            trigger: 'event',
          });
        }
        return { ok: true, result };
      } catch (err) {
        if (statusOf(err) >= 500) throw err; // platform retries 5xx
        return { ok: false, error: err?.message ?? String(err) };
      }
    },
  };
}
