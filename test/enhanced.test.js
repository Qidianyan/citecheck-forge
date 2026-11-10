// Enhanced mode (default in the app): English law names, per-line country cues, translation fallback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { verify } from '../src/core/index.js';

const memo = fs.readFileSync(new URL('./fixtures/demo_memo_en.txt', import.meta.url), 'utf8');
const docs = fs.readFileSync(new URL('./fixtures/golden.jsonl', import.meta.url), 'utf8').split('\n').filter(Boolean).map(JSON.parse);

test('demo memo (English, mixed VN/ID/TH) gets the expected verdicts', () => {
  const got = verify(memo, { asOf: '2026-11-10' }).map((r) => [r.citation, r.law ?? null, r.verdict]);
  assert.deepEqual(got, [
    ['Article 9', 'VN-91-2025-QH15', 'EXISTS_CONSISTENT'],
    ['Article 45', 'VN-91-2025-QH15', 'ARTICLE_NOT_FOUND'],
    ['Article 11', 'VN-ND-13-2023-CP', 'NOT_IN_FORCE'],
    ['Article 26', 'VN-ANM-24-2018-QH14', 'NOT_IN_FORCE'],
    ['Pasal 5', 'ID-UU-27-2022', 'EXISTS_CONSISTENT'],
    ['Pasal 90', 'ID-UU-27-2022', 'ARTICLE_NOT_FOUND'],
    ['Section 19', 'TH-PDPA-2562-TH', 'EXISTS_CONSISTENT'],
    ['Section 26', 'TH-PDPA-2562-TH', 'CONTENT_MISMATCH'],
    ['คำพิพากษาศาลฎีกาที่ 1234/2560', null, 'UNVERIFIABLE'],
  ]);
});

test('English quote vs Thai official text is compared with the bundled unofficial English translation', () => {
  const [r] = verify('Section 19 of the Personal Data Protection Act B.E. 2562: "The Data Controller shall not collect, use, or disclose Personal Data, unless the data subject has given consent"', { asOf: '2026-11-10' });
  assert.equal(r.law, 'TH-PDPA-2562-TH');
  assert.equal(r.compared_with, 'TH-PDPA-2562-EN');
  assert.equal(r.verdict, 'EXISTS_CONSISTENT');
});

test('Indonesian law cited in English form is linked', () => {
  const [r] = verify('Article 90 of Indonesia\'s Law No. 27 of 2022 sets a 20-year prison term.', { asOf: '2026-11-10' });
  assert.equal(r.law, 'ID-UU-27-2022');
  assert.equal(r.verdict, 'ARTICLE_NOT_FOUND');
});

test('enhanced mode changes < 10% of legacy verdicts and never downgrades a decided verdict to UNVERIFIABLE', () => {
  let total = 0, changed = 0;
  for (const d of docs) {
    const E = verify(d.text, { asOf: d.as_of });
    assert.equal(E.length, d.results.length, `citation count changed in ${d.id}`);
    d.results.forEach((L, i) => {
      total++;
      if (L.law !== (E[i].law ?? null) || L.verdict !== E[i].verdict) {
        changed++;
        assert.ok(!(L.verdict !== 'UNVERIFIABLE' && E[i].verdict === 'UNVERIFIABLE'), `${d.id} #${i} downgraded`);
      }
    });
  }
  // Enhanced linking (English names, per-line country, document version pinning, heading inheritance) relinks
  // a bounded share of citations; the eval (eval/REPORT.md) measures whether that helps.
  assert.ok(changed / total < 0.10, `${changed}/${total} changed`);
});
