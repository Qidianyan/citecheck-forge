// Organisation sources on the Forge Custom Entity Store (entity "orgsource"), injectable kvs so
// tests run without @forge/kvs. Key layout:
//   src:<sourceKey>          → head item (full value, or { ..., clauses: [], chunks: n } when chunked)
//   src:<sourceKey>#<n>      → chunk items holding { clauses: [...] }
// Every stored item stays ≤ 240 KiB of JSON; get() re-assembles chunked sources.

const ENTITY = 'orgsource';
const KEY_ALPHABET_RE = /[^A-Za-z0-9-_.:]/gu;
const MAX_KEY_CHARS = 100;
const MAX_BYTES = 240 * 1024;

/** Keep only [A-Za-z0-9-_.:] and cap at 100 chars; never empty. */
export function sanitiseSourceKey(sourceKey) {
  const clean = String(sourceKey ?? '').replace(KEY_ALPHABET_RE, '_').slice(0, MAX_KEY_CHARS).trim();
  return clean || 'unknown';
}

const headKey = (sourceKey) => `src:${sanitiseSourceKey(sourceKey)}`;
const chunkKey = (sourceKey, n) => `${headKey(sourceKey)}#${n}`;
const byteLen = (v) => Buffer.byteLength(JSON.stringify(v ?? null), 'utf8');

/**
 * @param {{ kvs?: object }} opts
 *   kvs: an @forge/kvs-shaped module with `.entity(name)`. Defaults to a lazy
 *   `await import('@forge/kvs')` → `.kvs`.
 */
export function createOrgSourceStore({ kvs } = {}) {
  let cached = kvs ?? null;
  const resolveKvs = async () => {
    if (cached) return cached;
    const mod = await import('@forge/kvs');
    cached = mod.kvs ?? mod.default?.kvs ?? mod.default;
    return cached;
  };

  async function dropChunks(sourceKey, count) {
    if (!count) return;
    const e = (await resolveKvs()).entity(ENTITY);
    for (let i = 1; i <= count; i++) {
      if (typeof e.delete === 'function') await e.delete(chunkKey(sourceKey, i));
      else if (typeof e.del === 'function') await e.del(chunkKey(sourceKey, i));
      else await e.remove(chunkKey(sourceKey, i));
    }
  }

  async function register(source) {
    if (!source?.sourceKey) throw new Error('sourceKey is required to register an org source.');
    const e = (await resolveKvs()).entity(ENTITY);
    const key = headKey(source.sourceKey);
    const head = {
      sourceKey: source.sourceKey,
      title: source.title ?? null,
      pageId: source.pageId ?? null,
      pageUrl: source.pageUrl ?? null,
      version: source.version ?? null,
      registeredBy: source.registeredBy ?? null,
      registeredAt: source.registeredAt ?? null,
    };
    const clauses = Array.isArray(source.clauses) ? source.clauses : [];
    const old = await e.get(key);
    const oldHead = old && typeof old === 'object' ? old : null;
    if (oldHead && oldHead.chunks) await dropChunks(source.sourceKey, oldHead.chunks);

    const whole = { ...head, clauses };
    if (byteLen(whole) <= MAX_BYTES) {
      await e.set(key, whole);
      return whole;
    }
    // Too big for one item: split clauses greedily across chunk items, mark the head with chunks: n.
    const chunks = [];
    let cur = [];
    for (const clause of clauses) {
      const next = [...cur, clause];
      if (cur.length && byteLen({ clauses: next }) > MAX_BYTES) { chunks.push(cur); cur = [clause]; }
      else cur = next;
    }
    if (cur.length) chunks.push(cur);
    for (let i = 0; i < chunks.length; i++) {
      await e.set(chunkKey(source.sourceKey, i + 1), { clauses: chunks[i] });
    }
    const chunkedHead = { ...head, clauses: [], chunks: chunks.length };
    await e.set(key, chunkedHead);
    return chunkedHead;
  }

  async function get(sourceKey) {
    const e = (await resolveKvs()).entity(ENTITY);
    const head = await e.get(headKey(sourceKey));
    if (!head) return null;
    if (!head.chunks) return head;
    const clauses = [];
    for (let i = 1; i <= head.chunks; i++) {
      const chunk = await e.get(chunkKey(sourceKey, i));
      if (chunk && Array.isArray(chunk.clauses)) clauses.push(...chunk.clauses);
    }
    return { ...head, clauses };
  }

  async function list() {
    const e = (await resolveKvs()).entity(ENTITY);
    const out = [];
    const seen = new Set();
    let cursor = null;
    for (let guard = 0; guard < 1000; guard++) {
      let q = e.query().index('by-key');
      if (typeof q.limit === 'function') q = q.limit(500);
      if (cursor && typeof q.cursor === 'function') q = q.cursor(cursor);
      const page = await q.getMany(cursor ? { cursor } : {});
      for (const r of page?.results || []) {
        if (!r || seen.has(r.key)) continue;
        seen.add(r.key);
        if (String(r.key).includes('#')) continue; // chunk items are not heads
        if (r.value) out.push(r.value);
      }
      if (!page?.nextCursor || page.nextCursor === cursor) break;
      cursor = page.nextCursor;
    }
    return out;
  }

  async function remove(sourceKey) {
    const e = (await resolveKvs()).entity(ENTITY);
    const key = headKey(sourceKey);
    const head = await e.get(key);
    let removed = false;
    if (head) {
      if (typeof e.delete === 'function') await e.delete(key);
      else if (typeof e.del === 'function') await e.del(key);
      else await e.remove(key);
      removed = true;
    }
    if (head?.chunks) await dropChunks(sourceKey, head.chunks);
    return removed;
  }

  async function keys() {
    return (await list()).map((s) => s.sourceKey).filter(Boolean);
  }

  return { register, get, list, remove, keys };
}
