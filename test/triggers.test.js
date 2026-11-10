// Task T — event triggers + recheck consumer tests. Fakes for actions/store/client/queue/audit only;
// this file never imports @forge/*.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEventHandlers } from '../src/triggers/events.js';

const T0 = new Date('2026-11-10T12:00:00.000Z');
const now = () => new Date(T0);

const fakeQueue = () => {
  const pushed = [];
  return { pushed, async push(items) { pushed.push(...items); } };
};
const fakeAudit = () => {
  const recorded = [];
  return { recorded, async record(rec) { recorded.push(rec); return rec; } };
};
const fakeStore = (prev = null) => {
  const saved = [];
  return {
    saved,
    async getResult() { return prev; },
    async saveResult(product, id, report, accountId) { saved.push({ product, id, report, accountId }); return report; },
  };
};
const fakeClient = (labels = {}) => {
  const calls = [];
  return {
    calls,
    async getConfluenceLabels(id) { calls.push(['getConfluenceLabels', id]); return labels[id] ?? []; },
    async getJiraLabels(key) { calls.push(['getJiraLabels', key]); return labels[key] ?? []; },
  };
};
const defaultActions = {
  async verifyContent(payload, context) {
    return { payload, context, verifiedAt: now().toISOString(), summary: { total: 1, flagged: 0, verified: 1, unverifiable: 0 } };
  },
};

function handlers(over = {}) {
  return createEventHandlers({
    actions: over.actions ?? defaultActions,
    store: over.store ?? fakeStore(over.prev ?? null),
    client: over.client ?? fakeClient(over.labels ?? {}),
    queue: over.queue ?? fakeQueue(),
    audit: over.audit ?? fakeAudit(),
    now,
    ownAccount: over.ownAccount ?? null,
  });
}

// ── Confluence trigger ──────────────────────────────────────────────────

test('confluence: queued when the page has the legal-review label', async () => {
  const queue = fakeQueue();
  const h = handlers({ labels: { '101': ['legal-review'] }, queue });
  const out = await h.onConfluenceUpdated({
    eventType: 'avi:confluence:updated:page',
    content: { id: '101', type: 'page', version: { number: 5 } },
  });
  assert.deepEqual(out, { queued: true, reason: 'legal-review-label' });
  assert.equal(queue.pushed.length, 1);
  assert.deepEqual(queue.pushed[0], {
    body: { product: 'confluence', id: '101', version: 5, reason: 'legal-review-label' },
  });
});

test('confluence: queued when a previous result exists (no label)', async () => {
  const queue = fakeQueue();
  const h = handlers({ prev: { verifiedAt: '2026-11-01T00:00:00.000Z' }, queue });
  const out = await h.onConfluenceUpdated({ content: { id: '7' } });
  assert.deepEqual(out, { queued: true, reason: 'previous-result' });
  assert.equal(queue.pushed[0].body.product, 'confluence');
  assert.equal(queue.pushed[0].body.version, null);
});

test('confluence: not eligible without the label and without a previous result', async () => {
  const queue = fakeQueue();
  const h = handlers({ queue });
  const out = await h.onConfluenceUpdated({ content: { id: '9', version: { number: 1 } } });
  assert.deepEqual(out, { queued: false, reason: 'not-eligible' });
  assert.equal(queue.pushed.length, 0);
});

test('confluence: debounced within 60 s of the last verification, queued once older', async () => {
  const fresh = handlers({ prev: { verifiedAt: new Date(T0.getTime() - 30_000).toISOString() } });
  assert.deepEqual(await fresh.onConfluenceUpdated({ content: { id: '1' } }), { queued: false, reason: 'debounced' });
  const stale = handlers({ prev: { verifiedAt: new Date(T0.getTime() - 61_000).toISOString() } });
  assert.equal((await stale.onConfluenceUpdated({ content: { id: '1' } })).queued, true);
});

test('confluence: the same version is skipped, a newer version is queued', async () => {
  const h = handlers({ prev: { verifiedAt: '2026-11-01T00:00:00.000Z', version: 7 } });
  assert.deepEqual(await h.onConfluenceUpdated({ content: { id: '1', version: { number: 7 } } }), { queued: false, reason: 'duplicate-version' });
  assert.deepEqual(await h.onConfluenceUpdated({ content: { id: '1', version: { number: 8 } } }), { queued: true, reason: 'previous-result' });
});

test('confluence: missing content id is never queued', async () => {
  const queue = fakeQueue();
  const h = handlers({ queue });
  assert.deepEqual(await h.onConfluenceUpdated({ content: { type: 'page' } }), { queued: false, reason: 'missing-content-id' });
  assert.equal(queue.pushed.length, 0);
});

// ── Jira trigger ────────────────────────────────────────────────────────

test('jira: eligible from event fields.labels without any client call', async () => {
  const client = fakeClient({});
  const queue = fakeQueue();
  const h = handlers({ client, queue });
  const out = await h.onJiraUpdated({
    eventType: 'avi:jira:updated:issue',
    issue: { key: 'LEGAL-1', id: '2', fields: { labels: ['legal-review', 'other'] } },
  });
  assert.deepEqual(out, { queued: true, reason: 'legal-review-label' });
  assert.equal(client.calls.length, 0);
});

test('jira: falls back to client.getJiraLabels when fields.labels is missing', async () => {
  const client = fakeClient({ 'LEGAL-7': ['legal-review'] });
  const queue = fakeQueue();
  const h = handlers({ client, queue });
  const out = await h.onJiraUpdated({ issue: { key: 'LEGAL-7', fields: { summary: 'x' } } });
  assert.deepEqual(out, { queued: true, reason: 'legal-review-label' });
  assert.deepEqual(client.calls[0], ['getJiraLabels', 'LEGAL-7']);
});

test('jira: own writes (changelog touching only labels/comment) are skipped', async () => {
  const queue = fakeQueue();
  const h = handlers({ queue });
  const own = {
    eventType: 'avi:jira:updated:issue',
    issue: { key: 'LEGAL-1', id: '2', fields: { labels: ['legal-review'] } },
    changelog: { items: [{ field: 'labels' }, { field: 'comment' }] },
  };
  assert.deepEqual(await h.onJiraUpdated(own), { queued: false, reason: 'own-write' });
  assert.equal(queue.pushed.length, 0);

  const mixed = { ...own, changelog: { items: [{ field: 'summary' }, { field: 'labels' }] } };
  assert.equal((await h.onJiraUpdated(mixed)).queued, true);
  assert.equal(queue.pushed.length, 1);
});

test('jira: skipped when atlassianId is the app own account (from handler context)', async () => {
  const queue = fakeQueue();
  const h = handlers({ queue });
  const ev = { issue: { key: 'LEGAL-1', fields: { labels: ['legal-review'] } }, atlassianId: 'app-1' };
  assert.deepEqual(await h.onJiraUpdated(ev, { ownAccount: 'app-1' }), { queued: false, reason: 'own-event' });
  assert.equal(queue.pushed.length, 0);
  const out = await h.onJiraUpdated({ ...ev, atlassianId: 'u-2' }, { ownAccount: 'app-1' });
  assert.equal(out.queued, true);
});

// ── Queue consumer ──────────────────────────────────────────────────────

test('consumer: verifyContent + audit.record for confluence and jira bodies (payload/payload fallbacks)', async () => {
  const calls = [];
  const actions = {
    async verifyContent(payload, context) {
      calls.push([payload, context]);
      return { verifiedAt: '2026-11-10T12:00:00.000Z', summary: { total: 2, flagged: 1, verified: 1, unverifiable: 0 } };
    },
  };
  const audit = fakeAudit();
  const store = fakeStore(null);
  const h = handlers({ actions, audit, store });

  const out = await h.consumer({ body: { product: 'confluence', id: '101', version: 3, reason: 'legal-review-label', accountId: 'u-9' } });
  assert.equal(out.ok, true);
  assert.deepEqual(calls[0], [{ contentId: '101' }, {}]);

  await h.consumer({ body: { product: 'jira', id: 'LEGAL-2', reason: 'previous-result' } });
  assert.deepEqual(calls[1], [{ issueKey: 'LEGAL-2' }, {}]);

  await h.consumer({ payload: { product: 'confluence', id: '5', version: 1 } });
  assert.deepEqual(calls[2], [{ contentId: '5' }, {}]);

  assert.equal(audit.recorded.length, 3);
  assert.deepEqual(audit.recorded[0], {
    product: 'confluence', id: '101', accountId: 'u-9',
    verifiedAt: '2026-11-10T12:00:00.000Z',
    summary: { total: 2, flagged: 1, verified: 1, unverifiable: 0 },
    trigger: 'event',
  });
  // version is stamped onto the stored result so later triggers can dedup on it
  assert.equal(store.saved[0].product, 'confluence');
  assert.equal(store.saved[0].id, '101');
  assert.equal(store.saved[0].report.version, 3);
  assert.equal(store.saved[0].accountId, 'u-9');
});

test('consumer: 4xx → { ok:false, error }; 5xx → rethrown so the platform retries', async () => {
  const h404 = handlers({ actions: { verifyContent: async () => { throw new Error('Atlassian API request failed: HTTP 404 nope'); } } });
  const out = await h404.consumer({ body: { product: 'confluence', id: '1' } });
  assert.equal(out.ok, false);
  assert.match(out.error, /HTTP 404/);

  const err503 = Object.assign(new Error('HTTP 503 down'), { status: 503 });
  const h503 = handlers({ actions: { verifyContent: async () => { throw err503; } } });
  await assert.rejects(() => h503.consumer({ body: { product: 'jira', id: 'L-1' } }), /HTTP 503/);
});
