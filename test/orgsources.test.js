// Task O tests — organisation-specific law sources: parse / extract / store / verify / admin / model.
// Node built-ins only; the kvs Custom Entity Store, the Confluence client and quoteScore are faked.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseClauses } from '../src/orgsources/parse.js';
import { extractOrgCitations } from '../src/orgsources/extract.js';
import { createOrgSourceStore } from '../src/orgsources/store.js';
import { verifyOrgCitations } from '../src/orgsources/verify.js';
import { createOrgSourceAdmin } from '../src/orgsources/admin.js';
import { buildReport, toMarkdown } from '../src/handlers/report.js';
import { quoteScore } from '../src/core/index.js';
import {
  formErrors, toOrgRows, toOrgSourcesViewModel, validPageId, validSourceKey,
} from '../src/frontend/orgSourcesModel.js';

// ── fakes ────────────────────────────────────────────────────────────────

/** In-memory Custom Entity Store mock: entity('orgsource').query().index('by-source-key').getMany(). */
function fakeEntityKvs({ pageSize = 100 } = {}) {
  const map = new Map();
  let getManyCalls = 0;
  return {
    map,
    get getManyCalls() { return getManyCalls; },
    entity(name) {
      assert.equal(name, 'orgsource');
      return {
        set: async (k, v) => { map.set(k, JSON.parse(JSON.stringify(v))); },
        get: async (k) => (map.has(k) ? JSON.parse(JSON.stringify(map.get(k))) : null),
        delete: async (k) => map.delete(k),
        query: () => ({
          index: () => ({
            getMany: async ({ cursor } = {}) => {
              getManyCalls++;
              const start = cursor ? Number(cursor) : 0;
              const entries = [...map.entries()].map(([key, value]) => ({ key, value }));
              const results = entries.slice(start, start + pageSize);
              const nextCursor = start + pageSize < entries.length ? String(start + pageSize) : null;
              return { results, nextCursor };
            },
          }),
        }),
      };
    },
  };
}

function fakePageClient(getPage) {
  const calls = [];
  return {
    calls,
    async getConfluencePage(id) {
      calls.push(String(id));
      return { ...getPage(id), id: String(id) };
    },
  };
}

const POLICY_PAGE = {
  title: 'Internal Access Policy',
  url: 'https://wiki.example.com/pages/77',
  version: 4,
  text: [
    '§ 3 Data retention',
    'Personal data must be deleted within 30 days.',
    '§ 4 Access logs',
    'Access logs are reviewed monthly by the security team.',
  ].join('\n'),
};

// ── parse.js ─────────────────────────────────────────────────────────────

test('parse: § / Section / Clause / Article / numbered headings incl. markdown form', () => {
  const text = [
    '§ 3 Data retention', 'Body of three.',
    'Section 4 Access', 'Body of four.',
    'Clause 12.4 Liability', 'Body of twelve.',
    'Article 5 Governing law', 'Body of five.',
    '9. Numbered heading', 'Body of nine.',
    '7) Bracket heading', 'Body of seven.',
    '11.', 'Body of eleven.',
    '12.4 Bare multi-part', 'Body of twelve four.',
    '### 6. Markdown heading', 'Body of six.',
  ].join('\n');
  const { sourceKey, title, clauses } = parseClauses(text, { sourceKey: 'POL-7', title: 'Policy' });
  assert.equal(sourceKey, 'POL-7');
  assert.equal(title, 'Policy');
  assert.deepEqual(clauses.map((c) => c.id), ['3', '4', '12.4', '5', '9', '7', '11', '12.4', '6']);
  assert.deepEqual(clauses.map((c) => c.heading), [
    'Data retention', 'Access', 'Liability', 'Governing law', 'Numbered heading',
    'Bracket heading', '', 'Bare multi-part', 'Markdown heading',
  ]);
  assert.equal(clauses[0].text, 'Body of three.');
  assert.equal(clauses[6].text, 'Body of eleven.');
  assert.equal(clauses[8].text, 'Body of six.');
});

test('parse: nested 3.1 under 3 — parent keeps only its own lines', () => {
  const { clauses } = parseClauses([
    '§ 3 Top clause', 'Own line of three.',
    '§ 3.1 Nested', 'Nested body.',
    '§ 3.2 Nested two', 'More body.',
  ].join('\n'));
  assert.deepEqual(clauses.map((c) => c.id), ['3', '3.1', '3.2']);
  assert.equal(clauses[0].text, 'Own line of three.');
  assert.equal(clauses[1].text, 'Nested body.');
  assert.equal(clauses[2].text, 'More body.');
});

test('parse: numbering inside sentences is ignored', () => {
  const { clauses } = parseClauses([
    'The policy has 3 main points and 12.4 items.',
    'See Section 3 and Clause 12.4 mid-sentence.',
    'In 2024 we updated 7 pages.',
    '3 years later the rule changed.',
    '',
  ].join('\n'));
  assert.deepEqual(clauses, []);
});

// ── extract.js ───────────────────────────────────────────────────────────

test('extract: all documented patterns in both orders', () => {
  const text = [
    'Policy POL-7 §3',
    'POL-7 § 3.1',
    'POL-7 section 3',
    'Section 3 of POL-7',
    'Clause 12.4 of MSA-2025',
    'MSA-2025 cl. 12.4',
    'MSA-2025, clause 12.4',
    'Article 5 of the MSA-2025',
  ].join('\n');
  const rows = extractOrgCitations(text, ['POL-7', 'MSA-2025']);
  assert.equal(rows.length, 8);
  assert.deepEqual(rows.map((r) => [r.sourceKey, r.clause]), [
    ['POL-7', '3'], ['POL-7', '3.1'], ['POL-7', '3'], ['POL-7', '3'],
    ['MSA-2025', '12.4'], ['MSA-2025', '12.4'], ['MSA-2025', '12.4'], ['MSA-2025', '5'],
  ]);
  assert.equal(rows[0].citation, 'Policy POL-7 §3');
  assert.equal(rows[3].citation, 'Section 3 of POL-7');
  assert.equal(rows[5].citation, 'MSA-2025 cl. 12.4');
  assert.ok(rows.every((r) => r.sentence && r.sentence.length > 0));
});

test('extract: unregistered keys ignored, matching is case-insensitive', () => {
  const rows = extractOrgCitations('POL-7 § 3 and Other-1 § 2 and pol-7 section 4', ['POL-7']);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.sourceKey === 'POL-7'));
  assert.equal(extractOrgCitations('POL-7 § 3', []).length, 0);
  assert.equal(extractOrgCitations('', ['POL-7']).length, 0);
});

test('extract: quote capture (straight and curly) and sentence field', () => {
  const straight = extractOrgCitations('POL-7 § 3 says "delete all data" now', ['POL-7']);
  assert.equal(straight[0].quote, 'delete all data');
  assert.equal(straight[0].sentence, 'POL-7 § 3 says "delete all data" now');
  const curly = extractOrgCitations('POL-7 § 3 says “keep nothing” here', ['POL-7']);
  assert.equal(curly[0].quote, 'keep nothing');
  const none = extractOrgCitations('POL-7 § 3 applies.', ['POL-7']);
  assert.equal(none[0].quote, null);
});

// ── store.js ─────────────────────────────────────────────────────────────

test('store: register/get round-trip keeps the documented value shape', async () => {
  const kvs = fakeEntityKvs();
  const store = createOrgSourceStore({ kvs });
  const value = {
    sourceKey: 'POL-7', title: 'Policy', pageId: '7', pageUrl: '/p/7', version: 2,
    registeredBy: 'u-1', registeredAt: '2026-11-10T00:00:00.000Z',
    clauses: [{ id: '3', heading: 'h', text: 't' }],
  };
  await store.register(value);
  assert.deepEqual(await store.get('POL-7'), value);
  assert.equal(await store.get('NOPE'), null);
  for (const [, v] of kvs.map) {
    assert.ok(Buffer.byteLength(JSON.stringify(v)) <= 240 * 1024);
  }
  assert.equal(kvs.map.get('src:POL-7').title, 'Policy');
});

test('store: sources over 240 KiB are chunked and get() re-assembles them', async () => {
  const kvs = fakeEntityKvs();
  const store = createOrgSourceStore({ kvs });
  const big = {
    sourceKey: 'BIG', title: 'Big policy', pageId: '9', pageUrl: '/p/9', version: 1,
    registeredBy: null, registeredAt: '2026-11-10T00:00:00.000Z',
    clauses: [
      { id: '1', heading: '', text: 'a'.repeat(180 * 1024) },
      { id: '2', heading: '', text: 'b'.repeat(180 * 1024) },
    ],
  };
  const head = await store.register(big);
  assert.ok(head.chunks >= 2);
  assert.deepEqual(head.clauses, []);
  for (const [k, v] of kvs.map) {
    assert.ok(Buffer.byteLength(JSON.stringify(v)) <= 240 * 1024, k);
  }
  assert.ok(kvs.map.has('src:BIG#1') && kvs.map.has('src:BIG#2'));
  const got = await store.get('BIG');
  assert.equal(got.clauses.length, 2);
  assert.equal(got.clauses[0].text.length, 180 * 1024);
  assert.equal(got.clauses[1].text.length, 180 * 1024);
  assert.equal(got.title, 'Big policy');
});

test('store: re-registering replaces stale chunk items', async () => {
  const kvs = fakeEntityKvs();
  const store = createOrgSourceStore({ kvs });
  await store.register({
    sourceKey: 'BIG', title: 't', pageId: '1', pageUrl: null, version: 1, registeredBy: null,
    registeredAt: 't', clauses: [{ id: '1', text: 'a'.repeat(200 * 1024) }, { id: '2', text: 'b'.repeat(200 * 1024) }],
  });
  await store.register({
    sourceKey: 'BIG', title: 't2', pageId: '1', pageUrl: null, version: 2, registeredBy: null,
    registeredAt: 't', clauses: [{ id: '1', text: 'small' }],
  });
  assert.equal([...kvs.map.keys()].some((k) => k.includes('#')), false);
  const got = await store.get('BIG');
  assert.equal(got.clauses.length, 1);
  assert.equal(got.version, 2);
  assert.equal(got.chunks, undefined);
});

test('store: list follows cursors and returns heads only; keys() lists source keys', async () => {
  const kvs = fakeEntityKvs({ pageSize: 2 });
  const store = createOrgSourceStore({ kvs });
  for (const k of ['A-1', 'B-2', 'C-3']) {
    await store.register({ sourceKey: k, title: k, pageId: '1', pageUrl: null, version: 1, registeredBy: null, registeredAt: 't', clauses: [] });
  }
  await kvs.entity('orgsource').set('src:A-1#1', { clauses: [{ id: '1', text: 'orphan chunk' }] });
  const heads = await store.list();
  assert.deepEqual(heads.map((s) => s.sourceKey), ['A-1', 'B-2', 'C-3']);
  assert.ok(kvs.getManyCalls >= 2, 'list must follow cursors');
  assert.deepEqual(await store.keys(), ['A-1', 'B-2', 'C-3']);
});

test('store: remove deletes head and chunks; keys stay consistent', async () => {
  const kvs = fakeEntityKvs();
  const store = createOrgSourceStore({ kvs });
  await store.register({
    sourceKey: 'BIG', title: 't', pageId: '1', pageUrl: null, version: 1, registeredBy: null,
    registeredAt: 't', clauses: [{ id: '1', text: 'a'.repeat(200 * 1024) }, { id: '2', text: 'b'.repeat(200 * 1024) }],
  });
  assert.equal(await store.remove('BIG'), true);
  assert.equal(await store.get('BIG'), null);
  assert.equal([...kvs.map.keys()].some((key) => key.startsWith('src:BIG')), false);
  assert.equal(await store.remove('NOPE'), false);
});

// ── admin.js ─────────────────────────────────────────────────────────────

test('admin: registerPage fetches the page, parses clauses and stores them', async () => {
  const kvs = fakeEntityKvs();
  const store = createOrgSourceStore({ kvs });
  const client = fakePageClient(() => POLICY_PAGE);
  const admin = createOrgSourceAdmin({
    store, client, now: () => new Date('2026-11-10T00:00:00.000Z'), registeredBy: 'u-1',
  });
  assert.deepEqual(await admin.registerPage({ pageId: '77', sourceKey: 'POL-7' }), { sourceKey: 'POL-7', clauses: 2 });
  assert.equal(client.calls[0], '77');
  const stored = await store.get('POL-7');
  assert.deepEqual([stored.title, stored.pageId, stored.pageUrl, stored.version, stored.registeredBy],
    ['Internal Access Policy', '77', 'https://wiki.example.com/pages/77', 4, 'u-1']);
  assert.deepEqual(stored.clauses[0], { id: '3', heading: 'Data retention', text: 'Personal data must be deleted within 30 days.' });
  assert.deepEqual(await admin.list(), [{
    sourceKey: 'POL-7', title: 'Internal Access Policy', pageUrl: 'https://wiki.example.com/pages/77',
    clauses: 2, registeredAt: '2026-11-10T00:00:00.000Z',
  }]);
});

test('admin: invalid source keys are rejected', async () => {
  const admin = createOrgSourceAdmin({
    store: createOrgSourceStore({ kvs: fakeEntityKvs() }),
    client: fakePageClient(() => POLICY_PAGE),
  });
  for (const bad of ['7bad', 'a', 'A'.repeat(32), 'bad key!', '']) {
    await assert.rejects(() => admin.registerPage({ pageId: '1', sourceKey: bad }), /sourceKey/i);
  }
});

test('admin: refresh re-fetches the page; remove deletes it', async () => {
  let version = 4;
  const client = fakePageClient(() => ({ ...POLICY_PAGE, version }));
  const store = createOrgSourceStore({ kvs: fakeEntityKvs() });
  const admin = createOrgSourceAdmin({ store, client });
  await admin.registerPage({ pageId: '77', sourceKey: 'POL-7' });
  version = 5;
  assert.deepEqual(await admin.refresh('pol-7'), { sourceKey: 'POL-7', clauses: 2 });
  assert.equal((await store.get('POL-7')).version, 5);
  assert.equal(client.calls.length, 2);
  assert.equal(await admin.remove('POL-7'), true);
  assert.deepEqual(await admin.list(), []);
  await assert.rejects(() => admin.refresh('POL-7'), /not registered/i);
});

// ── verify.js (end-to-end through admin.registerPage) ────────────────────

test('verify: all five verdicts end-to-end through a mocked Confluence page', async () => {
  const store = createOrgSourceStore({ kvs: fakeEntityKvs() });
  const admin = createOrgSourceAdmin({ store, client: fakePageClient(() => POLICY_PAGE) });
  await admin.registerPage({ pageId: '77', sourceKey: 'POL-7' });

  const text = [
    'Policy POL-7 §3 says: "Personal data must be deleted within 30 days."',
    'POL-7 section 4 applies to every team.',
    'Clause 99 of POL-7 was breached.',
    'POL-7 § 3 claims "banana telephone fabricated nonsense xyz".',
    'POL-7 § 3 partly matches: "Personal data must be reviewed weekly by team".',
  ].join('\n');
  const rows = await verifyOrgCitations(text, { store, quoteScore });

  assert.equal(rows.length, 5);
  for (const r of rows) {
    assert.equal(r.type, 'org');
    assert.equal(r.clause, null);
    assert.equal(r.law, 'POL-7');
    assert.equal(r.law_title, 'Internal Access Policy');
    assert.equal(r.evidence, 'https://wiki.example.com/pages/77');
    assert.ok(r.original_excerpt == null || r.original_excerpt.length <= 1200);
  }
  assert.deepEqual(rows.map((r) => r.verdict), [
    'EXISTS_CONSISTENT', 'EXISTS_UNQUOTED', 'ARTICLE_NOT_FOUND', 'CONTENT_MISMATCH', 'EXISTS_UNQUOTED',
  ]);
  assert.equal(rows[0].quote_score, 1);
  assert.equal(rows[0].article, '3');
  assert.equal(rows[2].article, '99');
  assert.deepEqual(rows[2].hallucination_types, ['H1']);
  assert.ok(rows[2].reason_en.includes('99'));
  assert.equal(rows[3].quote_score, 0);
  assert.deepEqual(rows[3].hallucination_types, ['H4']);
  assert.equal(rows[4].quote_score, 0.5);
  assert.equal(rows[4].reason_en, 'partial match');
  assert.equal(rows[1].quote, undefined); // org rows carry quote_score, not quote
  assert.equal(rows[1].quote_score, null);
});

test('verify: UNVERIFIABLE when the registered key has no stored source', async () => {
  const ghost = { keys: async () => ['GHOST-1'], get: async () => null };
  const rows = await verifyOrgCitations('GHOST-1 § 1 claims "anything".', { store: ghost });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].verdict, 'UNVERIFIABLE');
  assert.equal(rows[0].evidence, null);
  assert.equal(rows[0].original_excerpt, null);
  assert.ok(rows[0].reason_en.includes('GHOST-1'));
});

// ── report rendering ─────────────────────────────────────────────────────

test('render: org rows go through buildReport + toMarkdown without [object Object]', async () => {
  const store = createOrgSourceStore({ kvs: fakeEntityKvs() });
  const admin = createOrgSourceAdmin({ store, client: fakePageClient(() => POLICY_PAGE) });
  await admin.registerPage({ pageId: '77', sourceKey: 'POL-7' });
  const rows = await verifyOrgCitations([
    'POL-7 § 3 says "Personal data must be deleted within 30 days."',
    'Clause 99 of POL-7 was breached.',
    'POL-7 § 3 claims "totally fabricated banana telephone".',
  ].join('\n'), { store, quoteScore });
  const report = buildReport(rows, {
    source: { type: 'confluence', id: '77', title: 'Policy page' }, asOf: '2026-11-10', verifiedAt: '2026-11-10T00:00:00.000Z',
  });
  const md = toMarkdown(report);
  assert.ok(!md.includes('[object Object]'));
  assert.ok(md.startsWith('CiteCheck citation report'));
  assert.ok(md.includes('POL-7'));
  assert.ok(md.includes('Internal Access Policy'));
  assert.ok(md.includes('https://wiki.example.com/pages/77'));
  assert.ok(/\| H1 \|/.test(md), md);
  assert.ok(/\| H4 \|/.test(md), md);
  assert.equal(report.rows.length, 3);
});

// ── orgSourcesModel.js ───────────────────────────────────────────────────

test('model: validation, form errors, rows and view-model', () => {
  assert.equal(validSourceKey('POL-7'), true);
  assert.equal(validSourceKey('MSA-2025'), true);
  assert.equal(validSourceKey('a'), false);
  assert.equal(validSourceKey('7bad'), false);
  assert.equal(validSourceKey('A'.repeat(32)), false);
  assert.equal(validPageId('42'), true);
  assert.equal(validPageId('abc'), false);
  assert.deepEqual(formErrors({ pageId: '1', sourceKey: 'POL-7' }), {});
  assert.deepEqual(Object.keys(formErrors({ pageId: 'x', sourceKey: '9' })), ['pageId', 'sourceKey']);

  const rows = toOrgRows([{ sourceKey: 'POL-7', title: 'T', pageUrl: '/p/1', clauses: 3, registeredAt: '2026-11-10' }]);
  assert.deepEqual(rows[0], { sourceKey: 'POL-7', title: 'T', pageUrl: '/p/1', clauses: 3, registeredAt: '2026-11-10' });

  const vm = toOrgSourcesViewModel([{ sourceKey: 'POL-7', title: 'T', pageUrl: null, clauses: 1, registeredAt: null }]);
  assert.equal(vm.total, 1);
  assert.equal(vm.empty, false);
  assert.equal(vm.chipText, '1 organisation source registered');
  const empty = toOrgSourcesViewModel([]);
  assert.equal(empty.empty, true);
  assert.ok(empty.chipText.includes('No organisation sources'));
});
