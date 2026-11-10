// Pure view-model helpers for the OrgSourcesPanel (no @forge imports; tested directly).

export const SOURCE_KEY_RE = /^[A-Za-z][A-Za-z0-9-]{1,30}$/;
export const PAGE_ID_RE = /^\d{1,20}$/;

export function validSourceKey(key) {
  return SOURCE_KEY_RE.test(String(key ?? '').trim());
}

export function validPageId(pageId) {
  return PAGE_ID_RE.test(String(pageId ?? '').trim());
}

/** Field-level errors for the register form; empty object when the form is valid. */
export function formErrors({ pageId, sourceKey } = {}) {
  const errors = {};
  if (!validPageId(pageId)) errors.pageId = 'Enter the Confluence page ID (digits only).';
  if (!validSourceKey(sourceKey)) {
    errors.sourceKey = 'Source key: 2-31 characters, starting with a letter; then letters, digits or hyphens.';
  }
  return errors;
}

/** Store list rows → panel rows (plain data; the panel maps them onto UI Kit cells). */
export function toOrgRows(sources = []) {
  return sources.map((s) => ({
    sourceKey: String(s.sourceKey ?? ''),
    title: s.title ?? '',
    pageUrl: s.pageUrl ?? null,
    clauses: Number.isFinite(Number(s.clauses)) ? Number(s.clauses) : 0,
    registeredAt: s.registeredAt ?? null,
  }));
}

/** sources + { error, notice } → view-model for the org sources panel. */
export function toOrgSourcesViewModel(sources, { error = null, notice = null } = {}) {
  const rows = toOrgRows(sources ?? []);
  return {
    rows,
    total: rows.length,
    empty: rows.length === 0,
    error: error ?? null,
    notice: notice ?? null,
    chipText: rows.length
      ? `${rows.length} organisation source${rows.length === 1 ? '' : 's'} registered`
      : 'No organisation sources yet',
  };
}
