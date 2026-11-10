// CSV export for the audit trail: RFC 4180 quoting, CRLF line endings and a formula-injection guard
// so a cell starting with = + - @ tab/CR can never be executed by a spreadsheet app.

export const CSV_HEADER = ['verifiedAt', 'product', 'id', 'accountId', 'trigger', 'total', 'flagged', 'verified', 'unverifiable'];

/** Characters that make a cell a formula in Excel/Sheets; such cells get a leading apostrophe. */
const INJECTION_RE = /^[=+\-@\t\r]/u;
/** Fields containing any of these must be quoted, with inner quotes doubled. */
const QUOTE_RE = /[",\r\n]/u;

/** Apply the formula-injection guard to one raw cell value. */
export function guardCell(value) {
  const raw = value == null ? '' : String(value);
  return INJECTION_RE.test(raw) ? `'${raw}` : raw;
}

/** Quote/escape one cell for RFC 4180 (after the injection guard). */
export function csvCell(value) {
  const guarded = guardCell(value);
  return QUOTE_RE.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/**
 * Audit records → CSV text.
 * @param {Array<object>} records rows with { verifiedAt, product, id, accountId, trigger, total, flagged, verified, unverifiable }
 * @param {{ bom?: boolean }} opts `bom: true` prepends a UTF-8 BOM so Excel opens it as UTF-8.
 */
export function toCsv(records, { bom = false } = {}) {
  const lines = [CSV_HEADER.join(',')];
  for (const r of records ?? []) {
    const row = [
      r?.verifiedAt, r?.product, r?.id, r?.accountId, r?.trigger,
      r?.total, r?.flagged, r?.verified, r?.unverifiable,
    ];
    lines.push(row.map(csvCell).join(','));
  }
  return `${bom ? '\uFEFF' : ''}${lines.join('\r\n')}\r\n`;
}
