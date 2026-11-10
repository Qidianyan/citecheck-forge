// Task R: deterministic human-review pack builder for the silver labels.
// Reads eval/data/dataset.jsonl, verifies every answer with the shipped verifier
// (aligned exactly like eval/metrics.mjs rowsFor) and selects ~n citations for
// human review, stratified by country / gold verdict / question language, always
// including every ARTICLE_NOT_FOUND citation and ~30 verifier-vs-gold disagreements.
// Deterministic: selection order comes from sha256(seed + aid + cid), never Math.random.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeSplit, rowsFor, align, artKey } from '../metrics.mjs';
import { verify, enrich } from '../../src/core/index.js';
import laws from '../../src/corpus/laws.js';

export const VERDICT_CLASSES = ['CONTENT_MISMATCH', 'NOT_IN_FORCE', 'EXISTS_CONSISTENT', 'ARTICLE_NOT_FOUND', 'UNVERIFIABLE'];
export const LANG_CLASSES = ['zh', 'local'];
/** Target number of verifier-vs-gold disagreements in the pack. */
export const DISAGREE_TARGET = 30;
/** Minimum number of citations per gold verdict class (oversamples the rare ones). */
export const VERDICT_FLOOR = 5;
export const DEFAULT_SEED = 'citecheck-2026';

const corpusById = new Map(laws.map((l) => [l.law_id, l]));

const MISSED_REASON = 'The verifier produced no matching prediction for this citation.';

/** A citation "disagrees" when the verifier and gold differ on the hallucination decision
 *  (flagged verdicts: ARTICLE_NOT_FOUND / CONTENT_MISMATCH / NOT_IN_FORCE). */
const HALL = ['ARTICLE_NOT_FOUND', 'CONTENT_MISMATCH', 'NOT_IN_FORCE'];
const flagged = (v) => HALL.includes(v);
const disagrees = (row) => (flagged(row.gold) !== flagged(row.pred) ? 'yes' : 'no');

export const hashHex = (seed, aid, cid) => createHash('sha256').update(`${seed}|${aid}|${cid}`).digest('hex');

/** One sample row per citation, with gold and verifier side by side. */
export function buildRows(recs, verifyFn = verify) {
  const split = makeSplit(recs);
  const out = [];
  for (const rec of recs) {
    const results = verifyFn(rec.answer_text, { asOf: rec.as_of || '2026-10-18', country: rec.country, crossref: true });
    const { rows } = rowsFor(rec, results);
    const vByCid = new Map(align(rec, results).pairs.filter(([, v]) => v).map(([c, v]) => [c.cid, v]));
    for (const row of rows) {
      const c = rec.citations.find((x) => x.cid === row.cid) || {};
      const v = vByCid.get(row.cid) || null;
      const e = v ? enrich(v) : null;
      out.push({
        aid: rec.id,
        cid: row.cid,
        split: split(rec.qid),
        country: rec.country,
        question_lang: row.lang,
        model: rec.model,
        law_id: row.law_id ?? '',
        article: c.article ?? '',
        clause: c.clause ?? '',
        law_as_written: c.law_as_written ?? '',
        claim: c.claim ?? '',
        quoted_text: c.quoted_text ?? '',
        answer_excerpt: answerExcerpt(rec.answer_text, v, c),
        official_excerpt: officialExcerpt(row.law_id, row.article),
        official_source_url: officialUrl(row.law_id, row.article),
        gold_verdict: row.gold ?? '',
        gold_types: row.gold_types || [],
        gold_basis: c.gold?.basis ?? '',
        verifier_verdict: row.pred,
        verifier_types: e ? e.hallucination_types : [],
        verifier_reason_en: v ? (e.reason_en || '') : MISSED_REASON,
        disagreement: disagrees(row),
      });
    }
  }
  return out;
}

/** Up to 600 chars of the answer centred on the cited sentence/claim. */
function answerExcerpt(text, v, c) {
  if (!text) return '';
  if (v?.sentence && text.includes(v.sentence)) return v.sentence.slice(0, 600);
  const needles = [c.claim, c.quoted_text, c.law_as_written].filter(Boolean);
  for (const needle of needles) {
    const i = text.indexOf(needle);
    if (i >= 0) return clipAround(text, i);
  }
  if (c.article) {
    const re = new RegExp(`(Điều|Pasal|Article|第)\\s*${String(c.article).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u');
    const m = re.exec(text);
    if (m) return clipAround(text, m.index);
  }
  return text.slice(0, 600);
}

function clipAround(text, i) {
  const start = Math.max(0, i - 300);
  return text.slice(start, start + 600);
}

/** Up to 1200 chars of the cited article from the bundled corpus ('' when unknown).
 *  Registry-only (stub) laws fall back to their repeal-evidence article, like verify.js does. */
function corpusEntry(lawId, article) {
  const law = corpusById.get(lawId);
  if (!law) return { text: '', url: '' };
  const key = String(artKey(article) ?? '');
  let text = key && law.articles ? String(law.articles[key] ?? '') : '';
  let url = law.source_page || law.source_pdf || '';
  if (!text && law.stub && law.evidence_law) {
    const ev = corpusById.get(law.evidence_law);
    text = ev && ev.articles ? String(ev.articles[String(law.evidence_article)] ?? '') : '';
    url = url || ev?.source_page || ev?.source_pdf || '';
  }
  return { text: text.slice(0, 1200), url };
}

export function officialExcerpt(lawId, article) {
  return corpusEntry(lawId, article).text;
}

export function officialUrl(lawId, article) {
  return corpusEntry(lawId, article).url;
}

/**
 * Deterministic stratified selection of ~n citations for human review.
 * Always includes every ARTICLE_NOT_FOUND citation, ~DISAGREE_TARGET citations where the
 * verifier disagrees with gold, at least VERDICT_FLOOR per gold verdict class (oversampling
 * the rare ones) and both question languages; the rest fills countries round-robin so they
 * stay roughly equal. Ordering uses sha256(seed + aid + cid) only.
 */
export function selectSamples(recs, { n = 100, seed = DEFAULT_SEED, verifyFn = verify } = {}) {
  const rows = buildRows(recs, verifyFn);
  const h = (r) => hashHex(seed, r.aid, r.cid);
  const byHash = (a, b) => (h(a) < h(b) ? -1 : h(a) > h(b) ? 1 : a.aid < b.aid ? -1 : a.aid > b.aid ? 1 : a.cid < b.cid ? -1 : 1);
  const key = (r) => `${r.aid}|${r.cid}`;
  const selected = new Map();
  const add = (r) => { if (!selected.has(key(r))) selected.set(key(r), r); };
  const countIf = (fn) => [...selected.values()].filter(fn).length;

  // 1. Every ARTICLE_NOT_FOUND citation.
  for (const r of rows.filter((x) => x.gold_verdict === 'ARTICLE_NOT_FOUND').sort(byHash)) add(r);

  // 2. ~30 verifier-vs-gold disagreements (scaled down when n is small).
  const haveDis = countIf((x) => x.disagreement === 'yes');
  const disPool = rows.filter((x) => x.disagreement === 'yes' && !selected.has(key(x))).sort(byHash);
  for (const r of disPool.slice(0, Math.max(0, Math.min(DISAGREE_TARGET, n - selected.size) - haveDis))) add(r);

  // 3. Every gold verdict class present, rare classes oversampled to the floor.
  const rank = (pool) => [...pool.filter((x) => x.disagreement === 'no'), ...pool.filter((x) => x.disagreement === 'yes')];
  for (const v of VERDICT_CLASSES) {
    if (selected.size >= n) break;
    const have = countIf((x) => x.gold_verdict === v);
    const pool = rank(rows.filter((x) => x.gold_verdict === v && !selected.has(key(x)))).sort(byHash);
    for (const r of pool.slice(0, Math.max(0, VERDICT_FLOOR - have))) { if (selected.size >= n) break; add(r); }
  }

  // 4. Both question languages present.
  for (const L of LANG_CLASSES) {
    if (selected.size >= n) break;
    if (!countIf((x) => x.question_lang === L)) {
      const pool = rank(rows.filter((x) => x.question_lang === L && !selected.has(key(x)))).sort(byHash);
      if (pool[0]) add(pool[0]);
    }
  }

  // 5. Country-balanced fill to n, preferring citations the verifier already matches gold on.
  const countries = [...new Set(rows.map((x) => x.country))].sort();
  const cap = Math.ceil(n / Math.max(1, countries.length));
  const counts = new Map(countries.map((c) => [c, countIf((x) => x.country === c)]));
  let progressed = true;
  while (selected.size < n && progressed) {
    progressed = false;
    for (const c of countries) {
      if (selected.size >= n) break;
      if ((counts.get(c) || 0) >= cap) continue;
      const pool = rows.filter((x) => x.country === c && !selected.has(key(x))).sort(byHash);
      const next = pool.find((x) => x.disagreement === 'no') || pool[0];
      if (next) { add(next); counts.set(c, (counts.get(c) || 0) + 1); progressed = true; }
    }
  }

  return [...selected.values()].sort(byHash);
}

/** RFC 4180 cell: CRLF-safe, quoted when needed, formula-leading chars guarded with a single quote. */
export function csvCell(value) {
  let s = value == null ? '' : String(value);
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export const PACK_COLUMNS = ['sample_id', 'aid', 'cid', 'split', 'country', 'question_lang', 'model', 'law_id', 'article', 'clause', 'law_as_written', 'claim', 'quoted_text', 'answer_excerpt', 'official_excerpt', 'official_source_url', 'gold_verdict', 'gold_types', 'gold_basis', 'verifier_verdict', 'verifier_types', 'verifier_reason_en', 'disagreement', 'reviewer_verdict', 'reviewer_types', 'reviewer_confidence', 'reviewer_notes', 'reviewer_initials'];

const EMPTY_REVIEWER = ['reviewer_verdict', 'reviewer_types', 'reviewer_confidence', 'reviewer_notes', 'reviewer_initials'];

/** The pack as CSV text (UTF-8 BOM, CRLF, RFC 4180 quoting, formula guard). */
export function toCsv(samples) {
  const lines = [PACK_COLUMNS.join(',')];
  samples.forEach((s, i) => {
    const rec = { ...s, sample_id: `R${String(i + 1).padStart(3, '0')}` };
    for (const col of EMPTY_REVIEWER) rec[col] = '';
    lines.push(PACK_COLUMNS.map((col) => csvCell(Array.isArray(rec[col]) ? rec[col].join(';') : rec[col])).join(','));
  });
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** Counts per stratum of the generated pack. */
export function packStats(samples, { n, seed }) {
  const count = (fn) => {
    const m = new Map();
    for (const s of samples) { const k = fn(s); m.set(k, (m.get(k) || 0) + 1); }
    return Object.fromEntries([...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  };
  return {
    seed,
    requested_n: n,
    n: samples.length,
    by_country: count((s) => s.country),
    by_gold_verdict: count((s) => s.gold_verdict),
    by_question_lang: count((s) => s.question_lang),
    by_split: count((s) => s.split),
    disagreements: samples.filter((s) => s.disagreement === 'yes').length,
    article_not_found_included: samples.filter((s) => s.gold_verdict === 'ARTICLE_NOT_FOUND').length,
  };
}

function parseArgs(argv) {
  const a = { n: 100, seed: DEFAULT_SEED, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--n') a.n = Number.parseInt(argv[++i], 10);
    else if (argv[i] === '--seed') a.seed = argv[++i];
    else if (argv[i] === '--out') a.out = argv[++i];
  }
  return a;
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const a = parseArgs(process.argv.slice(2));
  const dataPath = path.join(here, '..', 'data', 'dataset.jsonl');
  const outDir = a.out ? path.resolve(a.out) : here;
  const recs = String(fs.readFileSync(dataPath)).split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const samples = selectSamples(recs, { n: a.n, seed: a.seed });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'review_pack.csv'), toCsv(samples), 'utf8');
  fs.writeFileSync(path.join(outDir, 'pack_stats.json'), `${JSON.stringify(packStats(samples, { n: a.n, seed: a.seed }), null, 2)}\n`, 'utf8');
  const stats = packStats(samples, { n: a.n, seed: a.seed });
  console.log(`wrote ${samples.length} samples to ${path.join(outDir, 'review_pack.csv')}`);
  console.log(JSON.stringify(stats));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
