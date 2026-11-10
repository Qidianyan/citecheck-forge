// Pure view-model for the CiteCheck UI Kit frontend (Confluence byline item / Jira issue panel).
// No @forge imports here — the UI layer (src/frontend/index.jsx) and the tests both consume this.

export const MAX_EXCERPT_CHARS = 300;

const STATUS_APPEARANCE = {
  none: 'default',
  clean: 'success',
  flagged: 'removed',
  'unverifiable-only': 'moved',
};

/** Code-point-safe truncation to ≤ max chars, appending an ellipsis when cut. */
function truncateExcerpt(value, max = MAX_EXCERPT_CHARS) {
  if (value == null) return '';
  const s = String(value);
  const cps = Array.from(s);
  if (cps.length <= max) return s;
  return cps.slice(0, max - 1).join('') + '…';
}

function statusOf(summary) {
  const total = summary?.total ?? 0;
  if (total === 0) return 'none';
  if (summary.flagged > 0) return 'flagged';
  if (summary.unverifiable > 0) return 'unverifiable-only';
  return 'clean';
}

function chipTextOf(report) {
  const s = report?.summary ?? {};
  if ((s.total ?? 0) === 0) return 'No citations found';
  return `${s.flagged ?? 0} flagged · ${s.verified ?? 0} verified · ${s.unverifiable ?? 0} unverifiable`;
}

function lawLabelOf(r) {
  return r.law_title || r.law || r.law_hint || '—';
}

/**
 * report (from buildReport) + { product } → view-model for the UI Kit panel.
 * Rows are ordered flagged-first; excerpts are truncated to ≤ 300 chars with an ellipsis.
 */
export function toViewModel(report, { product } = {}) {
  if (report == null) {
    return {
      product: product ?? null,
      status: 'none',
      chipText: 'Not checked yet',
      chipAppearance: STATUS_APPEARANCE.none,
      rows: [],
      footer: '',
    };
  }

  const status = statusOf(report.summary);
  const rows = [...(report.rows || [])];
  rows.sort((a, b) => Number(b.flagged ? 1 : 0) - Number(a.flagged ? 1 : 0));

  return {
    product: product ?? null,
    status,
    chipText: chipTextOf(report),
    chipAppearance: STATUS_APPEARANCE[status],
    rows: rows.map((r) => ({
      n: r.n,
      icon: r.icon ?? null,
      citation: r.citation ?? '',
      lawLabel: lawLabelOf(r),
      verdictLabel: r.verdict_label ?? '',
      types: (r.hallucination_types || []).join(', '),
      reason: r.reason_en ?? '',
      advisories: Array.isArray(r.advisories) ? r.advisories : [],
      suggestedArticle: r.suggested_article ?? null,
      sourceUrl: r.evidence ?? null,
      excerpt: truncateExcerpt(r.original_excerpt),
    })),
    footer: `Checked ${report.verifiedAt ?? '—'} against official texts as of ${report.asOf ?? '—'}`,
  };
}
