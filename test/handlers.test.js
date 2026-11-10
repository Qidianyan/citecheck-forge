// SPEC B handlers tests — Node built-ins only, fakes for api/kvs/client/store.
// Deliberately does NOT import src/index.js or src/resolver.js (they pull in @forge/*).

import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { storageToText, adfToText } from '../src/handlers/text.js';
import { createAtlassianClient } from '../src/handlers/atlassian.js';
import { buildReport, toMarkdown, toConfluenceStorage, toJiraAdf, labelFor, summaryLine, byteSize, fitPayload, MAX_ROWS } from '../src/handlers/report.js';
import { createStore } from '../src/handlers/store.js';
import { createActions, resolveTarget } from '../src/handlers/actions.js';
import { verify } from '../src/core/index.js';

// ── fakes ────────────────────────────────────────────────────────────────

function fakeRoute(strings, ...vals) {
  return strings.reduce((acc, s, i) => acc + s + (i < vals.length ? encodeURIComponent(String(vals[i])) : ''), '');
}

/** @forge/api-shaped fake: records every request, replays canned responses by URL prefix. */
function fakeApi(calls, responses = []) {
  return {
    route: fakeRoute,
    asUser: () => ({
      requestConfluence: async (url, init) => respond(calls, 'confluence', url, init, responses),
      requestJira: async (url, init) => respond(calls, 'jira', url, init, responses),
    }),
  };
}

async function respond(calls, product, url, init, responses) {
  calls.push({ product, url, method: init?.method, body: init?.body });
  for (const [prefix, res] of responses) {
    if (url.startsWith(prefix)) return typeof res === 'function' ? res() : res;
  }
  return { ok: true, status: 200, json: async () => ({}) };
}

const json = (obj) => ({ ok: true, status: 200, json: async () => obj });

function fakeClient(opts = {}) {
  const calls = [];
  const page = opts.page ?? { id: '42', title: 'Spec page', version: 3, text: opts.pageText ?? '', url: '/wiki/pages/42' };
  const issue = opts.issue ?? { key: 'LEGAL-1', summary: 'Spec issue', text: opts.issueText ?? '', url: '/browse/LEGAL-1' };
  return {
    calls,
    async getConfluencePage(id) { calls.push(['getConfluencePage', id]); return { ...page, id }; },
    async getJiraIssue(key) { calls.push(['getJiraIssue', key]); return { ...issue, key }; },
    async postConfluenceFooterComment(id, html) { calls.push(['postConfluenceFooterComment', id, html]); return { ok: true }; },
    async addConfluenceLabels(id, labels) { calls.push(['addConfluenceLabels', id, labels]); return { ok: true }; },
    async postJiraComment(key, doc) { calls.push(['postJiraComment', key, doc]); return { ok: true }; },
    async addJiraLabels(key, labels) { calls.push(['addJiraLabels', key, labels]); return { ok: true }; },
  };
}

function fakeStore() {
  const saved = [];
  return {
    saved,
    async saveResult(product, id, report, accountId) { saved.push({ product, id, report, accountId }); return report; },
    async getResult() { return null; },
  };
}

function fakeKvs() {
  const map = new Map();
  return {
    map,
    async set(k, v) { map.set(k, JSON.parse(JSON.stringify(v))); },
    async get(k) { return map.has(k) ? map.get(k) : null; },
  };
}

const NOW = () => new Date('2026-11-10T12:00:00.000Z');
const actions = (overrides = {}) => createActions({
  client: fakeClient(), store: fakeStore(), now: NOW, ...overrides,
});

// ── text.js ──────────────────────────────────────────────────────────────

test('storageToText: table rows become lines, cells ` | `-separated', () => {
  const out = storageToText('<p>Intro</p><table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>');
  assert.equal(out, 'Intro\na | b\nc | d');
});

test('storageToText: decodes named, decimal and hex entities', () => {
  const out = storageToText('<p>A &amp; B &lt;c&gt; &quot;q&quot; &#39;x&#39; D&nbsp;E &#65; &#x42;</p>');
  assert.equal(out, 'A & B <c> "q" \'x\' D\u00a0E A B');
});

test('storageToText: list items newline-separated, 3+ newlines collapse', () => {
  const out = storageToText('<ul><li>one</li><li>two</li></ul>\n\n\n\n<p>after</p>');
  assert.equal(out, 'one\n\ntwo\n\nafter');
});

test('storageToText: keeps code macro bodies verbatim (incl. angle brackets)', () => {
  const out = storageToText('<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[if (a < b) { return 1; }]]></ac:plain-text-body></ac:structured-macro>');
  assert.ok(out.includes('if (a < b) { return 1; }'));
});

test('adfToText: nested lists, mentions and hardBreak', () => {
  const adf = {
    type: 'doc', version: 1, content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Hi ' }, { type: 'mention', attrs: { text: '@ana' } }, { type: 'hardBreak' }, { type: 'text', text: 'there' }] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
          { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'nested' }] }] }] },
        ] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }] },
      ] },
    ],
  };
  const out = adfToText(adf);
  assert.equal(out, 'Hi @ana\nthere\none\nnested\ntwo');
});

// ── atlassian.js ─────────────────────────────────────────────────────────

test('atlassian client: getConfluencePage GETs the storage-format v2 path', async () => {
  const calls = [];
  const api = fakeApi(calls, [[
    '/wiki/api/v2/pages/123?body-format=storage',
    json({ id: '123', title: 'T', version: { number: 2 }, body: { storage: { value: '<p>hi</p>' } }, _links: { base: 'https://x', webui: '/wiki/x' } }),
  ]]);
  const page = await createAtlassianClient({ api }).getConfluencePage('123');
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[0].url, '/wiki/api/v2/pages/123?body-format=storage');
  assert.deepEqual([page.id, page.title, page.version, page.text, page.url], ['123', 'T', 2, 'hi', 'https://x/wiki/x']);
});

test('atlassian client: getJiraIssue concatenates summary, description and comments', async () => {
  const calls = [];
  const adf = (t) => ({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
  const api = fakeApi(calls, [[
    '/rest/api/3/issue/LEG-1?fields=summary,description,comment',
    json({ key: 'LEG-1', fields: { summary: 'S', description: adf('D'), comment: { comments: [{ body: adf('C1') }, { body: adf('C2') }] } } }),
  ]]);
  const issue = await createAtlassianClient({ api }).getJiraIssue('LEG-1');
  assert.equal(calls[0].url, '/rest/api/3/issue/LEG-1?fields=summary,description,comment');
  assert.equal(issue.text, 'S\nD\nC1\nC2');
  assert.equal(issue.url, '/browse/LEG-1');
});

test('atlassian client: footer comment, labels, jira comment and jira labels bodies', async () => {
  const calls = [];
  const api = fakeApi(calls);
  const c = createAtlassianClient({ api });
  await c.postConfluenceFooterComment('123', '<p>r</p>');
  await c.addConfluenceLabels('123', ['citecheck-flagged']);
  await c.postJiraComment('LEG-1', { type: 'doc', version: 1 });
  await c.addJiraLabels('LEG-1', ['citecheck-verified']);
  assert.deepEqual(calls[0], { product: 'confluence', url: '/wiki/api/v2/footer-comments', method: 'POST', body: { pageId: '123', body: { representation: 'storage', value: '<p>r</p>' } } });
  assert.deepEqual(calls[1].body, [{ prefix: 'global', name: 'citecheck-flagged' }]);
  assert.equal(calls[2].url, '/rest/api/3/issue/LEG-1/comment');
  assert.deepEqual(calls[2].body, { body: { type: 'doc', version: 1 } });
  assert.deepEqual(calls[3].body, { update: { labels: [{ add: 'citecheck-verified' }] } });
});

test('atlassian client: non-2xx throws with status and short body', async () => {
  const api = fakeApi([], [['/wiki', { ok: false, status: 404, text: async () => 'Page not found' }]]);
  await assert.rejects(() => createAtlassianClient({ api }).getConfluencePage('9'), /HTTP 404 Page not found/);
});

// ── report.js ────────────────────────────────────────────────────────────

const flagged = buildReport(verify('Điều 45 Luật 91/2025/QH15 nói sai.', { asOf: '2026-11-10' }), {
  source: { type: 'confluence', id: '1', title: 'My page' }, asOf: '2026-11-10', verifiedAt: '2026-11-10T00:00:00.000Z',
});

test('toMarkdown: every data row starts and ends with |, Type column shows H-types', () => {
  const md = toMarkdown(flagged);
  const rows = md.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| #') && !l.startsWith('| ---'));
  assert.equal(rows.length, 1);
  assert.ok(rows[0].endsWith(' |'));
  assert.ok(/\| H1 \|/.test(rows[0]), rows[0]);
  assert.ok(!rows[0].includes('statute'));
});

test('summaryLine: source object renders readable, never [object Object]', () => {
  assert.ok(summaryLine(flagged).includes('Source: My page.'));
  const jira = summaryLine(buildReport([], { source: { type: 'jira', key: 'LEGAL-1', summary: 's' } }));
  assert.ok(jira.includes('Source: LEGAL-1.'));
  const text = summaryLine(buildReport([], { source: { type: 'text' } }));
  assert.ok(text.includes('Source: pasted text.'));
  assert.ok(!summaryLine(flagged).includes('[object Object]'));
});

test('toConfluenceStorage: escapes script tags and keeps the report table', () => {
  const r = buildReport([{ citation: 'X', verdict: 'ARTICLE_NOT_FOUND', law: 'L' }], {});
  r.rows[0].reason_en = '<script>alert(1)</script>';
  const html = toConfluenceStorage(r);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.startsWith('<h3>CiteCheck citation report</h3>'));
  assert.ok(html.includes('<table>') && html.includes('</table>'));
});

test('toJiraAdf: valid doc v1 with header row + one row per report row', () => {
  const adf = toJiraAdf(flagged);
  assert.equal(adf.type, 'doc');
  assert.equal(adf.version, 1);
  const table = adf.content.find((n) => n.type === 'table');
  assert.equal(table.content.length, flagged.rows.length + 1);
  assert.equal(table.content[0].content[0].type, 'tableHeader');
});

test('buildReport: truncates at 60 rows with flagged first', () => {
  const results = [];
  for (let i = 0; i < 70; i++) {
    results.push({ citation: `Art ${i}`, verdict: i < 5 ? 'ARTICLE_NOT_FOUND' : 'EXISTS_CONSISTENT', law: 'VN-X', article: String(i) });
  }
  const r = buildReport(results, {});
  assert.equal(r.rows.length, 60);
  assert.equal(r.truncated, true);
  assert.ok(r.rows.every((row, i) => i < 5 ? row.flagged : !row.flagged));
});

test('buildReport summary + labelFor verdicts', () => {
  const r = buildReport([
    { citation: 'a', verdict: 'EXISTS_CONSISTENT', law: 'L' },
    { citation: 'b', verdict: 'EXISTS_UNQUOTED', law: 'L' },
    { citation: 'c', verdict: 'ARTICLE_NOT_FOUND', law: 'L' },
    { citation: 'd', verdict: 'UNVERIFIABLE', law: null },
  ], {});
  assert.deepEqual([r.summary.total, r.summary.flagged, r.summary.verified, r.summary.unverifiable], [4, 1, 2, 1]);
  assert.deepEqual(r.summary.by_h_type, { H1: 1 });
  assert.equal(labelFor(r), 'citecheck-flagged');
  assert.equal(labelFor(buildReport([{ citation: 'a', verdict: 'EXISTS_CONSISTENT', law: 'L' }], {})), 'citecheck-verified');
  assert.equal(labelFor(buildReport([], {})), null);
});

// ── actions.js ───────────────────────────────────────────────────────────

test('resolveTarget precedence: text > contentId > issueKey > context', () => {
  assert.equal(resolveTarget({ text: 't', contentId: '1', issueKey: 'A-1' }).kind, 'text');
  assert.equal(resolveTarget({ contentId: '1', issueKey: 'A-1' }).kind, 'confluence');
  assert.equal(resolveTarget({ issueKey: 'LEGAL-1' }).kind, 'jira');
  assert.equal(resolveTarget({ context: { confluence: { contentId: '7' } } }).kind, 'confluence');
  assert.equal(resolveTarget({ context: { jira: { issueKey: 'LEGAL-1' } } }).kind, 'jira');
});

test('resolveTarget: invalid explicit ids fall back to context, else NO_TARGET', () => {
  assert.equal(resolveTarget({ issueKey: 'bad-key', context: { jira: { issueKey: 'LEGAL-1' } } }).issueKey, 'LEGAL-1');
  assert.equal(resolveTarget({ contentId: 'abc', context: { confluence: { contentId: '9' } } }).contentId, '9');
  assert.equal(resolveTarget({ issueKey: 'bad', contentId: 'x' }), null);
});

test('extractCitations: scans supplied text and maps citation fields', async () => {
  const out = await actions().extractCitations({ text: 'Điều 45 Luật 91/2025/QH15.' }, {});
  assert.equal(out.source.type, 'text');
  assert.equal(out.citations[0].citation, 'Điều 45');
  assert.equal(out.citations[0].type, 'statute');
  assert.equal(out.citations[0].law, 'VN-91-2025-QH15');
  assert.ok('article' in out.citations[0] && 'clause' in out.citations[0] && 'quote' in out.citations[0]);
});

test('extractCitations / verifyContent: NO_TARGET without text, id or context', async () => {
  const a = actions();
  assert.equal((await a.extractCitations({}, {})).error, 'NO_TARGET');
  assert.equal((await a.verifyContent({}, {})).error, 'NO_TARGET');
});

test('verifyContent: flags a fake Confluence page, saves it, returns markdown', async () => {
  const client = fakeClient({ pageText: 'Điều 45 Luật 91/2025/QH15 được quy định tại đây.' });
  const store = fakeStore();
  const out = await actions({ client, store }).verifyContent({ contentId: '42' }, { accountId: 'u-1' });
  assert.ok(out.summary.flagged >= 1);
  assert.ok(out.rows[0].hallucination_types.includes('H1'));
  assert.ok(out.markdown.startsWith('CiteCheck citation report'));
  assert.equal(store.saved.length, 1);
  assert.equal(store.saved[0].product, 'confluence');
  assert.equal(store.saved[0].accountId, 'u-1');
});

test('verifyCitation: English cyber-security citation on 2026-11-10 → NOT_IN_FORCE/H5', async () => {
  const out = await actions().verifyCitation({
    citation: 'Article 12 of Vietnam\'s Law on Cyber Security No. 24/2018/QH14', asOf: '2026-11-10',
  }, {});
  assert.equal(out.summary.flagged, 1);
  assert.equal(out.results[0].verdict, 'NOT_IN_FORCE');
  assert.ok(out.results[0].hallucination_types.includes('H5'));
});

test('verifyCitation: NOT_A_CITATION for prose', async () => {
  const out = await actions().verifyCitation({ citation: 'hello world' }, {});
  assert.equal(out.error, 'NOT_A_CITATION');
  assert.ok(out.hint.includes('Điều'));
});

test('listSources: 30 laws, VN/ID/TH counts, country filter and in_force flags', async () => {
  const all = await actions().listSources({});
  assert.equal(all.sources.length, 30);
  assert.deepEqual([all.counts.VN, all.counts.ID, all.counts.TH], [16, 8, 6]);
  const vn = await actions().listSources({ country: 'vn' });
  assert.equal(vn.sources.length, 16);
  assert.ok(vn.sources.every((s) => s.country === 'VN' && typeof s.in_force === 'boolean' && 'law_id' in s && 'source_page' in s));
  const repealed = all.sources.find((s) => s.law_id === 'VN-ANM-24-2018-QH14');
  assert.equal(repealed.in_force, false);
});

test('postConfluenceReport: comment then label, flagged label chosen', async () => {
  const client = fakeClient({ pageText: 'Điều 45 Luật 91/2025/QH15.' });
  const store = fakeStore();
  const out = await actions({ client, store }).postConfluenceReport({ contentId: '42' }, { accountId: 'u-9' });
  assert.equal(out.posted, true);
  assert.equal(out.label, 'citecheck-flagged');
  const kinds = client.calls.map((c) => c[0]);
  assert.equal(kinds.indexOf('postConfluenceFooterComment'), kinds.indexOf('addConfluenceLabels') - 1);
  assert.ok(client.calls.find((c) => c[0] === 'postConfluenceFooterComment')[2].includes('<table>'));
  assert.equal(store.saved[0].accountId, 'u-9');
});

test('postJiraReport: clean content → verified label skipped when null, comment is ADF', async () => {
  const client = fakeClient({ issueText: 'Không có trích dẫn nào ở đây cả.' });
  const store = fakeStore();
  const out = await actions({ client, store }).postJiraReport({ issueKey: 'LEGAL-1' }, { accountId: 'u-9' });
  assert.equal(out.label, null);
  const kinds = client.calls.map((c) => c[0]);
  assert.ok(!kinds.includes('addJiraLabels'));
  const doc = client.calls.find((c) => c[0] === 'postJiraComment')[2];
  assert.equal(doc.type, 'doc');
  assert.equal(doc.version, 1);
  assert.equal(store.saved.length, 1);
  assert.equal(store.saved[0].product, 'jira');
  assert.equal(store.saved[0].id, 'LEGAL-1');
});

test('verifyContent: accountId comes from context, never from inputs', async () => {
  const store = fakeStore();
  await actions({ client: fakeClient({ pageText: 'Điều 12 Luật 91/2025/QH15.' }), store })
    .verifyContent({ contentId: '42', accountId: 'EVIL', context: { accountId: 'ALSO-EVIL' } }, { accountId: 'REAL' });
  assert.equal(store.saved[0].accountId, 'REAL');
});

// ── store.js ─────────────────────────────────────────────────────────────

test('store: sanitised keys, result payload only (no legacy audit:* KVS keys)', async () => {
  const kvs = fakeKvs();
  const store = createStore({ kvs });
  const report = buildReport(verify('Điều 45 Luật 91/2025/QH15.', { asOf: '2026-11-10' }), { verifiedAt: '2026-11-10T00:00:00Z' });
  await store.saveResult('confluence', '42;DROP', report, 'u-1');
  const keys = [...kvs.map.keys()];
  assert.ok(keys.some((k) => /^result:confluence:[a-zA-Z0-9:._-]+$/.test(k) && k.startsWith('result:confluence:42')));
  assert.ok(!keys.some((k) => k.startsWith('audit:')), 'saveResult must not write legacy audit:* keys');
  assert.deepEqual(await store.getResult('confluence', '42;DROP'), report);
});

test('store: trims original_excerpt to keep JSON under 200 KB', async () => {
  const kvs = fakeKvs();
  const store = createStore({ kvs });
  const huge = { summary: { total: 1 }, rows: [{ original_excerpt: 'x'.repeat(250 * 1024) }] };
  await store.saveResult('jira', 'K-1', huge, null);
  const stored = kvs.map.get([...kvs.map.keys()].find((k) => k.startsWith('result:')));
  assert.ok(JSON.stringify(stored).length < 200 * 1024);
  assert.equal(stored.rows[0].original_excerpt, undefined);
});

test('store: getResult returns null when nothing saved', async () => {
  assert.equal(await createStore({ kvs: fakeKvs() }).getResult('confluence', '1'), null);
});

// ── Task H hardening ────────────────────────────────────────────────

const MISATTRIBUTED = 'Pasal 10 UU PDP menyatakan bahwa Subjek Data Pribadi berhak menarik kembali persetujuan pemrosesan Data Pribadi tentang dirinya yang telah diberikan kepada Pengendali Data Pribadi.';
const NUMERIC_CLAIM = 'Pasal 67 UU No. 27 Tahun 2022 mengancam pidana denda maksimal 1 miliar rupiah.';
const CJK_RE = /[\u3400-\u9fff]/u;
const ALLOWED_CJK_FIELDS = new Set(['citation', 'sentence', 'original_excerpt', 'quote']);

/** Recursively assert no CJK character survives anywhere except the whitelisted source-text fields. */
function assertNoCjk(value, path = '$') {
  if (typeof value === 'string') {
    const m = value.match(CJK_RE);
    assert.equal(m, null, `CJK leak at ${path}: ${m?.[0]}`);
    return;
  }
  if (Array.isArray(value)) { value.forEach((v, i) => assertNoCjk(v, `${path}[${i}]`)); return; }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (ALLOWED_CJK_FIELDS.has(k)) continue;
      assertNoCjk(v, `${path}.${k}`);
    }
  }
}

/** A synthetic page with 2,000 citations (one per line). */
function bigPage(n = 2000) {
  const lines = [];
  for (let i = 0; i < n; i++) lines.push(`Điều ${(i % 45) + 1} Luật 91/2025/QH15 được quy định tại đây.`);
  return lines.join('\n');
}

test('content checks: verifyContent flags the misattributed Pasal 10 paraphrase (crossref on)', async () => {
  const out = await actions().verifyContent({ text: MISATTRIBUTED }, {});
  const row = out.rows[0];
  assert.equal(row.verdict, 'CONTENT_MISMATCH');
  assert.ok(row.hallucination_types.includes('H3'));
  assert.equal(row.suggested_article, '9');
  assert.equal(row.crossref.kind, 'misattributed');
  assert.ok(row.crossref.excerpt.length <= 300);
  assert.ok(row.reason_en.includes('article 9'));
  assert.ok(!('reason' in row), 'the legacy Chinese reason field must not leak into rows');
});

test('content checks: verifyCitation runs with crossref on and stays English-only', async () => {
  const out = await actions().verifyCitation({
    citation: 'Pasal 10 UU No. 27 Tahun 2022',
    quote: 'Subjek Data Pribadi berhak menarik kembali persetujuan pemrosesan Data Pribadi tentang dirinya yang telah diberikan kepada Pengendali Data Pribadi.',
  }, {});
  assert.equal(out.results[0].verdict, 'CONTENT_MISMATCH');
  assertNoCjk(out);
});

test('content checks: numeric findings surface as English advisories, verdict unchanged', async () => {
  const out = await actions().verifyContent({ text: NUMERIC_CLAIM }, {});
  const row = out.rows[0];
  assert.equal(row.verdict, 'EXISTS_UNQUOTED');
  assert.ok(Array.isArray(row.advisories));
  assert.ok(row.advisories.length >= 1 && row.advisories.length <= 3);
  assert.ok(row.advisories.every((a) => typeof a === 'string' && !CJK_RE.test(a)));
  assert.match(row.advisories[0], /^Check the figures:/);
  assert.equal(row.suggested_article, null);
  assert.ok(row.sentence.length <= 300);
  assert.ok(!('translation_excerpt' in row));
});

test('buildReport: advisories capped at 3 message_en strings', () => {
  const r = buildReport([{ citation: 'x', verdict: 'EXISTS_UNQUOTED', law: 'L', advisories: [1, 2, 3, 4, 5].map((i) => ({ message_en: `note ${i}` })) }], {});
  assert.deepEqual(r.rows[0].advisories, ['note 1', 'note 2', 'note 3']);
});

test('renderers append advisories to the Why cell as "Note: …"', async () => {
  const out = await actions().verifyContent({ text: NUMERIC_CLAIM }, {});
  assert.ok(toMarkdown(out).includes('Note: Check the figures:'));
  assert.ok(toConfluenceStorage(out).includes('Note: Check the figures:'));
  assert.ok(JSON.stringify(toJiraAdf(out)).includes('Note: Check the figures:'));
});

test('payload limits: all six actions serialise under 200 KB on a 2,000-citation page', async () => {
  const big = bigPage();
  const client = fakeClient({ pageText: big, issueText: big });
  const a = actions({ client });
  const outs = [
    await a.extractCitations({ text: big }, {}),
    await a.verifyCitation({ citation: 'Điều 45 Luật 91/2025/QH15', quote: 'quy định tại đây' }, {}),
    await a.verifyContent({ text: big }, {}),
    await a.listSources({}),
    await a.postConfluenceReport({ contentId: '42' }, {}),
    await a.postJiraReport({ issueKey: 'LEGAL-1' }, {}),
  ];
  for (const [i, o] of outs.entries()) assert.ok(byteSize(o) < 200 * 1024, `action #${i} must stay < 200 KB`);
  assert.equal(outs[0].citations.length, 300);
  assert.equal(outs[0].truncated, true);
  assert.equal(outs[0].total, 2000);
  assert.equal(outs[2].rows.length, MAX_ROWS);
  assert.equal(outs[2].truncated, true);
  assert.equal(outs[2].summary.total, 2000);
});

test('payload limits: the stored KVS result behind getStatus stays under the 240 KiB cap', async () => {
  const client = fakeClient({ pageText: bigPage() });
  const kvs = fakeKvs();
  const store = createStore({ kvs });
  const out = await actions({ client, store }).verifyContent({ contentId: '42' }, { accountId: 'u-1' });
  assert.ok(byteSize(out) < 200 * 1024);
  const stored = await store.getResult('confluence', '42');
  assert.ok(stored, 'result must be stored');
  assert.ok(byteSize(stored) <= 240 * 1024);
  assert.equal(stored.truncated, true);
  assert.equal(stored.summary.total, 2000);
  assert.ok(![...kvs.map.keys()].some((k) => k.startsWith('audit:')), 'no legacy audit:* keys may be written');
});

test('store: trims a giant report under the 240 KiB KVS cap and writes no audit keys', async () => {
  const kvs = fakeKvs();
  const store = createStore({ kvs });
  const huge = { summary: { total: 1 }, rows: [{ original_excerpt: 'x'.repeat(250 * 1024), sentence: 'y'.repeat(250 * 1024) }] };
  await store.saveResult('jira', 'K-1', huge, null);
  const stored = kvs.map.get([...kvs.map.keys()].find((k) => k.startsWith('result:')));
  assert.ok(byteSize(stored) <= 240 * 1024);
  assert.equal([...kvs.map.keys()].some((k) => k.startsWith('audit:')), false);
});

test('fitPayload: trims oversized results below the 200 KB action cap', () => {
  const big = { summary: { total: 1 }, rows: [{ original_excerpt: 'x'.repeat(250 * 1024) }] };
  const out = fitPayload(big);
  assert.ok(byteSize(out) < 200 * 1024);
});

test('English only: no CJK in any action output on demo_memo_en.txt', async () => {
  const memo = readFileSync(new URL('./fixtures/demo_memo_en.txt', import.meta.url), 'utf8');
  const client = fakeClient({ pageText: memo, issueText: memo });
  const a = actions({ client });
  const outs = [
    await a.extractCitations({ text: memo }, {}),
    await a.verifyCitation({ citation: 'Điều 9 Luật 91/2025/QH15', quote: memo.slice(0, 80) }, {}),
    await a.verifyContent({ text: memo }, {}),
    await a.listSources({}),
    await a.postConfluenceReport({ contentId: '42' }, {}),
    await a.postJiraReport({ issueKey: 'LEGAL-1' }, {}),
  ];
  for (const o of outs) assertNoCjk(o);
});

test('audit: verifyContent records exactly one entry per call (rovo default, manual override)', async () => {
  const recorded = [];
  const audit = { async record(rec) { recorded.push(rec); } };
  const a = actions({ client: fakeClient({ pageText: 'Điều 45 Luật 91/2025/QH15.' }), audit });
  assert.equal(a.recordsAudit, true);
  await a.verifyContent({ contentId: '42' }, {});
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].trigger, 'rovo');
  assert.equal(recorded[0].product, 'confluence');
  assert.equal(recorded[0].id, '42');
  assert.equal(recorded[0].summary.total, 1);
  await a.verifyContent({ contentId: '42' }, { trigger: 'manual', accountId: 'u-1' });
  assert.equal(recorded.length, 2);
  assert.equal(recorded[1].trigger, 'manual');
  assert.equal(recorded[1].accountId, 'u-1');
  // text targets are never persisted, so they leave no audit entry
  await a.verifyContent({ text: 'Điều 45 Luật 91/2025/QH15.' }, {});
  assert.equal(recorded.length, 2);
});
