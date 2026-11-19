// Pure decision logic for the byline / issue panel and the Share modal. No @forge imports.
import { COPY } from './copy.js';

export const STALE_DAYS = 7;
export const MAX_NOTE = 500;

/** Verdict → UI Kit Icon glyph + Lozenge appearance + short label (no emoji). */
export function verdictPresentation(row) {
  const misattributed = Boolean(row?.suggestedArticle ?? row?.suggested_article);
  switch (row?.verdict) {
    case 'EXISTS_CONSISTENT': return { glyph: 'check-circle', appearance: 'success', label: 'Verified' };
    case 'EXISTS_UNQUOTED': return { glyph: 'check-circle', appearance: 'default', label: 'Exists' };
    case 'NOT_IN_FORCE': return { glyph: 'recent', appearance: 'moved', label: 'Not in force' };
    case 'CONTENT_MISMATCH': return { glyph: 'cross-circle', appearance: 'removed', label: misattributed ? 'Misattributed' : 'Misquoted' };
    case 'ARTICLE_NOT_FOUND': return { glyph: 'cross-circle', appearance: 'removed', label: 'No such article' };
    default: return { glyph: 'question-circle', appearance: 'default', label: 'Unverifiable' };
  }
}

/** True when the report is older than STALE_DAYS or the content version moved past the checked one. */
export function isStale(report, { now = new Date(), currentVersion = null } = {}) {
  if (!report?.verifiedAt) return false;
  const age = now.getTime() - new Date(report.verifiedAt).getTime();
  if (Number.isFinite(age) && age > STALE_DAYS * 86400000) return true;
  const checked = report?.source?.version ?? null;
  return currentVersion != null && checked != null && Number(currentVersion) > Number(checked);
}

/** One of: loading, error, never-checked, no-citations, flagged, unverifiable-only, clean (+ stale flag). */
export function panelState({ loading = false, error = null, report = null, now, currentVersion } = {}) {
  if (loading) return { state: 'loading', stale: false };
  if (error) return { state: 'error', stale: false };
  if (!report) return { state: 'never-checked', stale: false };
  const s = report.summary ?? {};
  const stale = isStale(report, { now, currentVersion });
  if (!s.total) return { state: 'no-citations', stale };
  if ((s.flagged ?? 0) > 0) return { state: 'flagged', stale };
  if ((s.unverifiable ?? 0) > 0) return { state: 'unverifiable-only', stale };
  return { state: 'clean', stale };
}

/** Error (thrown or returned { error, status }) → plain-language copy. */
export function errorMessage(err) {
  const code = err?.error ?? err?.code ?? null;
  const status = Number(err?.status) || Number(/HTTP (\d{3})/.exec(String(err?.message ?? ''))?.[1]) || 0;
  if (status === 401 || status === 403) return COPY.errors.FORBIDDEN;
  if (status === 404) return COPY.errors.NOT_FOUND;
  if (code && COPY.errors[code]) return COPY.errors[code];
  if (code === 'API_ERROR' && err?.message) return String(err.message);
  if (/network|fetch|timeout/i.test(String(err?.message ?? ''))) return COPY.errors.NETWORK;
  return COPY.errors.GENERIC;
}

/** Summary lozenges for the header (only non-zero counts, flagged first). */
export function summaryLozenges(summary = {}) {
  const notInForce = summary?.by_verdict?.NOT_IN_FORCE ?? 0;
  const out = [];
  if (summary.flagged) out.push({ text: `${summary.flagged} ${COPY.lozenges.flagged}`, appearance: 'removed' });
  if (notInForce) out.push({ text: `${notInForce} ${COPY.lozenges.notInForce}`, appearance: 'moved' });
  if (summary.verified) out.push({ text: `${summary.verified} ${COPY.lozenges.verified}`, appearance: 'success' });
  if (summary.unverifiable) out.push({ text: `${summary.unverifiable} ${COPY.lozenges.unverifiable}`, appearance: 'default' });
  return out;
}

/** "just now", "5 minutes ago", "3 hours ago", "2 days ago", or the date. */
export function relativeTime(iso, now = new Date()) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const s = Math.max(0, Math.round((now.getTime() - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24); if (d <= 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return String(iso).slice(0, 10);
}

/** Share options available for a product (publish only on Confluence; assign only on Jira). */
export function shareOptions(product) {
  const all = ['comment', 'page', 'forward', 'export'];
  return all.filter((o) => o !== 'page' || product === 'confluence').map((key) => ({
    key, label: COPY.shareModal.options[key], hint: COPY.shareModal.hints[key],
  }));
}
export const canAssign = (product) => product === 'jira';

/** Forward form validation → { ok, errors, payload }. */
export function validateForward({ accountId, note, assign }, product) {
  const errors = {};
  const id = String(accountId ?? '').trim();
  if (!/^[A-Za-z0-9:_-]{6,128}$/.test(id)) errors.accountId = COPY.errors.INVALID_ACCOUNT;
  const n = String(note ?? '').trim();
  if (Array.from(n).length > MAX_NOTE) errors.note = COPY.errors.NOTE_TOO_LONG;
  if (assign && !canAssign(product)) errors.assign = COPY.errors.ASSIGN_JIRA_ONLY;
  const ok = Object.keys(errors).length === 0;
  return { ok, errors, payload: ok ? { accountId: id, note: n, assign: Boolean(assign) && canAssign(product) } : null };
}

/** Rows for the results table: flagged first, document order otherwise. */
export function panelRows(report) {
  const rows = [...(report?.rows ?? [])];
  rows.sort((a, b) => Number(Boolean(b.flagged)) - Number(Boolean(a.flagged)) || (a.n ?? 0) - (b.n ?? 0));
  return rows.map((r) => ({ ...r, presentation: verdictPresentation(r) }));
}

/** Array-of-cells → DynamicTable { head, rows } shape (UI Kit wants keyed cells, not plain arrays). */
export function toTable(headLabels, rows, rowKey = (r, i) => `r${i}`) {
  return {
    head: { cells: headLabels.map((label, i) => ({ key: `h${i}`, content: label })) },
    rows: rows.map((cells, i) => ({ key: String(rowKey(cells, i)), cells: cells.map((content, j) => ({ key: `c${i}-${j}`, content })) })),
  };
}
