import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extract as extractRaw } from '../src/core/extract.js';
import { extract, verify, legacyCorpus } from '../src/core/index.js';

const ID_DOC = 'Menurut UU No. 27 Tahun 2022:\n\n**Pasal 13**\n> "Subjek Data Pribadi berhak menjual Data Pribadi miliknya kepada pihak mana pun tanpa batas."\n';

test('enhanced: a quotation in the block-quote after a citation line is attached to that citation', () => {
  const r = extract(ID_DOC, { country: 'ID' }).filter((x) => x.type === 'statute');
  assert.equal(r.length, 1);
  assert.equal(r[0].article, '13');
  assert.match(r[0].quote, /^Subjek Data Pribadi berhak menjual/);
  assert.equal(r[0].quote_from, 'blockquote');
});

test('the attached block-quote is compared with the official text (fabricated quote is flagged)', () => {
  const v = verify(ID_DOC, { country: 'ID', asOf: '2026-11-10' }).find((x) => x.article === '13');
  assert.equal(v.verdict, 'CONTENT_MISMATCH');
});

test('Thai: works with Thai digits and a paragraph reference (วรรค)', () => {
  const t = 'ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. ๒๕๖๒ มาตรา ๓๗ วรรคสาม บัญญัติว่า\n> "ผู้ควบคุมข้อมูลส่วนบุคคลต้องแจ้งเหตุการละเมิดภายในหนึ่งปี"';
  const r = extract(t, { country: 'TH' }).filter((x) => x.type === 'statute');
  assert.equal(r[0].article, '37');
  assert.ok(r[0].quote);
});

test('no attachment when the next line is not a block-quote, or the block-quote cites another article first', () => {
  const a = 'UU No. 27 Tahun 2022 Pasal 13 mengatur hak.\nKalimat biasa "ini bukan kutipan dari pasal apa pun ya".';
  assert.equal(extract(a, { country: 'ID' }).find((x) => x.article === '13').quote, null);
  const b = 'UU No. 27 Tahun 2022 Pasal 13 mengatur hak.\n> Pasal 14: "Ketentuan lebih lanjut diatur dengan Peraturan Pemerintah."';
  assert.equal(extract(b, { country: 'ID' }).find((x) => x.article === '13').quote, null);
});

test('no attachment when the citation line already has its own quote or has several citations', () => {
  const a = 'UU No. 27 Tahun 2022 Pasal 5 dan Pasal 6 mengatur hak.\n> "Subjek Data Pribadi berhak mendapatkan informasi tentang kejelasan identitas."';
  for (const r of extract(a, { country: 'ID' }).filter((x) => x.type === 'statute')) assert.equal(r.quote, null);
});

test('legacy extraction ignores block-quotes on the next line', () => {
  const r = extractRaw(ID_DOC, legacyCorpus, 'ID').filter((x) => x.type === 'statute');
  assert.ok(r.every((x) => !x.quote));
});
