import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRovoShareActions } from '../src/share/rovo.js';

function fakeShare() {
  const calls = [];
  const rec = (name) => async (input, ctx) => { calls.push({ name, input, ctx }); return name === 'getShareLink' ? { url: 'https://s/x', absolute: true } : { ok: true, markdown: 'md' }; };
  return { calls, share: { publishReportPage: rec('publishReportPage'), forwardReport: rec('forwardReport'), exportReport: rec('exportReport'), getShareLink: rec('getShareLink') } };
}

test('share-report page mode uses the Rovo context page', async () => {
  const { share, calls } = fakeShare();
  await createRovoShareActions(share).shareReport({ mode: 'page', context: { confluence: { contentId: '123' } } }, { accountId: 'actor-1' });
  assert.equal(calls[0].name, 'publishReportPage');
  assert.equal(calls[0].input.contentId, '123');
  assert.equal(calls[0].ctx.accountId, 'actor-1');
});

test('share-report forward passes accountId, note and a boolean assign', async () => {
  const { share, calls } = fakeShare();
  await createRovoShareActions(share).shareReport({ mode: 'forward', issueKey: 'LEGAL-12', accountId: '557058:abc', note: 'n', assign: 'true' }, {});
  assert.deepEqual(calls[0].input, { contentId: undefined, issueKey: 'LEGAL-12', accountId: '557058:abc', note: 'n', assign: true });
});

test('share-report rejects unknown modes without calling anything', async () => {
  const { share, calls } = fakeShare();
  assert.equal((await createRovoShareActions(share).shareReport({ mode: 'email' })).error, 'BAD_MODE');
  assert.equal(calls.length, 0);
});

test('export-report returns markdown plus link', async () => {
  const { share } = fakeShare();
  const out = await createRovoShareActions(share).exportReport({ context: { jira: { issueKey: 'LEGAL-12' } } }, {});
  assert.equal(out.link, 'https://s/x');
  assert.equal(out.markdown, 'md');
});

test('manifest declares share-report (CREATE) and export-report (GET) on the agent with handlers in index.js', async () => {
  const fs = await import('node:fs');
  const m = fs.readFileSync(new URL('../manifest.yml', import.meta.url), 'utf8');
  assert.match(m, /- key: share-report\n\s+name: [^\n]+\n\s+function: share-report-fn\n\s+actionVerb: CREATE/);
  assert.match(m, /- key: export-report\n\s+name: [^\n]+\n\s+function: export-report-fn\n\s+actionVerb: GET/);
  assert.match(m, /handler: index\.shareReport/);
  assert.match(m, /write:page:confluence/);
  const idx = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(idx, /export const shareReport/);
  assert.match(idx, /export const exportReport/);
  const res = fs.readFileSync(new URL('../src/resolver.js', import.meta.url), 'utf8');
  for (const r of ['getStatus', 'verifyNow', 'postReport', 'exportReport', 'getShareLink', 'publishReportPage', 'forwardReport']) assert.ok(res.includes(`'${r}'`), r);
  const ui = fs.readFileSync(new URL('../src/frontend/index.jsx', import.meta.url), 'utf8');
  for (const r of ['getStatus', 'verifyNow', 'postReport', 'exportReport', 'getShareLink', 'publishReportPage', 'forwardReport']) assert.ok(ui.includes(`'${r}'`), `UI calls ${r}`);
});
