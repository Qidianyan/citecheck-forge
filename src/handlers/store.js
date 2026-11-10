// Result + audit persistence on top of @forge/kvs (injectable so tests run without @forge/* installed).
// Key layout:
//   result:${product}:${id}                      → the report JSON (kept < 200 KB by dropping original_excerpt)
//   audit:${YYYYMMDDHHmmss}:${product}:${id}     → { product, id, accountId, verifiedAt, summary }
// Keys must match /^(?!\s+$)[a-zA-Z0-9:._\s-#]+$/ — every id/product is sanitised before use.

const KEY_RE = /^(?!\s+$)[a-zA-Z0-9:._\s-#]+$/;
const MAX_BYTES = 200 * 1024; // Forge kvs values must stay small; keep JSON under 200 KB.

function byteLen(v) {
  return Buffer.byteLength(JSON.stringify(v ?? null), 'utf8');
}

/** Replace anything outside the allowed key alphabet; never return an empty/whitespace-only part. */
export function sanitiseKeyPart(part) {
  const clean = String(part ?? '').replace(/[^a-zA-Z0-9:._\s-#]/g, '_').trim();
  return KEY_RE.test(clean) && clean ? clean : 'unknown';
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Drop per-row original_excerpt until the JSON form of the value fits under the size cap. */
function trimToSize(value) {
  let out = value;
  for (let i = 0; i < 3 && byteLen(out) >= MAX_BYTES; i++) {
    out = Array.isArray(out?.rows)
      ? { ...out, rows: out.rows.map(({ original_excerpt, ...rest }) => rest) }
      : out;
    if (byteLen(out) >= MAX_BYTES && i === 1 && out?.rows) {
      out = { ...out, rows: out.rows.map((r) => ({ n: r.n, citation: r.citation, verdict: r.verdict, flagged: r.flagged })) };
    }
  }
  return out;
}

/**
 * @param {{ kvs?: object }} opts
 *   kvs: an @forge/kvs-shaped object ({ set, get }). Defaults to a lazy `await import('@forge/kvs')` → `.kvs`.
 */
export function createStore({ kvs } = {}) {
  let cached = kvs ?? null;
  const resolveKvs = async () => {
    if (cached) return cached;
    const mod = await import('@forge/kvs');
    cached = mod.kvs ?? mod.default?.kvs ?? mod.default;
    return cached;
  };

  return {
    /** Persist the report under result:${product}:${id} + an audit record; returns the stored value. */
    async saveResult(product, id, report, accountId) {
      const db = await resolveKvs();
      const p = sanitiseKeyPart(product);
      const i = sanitiseKeyPart(id);
      const value = trimToSize(report);
      await db.set(`result:${p}:${i}`, value);
      await db.set(`audit:${stamp()}:${p}:${i}`, {
        product: p, id: i,
        accountId: accountId ?? null,
        verifiedAt: report?.verifiedAt ?? null,
        summary: report?.summary ?? null,
      });
      return value;
    },

    /** Read the stored report for a product/id, or null when nothing was saved. */
    async getResult(product, id) {
      const db = await resolveKvs();
      const raw = await db.get(`result:${sanitiseKeyPart(product)}:${sanitiseKeyPart(id)}`);
      if (raw == null) return null;
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    },
  };
}
