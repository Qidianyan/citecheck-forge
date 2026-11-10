// Task K — article ranges and lists expand into one statute row per article (enhanced mode only).
// The legacy expectations below were snapshotted from the pre-change extractor output BEFORE editing
// src/core/extract.js (legacy corpus, byte-identical behaviour).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extract as extractEnhanced, legacyCorpus, verify } from '../src/core/index.js';
import { extract as extractCore } from '../src/core/extract.js';

const arts = (rows) => rows.map((r) => [r.article, r.law ? r.law.law_id : null]);

// --- Ranges (inclusive), one statute row per article -------------------------------------------

test('zh range with en dash: 参见 UU PDP 第67–74条。 expands to 67..74 on ID-UU-27-2022', () => {
  const rows = extractEnhanced('参见 UU PDP 第67–74条。', { country: 'ID' });
  assert.deepEqual(arts(rows), [['67', 'ID-UU-27-2022'], ['68', 'ID-UU-27-2022'], ['69', 'ID-UU-27-2022'], ['70', 'ID-UU-27-2022'], ['71', 'ID-UU-27-2022'], ['72', 'ID-UU-27-2022'], ['73', 'ID-UU-27-2022'], ['74', 'ID-UU-27-2022']]);
});

test('zh range with hyphen: 第78-82条 expands to 78..82', () => {
  const rows = extractEnhanced('参见 UU PDP 第78-82条。', { country: 'ID' });
  assert.deepEqual(arts(rows), [['78', 'ID-UU-27-2022'], ['79', 'ID-UU-27-2022'], ['80', 'ID-UU-27-2022'], ['81', 'ID-UU-27-2022'], ['82', 'ID-UU-27-2022']]);
});

test('zh range with spaces: 第 57–59 条 expands to 57..59', () => {
  const rows = extractEnhanced('参见 UU PDP 第 57–59 条。', { country: 'ID' });
  assert.deepEqual(arts(rows), [['57', 'ID-UU-27-2022'], ['58', 'ID-UU-27-2022'], ['59', 'ID-UU-27-2022']]);
});

test('zh range with 至: 第67至74条 expands to 67..74', () => {
  const rows = extractEnhanced('参见 UU PDP 第67至74条。', { country: 'ID' });
  assert.deepEqual(arts(rows).map((x) => x[0]), ['67', '68', '69', '70', '71', '72', '73', '74']);
  assert.ok(rows.every((r) => r.law && r.law.law_id === 'ID-UU-27-2022'));
});

test('zh range with repeated markers: 第67条至第74条 expands to 67..74', () => {
  const rows = extractEnhanced('参见 UU PDP 第67条至第74条。', { country: 'ID' });
  assert.deepEqual(arts(rows).map((x) => x[0]), ['67', '68', '69', '70', '71', '72', '73', '74']);
});

test('id range "sampai dengan" + bare end: Pasal 67 sampai dengan 73 expands to 67..73', () => {
  const rows = extractEnhanced('Pasal 67 sampai dengan 73 UU PDP', { country: 'ID' });
  assert.deepEqual(arts(rows), [['67', 'ID-UU-27-2022'], ['68', 'ID-UU-27-2022'], ['69', 'ID-UU-27-2022'], ['70', 'ID-UU-27-2022'], ['71', 'ID-UU-27-2022'], ['72', 'ID-UU-27-2022'], ['73', 'ID-UU-27-2022']]);
});

test('id range "sampai dengan" + repeated marker: Pasal 67 sampai dengan Pasal 73', () => {
  const rows = extractEnhanced('Pasal 67 sampai dengan Pasal 73 UU PDP', { country: 'ID' });
  assert.deepEqual(arts(rows), [['67', 'ID-UU-27-2022'], ['68', 'ID-UU-27-2022'], ['69', 'ID-UU-27-2022'], ['70', 'ID-UU-27-2022'], ['71', 'ID-UU-27-2022'], ['72', 'ID-UU-27-2022'], ['73', 'ID-UU-27-2022']]);
});

test('id range with hyphen: Pasal 67-73 expands to 67..73', () => {
  const rows = extractEnhanced('Pasal 67-73 UU PDP', { country: 'ID' });
  assert.deepEqual(arts(rows).map((x) => x[0]), ['67', '68', '69', '70', '71', '72', '73']);
});

test('vn range "đến" with repeated marker: Điều 5 đến Điều 10', () => {
  const rows = extractEnhanced('Điều 5 đến Điều 10 Luật 91/2025/QH15', { country: 'VN' });
  assert.deepEqual(arts(rows), [['5', 'VN-91-2025-QH15'], ['6', 'VN-91-2025-QH15'], ['7', 'VN-91-2025-QH15'], ['8', 'VN-91-2025-QH15'], ['9', 'VN-91-2025-QH15'], ['10', 'VN-91-2025-QH15']]);
});

test('vn range with hyphen: Điều 5-10', () => {
  const rows = extractEnhanced('Điều 5-10 Luật 91/2025/QH15', { country: 'VN' });
  assert.deepEqual(arts(rows).map((x) => x[0]), ['5', '6', '7', '8', '9', '10']);
});

test('vn range with từ ... đến: từ Điều 5 đến Điều 10', () => {
  const rows = extractEnhanced('từ Điều 5 đến Điều 10 Luật 91/2025/QH15', { country: 'VN' });
  assert.deepEqual(arts(rows).map((x) => x[0]), ['5', '6', '7', '8', '9', '10']);
});

test('th range "ถึง": มาตรา 78 ถึง 82', () => {
  const rows = extractEnhanced('มาตรา 78 ถึง 82 PDPA', { country: 'TH' });
  assert.deepEqual(arts(rows), [['78', 'TH-PDPA-2562-TH'], ['79', 'TH-PDPA-2562-TH'], ['80', 'TH-PDPA-2562-TH'], ['81', 'TH-PDPA-2562-TH'], ['82', 'TH-PDPA-2562-TH']]);
});

test('th range with Thai digits: มาตรา ๗๘-๘๒ expands to 78..82', () => {
  const rows = extractEnhanced('มาตรา ๗๘-๘๒ PDPA', { country: 'TH' });
  assert.deepEqual(arts(rows), [['78', 'TH-PDPA-2562-TH'], ['79', 'TH-PDPA-2562-TH'], ['80', 'TH-PDPA-2562-TH'], ['81', 'TH-PDPA-2562-TH'], ['82', 'TH-PDPA-2562-TH']]);
});

test('en range "to": Articles 5 to 10', () => {
  const rows = extractEnhanced('Articles 5 to 10 UU PDP', { country: 'ID' });
  assert.deepEqual(arts(rows), [['5', 'ID-UU-27-2022'], ['6', 'ID-UU-27-2022'], ['7', 'ID-UU-27-2022'], ['8', 'ID-UU-27-2022'], ['9', 'ID-UU-27-2022'], ['10', 'ID-UU-27-2022']]);
});

test('en range with en dash: Sections 78–82', () => {
  const rows = extractEnhanced('Sections 78–82 PDPA', { country: 'TH' });
  assert.deepEqual(arts(rows), [['78', 'TH-PDPA-2562-TH'], ['79', 'TH-PDPA-2562-TH'], ['80', 'TH-PDPA-2562-TH'], ['81', 'TH-PDPA-2562-TH'], ['82', 'TH-PDPA-2562-TH']]);
});

// --- Lists --------------------------------------------------------------------------------------

test('zh list with 、: 第5、6、7条 expands to 5,6,7', () => {
  const rows = extractEnhanced('第5、6、7条', { country: 'CN' });
  assert.deepEqual(arts(rows), [['5', null], ['6', null], ['7', null]]);
});

test('zh list with repeated markers and 和: 第5条、第6条和第7条', () => {
  const rows = extractEnhanced('第5条、第6条和第7条', { country: 'CN' });
  assert.deepEqual(arts(rows), [['5', null], ['6', null], ['7', null]]);
});

test('id list with commas and dan: Pasal 5, 6, dan 7', () => {
  const rows = extractEnhanced('Pasal 5, 6, dan 7 UU PDP', { country: 'ID' });
  assert.deepEqual(arts(rows), [['5', 'ID-UU-27-2022'], ['6', 'ID-UU-27-2022'], ['7', 'ID-UU-27-2022']]);
});

test('id list with repeated markers: Pasal 5 dan Pasal 6', () => {
  const rows = extractEnhanced('Pasal 5 dan Pasal 6 UU PDP', { country: 'ID' });
  assert.deepEqual(arts(rows), [['5', 'ID-UU-27-2022'], ['6', 'ID-UU-27-2022']]);
});

test('vn list with commas and và: Điều 5, 6 và 7', () => {
  const rows = extractEnhanced('Điều 5, 6 và 7 Luật 91/2025/QH15', { country: 'VN' });
  assert.deepEqual(arts(rows), [['5', 'VN-91-2025-QH15'], ['6', 'VN-91-2025-QH15'], ['7', 'VN-91-2025-QH15']]);
});

test('vn list with các prefix: các Điều 5, 6', () => {
  const rows = extractEnhanced('các Điều 5, 6 Luật 91/2025/QH15', { country: 'VN' });
  assert.deepEqual(arts(rows), [['5', 'VN-91-2025-QH15'], ['6', 'VN-91-2025-QH15']]);
});

test('th list with commas and และ: มาตรา 5, 6 และ 7', () => {
  const rows = extractEnhanced('มาตรา 5, 6 และ 7 PDPA', { country: 'TH' });
  assert.deepEqual(arts(rows), [['5', 'TH-PDPA-2562-TH'], ['6', 'TH-PDPA-2562-TH'], ['7', 'TH-PDPA-2562-TH']]);
});

test('en list with commas and and: Articles 5, 6 and 7', () => {
  const rows = extractEnhanced('Articles 5, 6 and 7 UU PDP', { country: 'ID' });
  assert.deepEqual(arts(rows), [['5', 'ID-UU-27-2022'], ['6', 'ID-UU-27-2022'], ['7', 'ID-UU-27-2022']]);
});

// --- Expanded-row shape -------------------------------------------------------------------------

test('expanded rows carry multi, share law/sentence/inferred, and only the first keeps the quote', () => {
  const rows = extractEnhanced('Pasal 5 sampai dengan Pasal 13 UU PDP: "hak subjek data pribadi yang dilindungi undang"', { country: 'ID' });
  assert.equal(rows.length, 9);
  assert.equal(rows[0].multi, 'range');
  assert.ok(rows.slice(1).every((r) => r.multi === 'range'));
  for (const r of rows) {
    assert.equal(r.law, rows[0].law); // same law object as the first article of the group
    assert.equal(r.sentence, rows[0].sentence);
    assert.equal(r.inferred, rows[0].inferred);
  }
  assert.notEqual(rows[0].quote, null); // first row keeps the quote logic of a single citation
  assert.ok(rows.slice(1).every((r) => r.quote === null && r.quote_lang === null));
  assert.ok(rows.slice(1).every((r) => r.clause === null));
});

test('plain single citations keep their fields and get multi: null in enhanced mode', () => {
  const rows = extractEnhanced('Pasal 46 UU PDP', { country: 'ID' });
  assert.deepEqual(arts(rows), [['46', 'ID-UU-27-2022']]);
  assert.equal(rows[0].multi, null);
  assert.equal(rows[0].citation, 'Pasal 46');
});

test('a group never emits duplicate (law, article) rows', () => {
  const rows = extractEnhanced('UU PDP Pasal 5, 5, dan 6', { country: 'ID' });
  assert.deepEqual(arts(rows), [['5', 'ID-UU-27-2022'], ['6', 'ID-UU-27-2022']]);
});

test('groups and single citations keep the order of appearance in one line', () => {
  const rows = extractEnhanced('Pasal 46 UU PDP dan Pasal 5 sampai dengan Pasal 7 UU PDP', { country: 'ID' });
  assert.deepEqual(arts(rows), [['46', 'ID-UU-27-2022'], ['5', 'ID-UU-27-2022'], ['6', 'ID-UU-27-2022'], ['7', 'ID-UU-27-2022']]);
  assert.deepEqual(rows.map((r) => r.multi), [null, 'range', 'range', 'range']);
});

// --- Cap: no expansion for invalid / oversized ranges -------------------------------------------

test('cap: 第1-40条 is not expanded to 40 rows', () => {
  const rows = extractEnhanced('第1-40条', { country: 'CN' });
  assert.equal(rows.length, 0); // 40 articles > 15: current behaviour (nothing extracted) is kept
});

test('cap: an 18-article range keeps the current single-row behaviour', () => {
  const rows = extractEnhanced('Pasal 40–57 UU PDP', { country: 'ID' });
  assert.equal(rows.length, 1);
  assert.deepEqual(arts(rows), [['40', 'ID-UU-27-2022']]);
  assert.equal(rows[0].multi, null);
});

test('cap: end <= start is not expanded', () => {
  const rows = extractEnhanced('第74–67条', { country: 'CN' });
  assert.equal(rows.length, 0);
});

// --- Legacy corpus: output unchanged (snapshot taken before the change) --------------------------

const LEGACY_ROWS = (text, country) => extractCore(text, legacyCorpus, country)
  .map((r) => [r.citation, r.article, r.law ? r.law.law_id : null, r.clause, r.quote]);

test('legacy corpus: range examples produce exactly the pre-change output', () => {
  assert.deepEqual(LEGACY_ROWS('参见 UU PDP 第67–74条。', 'ID'), []);
  assert.deepEqual(LEGACY_ROWS('参见 UU PDP 第78-82条。', 'ID'), []);
  assert.deepEqual(LEGACY_ROWS('参见 UU PDP 第 57–59 条。', 'ID'), []);
  assert.deepEqual(LEGACY_ROWS('参见 UU PDP 第67至74条。', 'ID'), []);
  assert.deepEqual(LEGACY_ROWS('参见 UU PDP 第67条至第74条。', 'ID'), [
    ['第67条', '67', 'ID-UU-27-2022', '74', null],
    ['第74条', '74', 'ID-UU-27-2022', null, null],
  ]);
  assert.deepEqual(LEGACY_ROWS('Pasal 67 sampai dengan 73 UU PDP', 'ID'), [['Pasal 67', '67', 'ID-UU-27-2022', null, null]]);
  assert.deepEqual(LEGACY_ROWS('Pasal 67 sampai dengan Pasal 73 UU PDP', 'ID'), [
    ['Pasal 67', '67', 'ID-UU-27-2022', null, null],
    ['Pasal 73', '73', 'ID-UU-27-2022', null, null],
  ]);
  assert.deepEqual(LEGACY_ROWS('Pasal 67-73 UU PDP', 'ID'), [['Pasal 67', '67', 'ID-UU-27-2022', null, null]]);
  assert.deepEqual(LEGACY_ROWS('Điều 5 đến Điều 10 Luật 91/2025/QH15', 'VN'), [
    ['Điều 5', '5', 'VN-91-2025-QH15', null, null],
    ['Điều 10', '10', 'VN-91-2025-QH15', null, null],
  ]);
  assert.deepEqual(LEGACY_ROWS('Điều 5-10 Luật 91/2025/QH15', 'VN'), [['Điều 5', '5', 'VN-91-2025-QH15', null, null]]);
  assert.deepEqual(LEGACY_ROWS('từ Điều 5 đến Điều 10 Luật 91/2025/QH15', 'VN'), [
    ['Điều 5', '5', 'VN-91-2025-QH15', null, null],
    ['Điều 10', '10', 'VN-91-2025-QH15', null, null],
  ]);
  assert.deepEqual(LEGACY_ROWS('มาตรา 78 ถึง 82 PDPA', 'TH'), [['มาตรา 78', '78', 'TH-PDPA-2562-TH', null, null]]);
  assert.deepEqual(LEGACY_ROWS('มาตรา ๗๘-๘๒ PDPA', 'TH'), [['มาตรา 78', '78', 'TH-PDPA-2562-TH', null, null]]);
  assert.deepEqual(LEGACY_ROWS('Articles 5 to 10 UU PDP', 'ID'), []);
  assert.deepEqual(LEGACY_ROWS('Sections 78–82 PDPA', 'TH'), []);
});

test('legacy corpus: list examples produce exactly the pre-change output', () => {
  assert.deepEqual(LEGACY_ROWS('第5、6、7条', 'CN'), []);
  assert.deepEqual(LEGACY_ROWS('第5条、第6条和第7条', 'CN'), [
    ['第5条', '5', null, '6', null],
    ['第6条', '6', null, '7', null],
    ['第7条', '7', null, null, null],
  ]);
  assert.deepEqual(LEGACY_ROWS('Pasal 5, 6, dan 7 UU PDP', 'ID'), [['Pasal 5', '5', 'ID-UU-27-2022', null, null]]);
  assert.deepEqual(LEGACY_ROWS('Pasal 5 dan Pasal 6 UU PDP', 'ID'), [
    ['Pasal 5', '5', 'ID-UU-27-2022', null, null],
    ['Pasal 6', '6', 'ID-UU-27-2022', null, null],
  ]);
  assert.deepEqual(LEGACY_ROWS('Điều 5, 6 và 7 Luật 91/2025/QH15', 'VN'), [['Điều 5', '5', 'VN-91-2025-QH15', null, null]]);
  assert.deepEqual(LEGACY_ROWS('các Điều 5, 6 Luật 91/2025/QH15', 'VN'), [['Điều 5', '5', 'VN-91-2025-QH15', null, null]]);
  assert.deepEqual(LEGACY_ROWS('มาตรา 5, 6 และ 7 PDPA', 'TH'), [['มาตรา 5', '5', 'TH-PDPA-2562-TH', null, null]]);
  assert.deepEqual(LEGACY_ROWS('Articles 5, 6 and 7 UU PDP', 'ID'), []);
});

test('legacy corpus rows never gain the multi field', () => {
  for (const [text, country] of [['参见 UU PDP 第67–74条。', 'ID'], ['Pasal 5, 6, dan 7 UU PDP', 'ID'], ['第5条、第6条和第7条', 'CN']]) {
    for (const r of extractCore(text, legacyCorpus, country)) assert.ok(!('multi' in r), 'legacy rows must stay field-identical');
  }
});

// --- Crossref ------------------------------------------------------------------------------------

test('verify with crossref:true on a range line yields no crossref misattribution for expanded rows', () => {
  const rows = verify('UU PDP mengatur hak subjek data pada Pasal 5 sampai dengan Pasal 13.', { asOf: '2026-11-10', crossref: true });
  assert.equal(rows.length, 9);
  assert.deepEqual(rows.map((r) => r.article), ['5', '6', '7', '8', '9', '10', '11', '12', '13']);
  for (const r of rows) assert.ok(!r.crossref, `no crossref misattribution on article ${r.article}`);
});

// Reviewer additions (phase 4): Chinese numerals and non-article enumerations.
import { extract as extractEnh } from '../src/core/index.js';
const arts4 = (t, country = 'VN') => extractEnh(t, { country }).filter((r) => r.type === 'statute').map((r) => r.article);
test('reviewer: Chinese-numeral ranges and lists expand', () => {
  assert.deepEqual(arts4('越南《劳动法》第五条至第十条'), ['5', '6', '7', '8', '9', '10']);
  assert.deepEqual(arts4('第三十五条、第三十六条'), ['35', '36']);
  assert.deepEqual(arts4('第一百二十条'), ['120']);
});
test('reviewer: "第2、3句" (sentences, no 条) is not an article list', () => {
  assert.deepEqual(arts4('[模拟回答，其中第2、3句为人为编造]'), []);
});
