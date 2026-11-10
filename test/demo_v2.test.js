// Task D tests — demo memo v2 and dev-site seed data. Node built-ins only; no @forge imports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { verify, enrich, quoteScore } from '../src/core/index.js';
import { parseClauses } from '../src/orgsources/parse.js';
import { verifyOrgCitations } from '../src/orgsources/verify.js';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const memo = read('../demo/demo_memo_v2_en.txt');
const expected = JSON.parse(read('../demo/expected_v2.json'));
const rows = verify(memo, { asOf: '2026-11-10', crossref: true, country: null }).map(enrich);

test('memo v2 yields exactly the verdicts recorded in expected_v2.json', () => {
  assert.equal(read('./fixtures/demo_memo_v2_en.txt'), memo, 'fixture copy must equal the demo memo');
  assert.equal(rows.length, expected.length);
  rows.forEach((r, i) => {
    const e = expected[i];
    assert.equal(r.sentence, e.line, `line mismatch at row ${i}`);
    assert.equal(r.citation, e.citation);
    assert.equal(r.verdict, e.verdict);
    assert.deepEqual(r.hallucination_types, e.types);
    assert.equal(r.crossref?.suggested_article ?? null, e.suggested_article ?? null);
  });
});

test('every verdict / hallucination type from the spec appears, each on its own memo line', () => {
  for (const e of expected) {
    assert.ok(memo.split('\n').some((l) => l.trim() === e.line), `line must stand alone: ${e.line}`);
  }
  assert.ok(rows.some((r) => r.verdict === 'EXISTS_CONSISTENT' && r.quote_score >= 0.8 && (r.quote || '').length >= 40));
  assert.ok(rows.some((r) => r.verdict === 'EXISTS_UNQUOTED'));
  assert.ok(rows.some((r) => r.verdict === 'ARTICLE_NOT_FOUND' && r.hallucination_types.includes('H1')));
  const h5 = rows.find((r) => r.verdict === 'NOT_IN_FORCE');
  assert.ok(h5 && h5.hallucination_types.includes('H5') && /repealed/.test(h5.reason_en));
  assert.ok(rows.some((r) => r.verdict === 'CONTENT_MISMATCH' && r.hallucination_types.includes('H4') && !r.crossref));
  assert.ok(rows.some((r) => r.verdict === 'UNVERIFIABLE' && r.law === null), 'Singapore PDPA must be UNVERIFIABLE');
});

test('the H3 row is a consent-withdrawal paraphrase cited to the information article', () => {
  const h3 = rows.filter((r) => r.hallucination_types.includes('H3'));
  assert.equal(h3.length, 1);
  assert.equal(h3[0].crossref.kind, 'misattributed');
  assert.ok(h3[0].crossref.suggested_article, 'suggested_article must be set');
  assert.match(h3[0].sentence, /Pasal 5/);
  assert.ok(h3[0].sentence.includes('menarik kembali persetujuan'), 'claim describes withdrawing consent');
});

test('the H7 numeric advisory flags a wrong deadline', () => {
  const adv = rows.find((r) => (r.advisories || []).some((a) => a.kind === 'numbers'));
  assert.ok(adv, 'a numbers advisory must exist');
  assert.equal(adv.verdict, 'EXISTS_UNQUOTED', 'advisory must not flip the verdict');
  assert.equal(adv.advisories[0].kind, 'numbers');
  assert.ok(adv.advisories[0].mismatches.some((m) => m.claimed === 24 && m.official.includes(72)));
});

test('organisation citations verify against POL-7 parsed with parseClauses', async () => {
  const pol = read('../demo/POL-7_data_retention_policy.txt');
  const parsed = parseClauses(pol, { sourceKey: 'POL-7', title: 'Mekong Retail Data Retention Policy' });
  assert.deepEqual(parsed.clauses.map((c) => c.id), ['1', '2', '3', '4', '5']);
  const store = {
    keys: async () => ['POL-7'],
    get: async (k) => (k === 'POL-7' ? { sourceKey: 'POL-7', title: parsed.title, pageUrl: 'demo://POL-7', clauses: parsed.clauses } : null),
  };
  const org = await verifyOrgCitations(memo, { store, quoteScore });
  assert.equal(org.length, 2);
  assert.ok(['EXISTS_UNQUOTED', 'EXISTS_CONSISTENT'].includes(org[0].verdict), `§3 must verify, got ${org[0].verdict}`);
  assert.equal(org[0].article, '3');
  assert.equal(org[1].verdict, 'ARTICLE_NOT_FOUND');
  assert.equal(org[1].article, '9');
  assert.deepEqual(org[1].hallucination_types, ['H1']);
});

test('the Jira seed issue carries the legal-review label and one flagged citation', () => {
  const jira = read('../demo/LEGAL-12_jira_issue.md');
  assert.match(jira, /legal-review/);
  const jrows = verify(jira, { asOf: '2026-11-10', crossref: true, country: null });
  assert.ok(jrows.some((r) => r.verdict === 'EXISTS_CONSISTENT'));
  assert.ok(jrows.some((r) => r.verdict === 'ARTICLE_NOT_FOUND'), 'item 2 must be flagged');
  assert.ok(jrows.some((r) => r.verdict === 'EXISTS_UNQUOTED'));
});

test('the old demo memo fixture is untouched and still verifies as before', () => {
  const old = read('./fixtures/demo_memo_en.txt');
  const got = verify(old, { asOf: '2026-11-10' }).map((r) => r.verdict);
  assert.deepEqual(got, [
    'EXISTS_CONSISTENT', 'ARTICLE_NOT_FOUND', 'NOT_IN_FORCE', 'NOT_IN_FORCE', 'EXISTS_CONSISTENT',
    'ARTICLE_NOT_FOUND', 'EXISTS_CONSISTENT', 'CONTENT_MISMATCH', 'UNVERIFIABLE',
  ]);
});
