// Admin operations over the org-source store: register / refresh / remove / list Confluence pages.
import { parseClauses } from './parse.js';

export const SOURCE_KEY_RE = /^[A-Za-z][A-Za-z0-9-]{1,30}$/;
const ARCHIVED_STATUS_SET = new Set(['archived', 'trashed', 'deleted', 'historical', 'superseded', 'deprecated', 'repealed', 'obsolete']);
const ARCHIVED_LABEL_RE = /^(?:archived|superseded|deprecated|repealed|obsolete)$/iu;
const ARCHIVED_TITLE_RE = /^\s*\[(?:ARCHIVED|SUPERSEDED|DEPRECATED|REPEALED|OBSOLETE|已归档|已废止)\]/iu;

/**
 * @param {{ store: object, client: object, now?: () => Date, registeredBy?: string|null }} opts
 *   client must expose getConfluencePage(id) → { id, title, status?, url, text, version }.
 */
export function createOrgSourceAdmin({ store, client, now, registeredBy = null } = {}) {
  const nowFn = now ?? (() => new Date());

  async function registerPage({ pageId, sourceKey } = {}) {
    const key = String(sourceKey ?? '').trim();
    if (!SOURCE_KEY_RE.test(key)) {
      throw new Error(`Invalid sourceKey "${key}": expected ^[A-Za-z][A-Za-z0-9-]{1,30}$ (2-31 chars, starting with a letter).`);
    }
    const page = await client.getConfluencePage(pageId);
    let labels = Array.isArray(page?.labels) ? page.labels : undefined;
    if (!labels && typeof client?.getConfluenceLabels === 'function') {
      try {
        const fetched = await client.getConfluenceLabels(page?.id ?? pageId);
        if (Array.isArray(fetched) && fetched.length) labels = fetched;
      } catch {
        // Optional label inspection: never block page registration if label read fails.
      }
    }
    const statusRaw = page?.status !== undefined ? String(page.status) : undefined;
    const isArchived = Boolean(
      page?.archived === true
      || (statusRaw && ARCHIVED_STATUS_SET.has(statusRaw.toLowerCase()))
      || (Array.isArray(labels) && labels.some((l) => ARCHIVED_LABEL_RE.test(String(l).trim())))
      || ARCHIVED_TITLE_RE.test(String(page?.title ?? '')),
    );
    const parsed = parseClauses(page?.text, { sourceKey: key, title: page?.title });
    const record = {
      sourceKey: key,
      title: page?.title ?? null,
      pageId: page?.id ?? pageId,
      pageUrl: page?.url ?? null,
      version: page?.version ?? null,
      registeredBy,
      registeredAt: nowFn().toISOString(),
      clauses: parsed.clauses,
    };
    if (statusRaw !== undefined) record.status = statusRaw;
    if (isArchived) record.archived = true;
    if (page?.supersededBy !== undefined) record.supersededBy = page.supersededBy;
    if (page?.repealed !== undefined) record.repealed = page.repealed;
    if (labels && labels.length) record.labels = labels;
    await store.register(record);
    return { sourceKey: key, clauses: parsed.clauses.length, ...(statusRaw !== undefined ? { status: statusRaw } : {}), ...(isArchived ? { archived: true } : {}) };
  }

  async function canonicalKey(sourceKey) {
    const wanted = String(sourceKey ?? '').trim().toLowerCase();
    const hit = (await store.list()).find((s) => String(s.sourceKey ?? '').toLowerCase() === wanted);
    return hit ? hit.sourceKey : String(sourceKey ?? '').trim();
  }

  return {
    registerPage,

    /** Re-fetch the stored page and overwrite the source with its current clauses and lifecycle status. */
    async refresh(sourceKey) {
      const key = await canonicalKey(sourceKey);
      const existing = await store.get(key);
      if (!existing) throw new Error(`Org source not registered: ${sourceKey}`);
      return registerPage({ pageId: existing.pageId, sourceKey: key });
    },

    async remove(sourceKey) {
      return store.remove(await canonicalKey(sourceKey));
    },

    /** [{ sourceKey, title, pageUrl, clauses, registeredAt, status?, archived? }] — clauses is the clause count. */
    async list() {
      const heads = await store.list();
      const out = [];
      for (const s of heads) {
        const clauses = s.chunks
          ? (await store.get(s.sourceKey)).clauses
          : (Array.isArray(s.clauses) ? s.clauses : []);
        const entry = {
          sourceKey: s.sourceKey,
          title: s.title ?? null,
          pageUrl: s.pageUrl ?? null,
          clauses: clauses.length,
          registeredAt: s.registeredAt ?? null,
        };
        if (s.status !== undefined) entry.status = s.status;
        if (s.archived !== undefined) entry.archived = Boolean(s.archived);
        out.push(entry);
      }
      return out;
    },
  };
}
