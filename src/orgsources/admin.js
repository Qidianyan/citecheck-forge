// Admin operations over the org-source store: register / refresh / remove / list Confluence pages.
import { parseClauses } from './parse.js';

export const SOURCE_KEY_RE = /^[A-Za-z][A-Za-z0-9-]{1,30}$/;

/**
 * @param {{ store: object, client: object, now?: () => Date, registeredBy?: string|null }} opts
 *   client must expose getConfluencePage(id) → { id, title, url, text, version }.
 */
export function createOrgSourceAdmin({ store, client, now, registeredBy = null } = {}) {
  const nowFn = now ?? (() => new Date());

  async function registerPage({ pageId, sourceKey } = {}) {
    const key = String(sourceKey ?? '').trim();
    if (!SOURCE_KEY_RE.test(key)) {
      throw new Error(`Invalid sourceKey "${key}": expected ^[A-Za-z][A-Za-z0-9-]{1,30}$ (2-31 chars, starting with a letter).`);
    }
    const page = await client.getConfluencePage(pageId);
    const parsed = parseClauses(page?.text, { sourceKey: key, title: page?.title });
    await store.register({
      sourceKey: key,
      title: page?.title ?? null,
      pageId: page?.id ?? pageId,
      pageUrl: page?.url ?? null,
      version: page?.version ?? null,
      registeredBy,
      registeredAt: nowFn().toISOString(),
      clauses: parsed.clauses,
    });
    return { sourceKey: key, clauses: parsed.clauses.length };
  }

  async function canonicalKey(sourceKey) {
    const wanted = String(sourceKey ?? '').trim().toLowerCase();
    const hit = (await store.list()).find((s) => String(s.sourceKey ?? '').toLowerCase() === wanted);
    return hit ? hit.sourceKey : String(sourceKey ?? '').trim();
  }

  return {
    registerPage,

    /** Re-fetch the stored page and overwrite the source with its current clauses. */
    async refresh(sourceKey) {
      const key = await canonicalKey(sourceKey);
      const existing = await store.get(key);
      if (!existing) throw new Error(`Org source not registered: ${sourceKey}`);
      return registerPage({ pageId: existing.pageId, sourceKey: key });
    },

    async remove(sourceKey) {
      return store.remove(await canonicalKey(sourceKey));
    },

    /** [{ sourceKey, title, pageUrl, clauses, registeredAt }] — clauses is the clause count. */
    async list() {
      const heads = await store.list();
      const out = [];
      for (const s of heads) {
        const clauses = s.chunks
          ? (await store.get(s.sourceKey)).clauses
          : (Array.isArray(s.clauses) ? s.clauses : []);
        out.push({
          sourceKey: s.sourceKey,
          title: s.title ?? null,
          pageUrl: s.pageUrl ?? null,
          clauses: clauses.length,
          registeredAt: s.registeredAt ?? null,
        });
      }
      return out;
    },
  };
}
