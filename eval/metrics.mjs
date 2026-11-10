// Core eval logic: gold ↔ prediction alignment, held-out split, detection metrics.
// Port of the alignment rules in the reference Python eval (run_eval.py); the runner and
// report rendering live in run-eval.mjs.
import { createHash } from 'node:crypto';

export const HALL = ['ARTICLE_NOT_FOUND', 'CONTENT_MISMATCH', 'NOT_IN_FORCE'];
const SEV = { EXISTS_CONSISTENT: 0, EXISTS_UNQUOTED: 1, UNVERIFIABLE: 2, NOT_IN_FORCE: 3, CONTENT_MISMATCH: 3, ARTICLE_NOT_FOUND: 3 };

/**
 * Fixed, label-independent 70/30 split by question id, stratified by country: within each
 * country the qids are ordered by sha256(qid) and the first round(30%) go to "test".
 * Returns a function qid → 'dev' | 'test'.
 */
export function makeSplit(recs, testShare = 0.3) {
  const byCountry = new Map();
  for (const r of recs) {
    if (!byCountry.has(r.country)) byCountry.set(r.country, new Set());
    byCountry.get(r.country).add(r.qid);
  }
  const test = new Set();
  const h = (q) => createHash('sha256').update(String(q)).digest('hex');
  for (const qids of byCountry.values()) {
    const sorted = [...qids].sort((a, b) => (h(a) < h(b) ? -1 : h(a) > h(b) ? 1 : 0));
    const n = Math.round(sorted.length * testShare);
    for (const q of sorted.slice(0, n)) test.add(q);
  }
  return (qid) => (test.has(qid) ? 'test' : 'dev');
}

export function artKey(a) {
  const m = /^\s*(\d+)/u.exec(String(a ?? ''));
  return m ? m[1] : null;
}

/** Align gold citations of one answer with verifier results by (law_id, article number); most severe wins. */
export function align(rec, results) {
  const by = new Map();
  for (const v of results) {
    if (v.type !== 'statute') continue;
    const k = `${v.law ?? ''}|${artKey(v.article) ?? ''}`;
    const cur = by.get(k);
    if (!cur || (SEV[v.verdict] ?? 0) > (SEV[cur.verdict] ?? 0)) by.set(k, v);
  }
  const used = new Set();
  const pairs = [];
  for (const c of rec.citations) {
    if (c.kind === 'case') { pairs.push([c, null]); continue; }
    const lawId = c.gold?.law_id ?? null;
    let k = `${lawId ?? ''}|${artKey(c.article) ?? ''}`;
    let v = by.get(k) ?? null;
    if (v) used.add(k);
    pairs.push([c, v]);
  }
  const extra = [...by.keys()].filter((k) => !used.has(k)).length;
  return { pairs, extra };
}

/** One row per gold citation. */
export function rowsFor(rec, results) {
  const { pairs, extra } = align(rec, results);
  return {
    extra,
    rows: pairs.map(([c, v]) => ({
      aid: rec.id, qid: rec.qid, model: rec.model, country: rec.country,
      lang: rec.lang === 'zh' ? 'zh' : 'local', cid: c.cid, law_id: c.gold?.law_id ?? null, article: c.article,
      gold: c.gold?.verdict, gold_types: (c.gold?.types || []).filter(Boolean),
      pred: v ? v.verdict : 'MISSED', pred_types: v?.hallucination_types || [],
    })),
  };
}

/** Detection metrics over rows whose gold is verifiable (hallucinated or EXISTS_CONSISTENT). */
export function detection(rows) {
  const ver = rows.filter((x) => HALL.includes(x.gold) || x.gold === 'EXISTS_CONSISTENT');
  const pos = ver.filter((x) => HALL.includes(x.gold));
  const tp = pos.filter((x) => HALL.includes(x.pred)).length;
  const fp = ver.filter((x) => x.gold === 'EXISTS_CONSISTENT' && HALL.includes(x.pred)).length;
  const fn = pos.length - tp;
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = tp + fn ? tp / (tp + fn) : null;
  const f1 = precision && recall ? (2 * precision * recall) / (precision + recall) : null;
  return { n_verifiable: ver.length, n_positive: pos.length, tp, fp, fn, precision, recall, f1,
    precision_ci95: wilson(tp, tp + fp), recall_ci95: wilson(tp, tp + fn) };
}

export function wilson(k, n, z = 1.96) {
  if (!n) return null;
  const p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

// --- Task E additions: new exports only; existing functions above are unchanged. ---

/** Share of gold citations the verifier managed to link to a law article (pred !== 'MISSED'). */
export function extractionRecall(rows) {
  if (!rows.length) return null;
  return rows.filter((r) => r.pred !== 'MISSED').length / rows.length;
}

/** Group rows by a key; preserves first-seen key order. */
export function groupBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}
