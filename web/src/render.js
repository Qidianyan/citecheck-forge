// Pure HTML renderers shared by the build (Node, pre-renders the landing hero) and the playground (browser).
// No DOM access, no network. Every dynamic string goes through esc().

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Verdict → seal (stamp) presentation. Tone drives colour; icon is a Phosphor glyph name. */
export function sealFor(row) {
  const misattributed = row.crossref && row.crossref.kind === 'misattributed';
  switch (row.verdict) {
    case 'EXISTS_CONSISTENT': return { tone: 'ok', icon: 'seal-check', text: 'Verified' };
    case 'EXISTS_UNQUOTED': return { tone: 'ok-soft', icon: 'check-circle', text: 'Exists' };
    case 'NOT_IN_FORCE': return { tone: 'amber', icon: 'clock-counter-clockwise', text: 'Not in force' };
    case 'CONTENT_MISMATCH': return { tone: 'red', icon: 'seal-warning', text: misattributed ? 'Misattributed' : 'Misquoted' };
    case 'ARTICLE_NOT_FOUND': return { tone: 'red', icon: 'x-circle', text: 'No such article' };
    default: return { tone: 'grey', icon: 'question', text: 'Unverifiable' };
  }
}

export function seal(row, icons) {
  const s = sealFor(row);
  return `<span class="seal seal--${s.tone}">${icons[s.icon] || ''}<span>${esc(s.text)}</span></span>`;
}

function safeHref(u) {
  return /^https:\/\/[^\s"'<>]+$/.test(String(u || '')) ? String(u) : null;
}

/** One citation row (report row shape from src/handlers/report.js buildReport). */
export function rowHtml(row, icons) {
  const href = safeHref(row.evidence);
  const sugg = row.suggested_article
    ? `<p class="row__hint">${icons['arrow-right'] || ''}<span>Did you mean <strong class="mono">Article ${esc(row.suggested_article)}</strong>?</span></p>` : '';
  const adv = (row.advisories || []).map((a) => `<li>${esc(a)}</li>`).join('');
  const excerpt = row.original_excerpt
    ? `<details class="row__excerpt"><summary>Official text of the cited article</summary><pre>${esc(row.original_excerpt)}</pre></details>` : '';
  const xexcerpt = row.crossref && row.crossref.kind === 'misattributed' && row.crossref.excerpt
    ? `<details class="row__excerpt"><summary>Where the statement actually is (Article ${esc(row.crossref.suggested_article)})</summary><pre>${esc(row.crossref.excerpt)}</pre></details>` : '';
  const types = (row.hallucination_types || []).map((h) => `<span class="htype">${esc(h)}</span>`).join('');
  return `<li class="row row--${sealFor(row).tone}">
  <div class="row__margin mono">${esc(row.article ? '§ ' + row.article : '§')}</div>
  <div class="row__body">
    <div class="row__head">${seal(row, icons)}<code class="mono row__cite">${esc(row.citation)}</code>${types}</div>
    <p class="row__law">${esc(row.law_title || 'Law not in the bundled corpus')}</p>
    <p class="row__reason">${esc(row.reason_en)}</p>
    ${sugg}
    ${adv ? `<ul class="row__adv">${adv}</ul>` : ''}
    ${row.sentence ? `<blockquote class="row__sentence">${esc(row.sentence)}</blockquote>` : ''}
    ${excerpt}${xexcerpt}
    ${href ? `<a class="row__src" href="${esc(href)}" rel="noopener noreferrer" target="_blank">Official source ${icons['arrow-square-out'] || ''}</a>` : ''}
  </div>
</li>`;
}

export function summaryHtml(summary) {
  const n = (k) => Number(summary?.[k] || 0);
  return `<dl class="tally">
  <div class="tally__item tally--red"><dt>Flagged</dt><dd>${n('flagged')}</dd></div>
  <div class="tally__item tally--ok"><dt>Verified</dt><dd>${n('verified')}</dd></div>
  <div class="tally__item tally--grey"><dt>Unverifiable</dt><dd>${n('unverifiable')}</dd></div>
  <div class="tally__item"><dt>Citations</dt><dd>${n('total')}</dd></div>
</dl>`;
}

export function reportHtml(report, icons) {
  if (!report.rows.length) return `<p class="empty">No legal citations found. Try a sample, or paste text that cites an article (for example "Article 9 of Law No. 91/2025/QH15").</p>`;
  return summaryHtml(report.summary) + `<ol class="rows">${report.rows.map((r) => rowHtml(r, icons)).join('\n')}</ol>`;
}
