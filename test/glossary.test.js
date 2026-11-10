import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLOSSARY, anchorsFor } from '../src/core/glossary.js';
import { corpus } from '../src/core/index.js';
import { CROSSREF_DEFAULTS } from '../src/core/crossref.js';

const C = { vi: 'VN', id: 'ID', th: 'TH' };

test('every vi/id glossary term occurs in the bundled statutes of its country', () => {
  const dead = [];
  for (const e of GLOSSARY) for (const lang of ['vi', 'id']) for (const t of e[lang]) {
    const hit = corpus.laws.some((l) => l.country === C[lang] && Object.values(l.articles || {}).some((a) => a.normalize('NFC').toLowerCase().includes(t)));
    if (!hit) dead.push(`${lang}:${t}`);
  }
  assert.deepEqual(dead, []);
});

test('every entry has zh, vi, id and th terms', () => {
  for (const e of GLOSSARY) for (const k of ['zh', 'vi', 'id', 'th']) assert.ok(e[k]?.length, JSON.stringify(e.zh));
});

test('anchorsFor renders Chinese concepts in the target official language, longest match first', () => {
  const a = anchorsFor('数据主体有权撤回同意，控制者应当通知。', 'VN');
  assert.equal(a.concepts.length, 3);
  assert.match(a.text, /rút lại sự đồng ý/);
  assert.doesNotMatch(a.text, /(^|; )sự đồng ý( ;|$)/); // "同意" inside "撤回同意" is not double-counted
  assert.match(anchorsFor('试用期不得超过', 'ID').text, /masa percobaan/);
  assert.match(anchorsFor('试用期不得超过', 'TH').text, /ทดลองงาน/);
});

test('anchorsFor returns nothing for unknown countries or text without concepts', () => {
  assert.deepEqual(anchorsFor('试用期', 'XX'), { concepts: [], text: '' });
  assert.equal(anchorsFor('今天天气很好', 'VN').concepts.length, 0);
});

test('frozen crossref defaults (phase 3, dev split only)', () => {
  assert.equal(CROSSREF_DEFAULTS.anchors, true);
  assert.equal(CROSSREF_DEFAULTS.anchorMinConcepts, 2);
  assert.equal(CROSSREF_DEFAULTS.anchorRatio, 4);
});
