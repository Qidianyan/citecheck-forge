import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pinnedVersions, extract } from '../src/core/extract.js';
import { corpus, legacyCorpus } from '../src/core/index.js';

const DOC = 'Dự án áp dụng Luật Đầu tư số 61/2020/QH14.\n\nTheo Điều 22 Luật Đầu tư, nhà đầu tư thành lập tổ chức kinh tế.\n\n## Thủ tục\nĐiều 23 quy định điều kiện đối với nhà đầu tư nước ngoài.';
const ids = (rows) => rows.map((r) => [r.law?.law_id ?? null, r.article]);

test('pinnedVersions maps a same-name law family to the version the document names', () => {
  const p = pinnedVersions(DOC, corpus);
  assert.equal(p.get('VN|Luật Đầu tư').law_id, 'VN-DT-61-2020-QH14');
});

test('pinnedVersions is empty when two versions of the family are named', () => {
  const p = pinnedVersions('Luật Đầu tư số 61/2020/QH14 và Luật Đầu tư số 143/2025/QH15.', corpus);
  assert.equal(p.has('VN|Luật Đầu tư'), false);
});

test('enhanced extraction links bare family mentions and headed sections to the pinned version', () => {
  assert.deepEqual(ids(extract(DOC, corpus)), [['VN-DT-61-2020-QH14', '22'], ['VN-DT-61-2020-QH14', '23']]);
  const r = extract(DOC, corpus);
  assert.equal(r[1].inferred, true);
});

test('legacy extraction is unchanged (no version pinning)', () => {
  assert.deepEqual(ids(extract(DOC, legacyCorpus)), [['VN-DT-143-2025-QH15', '22'], ['VN-DT-143-2025-QH15', '23']]);
});

test('an explicit version on the line beats the document pin', () => {
  const t = DOC + '\n\nĐiều 30 Luật Đầu tư số 143/2025/QH15 quy định khác.';
  const r = extract(t, corpus);
  assert.deepEqual(ids(r).at(-1), ['VN-DT-143-2025-QH15', '30']);
});
