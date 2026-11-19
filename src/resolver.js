// Rovo UI resolver (confluence:contentBylineItem + jira:issuePanel).
// @forge/resolver is only available inside the Forge runtime, so this module — not the actions — imports it.
// Tests must not import this file; they exercise the actions and store directly.

import { Resolver } from '@forge/resolver';
import { createAtlassianClient } from './handlers/atlassian.js';
import { createStore } from './handlers/store.js';
import { createActions } from './handlers/actions.js';
import { createAuditStore } from './audit/auditStore.js';
import { createOrgSourceStore } from './orgsources/store.js';
import { createShareActions } from './share/shareActions.js';

const client = createAtlassianClient();
const store = createStore();
const audit = createAuditStore();
const actions = createActions({ client, store, audit, orgStore: createOrgSourceStore() });

const share = createShareActions({ client, store, audit });

const resolver = new Resolver();

/** Read the stored full report for the page/work item the panel is rendered on (null when none yet). */
resolver.define('getStatus', async (req) => {
  const ext = req?.context?.extension ?? {};
  const contentId = ext?.content?.id ? String(ext.content.id) : null;
  const issueKey = ext?.issue?.key ? String(ext.issue.key) : null;
  if (contentId) return store.getResult('confluence', contentId);
  if (issueKey) return store.getResult('jira', issueKey);
  return null;
});

/** Re-run verification for the item in context (manual trigger: recorded as 'manual' in the audit trail). */
resolver.define('verifyNow', async (req) => actions.verifyContent(req?.payload ?? {}, { ...req?.context ?? {}, trigger: 'manual' }));

/** Post the report back to the item in context (Confluence comment or Jira comment + label). */
resolver.define('postReport', async (req) => {
  const ext = req?.context?.extension ?? {};
  if (ext?.content?.id) return actions.postConfluenceReport(req?.payload ?? {}, req?.context ?? {});
  if (ext?.issue?.key) return actions.postJiraReport(req?.payload ?? {}, req?.context ?? {});
  return { error: 'NO_TARGET', message: 'Open this panel on a Confluence page or Jira work item.' };
});

// Share / forward / export (the Share modal confirms before calling any write resolver).
const shareCtx = (req) => ({ ...(req?.context ?? {}), accountId: req?.context?.accountId ?? null, siteUrl: req?.context?.siteUrl });
resolver.define('exportReport', async (req) => share.exportReport(req?.payload ?? {}, shareCtx(req)));
resolver.define('getShareLink', async (req) => share.getShareLink(req?.payload ?? {}, shareCtx(req)));
resolver.define('publishReportPage', async (req) => share.publishReportPage(req?.payload ?? {}, shareCtx(req)));
resolver.define('forwardReport', async (req) => share.forwardReport(req?.payload ?? {}, shareCtx(req)));

// Audit list / CSV export live on the admin-only resolver (src/adminResolver.js).
export const handler = resolver.getDefinitions();
