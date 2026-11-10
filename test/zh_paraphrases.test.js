// Structural checks for the Simplified-Chinese paraphrase set of the fresh evaluation input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const input = JSON.parse(readFileSync(join(here, '..', 'eval', 'fresh', 'zh_input.json'), 'utf8'));
const data = JSON.parse(readFileSync(join(here, '..', 'eval', 'fresh', 'zh_paraphrases.json'), 'utf8'));

const CJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;
const countCjk = (s) => [...s].filter((c) => CJK.test(c)).length;

test('zh_paraphrases has 60 entries matching input ids and order', () => {
  assert.equal(data.length, 60);
  assert.deepEqual(data.map((r) => r.id), input.map((r) => r.id));
  for (const r of data) assert.equal(typeof r.zh, 'string');
});

test('each zh paraphrase is 40-160 CJK chars and at least 70% CJK', () => {
  for (const r of data) {
    const nonspace = [...r.zh].filter((c) => !/\s/.test(c));
    const cjk = countCjk(r.zh);
    assert.ok(cjk >= 40 && cjk <= 160, `${r.id}: ${cjk} CJK chars out of range`);
    assert.ok(cjk / nonspace.length >= 0.7, `${r.id}: CJK ratio below 70%`);
  }
});

test('each zh paraphrase omits article numbers, law markers, book quotes and quotation marks', () => {
  for (const r of data) {
    assert.ok(!/第\d+条/.test(r.zh), `${r.id}: numbered article reference`);
    assert.ok(!/Điều|Pasal|มาตรา|Section|Article/.test(r.zh), `${r.id}: foreign article marker`);
    assert.ok(!r.zh.includes('《'), `${r.id}: book quote mark`);
    assert.ok(!r.zh.includes('"') && !r.zh.includes('“') && !r.zh.includes('”'), `${r.id}: double quote`);
  }
});

test('every zh paraphrase is unique', () => {
  assert.equal(new Set(data.map((r) => r.zh)).size, data.length);
});
