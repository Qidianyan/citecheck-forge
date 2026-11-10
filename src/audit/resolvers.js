// Resolver functions exposing the audit trail to the UI (invoke('auditList') / invoke('auditCsv')).
// `audit` (createAuditStore) is injected; `now` is injectable for a deterministic export filename.

import { toCsv } from './csv.js';

const MAX_ROWS = 5000;

function payloadOf(req) {
  return req?.payload ?? req ?? {};
}

function limitOf(raw, fallback) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), MAX_ROWS) : fallback;
}

/**
 * @param {{ audit: object, now?: () => Date }} opts
 */
export function createAuditResolvers({ audit, now } = {}) {
  const nowFn = now ?? (() => new Date());

  return {
    /** Paginated audit records, newest first: payload { limit, cursor } → { results, cursor }. */
    async auditList(req = {}) {
      const p = payloadOf(req);
      return audit.list({ limit: limitOf(p.limit, 100), cursor: p.cursor ?? null });
    },

    /**
     * Full audit export as CSV: payload { max } → { filename, csv, truncated }.
     * Capped at MAX_ROWS rows; `truncated` flags that more rows exist.
     */
    async auditCsv(req = {}) {
      const p = payloadOf(req);
      const cap = limitOf(p.max, MAX_ROWS);
      const rows = await audit.all({ max: cap + 1 });
      const truncated = rows.length > cap;
      const csv = toCsv(rows.slice(0, cap));
      const filename = `citecheck-audit-${nowFn().toISOString().slice(0, 10)}.csv`;
      return { filename, csv, truncated };
    },
  };
}
