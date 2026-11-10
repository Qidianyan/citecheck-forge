// Task E tests: eval runner metrics, split, alignment, runEval, REPORT.md rendering and CLI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { makeSplit, rowsFor, align, detection, wilson, extractionRecall, groupBy, HALL } from '../eval/metrics.mjs';
import { runEval, renderReport, MODES, SILVER_NOTE } from '../eval/run-eval.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const approx = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// --- synthetic dataset -------------------------------------------------------
const RECS = [
  { id: 'A1', qid: 'Q1', model: 'm1', country: 'VN', lang: 'zh', as_of: '2026-01-01', answer_text: 'one',
    citations: [ { cid: 'C1', article: '5', kind: 'statute', gold: { law_id: 'L1', verdict: 'ARTICLE_NOT_FOUND', types: ['H1'] } } ] },
  { id: 'A2', qid: 'Q2', model: 'm1', country: 'VN', lang: 'vi', answer_text: 'two',
    citations: [ { cid: 'C2', article: '9', kind: 'statute', gold: { law_id: 'L2', verdict: 'EXISTS_CONSISTENT', types: [] } } ] },
  { id: 'A3', qid: 'Q3', model: 'm2', country: 'ID', lang: 'id', as_of: '2026-05-05', answer_text: 'three',
    citations: [
      { cid: 'C3', article: '11', kind: 'statute', gold: { law_id: 'L3', verdict: 'CONTENT_MISMATCH', types: ['H4'] } },
      { cid: 'C4', article: '90', kind: 'statute', gold: { law_id: 'L4', verdict: 'EXISTS_CONSISTENT', types: [] } },
      { cid: 'C5', article: '1', kind: 'case', gold: { law_id: null, verdict: 'UNVERIFIABLE', types: [] } },
    ] },
];

function fakeVerify(text) {
  if (text === 'one') return [{ type: 'statute', law: 'L1', article: '5', verdict: 'ARTICLE_NOT_FOUND' }];
  if (text === 'two') return [{ type: 'statute', law: 'L2', article: '9', verdict: 'EXISTS_CONSISTENT' }];
  return [
    { type: 'statute', law: 'L3', article: '11', verdict: 'CONTENT_MISMATCH' },
    { type: 'statute', law: 'L4', article: '90', verdict: 'ARTICLE_NOT_FOUND' },
    { type: 'case', law: null, article: 'X', verdict: 'UNVERIFIABLE' },
  ];
}

const row = (gold, pred, types = []) => ({ aid: 'a', qid: 'q', country: 'VN', lang: 'local', cid: 'c', law_id: 'L', article: '1', gold, gold_types: types, pred, pred_types: [] });

test('wilson: known values and edge cases', () => {
  assert.equal(wilson(0, 0), null);
  const [lo0, hi0] = wilson(0, 10);
  assert.ok(approx(lo0, 0));
  assert.ok(approx(hi0, 0.27754, 1e-4), hi0);
  const [lo1, hi1] = wilson(10, 10);
  assert.ok(approx(lo1, 0.72246, 1e-4), lo1);
  assert.ok(approx(hi1, 1));
  const [lo, hi] = wilson(5, 10);
  assert.ok(approx(lo, 0.23659, 1e-4), lo);
  assert.ok(approx(hi, 0.76341, 1e-4), hi);
});

test('makeSplit is deterministic and label-independent', () => {
  const recs = RECS;
  const s1 = makeSplit(recs);
  const s2 = makeSplit(recs);
  for (const r of recs) assert.equal(s1(r.qid), s2(r.qid));
  // Shuffled order and mutated labels/citations must not move any qid.
  const mutated = [...recs].reverse().map((r) => ({ ...r, answer_text: 'changed', citations: [] }));
  const s3 = makeSplit(mutated);
  for (const r of recs) assert.equal(s1(r.qid), s3(r.qid));
});

test('makeSplit: ~30% of qids per country land in test, every country in both splits', () => {
  const recs = [];
  for (const c of ['VN', 'ID', 'TH']) for (let i = 1; i <= 20; i++) recs.push({ id: `${c}${i}`, qid: `${c}-Q${i}`, country: c, citations: [] });
  const split = makeSplit(recs);
  for (const c of ['VN', 'ID', 'TH']) {
    const qids = recs.filter((r) => r.country === c).map((r) => r.qid);
    const nTest = qids.filter((q) => split(q) === 'test').length;
    assert.ok(Math.abs(nTest / qids.length - 0.3) < 0.15, `${c}: ${nTest}/${qids.length}`);
    assert.ok(qids.some((q) => split(q) === 'dev') && qids.some((q) => split(q) === 'test'), `${c} missing a split`);
  }
});

test('align picks the most severe of duplicate predictions; case citations stay MISSED', () => {
  const rec = { id: 'A1', qid: 'Q1', model: 'm', country: 'VN', lang: 'zh',
    citations: [
      { cid: 'C1', article: '5', kind: 'statute', gold: { law_id: 'L1', verdict: 'ARTICLE_NOT_FOUND', types: ['H1'] } },
      { cid: 'C2', article: '7', kind: 'case', gold: { law_id: null, verdict: 'UNVERIFIABLE', types: [] } },
    ] };
  const results = [
    { type: 'statute', law: 'L1', article: '5', verdict: 'EXISTS_CONSISTENT' },
    { type: 'statute', law: 'L1', article: '5', verdict: 'ARTICLE_NOT_FOUND' },
    { type: 'case', law: null, article: '7', verdict: 'UNVERIFIABLE' },
  ];
  const { pairs, extra } = align(rec, results);
  assert.equal(pairs[0][1].verdict, 'ARTICLE_NOT_FOUND'); // most severe wins
  assert.equal(pairs[1][1], null); // case kind never aligns
  assert.equal(extra, 0);
  const rev = align(rec, [...results].reverse());
  assert.equal(rev.pairs[0][1].verdict, 'ARTICLE_NOT_FOUND'); // order-independent
  assert.equal(rowsFor(rec, results).rows[0].pred, 'ARTICLE_NOT_FOUND');
  assert.equal(rowsFor(rec, results).rows[1].pred, 'MISSED');
});

test('detection counts tp/fp/fn on a synthetic set', () => {
  const rows = [
    row('ARTICLE_NOT_FOUND', 'ARTICLE_NOT_FOUND', ['H1']), // tp
    row('CONTENT_MISMATCH', 'CONTENT_MISMATCH', ['H4']), // tp
    row('NOT_IN_FORCE', 'EXISTS_CONSISTENT', ['H5']), // fn
    row('ARTICLE_NOT_FOUND', 'MISSED', ['H1']), // fn
    row('EXISTS_CONSISTENT', 'ARTICLE_NOT_FOUND'), // fp
    row('EXISTS_CONSISTENT', 'EXISTS_CONSISTENT'), // tn
    row('UNVERIFIABLE', 'ARTICLE_NOT_FOUND'), // not verifiable, excluded
  ];
  const d = detection(rows);
  assert.equal(d.n_verifiable, 6);
  assert.equal(d.n_positive, 4);
  assert.equal(d.tp, 2);
  assert.equal(d.fp, 1);
  assert.equal(d.fn, 2);
  assert.ok(approx(d.precision, 2 / 3));
  assert.ok(approx(d.recall, 0.5));
  assert.ok(approx(d.f1, 4 / 7));
});

test('extractionRecall and groupBy helpers', () => {
  assert.equal(extractionRecall([]), null);
  assert.ok(approx(extractionRecall([{ pred: 'MISSED' }, { pred: 'X' }, { pred: 'MISSED' }]), 1 / 3));
  const g = groupBy([{ k: 'a' }, { k: 'b' }, { k: 'a' }], (r) => r.k);
  assert.equal(g.get('a').length, 2);
  assert.equal(g.get('b').length, 1);
  assert.ok(HALL.includes('ARTICLE_NOT_FOUND') && !HALL.includes('EXISTS_CONSISTENT'));
});

test('runEval on 3 synthetic answers gives expected tp/fp/fn and tables', () => {
  const rep = runEval({ recs: RECS, modes: ['enhanced'], verifyFn: fakeVerify });
  const all = rep.modes.enhanced.splits.all;
  const d = all.detection;
  assert.equal(d.tp, 2);
  assert.equal(d.fp, 1);
  assert.equal(d.fn, 0);
  assert.ok(approx(d.precision, 2 / 3));
  assert.ok(approx(d.recall, 1));
  assert.ok(approx(d.f1, 0.8));
  assert.ok(approx(all.extraction_recall, 0.8)); // 4 of 5 gold citations linked
  assert.deepEqual(all.confusion, {
    ARTICLE_NOT_FOUND: { ARTICLE_NOT_FOUND: 1 },
    EXISTS_CONSISTENT: { EXISTS_CONSISTENT: 1, ARTICLE_NOT_FOUND: 1 },
    CONTENT_MISMATCH: { CONTENT_MISMATCH: 1 },
    UNVERIFIABLE: { MISSED: 1 },
  });
  assert.deepEqual(all.by_h_type, [
    { h_type: 'H1', n: 1, caught: 1, recall: 1 },
    { h_type: 'H4', n: 1, caught: 1, recall: 1 },
  ]);
  const vn = all.by_country.find((g) => g.key === 'VN');
  const id = all.by_country.find((g) => g.key === 'ID');
  assert.equal(vn.n, 2); assert.equal(vn.tp, 1); assert.equal(vn.fp, 0); assert.equal(vn.fn, 0);
  assert.equal(id.n, 3); assert.equal(id.tp, 1); assert.equal(id.fp, 1); assert.equal(id.fn, 0);
  const local = all.by_lang.find((g) => g.key === 'local');
  const zh = all.by_lang.find((g) => g.key === 'zh');
  assert.equal(zh.n, 1); assert.equal(local.n, 4);
  assert.deepEqual(all.top_errors, [
    { gold: 'EXISTS_CONSISTENT', pred: 'ARTICLE_NOT_FOUND', kind: 'fp', count: 1, ids: [{ aid: 'A3', cid: 'C4' }] },
  ]);
  // dev + test reconstruct "all"
  const s = makeSplit(RECS);
  const devRows = RECS.filter((r) => s(r.qid) === 'dev').reduce((n, r) => n + r.citations.length, 0);
  const testRows = RECS.filter((r) => s(r.qid) === 'test').reduce((n, r) => n + r.citations.length, 0);
  assert.equal(devRows + testRows, 5);
  assert.equal(rep.modes.enhanced.splits.dev.detection.tp + rep.modes.enhanced.splits.test.detection.tp, d.tp);
  assert.equal(rep.modes.enhanced.splits.dev.detection.fp + rep.modes.enhanced.splits.test.detection.fp, d.fp);
  assert.equal(rep.modes.enhanced.splits.dev.detection.fn + rep.modes.enhanced.splits.test.detection.fn, d.fn);
});

test('runEval meta and mode options', () => {
  const calls = [];
  const rep = runEval({ recs: RECS, modes: ['legacy', 'enhanced', 'crossref'], verifyFn: (text, opts) => { calls.push({ text, opts }); return []; } });
  const findCall = (text, opts) => calls.find((c) => c.text === text && Object.keys(c.opts).length === Object.keys(opts).length && Object.entries(opts).every(([k, v]) => c.opts[k] === v));
  assert.ok(findCall('one', { asOf: '2026-01-01', country: 'VN', legacy: true }));
  assert.ok(findCall('two', { asOf: '2026-10-18', country: 'VN' })); // as_of default
  assert.ok(findCall('three', { asOf: '2026-05-05', country: 'ID', crossref: true }));
  assert.equal(calls.length, 9); // 3 answers × 3 modes
  assert.deepEqual(rep.modes.legacy.options, MODES.legacy);
  assert.deepEqual(rep.modes.crossref.options, MODES.crossref);
  assert.equal(rep.meta.answers, 3);
  assert.equal(rep.meta.citations, 5);
  assert.equal(rep.meta.note, SILVER_NOTE);
  assert.match(rep.meta.dataset_sha256, /^[0-9a-f]{64}$/);
  assert.match(rep.meta.generated_at, /^\d{4}-\d{2}-\d{2}T/);
  const split = makeSplit(RECS);
  assert.deepEqual(rep.meta.test_qids, RECS.filter((r) => split(r.qid) === 'test').map((r) => r.qid).sort());
  // empty verify results: every citation is MISSED, recall null-safe
  const all = rep.modes.enhanced.splits.all;
  assert.equal(all.extraction_recall, 0);
  assert.equal(all.detection.precision, null);
});

test('renderReport contains the headline table, per-group test tables and the caveat', () => {
  // Split-proof dataset: every answer carries one tp and one fp, so any non-empty split shows them.
  const twoCit = (id, qid, country, lang) => ({ id, qid, model: 'm', country, lang, answer_text: id,
    citations: [
      { cid: 'TP', article: '5', kind: 'statute', gold: { law_id: 'L1', verdict: 'ARTICLE_NOT_FOUND', types: ['H1'] } },
      { cid: 'FP', article: '9', kind: 'statute', gold: { law_id: 'L2', verdict: 'EXISTS_CONSISTENT', types: [] } },
    ] });
  const R2 = [ twoCit('B1', 'QB1', 'VN', 'zh'), twoCit('B2', 'QB2', 'VN', 'vi'), twoCit('B3', 'QB3', 'ID', 'id'), twoCit('B4', 'QB4', 'ID', 'id') ];
  const verify2 = () => [
    { type: 'statute', law: 'L1', article: '5', verdict: 'ARTICLE_NOT_FOUND' },
    { type: 'statute', law: 'L2', article: '9', verdict: 'CONTENT_MISMATCH' },
  ];
  const rep = runEval({ recs: R2, modes: ['enhanced'], verifyFn: verify2 });
  const md = renderReport(rep);
  assert.ok(md.includes('| mode | split |'), 'headline table header');
  assert.ok(md.includes('| enhanced | all |'), 'headline rows');
  assert.ok(md.includes('#### By country') && md.includes('#### By question language') && md.includes('#### By gold hallucination type'));
  assert.ok(md.includes('## Top error classes'));
  assert.ok(md.includes('EXISTS_CONSISTENT → CONTENT_MISMATCH'));
  assert.ok(/B\d:FP/.test(md), 'aid:cid ids listed');
  assert.ok(md.includes('70/30'), 'split description');
  assert.ok(md.includes(SILVER_NOTE), 'silver-label caveat');
  assert.ok(md.includes('66.7%'), 'numbers rounded to 1 decimal %');
  assert.ok(md.includes('H1') && md.includes('100.0%'));
});

test('CLI writes report.json and REPORT.md into a temp --out dir', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'citecheck-eval-'));
  const stdout = execFileSync(process.execPath, [path.join(ROOT, 'eval', 'run-eval.mjs'), '--out', tmp, '--modes', 'enhanced'],
    { encoding: 'utf8', timeout: 60000, cwd: ROOT });
  assert.ok(stdout.includes('enhanced test: P='), stdout);
  const report = JSON.parse(fs.readFileSync(path.join(tmp, 'report.json'), 'utf8'));
  const md = fs.readFileSync(path.join(tmp, 'REPORT.md'), 'utf8');
  assert.ok(report.modes.enhanced.splits.test.detection);
  assert.ok(md.includes('| mode | split |') && md.includes(SILVER_NOTE));
  const sha = createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'eval', 'data', 'dataset.jsonl'))).digest('hex');
  assert.equal(report.meta.dataset_sha256, sha);
  const recs = fs.readFileSync(path.join(ROOT, 'eval', 'data', 'dataset.jsonl'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  assert.deepEqual(report.meta.test_qids, [...new Set(recs.filter((r) => makeSplit(recs)(r.qid) === 'test').map((r) => r.qid))].sort());
  fs.rmSync(tmp, { recursive: true, force: true });
}, { timeout: 60000 });
