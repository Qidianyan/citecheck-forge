// Pure view-model for the CiteCheck audit panel (src/frontend/AuditPanel.jsx) and its tests.
// No @forge imports here — only plain records in, table cells + counts out.

export const AUDIT_HEAD = ['Verified at', 'Product', 'ID', 'Account', 'Trigger', 'Total', 'Flagged', 'Verified', 'Unverifiable'];

/** One audit record → one DynamicTable row (all cells strings; nulls become ''). */
export function toAuditCells(record) {
  const r = record ?? {};
  return [
    r.verifiedAt ?? '',
    r.product ?? '',
    r.id ?? '',
    r.accountId ?? '',
    r.trigger ?? '',
    String(r.total ?? 0),
    String(r.flagged ?? 0),
    String(r.verified ?? 0),
    String(r.unverifiable ?? 0),
  ];
}

/** Trigger breakdown + citation totals across the visible records. */
export function auditCounts(records) {
  const counts = { total: 0, manual: 0, event: 0, rovo: 0, flagged: 0, unverifiable: 0 };
  for (const r of records ?? []) {
    if (r?.trigger && r.trigger in counts) counts[r.trigger] += 1;
    counts.flagged += Number(r?.flagged) || 0;
    counts.unverifiable += Number(r?.unverifiable) || 0;
  }
  counts.total = (records ?? []).length;
  return counts;
}

/** records → { head, rows, counts, footer } for the AuditPanel DynamicTable. */
export function toAuditModel(records = []) {
  const counts = auditCounts(records);
  return {
    head: AUDIT_HEAD,
    rows: records.map(toAuditCells),
    counts,
    footer: counts.total
      ? `${counts.total} run(s) · ${counts.flagged} flagged · ${counts.unverifiable} unverifiable`
      : 'No verification runs recorded yet.',
  };
}
