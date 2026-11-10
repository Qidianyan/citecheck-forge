// Scoring for the FRESH held-out set (Task F).
// Labels: an item is positive iff expected.flagged === true.
// Prediction: the verifier result row whose law === item.law_id and whose article number
// equals item.article (most severe verdict when several); predicted flagged iff the verdict
// is ARTICLE_NOT_FOUND | CONTENT_MISMATCH | NOT_IN_FORCE; a missing row counts as not flagged.
// The reviewer runs this exactly once after the verifier config is frozen; the constructor
// never runs it on the generated set.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verify as verifyWith } from '../../src/core/index.js';

export const FLAGGED = new Set(['ARTICLE_NOT_FOUND', 'CONTENT_MISMATCH', 'NOT_IN_FORCE']);
const SEV = { EXISTS_CONSISTENT: 0, EXISTS_UNQUOTED: 1, UNVERIFIABLE: 2, NOT_IN_FORCE: 3, CONTENT_MISMATCH: 4, ARTICLE_NOT_FOUND: 5 };

export const artKey = (a) => {
  const m = /^\s*(\d+)/u.exec(String(a ?? ''));
  return m ? m[1] : null;
};

const agg = (rows) => {
  const pos = rows.filter((r) => r.positive);
  const tp = pos.filter((r) => r.predFlagged).length;
  const fp = rows.filter((r) => !r.positive && r.predFlagged).length;
  const fn = pos.length - tp;
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = pos.length ? tp / pos.length : null;
  const f1 = precision != null && recall != null ? (2 * precision * recall) / (precision + recall) : null;
  return { n: rows.length, n_positive: pos.length, tp, fp, fn, precision, recall, f1 };
};

/**
 * Score fresh items against verifyFn (the real verifier or a mock).
 * Returns { overall, by_type, by_country, by_lang, rows }.
 */
export async function scoreFresh(items, verifyFn) {
  if (typeof verifyFn !== 'function') throw new TypeError('scoreFresh: verifyFn required');
  const rows = [];
  for (const item of items) {
    const results = (await verifyFn(item.text, { asOf: item.as_of, country: item.country, crossref: true })) || [];
    const want = artKey(item.article);
    let best = null;
    for (const r of results) {
      if (!r || r.law !== item.law_id) continue;
      if (artKey(r.article) !== want) continue;
      if (!best || (SEV[r.verdict] ?? -1) > (SEV[best.verdict] ?? -1)) best = r;
    }
    rows.push({
      id: item.id, type: item.type, country: item.country, lang: item.lang,
      law_id: item.law_id, article: item.article,
      positive: item.expected?.flagged === true,
      pred_verdict: best ? best.verdict : null,
      predFlagged: best ? FLAGGED.has(best.verdict) : false,
    });
  }
  const group = (keyFn) => {
    const m = new Map();
    for (const r of rows) {
      const k = keyFn(r);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    const out = {};
    for (const [k, v] of [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) out[k] = agg(v);
    return out;
  };
  return { overall: agg(rows), by_type: group((r) => r.type), by_country: group((r) => r.country), by_lang: group((r) => r.lang), rows };
}

// --- CLI ----------------------------------------------------------------------

const pct = (x) => (x == null ? 'NA' : `${(x * 100).toFixed(1)}%`);

function table(title, obj) {
  const lines = [`## ${title}`, '| key | n | positives | tp | fp | fn | P | R |', '|---|---|---|---|---|---|---|---|'];
  for (const [k, s] of Object.entries(obj)) {
    lines.push(`| ${k} | ${s.n} | ${s.n_positive} | ${s.tp} | ${s.fp} | ${s.fn} | ${pct(s.precision)} | ${pct(s.recall)} |`);
  }
  return lines.join('\n');
}

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const argv = process.argv.slice(2);
  let itemsPath = path.join(here, 'fresh.jsonl');
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--items') itemsPath = argv[++i];
    else if (argv[i] && !argv[i].startsWith('-')) itemsPath = argv[i];
  }
  const items = fs.readFileSync(itemsPath, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const report = await scoreFresh(items, verifyWith);
  const out = [
    `# Fresh held-out set scoring (${items.length} items, ${report.overall.n_positive} positives)`,
    '',
    table('Overall', { overall: report.overall }),
    '',
    table('By type', report.by_type),
    '',
    table('By country', report.by_country),
    '',
    table('By language', report.by_lang),
  ];
  console.log(out.join('\n'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
