// Share / forward / export, end-to-end on a fake @forge/api site (no network, no real people).
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAtlassianClient } from '../src/handlers/atlassian.js';
import { createStore } from '../src/handlers/store.js';
import { createActions } from '../src/handlers/actions.js';
import { buildReport, toMarkdown, toConfluenceStorage, toJiraAdf, statusOf, statusMacro } from '../src/handlers/report.js';
import { createShareActions, targetOf } from '../src/share/shareActions.js';
import { reportPageTitle, exportFilename, toForwardStorage, toForwardAdf, toReportPageStorage, ACCOUNT_ID_RE } from '../src/share/render.js';
import { verify } from '../src/core/index.js';

const MEMO = readFileSync(new URL('../demo/demo_memo_v2_en.txt', import.meta.url), 'utf8');
const LEGAL12 = readFileSync(new URL('../demo/LEGAL-12_jira_issue.md', import.meta.url), 'utf8');
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const NOW = () => new Date('2026-11-10T12:00:00.000Z');
const ALEX = '557058:f00d-cafe-0001';
const CTX = { accountId: 'actor-0001', siteUrl: 'https://example.atlassian.net' };

const route = (strings, ...vals) => strings.reduce((a, s, i) => a + s + (i < vals.length ? encodeURIComponent(String(vals[i])) : ''), '');
const adf = (t) => ({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] });
const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** Tiny in-memory Atlassian site. mode: 'ok' | 'forbidden' | 'assign-forbidden'. */
function fakeSite({ pageTitle = 'Data retention memo', pageText = MEMO, mode = 'ok' } = {}) {
  const calls = [];
  const pages = new Map([['123', { id: '123', title: pageTitle, spaceId: '999', storage: `<p>${esc(pageText).replaceAll('\n', '</p><p>')}</p>` }]]);
  const comments = [];
  let nextId = 500;
  const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  async function handle(product, url, init = {}) {
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
    calls.push({ product, method, url, body, headers: init.headers });
    if (mode === 'forbidden' && method !== 'GET') return res(403, { message: 'forbidden' });
    if (product === 'confluence') {
      let m;
      if (method === 'GET' && (m = /^\/wiki\/api\/v2\/pages\/(\d+)\?/.exec(url))) {
        const p = pages.get(m[1]);
        return p ? res(200, { id: p.id, title: p.title, spaceId: p.spaceId, version: { number: 1 }, body: { storage: { value: p.storage } }, _links: { webui: `/spaces/LEG/pages/${p.id}` } }) : res(404, {});
      }
      if (method === 'POST' && url === '/wiki/api/v2/pages') {
        const id = String(nextId++);
        pages.set(id, { id, title: body.title, spaceId: body.spaceId, parentId: body.parentId, storage: body.body.value });
        return res(200, { id, _links: { webui: `/spaces/LEG/pages/${id}` } });
      }
      if (method === 'POST' && url === '/wiki/api/v2/footer-comments') { comments.push({ product, ...body }); return res(200, { id: String(nextId++) }); }
      if (url.includes('/labels') || url.includes('/label')) return res(200, { results: [] });
    } else {
      if (method === 'GET' && url.startsWith('/rest/api/3/issue/LEGAL-12?')) return res(200, { key: 'LEGAL-12', fields: { summary: 'Verify AI-drafted citations', description: adf(LEGAL12), comment: { comments: [] }, labels: ['legal-review'] } });
      if (method === 'POST' && url === '/rest/api/3/issue/LEGAL-12/comment') { comments.push({ product, ...body }); return res(201, { id: String(nextId++) }); }
      if (method === 'PUT' && url === '/rest/api/3/issue/LEGAL-12/assignee') return mode === 'assign-forbidden' ? res(403, {}) : res(204, {});
      if (method === 'PUT' && url === '/rest/api/3/issue/LEGAL-12') return res(204, {});
    }
    return res(404, {});
  }
  const api = { route, asUser: () => ({ requestConfluence: (u, i) => handle('confluence', u, i), requestJira: (u, i) => handle('jira', u, i) }) };
  return { api, calls, pages, comments };
}

function fakeKvs() {
  const map = new Map();
  return { map, async set(k, v) { map.set(k, JSON.parse(JSON.stringify(v))); }, async get(k) { return map.has(k) ? map.get(k) : null; } };
}

function setup(opts) {
  const site = fakeSite(opts);
  const client = createAtlassianClient({ api: site.api });
  const store = createStore({ kvs: fakeKvs() });
  const records = [];
  const audit = { async record(r) { records.push(JSON.parse(JSON.stringify(r))); } };
  const actions = createActions({ client, store, now: NOW });
  const share = createShareActions({ client, store, now: NOW, audit });
  return { site, client, store, actions, share, records };
}
const writes = (calls) => calls.filter((c) => c.method !== 'GET');

// ── Confluence path ─────────────────────────────────────────────────────

test('confluence: export before verification → NO_REPORT', async () => {
  const { share } = setup();
  assert.equal((await share.exportReport({ contentId: '123' }, CTX)).error, 'NO_REPORT');
});

test('confluence: full path verify → export → link → publish → forward, with audit', async () => {
  const { actions, share, site, records } = setup();
  await actions.verifyContent({ contentId: '123' }, CTX);
  const ex = await share.exportReport({ contentId: '123' }, CTX);
  assert.match(ex.markdown, /^CiteCheck citation report — 11 citation\(s\): 4 flagged/);
  assert.match(ex.markdown, /\*\*FLAGGED\*\*/);
  assert.equal(ex.filename, 'citecheck-confluence-123-2026-11-10.md');
  assert.ok(!EMOJI.test(ex.markdown));

  assert.deepEqual(await share.getShareLink({ contentId: '123' }, CTX), { url: 'https://example.atlassian.net/spaces/LEG/pages/123', absolute: true });
  assert.deepEqual(await share.getShareLink({ contentId: '123' }, {}), { url: '/spaces/LEG/pages/123', absolute: false });

  const pub = await share.publishReportPage({ contentId: '123' }, CTX);
  assert.equal(pub.published, true);
  assert.equal(pub.title, 'Citation check — Data retention memo — 2026-11-10');
  const post = site.calls.find((c) => c.method === 'POST' && c.url === '/wiki/api/v2/pages');
  assert.equal(post.body.spaceId, '999');
  assert.equal(post.body.parentId, '123');
  assert.equal(post.body.status, 'current');
  assert.equal(post.headers['Content-Type'], 'application/json');
  assert.match(post.body.body.value, /ac:name="status"/);
  assert.ok(!EMOJI.test(post.body.body.value));

  const fw = await share.forwardReport({ contentId: '123', accountId: ALEX, note: 'Please look before Friday.' }, CTX);
  assert.deepEqual(fw, { forwarded: true, mentioned: ALEX, assigned: false });
  const c = site.comments.at(-1);
  assert.match(c.body.value, new RegExp(`<ri:user ri:account-id="${ALEX}" />`));
  assert.match(c.body.value, /Please look before Friday\./);
  assert.deepEqual(records.map((r) => r.trigger), ['share:export', 'share:page', 'share:forward']);
});

test('confluence: forward without a note uses the default text', async () => {
  const { actions, share, site } = setup();
  await actions.verifyContent({ contentId: '123' }, CTX);
  await share.forwardReport({ contentId: '123', accountId: ALEX }, CTX);
  assert.match(site.comments.at(-1).body.value, /Please review the flagged citations in this citation check\./);
});

test('confluence: assign is rejected with ASSIGN_JIRA_ONLY and nothing is written', async () => {
  const { actions, share, site } = setup();
  await actions.verifyContent({ contentId: '123' }, CTX);
  const before = writes(site.calls).length;
  assert.equal((await share.forwardReport({ contentId: '123', accountId: ALEX, assign: true }, CTX)).error, 'ASSIGN_JIRA_ONLY');
  assert.equal(writes(site.calls).length, before);
});

test('confluence: target from the Forge context (byline) works without explicit ids', async () => {
  const { actions, share } = setup();
  await actions.verifyContent({ contentId: '123' }, CTX);
  const out = await share.exportReport({}, { ...CTX, extension: { content: { id: '123' } } });
  assert.ok(out.markdown);
});

test('confluence: 403 on publish → API_ERROR with a permission message, no audit entry', async () => {
  const { actions, share, records } = setup({ mode: 'forbidden' });
  await actions.verifyContent({ contentId: '123' }, CTX);
  const out = await share.publishReportPage({ contentId: '123' }, CTX);
  assert.equal(out.error, 'API_ERROR');
  assert.equal(out.status, 403);
  assert.match(out.message, /You don't have permission to create a page/);
  assert.equal(records.length, 0);
});

test('confluence: 403 on forward → API_ERROR', async () => {
  const { actions, share } = setup({ mode: 'forbidden' });
  await actions.verifyContent({ contentId: '123' }, CTX);
  const out = await share.forwardReport({ contentId: '123', accountId: ALEX }, CTX);
  assert.equal(out.error, 'API_ERROR');
  assert.match(out.message, /permission to comment here/);
});

test('publish on Jira → CONFLUENCE_ONLY', async () => {
  const { actions, share } = setup();
  await actions.verifyContent({ issueKey: 'LEGAL-12' }, CTX);
  assert.equal((await share.publishReportPage({ issueKey: 'LEGAL-12' }, CTX)).error, 'CONFLUENCE_ONLY');
});

// ── Jira path ───────────────────────────────────────────────────────────

test('jira: forward with assign → mention ADF with status nodes, then PUT assignee', async () => {
  const { actions, share, site, records } = setup();
  await actions.verifyContent({ issueKey: 'LEGAL-12' }, CTX);
  const out = await share.forwardReport({ issueKey: 'LEGAL-12', accountId: ALEX, note: 'Section 99?', assign: true }, CTX);
  assert.deepEqual(out, { forwarded: true, mentioned: ALEX, assigned: true });
  const comment = site.calls.find((c) => c.method === 'POST' && c.url.endsWith('/comment'));
  const doc = comment.body.body;
  assert.deepEqual(doc.content[0].content[0], { type: 'mention', attrs: { id: ALEX, text: '@teammate' } });
  const json = JSON.stringify(doc);
  assert.match(json, /"type":"status"/);
  assert.ok(!EMOJI.test(json));
  const put = site.calls.find((c) => c.method === 'PUT' && c.url.endsWith('/assignee'));
  assert.deepEqual(put.body, { accountId: ALEX });
  assert.ok(site.calls.indexOf(comment) < site.calls.indexOf(put));
  assert.deepEqual(records.map((r) => r.trigger), ['share:forward']);
});

test('jira: forward without assign → no PUT', async () => {
  const { actions, share, site } = setup();
  await actions.verifyContent({ issueKey: 'LEGAL-12' }, CTX);
  await share.forwardReport({ issueKey: 'LEGAL-12', accountId: ALEX }, CTX);
  assert.equal(site.calls.filter((c) => c.method === 'PUT' && c.url.endsWith('/assignee')).length, 0);
});

test('jira: assignment 403 after the comment → forwarded but not assigned, permission message', async () => {
  const { actions, share } = setup({ mode: 'assign-forbidden' });
  await actions.verifyContent({ issueKey: 'LEGAL-12' }, CTX);
  const out = await share.forwardReport({ issueKey: 'LEGAL-12', accountId: ALEX, assign: true }, CTX);
  assert.equal(out.forwarded, true);
  assert.equal(out.assigned, false);
  assert.match(out.message, /permission to assign/);
});

test('jira: export file name and share link use /browse/KEY', async () => {
  const { actions, share } = setup();
  await actions.verifyContent({ issueKey: 'LEGAL-12' }, CTX);
  assert.equal((await share.exportReport({ issueKey: 'LEGAL-12' }, CTX)).filename, 'citecheck-jira-LEGAL-12-2026-11-10.md');
  assert.equal((await share.getShareLink({ issueKey: 'LEGAL-12' }, CTX)).url, 'https://example.atlassian.net/browse/LEGAL-12');
});

// ── Validation ─────────────────────────────────────────────────────────

test('invalid targets → NO_TARGET', async () => {
  const { share } = setup();
  for (const bad of [{}, { contentId: '12a' }, { issueKey: 'legal-12' }, { contentId: '../1' }]) {
    assert.equal((await share.exportReport(bad, {})).error, 'NO_TARGET', JSON.stringify(bad));
  }
});

test('invalid account id is rejected before any API call', async () => {
  const { actions, share, site } = setup();
  await actions.verifyContent({ contentId: '123' }, CTX);
  const n = site.calls.length;
  for (const bad of ['"><script>', 'abc', '', 'x'.repeat(129), 'id with space']) {
    assert.equal((await share.forwardReport({ contentId: '123', accountId: bad }, CTX)).error, 'INVALID_ACCOUNT', bad);
  }
  assert.equal(site.calls.length, n);
});

test('note over 500 characters is rejected; note text never reaches the audit trail', async () => {
  const { actions, share, records } = setup();
  await actions.verifyContent({ issueKey: 'LEGAL-12' }, CTX);
  assert.equal((await share.forwardReport({ issueKey: 'LEGAL-12', accountId: ALEX, note: 'x'.repeat(501) }, CTX)).error, 'NOTE_TOO_LONG');
  await share.forwardReport({ issueKey: 'LEGAL-12', accountId: ALEX, note: 'SECRET-NOTE-TEXT', assign: true }, CTX);
  const dump = JSON.stringify(records);
  assert.ok(!dump.includes('SECRET-NOTE-TEXT'));
  assert.ok(!dump.includes(ALEX));
  assert.equal(records.at(-1).accountId, 'actor-0001');
});

test('share audit entries never overwrite the verification record time', async () => {
  const { actions, share, records } = setup();
  await actions.verifyContent({ contentId: '123' }, CTX);
  await share.exportReport({ contentId: '123' }, CTX);
  assert.equal(records[0].verifiedAt, NOW().toISOString());
  assert.equal(records[0].trigger, 'share:export');
});

// ── Escaping ───────────────────────────────────────────────────────────

test('escaping: hostile page title and note come out inert', async () => {
  const { actions, share, site } = setup({ pageTitle: '<img src=x onerror=alert(1)>' });
  await actions.verifyContent({ contentId: '123' }, CTX);
  const pub = await share.publishReportPage({ contentId: '123' }, CTX);
  assert.ok(pub.published);
  const post = site.calls.find((c) => c.url === '/wiki/api/v2/pages');
  assert.ok(!post.body.body.value.includes('<img'));
  assert.ok(post.body.body.value.includes('&lt;img src=x onerror=alert(1)&gt;'));
  await share.forwardReport({ contentId: '123', accountId: ALEX, note: ']]><script>alert(1)</script>' }, CTX);
  const body = site.comments.at(-1).body.value;
  assert.ok(!body.includes('<script>'));
  assert.ok(body.includes(']]&gt;&lt;script&gt;'));
});

test('renderers refuse an invalid account id even if called directly', () => {
  const report = buildReport(verify(MEMO, { asOf: '2026-11-10', crossref: true }), { asOf: '2026-11-10' });
  assert.throws(() => toForwardStorage(report, { accountId: '" onmouseover="x' }), /INVALID_ACCOUNT/);
  assert.throws(() => toForwardAdf(report, { accountId: '<x>' }), /INVALID_ACCOUNT/);
  assert.ok(ACCOUNT_ID_RE.test(ALEX));
});

test('page title is capped at 255 characters; export filename is safe', () => {
  const t = reportPageTitle({ source: { title: 'A'.repeat(400) } }, '2026-11-10');
  assert.ok(Array.from(t).length <= 255);
  assert.ok(t.endsWith(' — 2026-11-10'));
  assert.equal(exportFilename('jira', 'LEGAL-12/../x', '2026-11-10'), 'citecheck-jira-LEGAL-12____x-2026-11-10.md');
});

test('report page storage only links https or site-relative URLs', () => {
  const report = buildReport([], { source: { title: 'T' } });
  assert.ok(!toReportPageStorage(report, { link: 'javascript:alert(1)' }).includes('javascript:'));
  assert.ok(toReportPageStorage(report, { link: '/wiki/x' }).includes('href="/wiki/x"'));
});

// ── Renderers: no emoji, status labels ─────────────────────────────────

test('renderers: no emoji in Markdown, storage or ADF; status macro colours per verdict', () => {
  const report = buildReport(verify(MEMO, { asOf: '2026-11-10', crossref: true }), { asOf: '2026-11-10' });
  assert.ok(!EMOJI.test(toMarkdown(report)));
  assert.ok(!EMOJI.test(toConfluenceStorage(report)));
  assert.ok(!EMOJI.test(JSON.stringify(toJiraAdf(report))));
  const want = { CONTENT_MISMATCH: 'Red', ARTICLE_NOT_FOUND: 'Red', NOT_IN_FORCE: 'Yellow', EXISTS_CONSISTENT: 'Green', EXISTS_UNQUOTED: 'Grey', UNVERIFIABLE: 'Grey' };
  for (const [v, colour] of Object.entries(want)) {
    assert.equal(statusOf({ verdict: v }).colour, colour, v);
    assert.match(statusMacro({ verdict: v }), new RegExp(`<ac:parameter ac:name="colour">${colour}</ac:parameter>`));
  }
  assert.match(toMarkdown(report), /\*\*FLAGGED\*\* Misattributed: did you mean article 9\?/);
  assert.match(toMarkdown(report), /\*\*VERIFIED\*\*/);
  assert.match(toMarkdown(report), /\*\*NOT IN FORCE\*\*/);
});

test('targetOf: explicit ids win, then product/id, then Forge context', () => {
  assert.deepEqual(targetOf({ contentId: '5' }), { product: 'confluence', id: '5' });
  assert.deepEqual(targetOf({ product: 'jira', id: 'AB-1' }), { product: 'jira', id: 'AB-1' });
  assert.deepEqual(targetOf({}, { extension: { issue: { key: 'LEGAL-12' } } }), { product: 'jira', id: 'LEGAL-12' });
  assert.equal(targetOf({ contentId: 'x' }), null);
});
