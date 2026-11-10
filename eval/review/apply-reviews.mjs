// Task R: apply human reviews to a filled review_pack.csv.
// Reads the reviewer columns (reviewer_verdict/types/confidence/initials), writes
// eval/review/reviewed_labels.jsonl and prints agreement stats vs the gold labels
// (Cohen's kappa on verdict). Never touches eval/data/dataset.jsonl.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REVIEW_COLUMNS = ['reviewer_verdict', 'reviewer_types', 'reviewer_confidence', 'reviewer_notes', 'reviewer_initials'];

/** Minimal RFC 4180 parser: BOM, CRLF/LF, quoted fields with "" escapes. */
export function parseCsv(text) {
  const src = String(text).replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQ) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(unGuard(field)); field = ''; }
    else if (ch === '\n') { row.push(unGuard(field)); rows.push(row); row = []; field = ''; }
    else if (ch === '\r') { /* part of CRLF; ignored outside quotes */ }
    else field += ch;
  }
  if (field !== '' || row.length) { row.push(unGuard(field)); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}

/** Excel-style formula guard: a cell written as '=... reads back as =... */
const unGuard = (s) => (/^'[=+\-@]/.test(s) ? s.slice(1) : s);

const splitTypes = (s) => String(s ?? '').split(/[;,]/).map((t) => t.trim()).filter(Boolean);

/** Rows of the pack where the reviewer filled a verdict. */
export function loadReviews(csvText) {
  const rows = parseCsv(csvText);
  if (!rows.length) return [];
  const header = rows[0];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const get = (r, col) => (r[idx[col]] ?? '').trim();
  const out = [];
  for (const r of rows.slice(1)) {
    const reviewer_verdict = get(r, 'reviewer_verdict');
    if (!reviewer_verdict) continue;
    out.push({
      aid: get(r, 'aid'),
      cid: get(r, 'cid'),
      reviewer_verdict,
      reviewer_types: splitTypes(get(r, 'reviewer_types')),
      confidence: Number(get(r, 'reviewer_confidence')) || null,
      initials: get(r, 'reviewer_initials'),
      gold_verdict: get(r, 'gold_verdict'),
      gold_types: splitTypes(get(r, 'gold_types')),
    });
  }
  return out;
}

/** Cohen's kappa on verdict between two labellers over the same rows. */
export function cohensKappa(pairs) {
  const n = pairs.length;
  if (!n) return null;
  let agree = 0;
  const g = {};
  const r = {};
  for (const [a, b] of pairs) {
    if (a === b) agree++;
    g[a] = (g[a] || 0) + 1;
    r[b] = (r[b] || 0) + 1;
  }
  const po = agree / n;
  let pe = 0;
  for (const c of new Set([...Object.keys(g), ...Object.keys(r)])) pe += ((g[c] || 0) / n) * ((r[c] || 0) / n);
  if (pe === 1) return po === 1 ? 1 : 0;
  return (po - pe) / (1 - pe);
}

/** labels + agreement stats for a filled pack CSV text. */
export function applyReviews(csvText) {
  const reviews = loadReviews(csvText);
  const labels = reviews.map((x) => ({
    aid: x.aid,
    cid: x.cid,
    reviewer_verdict: x.reviewer_verdict,
    reviewer_types: x.reviewer_types,
    confidence: x.confidence,
    initials: x.initials,
  }));
  const agree = reviews.filter((x) => x.reviewer_verdict === x.gold_verdict).length;
  const stats = {
    n_reviewed: reviews.length,
    n_agree: agree,
    agreement: reviews.length ? agree / reviews.length : null,
    kappa: cohensKappa(reviews.map((x) => [x.gold_verdict, x.reviewer_verdict])),
  };
  return { labels, stats };
}

function parseArgs(argv) {
  const a = { csv: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--csv') a.csv = argv[++i];
    else if (argv[i] === '--out') a.out = argv[++i];
  }
  return a;
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const a = parseArgs(process.argv.slice(2));
  const csvPath = a.csv ? path.resolve(a.csv) : path.join(here, 'review_pack.csv');
  const outPath = a.out ? path.resolve(a.out) : path.join(here, 'reviewed_labels.jsonl');
  const { labels, stats } = applyReviews(fs.readFileSync(csvPath, 'utf8'));
  fs.writeFileSync(outPath, labels.map((l) => JSON.stringify(l)).join('\n') + (labels.length ? '\n' : ''), 'utf8');
  console.log(JSON.stringify(stats));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
