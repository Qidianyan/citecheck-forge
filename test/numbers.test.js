// Paired tests for the numeric content check (H7): unit normalisation, money magnitudes,
// article/law-number filtering, compareNumbers, and the numbers:'flag' / advisory pipeline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numericFacts, compareNumbers, verify, enrich } from '../src/core/index.js';

test('numericFacts reads Vietnamese durations and percentages', () => {
  assert.deepEqual(numericFacts('30 ngày'), [{ unit: 'day', value: 30, raw: '30' }]);
  assert.deepEqual(numericFacts('6 tháng'), [{ unit: 'month', value: 6, raw: '6' }]);
  assert.deepEqual(numericFacts('2 năm'), [{ unit: 'year', value: 2, raw: '2' }]);
  assert.deepEqual(numericFacts('5 phần trăm'), [{ unit: 'percent', value: 5, raw: '5' }]);
});

test('numericFacts reads Indonesian durations and percentages, incl. 3 x 24 jam', () => {
  assert.deepEqual(numericFacts('3 x 24 jam'), [{ unit: 'hour', value: 24, raw: '24' }]);
  assert.deepEqual(numericFacts('72 jam'), [{ unit: 'hour', value: 72, raw: '72' }]);
  assert.deepEqual(numericFacts('5 persen'), [{ unit: 'percent', value: 5, raw: '5' }]);
  assert.deepEqual(numericFacts('5 tahun'), [{ unit: 'year', value: 5, raw: '5' }]);
});

test('numericFacts reads Thai durations and percentages', () => {
  assert.deepEqual(numericFacts('72 ชั่วโมง'), [{ unit: 'hour', value: 72, raw: '72' }]);
  assert.deepEqual(numericFacts('30 วัน'), [{ unit: 'day', value: 30, raw: '30' }]);
  assert.deepEqual(numericFacts('3 เดือน'), [{ unit: 'month', value: 3, raw: '3' }]);
  assert.deepEqual(numericFacts('10 เปอร์เซ็นต์'), [{ unit: 'percent', value: 10, raw: '10' }]);
});

test('numericFacts reads English durations and percentages', () => {
  assert.deepEqual(numericFacts('15 days'), [{ unit: 'day', value: 15, raw: '15' }]);
  assert.deepEqual(numericFacts('2%'), [{ unit: 'percent', value: 2, raw: '2' }]);
  assert.deepEqual(numericFacts('5 percent'), [{ unit: 'percent', value: 5, raw: '5' }]);
});

test('numericFacts reads Chinese durations and percentages', () => {
  assert.deepEqual(numericFacts('72小时'), [{ unit: 'hour', value: 72, raw: '72' }]);
  assert.deepEqual(numericFacts('30天'), [{ unit: 'day', value: 30, raw: '30' }]);
  assert.deepEqual(numericFacts('6个月'), [{ unit: 'month', value: 6, raw: '6' }]);
  assert.deepEqual(numericFacts('1年'), [{ unit: 'year', value: 1, raw: '1' }]);
});

test('numericFacts normalises Indonesian money formats', () => {
  assert.deepEqual(numericFacts('Rp5.000.000.000,00'), [{ unit: 'money', value: 5e9, raw: '5.000.000.000,00' }]);
  assert.deepEqual(numericFacts('Rp 1.000.000'), [{ unit: 'money', value: 1e6, raw: '1.000.000' }]);
  assert.deepEqual(numericFacts('5 juta rupiah'), [{ unit: 'money', value: 5e6, raw: '5' }]);
});

test('numericFacts normalises Chinese and Vietnamese money magnitudes', () => {
  assert.deepEqual(numericFacts('50亿印尼盾'), [{ unit: 'money', value: 5e9, raw: '50' }]);
  assert.deepEqual(numericFacts('100 triệu đồng'), [{ unit: 'money', value: 1e8, raw: '100' }]);
  assert.deepEqual(numericFacts('1 tỷ đồng'), [{ unit: 'money', value: 1e9, raw: '1' }]);
});

test('numericFacts reads Thai and English money amounts', () => {
  assert.deepEqual(numericFacts('1,000,000 baht'), [{ unit: 'money', value: 1e6, raw: '1,000,000' }]);
  assert.deepEqual(numericFacts('THB 1,000,000'), [{ unit: 'money', value: 1e6, raw: '1,000,000' }]);
});

test('numericFacts ignores article numbers, law numbers and clause references', () => {
  assert.deepEqual(numericFacts('13/2023/NĐ-CP'), []);
  assert.deepEqual(numericFacts('Điều 9'), []);
  assert.deepEqual(numericFacts('第9条'), []);
  assert.deepEqual(numericFacts('Pasal 5'), []);
  assert.deepEqual(numericFacts('Pasal 46'), []);
  assert.deepEqual(numericFacts('Nomor 27 Tahun 2022'), []);
});

test('compareNumbers matches equal values of the same unit', () => {
  assert.deepEqual(compareNumbers('30 hari', '30 hari'), { mismatches: [], matched: 1 });
});

test('compareNumbers flags different values when the same unit is present', () => {
  const r = compareNumbers('45 hari', '30 hari');
  assert.equal(r.matched, 0);
  assert.deepEqual(r.mismatches, [{ unit: 'day', claimed: 45, official: [30] }]);
});

test('compareNumbers returns null when the article has no such unit', () => {
  assert.equal(compareNumbers('5 tahun', '30 hari'), null);
});

test('compareNumbers returns null when the claim carries no numbers', () => {
  assert.equal(compareNumbers('tidak ada angka sama sekali', '30 hari'), null);
});

test('verify with numbers:"flag" turns a wrong duration into H7 + CONTENT_MISMATCH', () => {
  // VN-91-2025-QH15 Điều 23 states 72 giờ; the claim says 24 giờ.
  const text = 'Điều 23 Luật số 91/2025/QH15 yêu cầu thông báo vi phạm trong vòng 24 giờ.';
  const [r] = verify(text, { asOf: '2026-10-18', country: 'VN', crossref: true, crossrefOptions: { numbers: 'flag' } });
  assert.equal(r.verdict, 'CONTENT_MISMATCH');
  assert.equal(r.rule_verdict, 'EXISTS_UNQUOTED');
  assert.deepEqual(enrich(r).hallucination_types, ['H7']);
  assert.equal(r.numbers.mismatches[0].unit, 'hour');
  assert.equal(r.numbers.mismatches[0].claimed, 24);
  assert.deepEqual(r.numbers.mismatches[0].official, [72]);
});

test('default numbers option is advisory only: verdict stays EXISTS_UNQUOTED', () => {
  const text = 'Điều 23 Luật số 91/2025/QH15 yêu cầu thông báo vi phạm trong vòng 24 giờ.';
  const [r] = verify(text, { asOf: '2026-10-18', country: 'VN', crossref: true });
  assert.equal(r.verdict, 'EXISTS_UNQUOTED');
  assert.equal(r.rule_verdict, 'EXISTS_UNQUOTED');
  assert.equal(r.content_types, undefined);
  assert.equal(r.numbers, undefined);
  assert.equal(r.advisories[0].kind, 'numbers');
  assert.ok(r.advisories[0].message_en.includes('24'));
  assert.ok(r.advisories[0].message_en.includes('72'));
});
