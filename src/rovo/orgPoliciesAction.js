// Rovo & Atlassian MCP action handler for listing and searching registered organisation Confluence policies.
// Exposed as `list-registered-org-policies` in manifest.yml (both `rovo:agent` and `rovo:mcp`).
import { cpSlice } from '../core/normalize.js';
import { fitPayload } from '../handlers/report.js';
import { orgSourceLifecycle } from '../orgsources/verify.js';

const MAX_POLICIES = 100;
const MAX_MATCHING_CLAUSES = 5;
const MAX_SNIPPET_CP = 240;

function cleanStr(v) {
  return v == null ? null : String(v).trim() || null;
}

/**
 * Create Rovo action handlers for inspecting registered Confluence organisation policies.
 * @param {{ orgStore?: object, now?: () => Date }} opts
 */
export function createOrgPoliciesActions({ orgStore, now } = {}) {
  const nowFn = now ?? (() => new Date());

  return {
    /**
     * List and optionally search all authoritative Confluence policies registered in CiteCheck.
     * Inputs:
     *  - query (optional string): case-insensitive substring filter over sourceKey, title, or clause headings/text
     *  - status (optional string): "all" (default), "active", or "archived"
     */
    async listRegisteredOrgPolicies(payload = {}) {
      if (!orgStore) {
        return {
          policies: [],
          counts: { total: 0, active: 0, archived: 0 },
        };
      }
      const queryRaw = cleanStr(payload?.query);
      const q = queryRaw ? queryRaw.normalize('NFC').toLowerCase() : null;
      const statusFilter = (cleanStr(payload?.status) || 'all').toLowerCase();
      const asOf = nowFn().toISOString().slice(0, 10);

      const heads = await orgStore.list();
      const policies = [];
      let activeCount = 0;
      let archivedCount = 0;

      for (const head of heads) {
        const full = head.chunks || q
          ? (await orgStore.get(head.sourceKey)) ?? head
          : head;
        const clauses = Array.isArray(full.clauses) ? full.clauses : [];
        const lifecycle = orgSourceLifecycle(full, asOf);
        const inForce = !lifecycle.archived;
        const lifecycleStatus = lifecycle.archived ? (full.status && String(full.status).toLowerCase() !== 'current' ? String(full.status).toLowerCase() : 'archived') : (full.status || 'current');

        if (statusFilter === 'active' && !inForce) continue;
        if (statusFilter === 'archived' && inForce) continue;

        let matchingClauses = undefined;
        if (q) {
          const keyOrTitleHit = String(full.sourceKey ?? '').toLowerCase().includes(q)
            || String(full.title ?? '').normalize('NFC').toLowerCase().includes(q);
          const hits = clauses.filter((cl) => {
            const hay = `${cl.id ?? ''} ${cl.heading ?? ''} ${cl.text ?? ''}`.normalize('NFC').toLowerCase();
            return hay.includes(q);
          });
          if (!keyOrTitleHit && !hits.length) continue;
          matchingClauses = hits.slice(0, MAX_MATCHING_CLAUSES).map((cl) => ({
            id: String(cl.id),
            heading: cl.heading || null,
            excerpt: cpSlice(String(cl.text ?? ''), 0, MAX_SNIPPET_CP),
          }));
        }

        if (inForce) activeCount++;
        else archivedCount++;

        const row = {
          sourceKey: full.sourceKey,
          title: full.title ?? null,
          pageId: full.pageId ?? null,
          pageUrl: full.pageUrl ?? null,
          version: full.version ?? null,
          status: lifecycleStatus,
          in_force: inForce,
          ...(lifecycle.archived ? { status_reason: lifecycle.why } : {}),
          ...(full.supersededBy ? { superseded_by: full.supersededBy } : {}),
          clause_count: clauses.length,
          clause_ids: clauses.slice(0, 50).map((cl) => String(cl.id)),
          registeredAt: full.registeredAt ?? null,
          ...(matchingClauses !== undefined ? { matching_clauses: matchingClauses } : {}),
        };
        policies.push(row);
      }

      policies.sort((a, b) => String(a.sourceKey).localeCompare(String(b.sourceKey)));
      const truncated = policies.length > MAX_POLICIES;
      const out = {
        policies: policies.slice(0, MAX_POLICIES),
        counts: {
          total: policies.length,
          active: activeCount,
          archived: archivedCount,
        },
        ...(queryRaw ? { query: queryRaw } : {}),
        ...(truncated ? { truncated: true } : {}),
      };
      return fitPayload(out);
    },
  };
}
