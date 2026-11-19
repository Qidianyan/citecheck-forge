// Tests for `list-registered-org-policies` Rovo & Atlassian MCP action (src/rovo/orgPoliciesAction.js + manifest.yml).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrgSourceStore } from '../src/orgsources/store.js';
import { createActions } from '../src/handlers/actions.js';
import { byteSize } from '../src/handlers/report.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function fakeKvs() {
  const map = new Map();
  return {
    entity() {
      return {
        set: async (k, v) => { map.set(k, JSON.parse(JSON.stringify(v))); },
        get: async (k) => (map.has(k) ? JSON.parse(JSON.stringify(map.get(k))) : null),
        delete: async (k) => map.delete(k),
        query: () => ({
          index: () => ({
            getMany: async () => ({
              results: [...map.entries()].map(([key, value]) => ({ key, value })),
              nextCursor: null,
            }),
          }),
        }),
      };
    },
  };
}

test('manifest.yml declares list-registered-org-policies in rovo:agent, rovo:skill, rovo:mcp, action and function', () => {
  const yml = fs.readFileSync(path.join(ROOT, 'manifest.yml'), 'utf8');
  assert.match(yml, /- list-registered-org-policies/);
  assert.match(yml, /key:\s*list-registered-org-policies/);
  assert.match(yml, /function:\s*list-org-policies-fn/);
  assert.match(yml, /handler:\s*index\.listRegisteredOrgPolicies/);
  // Verify rovo:mcp exposes list-registered-org-policies to external MCP clients
  const mcpBlock = /rovo:mcp:[\s\S]*?(?=\n {2}[a-z]+:)/u.exec(yml)?.[0] || '';
  assert.match(mcpBlock, /list-registered-org-policies/);
});

test('listRegisteredOrgPolicies lists active and archived policies, supports query & status filters, and stays < 200 KB', async () => {
  const orgStore = createOrgSourceStore({ kvs: fakeKvs() });
  await orgStore.register({
    sourceKey: 'POL-7',
    title: 'Global Data Retention Policy',
    pageId: '77',
    pageUrl: 'https://wiki.example.com/pages/77',
    status: 'current',
    version: 4,
    registeredAt: '2026-11-18T00:00:00Z',
    clauses: [
      { id: '3', heading: 'Customer logs', text: 'Application logs are retained for 90 days.' },
      { id: '6', heading: 'Backups', text: 'Encrypted backups are purged after 30 days.' },
    ],
  });
  await orgStore.register({
    sourceKey: 'POL-2',
    title: 'Legacy Travel Expense Policy',
    pageId: '19',
    pageUrl: 'https://wiki.example.com/pages/19',
    status: 'archived',
    archived: true,
    supersededBy: 'POL-9',
    version: 1,
    registeredAt: '2025-02-01T00:00:00Z',
    clauses: [
      { id: '1', heading: 'Per diem', text: 'Domestic meal cap is USD 65 per day.' },
    ],
  });

  const acts = createActions({ orgStore, now: () => new Date('2026-11-18T12:00:00Z') });

  // List all
  const all = await acts.listRegisteredOrgPolicies({});
  assert.equal(all.counts.total, 2);
  assert.equal(all.counts.active, 1);
  assert.equal(all.counts.archived, 1);
  assert.deepEqual(all.policies.map((p) => [p.sourceKey, p.in_force, p.clause_count]), [
    ['POL-2', false, 1],
    ['POL-7', true, 2],
  ]);
  assert.equal(all.policies[0].superseded_by, 'POL-9');
  assert.ok(byteSize(all) < 200 * 1024);

  // Filter active only
  const activeOnly = await acts.listRegisteredOrgPolicies({ status: 'active' });
  assert.equal(activeOnly.policies.length, 1);
  assert.equal(activeOnly.policies[0].sourceKey, 'POL-7');

  // Filter archived only
  const archivedOnly = await acts.listRegisteredOrgPolicies({ status: 'archived' });
  assert.equal(archivedOnly.policies.length, 1);
  assert.equal(archivedOnly.policies[0].sourceKey, 'POL-2');

  // Search by clause keyword
  const search = await acts.listRegisteredOrgPolicies({ query: 'Encrypted backups' });
  assert.equal(search.policies.length, 1);
  assert.equal(search.policies[0].sourceKey, 'POL-7');
  assert.equal(search.policies[0].matching_clauses.length, 1);
  assert.equal(search.policies[0].matching_clauses[0].id, '6');

  // verifyCitation action also verifies registered org policy citations directly
  const singleCheck = await acts.verifyCitation({ citation: 'Policy POL-2 §1' });
  assert.equal(singleCheck.results[0].type, 'org');
  assert.equal(singleCheck.results[0].verdict, 'NOT_IN_FORCE');
  assert.deepEqual(singleCheck.results[0].hallucination_types, ['H5']);
});
