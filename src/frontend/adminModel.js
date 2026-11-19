// Pure validation for the admin forms. No @forge imports.
export const SOURCE_KEY_RE = /^[A-Z][A-Z0-9-]{1,30}$/;
export function validateOrgForm({ pageId, sourceKey }) {
  const errors = {};
  if (!/^\d{1,20}$/.test(String(pageId ?? '').trim())) errors.pageId = 'Enter the numeric page ID (from the page URL).';
  if (!SOURCE_KEY_RE.test(String(sourceKey ?? '').trim())) errors.sourceKey = 'Use capitals, digits and dashes, starting with a letter (for example POL-7).';
  return errors;
}
