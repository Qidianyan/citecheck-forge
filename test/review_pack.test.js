// Task R tests: deterministic stratified selection, pack CSV shape, apply-reviews kappa,
// dataset immutability. Uses an injected fake verifier (no @forge imports, no network).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { selectSamples, toCsv, csvCell, packStats, PACK_COLUMNS, VERDICT_CLASSES } from '../eval/review/make-pack.mjs';
import { applyReviews, loadReviews, cohensKappa, parseCsv } from '../eval/review/apply-reviews.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'eval', 'data', 'dataset.jsonl');
const PACK_CSV = path.join(ROOT, 'eval', 'review', 'review_pack.csv');
const STATS = path.join(ROOT, 'eval', 'review', 'pack_stats.json');

const readRecs = () => fs.readFileSync(DATA, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));

const sha = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');

// Deterministic fake verifier: flips the gold verdict on sha256(aid|cid), so ~37% of
// citations disagree with gold under the flag semantics the pack uses.
function makeFakeVerify(recs) {
  const byText = new Map();
  for (const rec of recs) {
    byText.set(rec.answer_text, (rec.citations || [])
      .filter((c) => c.kind !== 'case')
      .map((c) => {
        const hex = createHash('sha256').update(`fake|${rec.id}|${c.cid}`).digest('hex');
        const disagree = parseInt(hex[0], 16) < 6;
        const gold = c.gold?.verdict ?? 'UNVERIFIABLE';
        const verdict = disagree ? (gold === 'EXISTS_CONSISTENT' ? 'CONTENT_MISMATCH' : 'EXISTS_CONSISTENT') : gold;
        return { type: 'statute', law: c.gold?.law_id ?? '', article: c.article, verdict, hallucination_types: verdict === 'CONTENT_MISMATCH' ? ['H4'] : [] };
      }));
  }
  return (text) => byText.get(text) || [];
}

const sel = (recs, opts = {}) => selectSamples(recs, { verifyFn: makeFakeVerify(recs), ...opts });

test('selectSamples: same seed → same ids, different seed → different ids', () => {
  const recs = readRecs();
  const a = sel(recs, { seed: 'citecheck-2026' }).map((s) => `${s.aid}|${s.cid}`);
  const b = sel(recs, { seed: 'citecheck-2026' }).map((s) => `${s.aid}|${s.cid}`);
  assert.deepEqual(a, b);
  const c = sel(recs, { seed: 'other-seed-2027' }).map((s) => `${s.aid}|${s.cid}`);
  assert.notDeepEqual(a, c);
  assert.ok(new Set([...a, ...c]).size > a.length);
});

test('selectSamples: size within n ± 5 for n=100 and n=40', () => {
  const recs = readRecs();
  for (const n of [100, 40]) {
    const s = sel(recs, { n, seed: 'citecheck-2026' });
    assert.ok(s.length >= n - 5 && s.length <= n + 5, `n=${n} got ${s.length}`);
  }
});

test('selectSamples: every country, gold verdict class and question language present', () => {
  const s = sel(readRecs(), { seed: 'citecheck-2026' });
  for (const c of ['VN', 'ID', 'TH']) assert.ok(s.some((x) => x.country === c), `country ${c}`);
  for (const v of VERDICT_CLASSES) assert.ok(s.some((x) => x.gold_verdict === v), `verdict ${v}`);
  assert.ok(s.some((x) => x.question_lang === 'zh') && s.some((x) => x.question_lang === 'local'));
});

test('selectSamples: every ARTICLE_NOT_FOUND citation in the dataset is included', () => {
  const recs = readRecs();
  const want = new Set();
  for (const r of recs) for (const c of r.citations || []) if (c.gold?.verdict === 'ARTICLE_NOT_FOUND') want.add(`${r.id}|${c.cid}`);
  const got = new Set(sel(recs, { seed: 'citecheck-2026' }).map((x) => `${x.aid}|${x.cid}`));
  for (const k of want) assert.ok(got.has(k), `missing ${k}`);
});

test('selectSamples: at least 25 verifier-vs-gold disagreements', () => {
  const s = sel(readRecs(), { seed: 'citecheck-2026' });
  assert.ok(s.filter((x) => x.disagreement === 'yes').length >= 25);
});

test('pack CSV: exact header, BOM, CRLF, quoting and formula guard', () => {
  const raw = fs.readFileSync(PACK_CSV, 'utf8');
  assert.ok(raw.startsWith('\uFEFF'), 'missing BOM');
  assert.ok(raw.includes('\r\n'), 'missing CRLF');
  const header = raw.split('\r\n')[0].slice(1);
  assert.equal(header, PACK_COLUMNS.join(','));
  const rows = parseCsv(raw);
  assert.equal(rows[0].length, PACK_COLUMNS.length);
  assert.ok(rows.every((r) => r.length === PACK_COLUMNS.length), 'ragged row');
  // reviewer columns empty in the generated pack
  const rIdx = PACK_COLUMNS.indexOf('reviewer_verdict');
  assert.ok(rows.slice(1).every((r) => r[rIdx] === ''));
  // unit checks for the cell escaper
  assert.equal(csvCell('=A1'), "'=A1");
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('-1'), "'-1");
  assert.equal(csvCell('@x'), "'@x");
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('l1\nl2'), '"l1\nl2"');
  assert.equal(csvCell(null), '');
  // toCsv round-trips and guards formula-leading claims
  const samples = selectSamples(readRecs(), { n: 5, seed: 's', verifyFn: () => [] });
  samples[0].claim = '=SUM(A1)';
  const csvText = toCsv(samples);
  assert.ok(csvText.includes(`"'=SUM(A1)"`) || csvText.includes("'=SUM(A1)"));
  assert.equal(parseCsv(csvText)[1][PACK_COLUMNS.indexOf('claim')], '=SUM(A1)');
});

test('pack CSV: at least 25 disagreement rows and strata present in the committed pack', () => {
  const rows = parseCsv(fs.readFileSync(PACK_CSV, 'utf8'));
  const h = rows[0];
  const col = (name) => h.indexOf(name);
  const body = rows.slice(1);
  assert.ok(body.filter((r) => r[col('disagreement')] === 'yes').length >= 25);
  for (const c of ['VN', 'ID', 'TH']) assert.ok(body.some((r) => r[col('country')] === c));
  for (const v of VERDICT_CLASSES) assert.ok(body.some((r) => r[col('gold_verdict')] === v));
  assert.ok(body.some((r) => r[col('question_lang')] === 'zh') && body.some((r) => r[col('question_lang')] === 'local'));
  assert.ok(body.some((r) => r[col('official_excerpt')] !== ''));
  assert.ok(body.every((r) => r[col('answer_excerpt')].length <= 600));
  assert.ok(body.every((r) => r[col('official_excerpt')].length <= 1200));
});

test('pack_stats.json matches the committed pack', () => {
  const rows = parseCsv(fs.readFileSync(PACK_CSV, 'utf8'));
  const h = rows[0];
  const body = rows.slice(1);
  const stats = JSON.parse(fs.readFileSync(STATS, 'utf8'));
  const count = (i) => body.reduce((m, r) => (m[r[i]] = (m[r[i]] || 0) + 1, m), {});
  assert.equal(stats.n, body.length);
  assert.deepEqual(stats.by_country, count(h.indexOf('country')));
  assert.deepEqual(stats.by_gold_verdict, count(h.indexOf('gold_verdict')));
  assert.deepEqual(stats.by_question_lang, count(h.indexOf('question_lang')));
  assert.equal(stats.disagreements, body.filter((r) => r[h.indexOf('disagreement')] === 'yes').length);
  assert.equal(stats.article_not_found_included, body.filter((r) => r[h.indexOf('gold_verdict')] === 'ARTICLE_NOT_FOUND').length);
});

test('apply-reviews: parses a 3-row filled CSV and computes Cohen kappa on a hand-made example', () => {
  const rowFor = (i, gold, review, types) => {
    const cells = new Array(PACK_COLUMNS.length).fill('');
    const set = (name, v) => { cells[PACK_COLUMNS.indexOf(name)] = v; };
    set('sample_id', `R${i}`); set('aid', `A${i}`); set('cid', `C${i}`); set('split', 'dev');
    set('gold_verdict', gold); set('gold_types', 'H5');
    set('reviewer_verdict', review); set('reviewer_types', types);
    set('reviewer_confidence', '2'); set('reviewer_notes', 'checked the gazette'); set('reviewer_initials', 'AB');
    return cells.join(',');
  };
  // gold  A A B ; reviewer A B B  → po = 2/3, pe = 4/9, kappa = 0.4
  const csvText = `\uFEFF${PACK_COLUMNS.join(',')}\r\n${[
    rowFor(1, 'CONTENT_MISMATCH', 'CONTENT_MISMATCH', 'H3;H4'),
    rowFor(2, 'CONTENT_MISMATCH', 'NOT_IN_FORCE', 'H5'),
    rowFor(3, 'NOT_IN_FORCE', 'NOT_IN_FORCE', 'H5'),
  ].join('\r\n')}\r\n`;
  const reviews = loadReviews(csvText);
  assert.equal(reviews.length, 3);
  assert.deepEqual(reviews[0].reviewer_types, ['H3', 'H4']);
  assert.equal(reviews[0].confidence, 2);
  assert.equal(reviews[0].initials, 'AB');
  const { labels, stats } = applyReviews(csvText);
  assert.equal(labels.length, 3);
  assert.deepEqual(Object.keys(labels[0]), ['aid', 'cid', 'reviewer_verdict', 'reviewer_types', 'confidence', 'initials']);
  assert.equal(labels[0].reviewer_verdict, 'CONTENT_MISMATCH');
  assert.equal(stats.n_reviewed, 3);
  assert.equal(stats.n_agree, 2);
  assert.ok(Math.abs(stats.kappa - 0.4) < 1e-9, `kappa=${stats.kappa}`);
  assert.ok(Math.abs(cohensKappa([['A', 'A'], ['A', 'B'], ['B', 'B']]) - 0.4) < 1e-9);
  assert.equal(cohensKappa([['A', 'A'], ['B', 'B']]), 1);
  assert.equal(cohensKappa([['A', 'B'], ['B', 'A']]), -1);
  assert.equal(cohensKappa([]), null);
});

test('apply-reviews CLI: writes reviewed_labels.jsonl and prints stats, dataset untouched', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-'));
  const csvPath = path.join(dir, 'filled.csv');
  const rowFor = (i, gold, review) => {
    const cells = new Array(PACK_COLUMNS.length).fill('');
    const set = (name, v) => { cells[PACK_COLUMNS.indexOf(name)] = v; };
    set('aid', `A${i}`); set('cid', `C${i}`); set('gold_verdict', gold);
    set('reviewer_verdict', review); set('reviewer_types', 'H4'); set('reviewer_confidence', '3'); set('reviewer_initials', 'XY');
    return cells.join(',');
  };
  fs.writeFileSync(csvPath, `\uFEFF${PACK_COLUMNS.join(',')}\r\n${[rowFor(1, 'UNVERIFIABLE', 'UNVERIFIABLE'), rowFor(2, 'UNVERIFIABLE', 'CONTENT_MISMATCH'), rowFor(3, 'CONTENT_MISMATCH', 'CONTENT_MISMATCH')].join('\r\n')}\r\n`);
  const out = path.join(dir, 'labels.jsonl');
  const stdout = execFileSync(process.execPath, [path.join(ROOT, 'eval', 'review', 'apply-reviews.mjs'), '--csv', csvPath, '--out', out], { encoding: 'utf8' });
  const stats = JSON.parse(stdout.trim().split('\n').pop());
  assert.equal(stats.n_reviewed, 3);
  assert.equal(stats.kappa, cohensKappa([['UNVERIFIABLE', 'UNVERIFIABLE'], ['UNVERIFIABLE', 'CONTENT_MISMATCH'], ['CONTENT_MISMATCH', 'CONTENT_MISMATCH']]));
  const lines = fs.readFileSync(out, 'utf8').split('\n').filter(Boolean);
  assert.equal(lines.length, 3);
  assert.deepEqual(JSON.parse(lines[0]), { aid: 'A1', cid: 'C1', reviewer_verdict: 'UNVERIFIABLE', reviewer_types: ['H4'], confidence: 3, initials: 'XY' });
});

test('make-pack CLI runs and leaves dataset.jsonl byte-identical', () => {
  const before = sha(DATA);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-'));
  const stdout = execFileSync(process.execPath, [path.join(ROOT, 'eval', 'review', 'make-pack.mjs'), '--n', '20', '--seed', 'cli-test', '--out', dir], { encoding: 'utf8' });
  assert.ok(stdout.includes('wrote 20 samples'));
  const csv = fs.readFileSync(path.join(dir, 'review_pack.csv'), 'utf8');
  assert.ok(csv.startsWith('\uFEFF'));
  assert.equal(parseCsv(csv).length, 21);
  const stats = JSON.parse(fs.readFileSync(path.join(dir, 'pack_stats.json'), 'utf8'));
  assert.equal(stats.n, 20);
  assert.equal(stats.seed, 'cli-test');
  // selection exports are pure; dataset untouched
  sel(readRecs(), { n: 10, seed: 'x' });
  packStats([], { n: 0, seed: 'x' });
  assert.equal(sha(DATA), before);
});
