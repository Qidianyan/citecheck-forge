// Task E: JS eval runner. Measures the verifier on the bundled eval set (eval/data/dataset.jsonl)
// and writes report.json + REPORT.md into the --out dir (default: eval/). Offline only, no network,
// no Forge modules. `npm run eval` executes this file; it must finish in < 60 s.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { verify } from '../src/core/index.js';
import { makeSplit, rowsFor, detection, extractionRecall, groupBy, HALL } from './metrics.mjs';

// CLI --modes values and the options each mode passes to verify().
// crossref_prereg: the configuration fixed on the dev split before the held-out split was scored
// (numeric H7 checks flip verdicts). crossref: the shipped default (numeric checks are advisory only),
// chosen AFTER seeing held-out results — reported as a post-hoc variant.
export const MODES = {
  legacy: { legacy: true },
  enhanced: {},
  crossref_prereg: { crossref: true, crossrefOptions: { numbers: 'flag' } },
  crossref_noanchor: { crossref: true, crossrefOptions: { anchors: false } },
  crossref: { crossref: true },
};
export const MODE_NOTES = {
  legacy: 'Reference behaviour of the original Python verifier (rule checks only).',
  enhanced: 'Rule checks + English law names, per-line country cues, translation fallback.',
  crossref_prereg: 'Phase-2 pre-registered variant (H7 numbers flag), now on the phase-3 linking + anchors code.',
  crossref_noanchor: 'Ablation: shipped default without the zh→local glossary anchors (phase-3 linking rules only).',
  crossref: 'Shipped default (phase 3): content checks with H7 advisory, same-name-law version pinning + heading inheritance, and zh→local glossary anchors for Chinese claims. Phase 4 adds block-quote quotes and article range/list expansion (frozen at 4485595). The 30% test split has been SEEN since phase 3, so its numbers are no longer a clean held-out estimate; see eval/fresh/FRESH_REPORT.md for the fresh held-out set. (Phase-2 history: shipped crossref test P 95.9 / R 40.9, post-hoc; crossref_prereg test P 89.3 / R 43.5.)',
};

export const SILVER_NOTE = 'Labels are silver standard (rule facts + LLM judge), not yet human-audited.';

const SPLIT_NAMES = ['dev', 'test', 'all'];

const pct = (x) => (x == null ? 'NA' : `${(x * 100).toFixed(1)}%`);
const ci = (x) => (x == null ? 'NA' : `[${pct(x[0])}, ${pct(x[1])}]`);

/** Detection-style stats for one group of rows (reuses detection so semantics stay identical). */
function groupStats(rows) {
  const d = detection(rows);
  return { n: rows.length, n_verifiable: d.n_verifiable, tp: d.tp, fp: d.fp, fn: d.fn, recall: d.recall };
}

function groupTable(rows, keyFn) {
  return [...groupBy(rows, keyFn)]
    .map(([key, rs]) => ({ key, ...groupStats(rs) }))
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

/** Recall per gold hallucination type: rows whose gold is hallucinated, caught when pred ∈ HALL. */
function hTypeTable(rows) {
  const st = new Map();
  for (const r of rows) {
    if (!HALL.includes(r.gold)) continue;
    for (const t of r.gold_types) {
      const s = st.get(t) ?? { h_type: t, n: 0, caught: 0 };
      s.n += 1;
      if (HALL.includes(r.pred)) s.caught += 1;
      st.set(t, s);
    }
  }
  return [...st.values()]
    .sort((a, b) => a.h_type.localeCompare(b.h_type))
    .map((s) => ({ ...s, recall: s.n ? s.caught / s.n : null }));
}

/** Count rows per gold→pred verdict pair. */
function confusionMap(rows) {
  const m = {};
  for (const r of rows) {
    const g = r.gold ?? 'UNKNOWN';
    m[g] ??= {};
    m[g][r.pred] = (m[g][r.pred] ?? 0) + 1;
  }
  return m;
}

/** 5 largest gold→pred cells among false negatives (incl. MISSED) and all false positives. */
function topErrors(rows) {
  const cells = new Map();
  for (const r of rows) {
    const isFn = HALL.includes(r.gold) && !HALL.includes(r.pred);
    const isFp = r.gold === 'EXISTS_CONSISTENT' && HALL.includes(r.pred);
    if (!isFn && !isFp) continue;
    const key = `${r.gold}->${r.pred}`;
    let c = cells.get(key);
    if (!c) { c = { gold: r.gold, pred: r.pred, kind: isFn ? 'fn' : 'fp', count: 0, ids: [] }; cells.set(key, c); }
    c.count += 1;
    if (c.ids.length < 10) c.ids.push({ aid: r.aid, cid: r.cid });
  }
  return [...cells.values()].sort((a, b) => b.count - a.count).slice(0, 5);
}

function splitStats(rows) {
  return {
    n_rows: rows.length,
    extraction_recall: extractionRecall(rows),
    detection: detection(rows),
    by_country: groupTable(rows, (r) => r.country),
    by_lang: groupTable(rows, (r) => r.lang),
    by_h_type: hTypeTable(rows),
    confusion: confusionMap(rows),
    top_errors: topErrors(rows),
  };
}

/**
 * Run the verifier over every answer in `recs` for each mode and build the report object.
 * verifyFn(text, opts) may be injected (tests); defaults to the real verifier.
 */
export function runEval({ recs, modes = Object.keys(MODES), verifyFn = verify, sha256: shaArg } = {}) {
  const split = makeSplit(recs);
  const testQids = [...new Set(recs.filter((r) => split(r.qid) === 'test').map((r) => r.qid))].sort();
  const nCitations = recs.reduce((n, r) => n + (r.citations || []).length, 0);
  const datasetSha = shaArg ?? createHash('sha256').update(JSON.stringify(recs)).digest('hex');

  const modesOut = {};
  for (const mode of modes) {
    const opts = MODES[mode] ?? {};
    const rows = recs.flatMap((rec) =>
      rowsFor(rec, verifyFn(rec.answer_text, { asOf: rec.as_of || '2026-10-18', country: rec.country, ...opts })).rows);
    const splits = {};
    for (const s of SPLIT_NAMES) {
      splits[s] = splitStats(s === 'all' ? rows : rows.filter((r) => split(r.qid) === s));
    }
    modesOut[mode] = { options: opts, splits };
  }
  return {
    meta: {
      generated_at: new Date().toISOString(),
      dataset_sha256: datasetSha,
      answers: recs.length,
      citations: nCitations,
      test_qids: testQids,
      note: SILVER_NOTE,
    },
    modes: modesOut,
  };
}

/** Render the report object as English Markdown (eval/REPORT.md). */
export function renderReport(report) {
  const L = [];
  const { meta } = report;
  L.push('# CiteCheck eval report', '');
  L.push(`Generated: ${meta.generated_at}`);
  L.push(`Dataset sha256: \`${meta.dataset_sha256}\``);
  L.push(`${meta.answers} answers, ${meta.citations} citations, ${meta.test_qids.length} held-out test questions.`, '');

  L.push('## Modes', '');
  for (const m of Object.keys(report.modes)) L.push(`- **${m}** — ${MODE_NOTES[m] ?? ''}`);
  L.push('', 'Acceptance target: recall ≥ 45% at precision ≥ 95% on the held-out test split. Honest status: no configuration reaches both on the test split (see headline).', '');
  L.push('## Headline (per mode × split)', '');
  L.push('| mode | split | P | P CI95 | R | R CI95 | F1 | extraction recall |');
  L.push('|---|---|---|---|---|---|---|---|');
  for (const mode of Object.keys(report.modes)) {
    for (const s of SPLIT_NAMES) {
      const { detection: d, extraction_recall: er } = report.modes[mode].splits[s];
      L.push(`| ${mode} | ${s} | ${pct(d.precision)} | ${ci(d.precision_ci95)} | ${pct(d.recall)} | ${ci(d.recall_ci95)} | ${pct(d.f1)} | ${pct(er)} |`);
    }
  }
  L.push('');

  L.push('## Per-group recall (test split)', '');
  for (const mode of Object.keys(report.modes)) {
    const sp = report.modes[mode].splits.test;
    L.push(`### ${mode}`, '');
    L.push('#### By country', '', '| country | n | verifiable | tp | fp | fn | recall |', '|---|---|---|---|---|---|---|');
    for (const g of sp.by_country) L.push(`| ${g.key} | ${g.n} | ${g.n_verifiable} | ${g.tp} | ${g.fp} | ${g.fn} | ${pct(g.recall)} |`);
    L.push('', '#### By question language', '', '| language | n | verifiable | tp | fp | fn | recall |', '|---|---|---|---|---|---|---|');
    for (const g of sp.by_lang) L.push(`| ${g.key} | ${g.n} | ${g.n_verifiable} | ${g.tp} | ${g.fp} | ${g.fn} | ${pct(g.recall)} |`);
    L.push('', '#### By gold hallucination type (caught = pred is a hallucination verdict)', '', '| h_type | n | caught | recall |', '|---|---|---|---|');
    for (const g of sp.by_h_type) L.push(`| ${g.h_type} | ${g.n} | ${g.caught} | ${pct(g.recall)} |`);
    L.push('');
  }

  L.push('## Top error classes (test split)', '');
  L.push('Five largest gold→pred cells among false negatives (incl. MISSED) and all false positives.', '');
  for (const mode of Object.keys(report.modes)) {
    L.push(`### ${mode}`, '', '| rank | gold → pred | class | count | ids (aid:cid, max 10) |', '|---|---|---|---|---|');
    report.modes[mode].splits.test.top_errors.forEach((e, i) => {
      L.push(`| ${i + 1} | ${e.gold} → ${e.pred} | ${e.kind} | ${e.count} | ${e.ids.map((x) => `${x.aid}:${x.cid}`).join(', ')} |`);
    });
    L.push('');
  }

  L.push('## Split', '');
  L.push('Fixed 70/30 split by question id, stratified by country: within each country the qids are ordered by sha256(qid) and the first round(30%) go to "test"; the split is label-independent.', '');
  L.push('## Caveat', '');
  L.push(meta.note || SILVER_NOTE, '');
  return L.join('\n');
}

function parseArgs(argv) {
  const a = { data: null, out: null, modes: Object.keys(MODES) };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--data') a.data = argv[++i];
    else if (argv[i] === '--out') a.out = argv[++i];
    else if (argv[i] === '--modes') a.modes = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
  }
  return a;
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const a = parseArgs(process.argv.slice(2));
  const dataPath = a.data ? path.resolve(a.data) : path.join(here, 'data', 'dataset.jsonl');
  const outDir = a.out ? path.resolve(a.out) : here;
  const raw = fs.readFileSync(dataPath);
  const recs = String(raw).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const report = runEval({ recs, modes: a.modes, sha256: createHash('sha256').update(raw).digest('hex') });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outDir, 'REPORT.md'), renderReport(report));
  for (const mode of a.modes) {
    const d = report.modes[mode].splits.test.detection;
    console.log(`${mode} test: P=${pct(d.precision)} R=${pct(d.recall)} F1=${pct(d.f1)}`);
  }
}

// CLI only when executed directly; imports of this module (tests) stay side-effect free.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
