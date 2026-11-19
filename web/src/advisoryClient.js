// Browser side of the OPTIONAL advisory re-check. The toggle is OFF by default.
// Results are rendered apart from the verdict and labelled "Advisory only".
import { esc } from './render.js';

export const ADVISORY_UI_LABEL = 'Advisory only';
export const MAX_ROWS_PER_RUN = 3;
const WORDS = { same_meaning: 'LLM reads this as the same meaning', different_meaning: 'LLM reads this as a different meaning', unclear: 'LLM could not decide' };

/** Rows worth a paraphrase re-check: a known law and article, with a statement sentence. Flagged rows come first. */
export function advisoryCandidates(rows) {
  return (rows || [])
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.law && r.article && r.sentence && r.sentence.length >= 15)
    .sort((a, b) => Number(b.r.flagged) - Number(a.r.flagged))
    .slice(0, MAX_ROWS_PER_RUN);
}

export function advisoryHtml(res) {
  const label = `<span class="adv__tag">${ADVISORY_UI_LABEL}</span>`;
  if (!res || res.error) return `<div class="adv adv--muted">${label}<span>${esc(res?.message || 'The re-check is not available.')}</span></div>`;
  return `<div class="adv">${label}<span><strong>${esc(WORDS[res.judgement] || WORDS.unclear)}.</strong> ${esc(res.rationale || '')}</span><small>${esc(res.label || '')}</small></div>`;
}

export async function fetchStatus(fetchImpl = fetch) {
  try { const r = await fetchImpl('/api/advisory/status', { cache: 'no-store' }); if (!r.ok) return { enabled: false }; return await r.json(); } catch { return { enabled: false }; }
}

export async function recheck(row, fetchImpl = fetch) {
  try {
    const r = await fetchImpl('/api/advisory/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ quote: row.sentence, lawId: row.law, article: String(row.article) }) });
    return await r.json();
  } catch { return { error: 'NETWORK', message: 'The re-check could not reach the server. The verdict above stands.' }; }
}
