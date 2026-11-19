// Enterprise Confluence policy verification tests:
//  - H3 IDF-weighted misattributed clause detection (English + Chinese corporate policies, paraphrased & misquoted)
//  - H5 Confluence archived / superseded / retired policy blocking
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOrgSourceStore } from '../src/orgsources/store.js';
import { createOrgSourceAdmin } from '../src/orgsources/admin.js';
import { verifyOrgCitations } from '../src/orgsources/verify.js';
import { buildReport, toMarkdown } from '../src/handlers/report.js';
import { toViewModel } from '../src/frontend/viewModel.js';

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

const PROCUREMENT_EN = {
  id: '201',
  title: 'Global Procurement Policy',
  status: 'current',
  url: 'https://wiki.example.com/wiki/spaces/FIN/pages/201',
  version: 8,
  text: [
    '§ 1 Scope',
    'This policy governs vendor onboarding, purchase orders and invoice settlement across all business units.',
    '§ 3 Vendor security onboarding',
    'Every external software vendor must complete an ISO 27001 or SOC 2 Type II security questionnaire prior to contract execution.',
    '§ 5 Competitive bidding',
    'Engagements above USD 25,000 require at least three independent vendor quotes documented in Jira.',
    '§ 7 Approval limits and CFO sign-off',
    'Purchase orders exceeding USD 50,000 require written approval from the Chief Financial Officer and General Counsel.',
  ].join('\n'),
};

const PROCUREMENT_ZH = {
  id: '202',
  title: '集团采购审批管理制度',
  status: 'current',
  url: 'https://wiki.example.com/wiki/spaces/FIN/pages/202',
  version: 3,
  text: [
    '第 1 条 适用范围',
    '本制度适用于集团及各子公司所有物资采购与技术服务外包项目。',
    '第 3 条 供应商安全准入',
    '所有外部云服务供应商在签署合同前必须提交信息安全等级保护或 ISO 27001 认证材料。',
    '第 7 条 审批限额与财务总监签批',
    '单笔采购金额超过 50 万元人民币的订单，必须经过首席财务官（CFO）与法务总监书面审批后方可生效。',
  ].join('\n'),
};

test('H3 (English policy): citing PROC-2026 § 3 for CFO approval threshold flags H3 and suggests clause 7', async () => {
  const store = createOrgSourceStore({ kvs: fakeKvs() });
  const admin = createOrgSourceAdmin({ store, client: { async getConfluencePage() { return PROCUREMENT_EN; } } });
  await admin.registerPage({ pageId: '201', sourceKey: 'PROC-2026' });

  // Unquoted paraphrase misattribution
  const rows = await verifyOrgCitations(
    'Under Policy PROC-2026 §3, purchase orders exceeding USD 50,000 require written approval from the Chief Financial Officer and General Counsel.',
    { store },
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].verdict, 'CONTENT_MISMATCH');
  assert.deepEqual(rows[0].hallucination_types, ['H3']);
  assert.equal(rows[0].suggested_article, '7');
  assert.equal(rows[0].crossref.suggested_article, '7');
  assert.match(rows[0].reason_en, /did you mean clause 7/i);

  // Verbatim quote from clause 7 wrongly cited under clause 3
  const misquotedRows = await verifyOrgCitations(
    'PROC-2026 § 3 states: "Purchase orders exceeding USD 50,000 require written approval from the Chief Financial Officer and General Counsel."',
    { store },
  );
  assert.equal(misquotedRows[0].verdict, 'CONTENT_MISMATCH');
  assert.deepEqual(misquotedRows[0].hallucination_types, ['H3']);
  assert.equal(misquotedRows[0].suggested_article, '7');

  // Flows cleanly through report renderer and UI Kit viewModel
  const report = buildReport(rows, { asOf: '2026-11-18' });
  assert.equal(report.rows[0].suggested_article, '7');
  assert.match(toMarkdown(report), /Misattributed: did you mean article 7\?/);
  assert.equal(toViewModel(report).rows[0].suggestedArticle, '7');
});

test('H3 (Chinese corporate policy): citing 《采购制度》(PROC-CN) 第 3 条 for 50万 CFO 审批限额 flags H3 and suggests clause 7', async () => {
  const store = createOrgSourceStore({ kvs: fakeKvs() });
  const admin = createOrgSourceAdmin({ store, client: { async getConfluencePage() { return PROCUREMENT_ZH; } } });
  await admin.registerPage({ pageId: '202', sourceKey: 'PROC-CN' });

  const rows = await verifyOrgCitations(
    '根据《采购制度》（PROC-CN）第 3 条，单笔采购金额超过 50 万元人民币的订单必须经过首席财务官书面审批。',
    { store },
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].verdict, 'CONTENT_MISMATCH');
  assert.deepEqual(rows[0].hallucination_types, ['H3']);
  assert.equal(rows[0].suggested_article, '7');
  assert.match(rows[0].crossref.excerpt, /50 万元/);
});

test('H5 (Archived Confluence policy): detects archived status, superseded labels, and refresh transitions -> NOT_IN_FORCE', async () => {
  let pageStatus = 'current';
  const store = createOrgSourceStore({ kvs: fakeKvs() });
  const admin = createOrgSourceAdmin({
    store,
    client: {
      async getConfluencePage() {
        return { ...PROCUREMENT_EN, status: pageStatus, supersededBy: pageStatus === 'archived' ? 'PROC-2027' : undefined };
      },
    },
  });

  await admin.registerPage({ pageId: '201', sourceKey: 'PROC-OLD' });
  let rows = await verifyOrgCitations('Policy PROC-OLD § 3 requires SOC 2 Type II security questionnaires.', { store });
  assert.equal(rows[0].verdict, 'EXISTS_UNQUOTED');

  // Admin archives the policy page in Confluence and refreshes the source
  pageStatus = 'archived';
  const refreshed = await admin.refresh('PROC-OLD');
  assert.equal(refreshed.archived, true);
  assert.equal(refreshed.status, 'archived');

  rows = await verifyOrgCitations(
    'Policy PROC-OLD § 3: "Every external software vendor must complete an ISO 27001 or SOC 2 Type II security questionnaire prior to contract execution."',
    { store },
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].verdict, 'NOT_IN_FORCE');
  assert.deepEqual(rows[0].hallucination_types, ['H5']);
  assert.match(rows[0].reason_en, /archived/i);
  assert.match(rows[0].reason_en, /PROC-2027/);

  // Confluence lifecycle label (`superseded`) also blocks citations with H5
  await store.register({
    sourceKey: 'SEC-2022',
    title: 'Legacy Encryption Standard',
    pageId: '305',
    pageUrl: 'https://wiki.example.com/pages/305',
    version: 2,
    labels: ['legal', 'superseded'],
    clauses: [{ id: '2', heading: 'TLS', text: 'TLS 1.1 is permitted for internal traffic.' }],
  });
  const labelRows = await verifyOrgCitations('Section 2 of SEC-2022 permits TLS 1.1.', { store });
  assert.equal(labelRows[0].verdict, 'NOT_IN_FORCE');
  assert.deepEqual(labelRows[0].hallucination_types, ['H5']);
  assert.match(labelRows[0].reason_en, /superseded/i);
});
