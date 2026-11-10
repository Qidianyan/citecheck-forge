// Task T — audit store, CSV export, resolvers and auditModel tests. Fakes only; no @forge/* imports.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuditStore } from '../src/audit/auditStore.js';
import { toCsv } from '../src/audit/csv.js';
import { createAuditResolvers } from '../src/audit/resolvers.js';
import { toAuditModel } from '../src/frontend/auditModel.js';

const T0 = new Date('2026-11-10T12:00:00.000Z');
const now = () => new Date(T0);

/** Custom Entity Store fake: entity('audit') with set/get + query().index('by-time').sort().limit().cursor().getMany(). */
function fakeEntityKvs() {
  const rows = new Map();
  const sorted = () => [...rows.values()].sort((a, b) => String(b.verifiedAt).localeCompare(String(a.verifiedAt)));
  const entity = {
    async set(key, value) { rows.set(key, value); },
    async get(key) { return rows.get(key) ?? null; },
    query: () => ({
      index: (name) => {
        assert.equal(name, 'by-time');
        return { sort: (dir) => {
          assert.equal(dir, 'DESC');
          return { limit: (n) => ({ cursor: (c) => ({
            getMany: async () => {
              const all = sorted();
              const off = c ? Number(c) : 0;
              return { results: all.slice(off, off + n), cursor: off + n < all.length ? String(off + n) : null };
            },
          }) }) };
        } };
      },
    }),
  };
  return { entity(name) { assert.equal(name, 'audit'); return entity; }, rows };
}

// ── auditStore ──────────────────────────────────────────────────────────

test('auditStore.record: exact stored shape and sanitised a:<ISO>:<product>:<id> key', async () => {
  const kvs = fakeEntityKvs();
  const audit = createAuditStore({ kvs, now });
  const rec = await audit.record({
    product: 'confluence', id: '42;DROP', accountId: 'u-1',
    verifiedAt: '2026-11-10T12:00:00.000Z',
    summary: { total: 3, flagged: 1, verified: 1, unverifiable: 1 },
    trigger: 'event',
  });
  assert.deepEqual(rec, {
    product: 'confluence', id: '42;DROP', accountId: 'u-1',
    verifiedAt: '2026-11-10T12:00:00.000Z',
    total: 3, flagged: 1, verified: 1, unverifiable: 1, trigger: 'event',
  });
  const key = [...kvs.rows.keys()][0];
  assert.ok(key.startsWith('a:2026-11-10T12:00:00.000Z:confluence:'), key);
  assert.ok(!key.includes(';'), 'id must be sanitised inside the key');
  assert.equal(kvs.rows.get(key).id, '42;DROP');
});

test('auditStore.record: verifiedAt defaults to the injected clock, trigger defaults to manual', async () => {
  const audit = createAuditStore({ kvs: fakeEntityKvs(), now });
  const rec = await audit.record({ product: 'jira', id: 'L-1', summary: {} });
  assert.equal(rec.verifiedAt, '2026-11-10T12:00:00.000Z');
  assert.equal(rec.trigger, 'manual');
  assert.deepEqual([rec.total, rec.flagged, rec.verified, rec.unverifiable], [0, 0, 0, 0]);
});

test('auditStore.list: newest first via by-time index, cursor pages forward', async () => {
  const audit = createAuditStore({ kvs: fakeEntityKvs(), now });
  for (let i = 1; i <= 3; i++) {
    await audit.record({
      product: 'confluence', id: String(i), accountId: null,
      verifiedAt: `2026-11-10T0${i}:00:00.000Z`,
      summary: { total: i, flagged: 0, verified: 0, unverifiable: 0 }, trigger: 'manual',
    });
  }
  const page1 = await audit.list({ limit: 2 });
  assert.deepEqual(page1.results.map((r) => r.id), ['3', '2']);
  assert.equal(page1.cursor, '2');
  const page2 = await audit.list({ limit: 2, cursor: page1.cursor });
  assert.deepEqual(page2.results.map((r) => r.id), ['1']);
  assert.equal(page2.cursor, null);
});

test('auditStore.all: follows cursors across pages and caps at max', async () => {
  const audit = createAuditStore({ kvs: fakeEntityKvs(), now });
  for (let i = 0; i < 250; i++) {
    await audit.record({
      product: 'jira', id: `L-${i}`, accountId: null,
      verifiedAt: new Date(T0.getTime() + i * 1000).toISOString(),
      summary: { total: 1, flagged: 0, verified: 1, unverifiable: 0 }, trigger: 'event',
    });
  }
  const all = await audit.all({ max: 300 });
  assert.equal(all.length, 250);
  assert.equal(all[0].verifiedAt, new Date(T0.getTime() + 249 * 1000).toISOString());
  assert.equal((await audit.all({ max: 5 })).length, 5);
});

// ── csv ─────────────────────────────────────────────────────────────────

test('csv.toCsv: header order, RFC 4180 quoting and CRLF line endings', () => {
  const csv = toCsv([
    { verifiedAt: '2026-11-10T00:00:00.000Z', product: 'confluence', id: '1', accountId: 'a"b', trigger: 'manual', total: 1, flagged: 0, verified: 1, unverifiable: 0 },
    { verifiedAt: '2026-11-10T00:00:01.000Z', product: 'jira', id: 'L-1', accountId: 'u,2', trigger: 'event', total: 2, flagged: 1, verified: 0, unverifiable: 1 },
  ]);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'verifiedAt,product,id,accountId,trigger,total,flagged,verified,unverifiable');
  assert.equal(lines[1], '2026-11-10T00:00:00.000Z,confluence,1,"a""b",manual,1,0,1,0');
  assert.equal(lines[2], '2026-11-10T00:00:01.000Z,jira,L-1,"u,2",event,2,1,0,1');
  assert.equal(lines[lines.length - 1], ''); // trailing CRLF
});

test('csv.toCsv: formula-injection guard prefixes = + - @ tab CR, and the bom flag', () => {
  const csv = toCsv([{
    verifiedAt: 't', product: '=cmd', id: '+x', accountId: '-x', trigger: '@x',
    total: 0, flagged: 0, verified: 0, unverifiable: 0,
  }]);
  assert.equal(csv.split('\r\n')[1], "t,'=cmd,'+x,'-x,'@x,0,0,0,0");

  const csv2 = toCsv([{
    verifiedAt: '\ttabbed', product: '\rcr', id: 'x', accountId: null, trigger: 'manual',
    total: 0, flagged: 0, verified: 0, unverifiable: 0,
  }]);
  assert.ok(csv2.includes("'\t") && csv2.includes("'\r"), csv2);

  assert.ok(toCsv([], { bom: true }).startsWith('\uFEFF'));
  assert.ok(!toCsv([]).startsWith('\uFEFF'));
});

// ── resolvers ───────────────────────────────────────────────────────────

test('auditResolvers.auditCsv: dated filename, 5000-row cap and truncated flag', async () => {
  const audit = createAuditStore({ kvs: fakeEntityKvs(), now });
  const { auditCsv } = createAuditResolvers({ audit, now });

  const small = await auditCsv({ payload: {} });
  assert.equal(small.filename, 'citecheck-audit-2026-11-10.csv');
  assert.equal(small.truncated, false);
  assert.ok(small.csv.startsWith('verifiedAt,product,id,accountId,trigger,total,flagged,verified,unverifiable\r\n'));

  for (let i = 0; i < 5001; i++) {
    await audit.record({
      product: 'confluence', id: `p-${i}`, accountId: null,
      verifiedAt: new Date(T0.getTime() + i).toISOString(),
      summary: { total: 1, flagged: 0, verified: 1, unverifiable: 0 }, trigger: 'event',
    });
  }
  const big = await auditCsv({ payload: {} });
  assert.equal(big.truncated, true);
  assert.equal(big.csv.split('\r\n').length, 5000 + 1 + 1); // header + 5000 rows + trailing CRLF
});

test('auditResolvers.auditList: limit/cursor passthrough with sane defaults', async () => {
  const audit = createAuditStore({ kvs: fakeEntityKvs(), now });
  const { auditList } = createAuditResolvers({ audit });
  assert.deepEqual(await auditList({ payload: {} }), { results: [], cursor: null });
  assert.deepEqual(await auditList({}), { results: [], cursor: null });
  await audit.record({
    product: 'jira', id: 'L-1', accountId: 'u', verifiedAt: '2026-11-10T00:00:00.000Z',
    summary: { total: 1, flagged: 1, verified: 0, unverifiable: 0 }, trigger: 'rovo',
  });
  const out = await auditList({ payload: { limit: 5 } });
  assert.equal(out.results.length, 1);
  assert.equal(out.results[0].trigger, 'rovo');
});

// ── auditModel ──────────────────────────────────────────────────────────

test('auditModel: rows → table cells, trigger counts and footer line', () => {
  const model = toAuditModel([
    { verifiedAt: 't1', product: 'confluence', id: '1', accountId: 'u1', trigger: 'manual', total: 2, flagged: 1, verified: 1, unverifiable: 0 },
    { verifiedAt: 't2', product: 'jira', id: 'L-1', accountId: null, trigger: 'event', total: 1, flagged: 0, verified: 1, unverifiable: 0 },
    { verifiedAt: 't3', product: 'text', id: 'x', accountId: '', trigger: 'rovo', total: 0, flagged: 0, verified: 0, unverifiable: 0 },
  ]);
  assert.deepEqual(model.head, ['Verified at', 'Product', 'ID', 'Account', 'Trigger', 'Total', 'Flagged', 'Verified', 'Unverifiable']);
  assert.deepEqual(model.rows[0], ['t1', 'confluence', '1', 'u1', 'manual', '2', '1', '1', '0']);
  assert.deepEqual(model.rows[1], ['t2', 'jira', 'L-1', '', 'event', '1', '0', '1', '0']);
  assert.deepEqual(model.counts, { total: 3, manual: 1, event: 1, rovo: 1, flagged: 1, unverifiable: 0 });
  assert.equal(model.footer, '3 run(s) · 1 flagged · 0 unverifiable');

  assert.deepEqual(toAuditModel([]).rows, []);
  assert.equal(toAuditModel([]).footer, 'No verification runs recorded yet.');
});
