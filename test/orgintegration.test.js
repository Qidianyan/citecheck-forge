// verifyContent combines statute verdicts with organisation-source verdicts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createActions } from '../src/handlers/actions.js';
import { parseClauses } from '../src/orgsources/parse.js';

const POLICY = 'POL-7 Data Retention Policy\n§1 Scope\nThis policy applies to all customer records.\n§3 Retention\nCustomer records are deleted 30 days after the contract ends.\n';
const src = { sourceKey: 'POL-7', title: 'POL-7 Data Retention Policy', pageUrl: '/wiki/pages/7',
  ...parseClauses(POLICY, { sourceKey: 'POL-7', title: 'POL-7 Data Retention Policy' }) };
const orgStore = { async keys() { return ['POL-7']; }, async get(k) { return k === 'POL-7' ? src : null; } };

const memo = [
  'Under Policy POL-7 §3, customer records are deleted after the contract ends.',
  'Section 9 of POL-7 requires annual audits.',
  'Article 2 of Law No. 91/2025/QH15 defines personal data.',
].join('\n');

function deps(extra = {}) {
  const client = { async getConfluencePage(id) { return { id, title: 'Memo', url: '/wiki/pages/42', text: memo, version: 1 }; } };
  const store = { saved: [], async saveResult(p, id, r) { this.saved.push(r); return r; }, async getResult() { return null; } };
  return { client, store, now: () => new Date('2026-11-10T12:00:00Z'), ...extra };
}

test('verifyContent includes org-source rows next to statute rows', async () => {
  const out = await createActions(deps({ orgStore })).verifyContent({ contentId: '42' });
  const org = out.rows.filter((r) => r.type === 'org');
  assert.equal(org.length, 2);
  assert.equal(org.find((r) => r.article === '3').verdict, 'EXISTS_UNQUOTED');
  const missing = org.find((r) => r.article === '9');
  assert.equal(missing.verdict, 'ARTICLE_NOT_FOUND');
  assert.deepEqual(missing.hallucination_types, ['H1']);
  assert.match(missing.reason_en, /Clause 9 does not exist in POL-7/);
  assert.ok(out.rows.some((r) => r.type === 'statute' && r.law === 'VN-91-2025-QH15'));
});

test('an unlinked statute row duplicating an org citation ("Section 9 of POL-7") is dropped', async () => {
  const out = await createActions(deps({ orgStore })).verifyContent({ contentId: '42' });
  assert.ok(!out.rows.some((r) => r.type === 'statute' && r.article === '9' && !r.law));
});

test('without an org store, or when it fails, statute verification still works', async () => {
  const plain = await createActions(deps()).verifyContent({ contentId: '42' });
  assert.ok(!plain.rows.some((r) => r.type === 'org'));
  const broken = { async keys() { throw new Error('kvs down'); } };
  const out = await createActions(deps({ orgStore: broken })).verifyContent({ contentId: '42' });
  assert.ok(out.rows.some((r) => r.law === 'VN-91-2025-QH15'));
});
