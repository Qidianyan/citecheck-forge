// Paired tests for the crossref / misattribution content checks (H3/H4) and the opt-in crossref pipeline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  claimTokens, createCrossIndex, rankArticles, claimWindows, crossCheck, cjkShare, verify, enrich,
} from '../src/core/index.js';

// Tiny synthetic Indonesian law for rankArticles / crossCheck unit tests.
const ID_LAW = {
  law_id: 'ID-TEST-PA',
  title: 'Undang-Undang Nomor 5 Tahun 2024 tentang Perlindungan Anak',
  aliases: ['UU Perlindungan Anak'],
  articles: {
    '1': 'Setiap anak berhak atas kesejahteraan sosial dan pendidikan.',
    '2': 'Orang tua wajib memberikan nafkah dan perlindungan kepada anak.',
    '3': 'Korban kekerasan dalam rumah tangga berhak mendapatkan ganti rugi dan pemulihan.',
  },
};

test('claimTokens splits Thai runs into trigrams', () => {
  const t = claimTokens('สิทธิในการเข้าถึงข้อมูล');
  assert.ok(t.length > 0);
  assert.ok(t.every((x) => x.length === 3), `every Thai token is a trigram: ${JSON.stringify(t)}`);
  assert.ok(t.includes('สิท') && t.includes('ทธิ') && t.includes('ข้อ'));
  assert.ok(!t.some((x) => /[a-z]/u.test(x)), 'no Latin tokens from Thai input');
});

test('claimTokens keeps Latin unigrams and bigrams in order, stop words removed', () => {
  assert.deepEqual(claimTokens('data transfer right'),
    ['data', 'data transfer', 'transfer', 'transfer right', 'right']);
  assert.deepEqual(claimTokens('the data of transfer'), ['data', 'data transfer', 'transfer']);
});

test('claimTokens drops corpus stop words', () => {
  assert.deepEqual(claimTokens('the of and pasal ayat undang nomor tahun untuk dengan'), []);
  assert.deepEqual(claimTokens('dan Pasal 5 untuk Undang-Undang'), []);
});

test('claimTokens ignores CJK text', () => {
  assert.deepEqual(claimTokens('第三条规定 保护个人信息'), []);
  assert.deepEqual(claimTokens('第9条'), []);
});

test('cjkShare measures the CJK share of letters only', () => {
  assert.equal(cjkShare('该条规定了处理个人数据'), 1);
  assert.equal(cjkShare('Hak untuk tidak diperlakukan'), 0);
  assert.ok(cjkShare('中文 text') > 0.3);
});

test('createCrossIndex returns null for stub laws and laws without articles', () => {
  const idx = createCrossIndex({ byId: {} });
  assert.equal(idx({ law_id: 'S', stub: true, articles: { '1': 'x' } }), null);
  assert.equal(idx({ law_id: 'N', articles: null }), null);
  assert.equal(idx(null), null);
});

test('rankArticles never suggests blob articles longer than 8x the median', () => {
  const art = (w) => `Pasal berisi tentang ${w} dan keterangan lebih lanjut mengenai hal tersebut.`;
  const law = {
    law_id: 'ID-TEST-BLOB', title: 'Test Law', aliases: [],
    articles: {
      '1': art('satu'), '2': art('dua'), '3': art('tiga'), '4': art('empat'),
      '5': `Pasal berisi tentang ${'kata unik yang hanya ada di sini '.repeat(30)}`,
    },
  };
  const ix = createCrossIndex({ byId: {} })(law);
  assert.ok(ix.lens['5'] > 8 * ix.median, 'article 5 is a blob');
  const { ranked } = rankArticles('Pasal 5 mengatur kata unik yang hanya ada di sini dan keterangan', ix);
  assert.ok(ranked.length > 0);
  assert.ok(!ranked.some(([k]) => k === '5'), 'blob article must never be suggested');
});

test('rankArticles puts the article sharing the claim words first', () => {
  const ix = createCrossIndex({ byId: {} })(ID_LAW);
  const { ranked, n } = rankArticles('Korban kekerasan dalam rumah tangga berhak mendapatkan ganti rugi dan pemulihan', ix);
  assert.ok(n >= 6);
  assert.equal(ranked[0][0], '3');
  assert.ok(ranked[0][1] > ranked[1][1]);
});

test('rankArticles excludes law-name tokens from the claim', () => {
  const ix = createCrossIndex({ byId: {} })(ID_LAW);
  assert.deepEqual(rankArticles('perlindungan anak', ix), { n: 0, ranked: [] });
  const { ranked } = rankArticles('Perlindungan Anak korban kekerasan rumah tangga', ix);
  assert.equal(ranked[0][0], '3');
});

test('claimWindows covers the claim line plus following lines', () => {
  const text = 'Pasal 5 UU No. 27 Tahun 2022 mengatur hak akses.\nSubjek data berhak mendapat informasi lengkap.\nPenjelasan lebih lanjut mengenai hak akses.';
  const w = claimWindows(text, [{ sentence: 'Pasal 5 UU No. 27 Tahun 2022 mengatur hak akses.' }]);
  assert.equal(w[0], text);
});

test('claimWindows stops at the next article reference', () => {
  const text = 'Pasal 5 UU No. 27 Tahun 2022 mengatur hak akses.\nPenjelasan pertama.\nPasal 9 UU No. 27 Tahun 2022 mengatur kewajiban.\nPenjelasan kedua.';
  const w = claimWindows(text, [{ sentence: 'Pasal 5 UU No. 27 Tahun 2022 mengatur hak akses.' }]);
  assert.ok(w[0].includes('Penjelasan pertama.'));
  assert.ok(!w[0].includes('Pasal 9'));
  assert.ok(!w[0].includes('Penjelasan kedua.'));
});

test('claimWindows stops at a Markdown heading', () => {
  const text = 'Pasal 5 UU No. 27 Tahun 2022 mengatur hak akses.\nPenjelasan pertama.\n## Ringkasan\nSetelah heading.';
  const w = claimWindows(text, [{ sentence: 'Pasal 5 UU No. 27 Tahun 2022 mengatur hak akses.' }]);
  assert.ok(w[0].includes('Penjelasan pertama.'));
  assert.ok(!w[0].includes('Ringkasan'));
  assert.ok(!w[0].includes('Setelah heading.'));
});

test('claimWindows stops at a line naming another numbered law', () => {
  const text = 'Pasal 5 UU No. 27 Tahun 2022 mengatur hak akses.\nPenjelasan pertama.\nPP No. 9 Tahun 1975 mengatur hal lain.\nSetelah PP.';
  const w = claimWindows(text, [{ sentence: 'Pasal 5 UU No. 27 Tahun 2022 mengatur hak akses.' }]);
  assert.ok(w[0].includes('Penjelasan pertama.'));
  assert.ok(!w[0].includes('PP No. 9 Tahun 1975'));
  assert.ok(!w[0].includes('Setelah PP.'));
});

test('claimWindows matches duplicate line text to later lines in order', () => {
  const line = 'Pasal 5 UU No. 27 Tahun 2022 mengatur hak akses.';
  const text = `${line}\nCatatan pertama.\nPasal 9 UU No. 27 Tahun 2022 mengatur kewajiban.\n${line}\nCatatan kedua.`;
  const results = [
    { sentence: line },
    { sentence: 'Pasal 9 UU No. 27 Tahun 2022 mengatur kewajiban.' },
    { sentence: line },
  ];
  const w = claimWindows(text, results);
  assert.ok(w[0].includes('Catatan pertama.'));
  assert.equal(w[1], 'Pasal 9 UU No. 27 Tahun 2022 mengatur kewajiban.');
  // The third result re-uses the same line text: it must match the second occurrence, in order.
  assert.ok(w[2].includes('Catatan kedua.'));
  assert.ok(!w[2].includes('Catatan pertama.'));
});

test('crossCheck flags misattribution when another article fits better', () => {
  const law = {
    law_id: 'ID-TEST-XR', title: 'Undang-Undang Pengujian', aliases: [],
    articles: {
      '1': 'Definisi istilah dan ketentuan umum dalam undang-undang ini.',
      '2': 'Pengendali wajib memberitahukan kebocoran data pribadi secara tertulis paling lambat tiga kali dua puluh empat jam kepada subjek data.',
      '3': 'Sanksi pidana berupa denda dan pidana penjara bagi pelanggar.',
    },
  };
  const ix = createCrossIndex({ byId: {} })(law);
  const claim = 'Pengendali wajib memberitahukan kebocoran data pribadi secara tertulis paling lambat tiga kali dua puluh empat jam kepada subjek data.';
  const r = crossCheck({ sentence: `Pasal 1 UU mengatur ${claim}`, article: '1' }, claim, law, ix);
  assert.equal(r.kind, 'misattributed');
  assert.equal(r.suggested_article, '2');
  assert.equal(r.suggested_law, 'ID-TEST-XR');
  assert.ok(r.score_best >= 0.2 && r.score_best >= 3 * r.score_cited);
  assert.equal(r.excerpt, law.articles['2']);
});

test('crossCheck returns null when the cited article is the best match', () => {
  const ix = createCrossIndex({ byId: {} })(ID_LAW);
  const r = crossCheck({ sentence: 'Pasal 3 UU mengatur korban kekerasan.', article: '3' },
    'Korban kekerasan dalam rumah tangga berhak mendapatkan ganti rugi dan pemulihan.', ID_LAW, ix);
  assert.equal(r, null);
});

test('crossCheck skips article ranges in the citation line', () => {
  const ix = createCrossIndex({ byId: {} })(ID_LAW);
  const claim = 'Korban kekerasan dalam rumah tangga berhak mendapatkan ganti rugi dan pemulihan.';
  assert.equal(crossCheck({ sentence: 'Pasal 5 sampai dengan Pasal 13 mengatur hak subjek data.', article: '5' }, claim, ID_LAW, ix), null);
  assert.equal(crossCheck({ sentence: 'Điều 3–5 quy định về quyền chủ thể dữ liệu.', article: '3' }, claim, ID_LAW, ix), null);
});

test('crossCheck skips CJK-dominated claims', () => {
  const ix = createCrossIndex({ byId: {} })(ID_LAW);
  const r = crossCheck({ sentence: 'Pasal 1 UU mengatur hal tersebut.', article: '1' },
    '该条规定了处理个人数据需要取得同意的具体程序和要求以及相关法律责任。', ID_LAW, ix);
  assert.equal(r, null);
});

test('crossCheck needs at least minTokens content tokens', () => {
  const ix = createCrossIndex({ byId: {} })(ID_LAW);
  assert.equal(crossCheck({ sentence: 'Pasal 1 UU.', article: '1' }, 'Perlindungan data', ID_LAW, ix), null);
});

test('crossCheck flags long statements with near-zero overlap as unsupported', () => {
  const law = {
    law_id: 'ID-TEST-XR', title: 'Undang-Undang Pengujian', aliases: [],
    articles: {
      '1': 'Definisi istilah dan ketentuan umum dalam undang-undang ini.',
      '2': 'Pengendali wajib memberitahukan kebocoran data pribadi secara tertulis paling lambat tiga kali dua puluh empat jam kepada subjek data.',
      '3': 'Sanksi pidana berupa denda dan pidana penjara bagi pelanggar.',
    },
  };
  const ix = createCrossIndex({ byId: {} })(law);
  const claim = 'Laporan tahunan ini memuat analisis keuangan pasar modal daerah dan luar negeri serta proyeksi anggaran pendapatan belanja negara tahun depan yang disusun oleh tim kerja khusus';
  const r = crossCheck({ sentence: 'Pasal 1 UU mengatur laporan tahunan.', article: '1' }, claim, law, ix);
  assert.equal(r.kind, 'unsupported');
  assert.ok(r.tokens >= 30);
  assert.ok(r.score_cited <= 0.06);
  assert.ok(r.score_best < 0.2);
});

test('end-to-end: real corpus flags a gold H3 misattribution from the eval dataset', () => {
  // eval/data/dataset.jsonl row QIDID01-deepseek-v4.1-flash, citation C07 (gold CONTENT_MISMATCH / ["H3"]):
  // the answer attributes the right to sue for damages to Pasal 11 of UU PDP, but the bundled official text
  // of Pasal 11 covers suspension/limitation of processing, while the wording sits in Pasal 12.
  const text = [
    'Dasar hukumnya adalah **Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi** (UU PDP).',
    '**7. Pasal 11 — Hak menggugat dan menuntut ganti rugi**',
    'Subjek Data Pribadi berhak menggugat dan menuntut ganti rugi atas pelanggaran pemrosesan Data Pribadi tentang dirinya sesuai dengan ketentuan peraturan perundang-undangan.',
  ].join('\n');
  const [r] = verify(text, { asOf: '2026-10-18', country: 'ID', crossref: true });
  assert.equal(r.verdict, 'CONTENT_MISMATCH');
  assert.equal(r.rule_verdict, 'EXISTS_UNQUOTED');
  assert.deepEqual(enrich(r).hallucination_types, ['H3']);
  assert.equal(r.law, 'ID-UU-27-2022');
  assert.equal(r.crossref.kind, 'misattributed');
  assert.equal(r.crossref.suggested_article, '12');
  assert.ok(enrich(r).reason_en.includes('did you mean article'));
});

test('crossref is opt-in: without crossref:true the verdict stays EXISTS_UNQUOTED', () => {
  const text = 'Dasar hukumnya adalah **Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi** (UU PDP).\n**7. Pasal 11 — Hak menggugat dan menuntut ganti rugi**\nSubjek Data Pribadi berhak menggugat dan menuntut ganti rugi atas pelanggaran pemrosesan Data Pribadi tentang dirinya sesuai dengan ketentuan peraturan perundang-undangan.';
  const [r] = verify(text, { asOf: '2026-10-18', country: 'ID' });
  assert.equal(r.verdict, 'EXISTS_UNQUOTED');
  assert.equal(r.rule_verdict, 'EXISTS_UNQUOTED');
  assert.equal(r.crossref, undefined);
  assert.equal(r.content_types, undefined);
});

test('legacy mode ignores crossref:true', () => {
  const text = 'Dasar hukumnya adalah **Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi** (UU PDP).\n**7. Pasal 11 — Hak menggugat dan menuntut ganti rugi**\nSubjek Data Pribadi berhak menggugat dan menuntut ganti rugi atas pelanggaran pemrosesan Data Pribadi tentang dirinya sesuai dengan ketentuan peraturan perundang-undangan.';
  const [r] = verify(text, { asOf: '2026-10-18', country: 'ID', legacy: true, crossref: true });
  assert.equal(r.verdict, 'EXISTS_UNQUOTED');
  assert.equal(r.crossref, undefined);
  assert.equal(r.content_types, undefined);
});

test('demo memo verdicts are unchanged with crossref on', () => {
  const memo = fs.readFileSync(new URL('./fixtures/demo_memo_en.txt', import.meta.url), 'utf8');
  const plain = verify(memo, { asOf: '2026-11-10' });
  const withX = verify(memo, { asOf: '2026-11-10', crossref: true });
  assert.equal(plain.length, 9);
  assert.equal(withX.length, 9);
  assert.deepEqual(withX.map((r) => r.verdict), plain.map((r) => r.verdict));
  assert.deepEqual(withX.map((r) => r.rule_verdict), plain.map((r) => r.rule_verdict));
  assert.ok(withX.every((r) => !r.crossref && !r.advisories && !r.content_types));
});
