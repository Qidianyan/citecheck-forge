// Audit trail on the Forge Custom Entity Store entity `audit` (entity name → kvs.entity('audit')).
// Record key: `a:<ISO verifiedAt>:<product>:<id>` with every part sanitised.
// Reads go through the `by-time` index, newest first: kvs.entity('audit').query()
//   .index('by-time').sort('DESC').limit(n).cursor(c).getMany().
// The kvs module is injectable so tests run on fakes only; @forge/kvs is imported lazily otherwise.

import { sanitiseKeyPart } from '../handlers/store.js';

const DEFAULT_LIMIT = 100;

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * @param {{ kvs?: object, now?: () => Date }} opts
 *   kvs: an @forge/kvs-shaped object with `.entity(name)` (defaults to a lazy `await import('@forge/kvs')`).
 */
export function createAuditStore({ kvs, now } = {}) {
  let cachedKvs = kvs ?? null;
  let cachedEntity = null;
  const nowFn = now ?? (() => new Date());

  const resolveKvs = async () => {
    if (cachedKvs) return cachedKvs;
    const mod = await import('@forge/kvs');
    cachedKvs = mod.kvs ?? mod.default?.kvs ?? mod.default;
    return cachedKvs;
  };
  const entity = async () => {
    if (cachedEntity) return cachedEntity;
    cachedEntity = (await resolveKvs()).entity('audit');
    return cachedEntity;
  };

  /** Newest first via the by-time index; returns { results, cursor } (cursor null on the last page). */
  async function list({ limit = DEFAULT_LIMIT, cursor = null } = {}) {
    const db = await entity();
    const res = await db.query().index('by-time').sort('DESC').limit(num(limit, DEFAULT_LIMIT)).cursor(cursor).getMany();
    return Array.isArray(res) ? { results: res, cursor: null } : res;
  }

  /** Every record (newest first), following cursors, capped at max rows. */
  async function all({ max = 5000 } = {}) {
    const rows = [];
    let cursor = null;
    const cap = num(max, 5000);
    for (let guard = 0; rows.length < cap && guard < 1000; guard++) {
      const page = await list({ limit: Math.min(DEFAULT_LIMIT, cap - rows.length), cursor });
      const results = page?.results ?? [];
      if (!results.length) break;
      rows.push(...results);
      const next = page?.cursor ?? null;
      if (!next || next === cursor) break;
      cursor = next;
    }
    return rows.slice(0, cap);
  }

  return {
    /**
     * Persist one audit record. Input:
     *   { product, id, accountId, verifiedAt, summary: { total, flagged, verified, unverifiable }, trigger }
     * Stored shape: { product, id, accountId, verifiedAt, total, flagged, verified, unverifiable, trigger }.
     */
    async record(input = {}) {
      const db = await entity();
      const summary = input.summary ?? {};
      const verifiedAt = String(input.verifiedAt ?? nowFn().toISOString());
      const value = {
        product: input.product ?? null,
        id: input.id ?? null,
        accountId: input.accountId ?? null,
        verifiedAt,
        total: num(summary.total, 0),
        flagged: num(summary.flagged, 0),
        verified: num(summary.verified, 0),
        unverifiable: num(summary.unverifiable, 0),
        trigger: input.trigger ?? 'manual',
      };
      const key = `a:${sanitiseKeyPart(verifiedAt)}:${sanitiseKeyPart(value.product)}:${sanitiseKeyPart(value.id)}`;
      await db.set(key, value);
      return value;
    },

    list,
    all,
  };
}
