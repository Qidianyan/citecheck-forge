import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { COPY } from '../src/frontend/copy.js';
import { panelState, isStale, errorMessage, verdictPresentation, summaryLozenges, shareOptions, canAssign, validateForward, panelRows, toTable, relativeTime } from '../src/frontend/panelModel.js';
import { validateOrgForm } from '../src/frontend/adminModel.js';

const NOW = new Date('2026-11-10T12:00:00Z');
const rep = (summary, extra = {}) => ({ verifiedAt: '2026-11-10T09:00:00Z', asOf: '2026-11-10', summary, rows: [], ...extra });
const glyphs = new Set(fs.readFileSync(new URL('../tools/uikit/icon-glyphs.txt', import.meta.url), 'utf8').split('\n').filter(Boolean));

test('panel states', () => {
  assert.equal(panelState({ loading: true }).state, 'loading');
  assert.equal(panelState({ error: 'x' }).state, 'error');
  assert.equal(panelState({ report: null }).state, 'never-checked');
  assert.equal(panelState({ report: rep({ total: 0 }), now: NOW }).state, 'no-citations');
  assert.equal(panelState({ report: rep({ total: 3, flagged: 1 }), now: NOW }).state, 'flagged');
  assert.equal(panelState({ report: rep({ total: 3, flagged: 0, unverifiable: 1 }), now: NOW }).state, 'unverifiable-only');
  assert.equal(panelState({ report: rep({ total: 3, flagged: 0, unverifiable: 0, verified: 3 }), now: NOW }).state, 'clean');
});

test('stale after 7 days or when the content version moved on', () => {
  assert.equal(isStale(rep({}), { now: NOW }), false);
  assert.equal(isStale(rep({}), { now: new Date('2026-11-18T09:00:01Z') }), true);
  assert.equal(isStale(rep({}, { source: { version: 3 } }), { now: NOW, currentVersion: 4 }), true);
  assert.equal(isStale(rep({}, { source: { version: 3 } }), { now: NOW, currentVersion: 3 }), false);
  assert.equal(panelState({ report: rep({ total: 1, flagged: 1 }), now: new Date('2026-12-01') }).stale, true);
});

test('error codes map to plain copy', () => {
  assert.equal(errorMessage({ error: 'API_ERROR', status: 403 }), COPY.errors.FORBIDDEN);
  assert.equal(errorMessage(new Error('Atlassian API request failed: HTTP 404')), COPY.errors.NOT_FOUND);
  assert.equal(errorMessage({ error: 'NO_REPORT' }), COPY.errors.NO_REPORT);
  assert.equal(errorMessage({ error: 'NO_TARGET' }), COPY.errors.NO_TARGET);
  assert.equal(errorMessage(new Error('network down')), COPY.errors.NETWORK);
  assert.equal(errorMessage(new Error('weird')), COPY.errors.GENERIC);
});

test('verdict → glyph (in allow-list) and lozenge appearance', () => {
  const want = { EXISTS_CONSISTENT: 'success', EXISTS_UNQUOTED: 'default', NOT_IN_FORCE: 'moved', CONTENT_MISMATCH: 'removed', ARTICLE_NOT_FOUND: 'removed', UNVERIFIABLE: 'default' };
  for (const [v, a] of Object.entries(want)) {
    const p = verdictPresentation({ verdict: v });
    assert.equal(p.appearance, a, v);
    assert.ok(glyphs.has(p.glyph), p.glyph);
  }
  assert.equal(verdictPresentation({ verdict: 'CONTENT_MISMATCH', suggested_article: '9' }).label, 'Misattributed');
});

test('summary lozenges skip zero counts, flagged first', () => {
  const l = summaryLozenges({ flagged: 2, verified: 3, unverifiable: 0, by_verdict: { NOT_IN_FORCE: 1 } });
  assert.deepEqual(l.map((x) => x.appearance), ['removed', 'moved', 'success']);
});

test('share options per product; assign only on Jira', () => {
  assert.deepEqual(shareOptions('confluence').map((o) => o.key), ['comment', 'page', 'forward', 'export']);
  assert.deepEqual(shareOptions('jira').map((o) => o.key), ['comment', 'forward', 'export']);
  assert.equal(canAssign('jira'), true);
  assert.equal(canAssign('confluence'), false);
});

test('forward validation: account id, note length (trimmed), assign scope', () => {
  assert.equal(validateForward({ accountId: '557058:abc-123' }, 'jira').ok, true);
  assert.ok(validateForward({ accountId: '"><x' }, 'jira').errors.accountId);
  assert.ok(validateForward({ accountId: '557058:abc', note: 'x'.repeat(501) }, 'jira').errors.note);
  assert.equal(validateForward({ accountId: '557058:abc', note: `  ${'x'.repeat(500)}  ` }, 'jira').ok, true);
  assert.ok(validateForward({ accountId: '557058:abc', assign: true }, 'confluence').errors.assign);
  assert.deepEqual(validateForward({ accountId: ' 557058:abc ', note: ' hi ', assign: true }, 'jira').payload, { accountId: '557058:abc', note: 'hi', assign: true });
});

test('rows flagged first; DynamicTable keyed shape', () => {
  const rows = panelRows({ rows: [{ n: 1, verdict: 'EXISTS_CONSISTENT' }, { n: 2, verdict: 'ARTICLE_NOT_FOUND', flagged: true }] });
  assert.deepEqual(rows.map((r) => r.n), [2, 1]);
  const t = toTable(['A', 'B'], [['x', 'y']]);
  assert.deepEqual(t.head.cells.map((c) => c.content), ['A', 'B']);
  assert.equal(t.rows[0].cells[1].content, 'y');
  assert.ok(t.rows[0].key && t.rows[0].cells[0].key);
});

test('relative time', () => {
  assert.equal(relativeTime('2026-11-10T11:59:30Z', NOW), 'just now');
  assert.equal(relativeTime('2026-11-10T11:55:00Z', NOW), '5 minutes ago');
  assert.equal(relativeTime('2026-11-08T12:00:00Z', NOW), '2 days ago');
});

test('copy: no emoji, no "Oops", no exclamation marks', () => {
  const flat = [];
  const walk = (v) => { if (typeof v === 'string') flat.push(v); else if (typeof v === 'function') flat.push(String(v({ name: 'A', product: 'jira', assign: true }))); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(COPY);
  for (const s of flat) {
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(s), s);
    assert.ok(!/oops/i.test(s), s);
    assert.ok(!s.includes('!'), s);
  }
});

test('admin form validation', () => {
  assert.deepEqual(validateOrgForm({ pageId: '123', sourceKey: 'POL-7' }), {});
  assert.ok(validateOrgForm({ pageId: '12a', sourceKey: 'POL-7' }).pageId);
  assert.ok(validateOrgForm({ pageId: '1', sourceKey: 'pol-7' }).sourceKey);
});
