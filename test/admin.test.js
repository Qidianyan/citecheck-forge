// Admin resolver definitions: module-key guard, delegation, error wrapping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAdminDefinitions, ADMIN_MODULE_KEY } from '../src/adminResolverDefs.js';

function fakes() {
  const calls = [];
  const orgAdmin = {
    list: async () => { calls.push('list'); return [{ sourceKey: 'POL-7' }]; },
    registerPage: async (p) => { calls.push(['register', p]); return { sourceKey: p.sourceKey, clauses: 3 }; },
    refresh: async (k) => { calls.push(['refresh', k]); return { sourceKey: k, clauses: 3 }; },
    remove: async (k) => { calls.push(['remove', k]); return { removed: true }; },
  };
  const auditResolvers = {
    auditList: async () => { calls.push('auditList'); return { records: [] }; },
    auditCsv: async () => { calls.push('auditCsv'); return { filename: 'x.csv', csv: '' }; },
  };
  return { calls, defs: createAdminDefinitions({ orgAdmin, auditResolvers }) };
}
const adminReq = (payload = {}) => ({ payload, context: { moduleKey: ADMIN_MODULE_KEY } });

test('admin definitions refuse calls from any other module (byline / issue panel)', async () => {
  const { calls, defs } = fakes();
  for (const name of Object.keys(defs)) {
    const out = await defs[name]({ payload: { sourceKey: 'POL-7' }, context: { moduleKey: 'citecheck-byline' } });
    assert.equal(out.error, 'FORBIDDEN', name);
  }
  assert.equal(calls.length, 0);
});

test('admin definitions delegate to the org-source admin and audit resolvers', async () => {
  const { calls, defs } = fakes();
  assert.deepEqual(await defs.orgList(adminReq()), [{ sourceKey: 'POL-7' }]);
  assert.deepEqual(await defs.orgRegister(adminReq({ pageId: '123', sourceKey: 'POL-7' })), { sourceKey: 'POL-7', clauses: 3 });
  await defs.orgRefresh(adminReq({ sourceKey: 'POL-7' }));
  await defs.orgRemove(adminReq({ sourceKey: 'POL-7' }));
  await defs.auditList(adminReq());
  await defs.auditCsv(adminReq());
  assert.deepEqual(calls, ['list', ['register', { pageId: '123', sourceKey: 'POL-7' }], ['refresh', 'POL-7'], ['remove', 'POL-7'], 'auditList', 'auditCsv']);
});

test('admin definitions turn thrown errors into a FAILED result', async () => {
  const defs = createAdminDefinitions({
    orgAdmin: { registerPage: async () => { throw new Error('Invalid sourceKey'); } },
    auditResolvers: {},
  });
  const out = await defs.orgRegister(adminReq({ pageId: '1', sourceKey: '!' }));
  assert.deepEqual(out, { error: 'FAILED', message: 'Invalid sourceKey' });
});
