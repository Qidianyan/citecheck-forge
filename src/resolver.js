// Rovo UI resolver (confluence:contentBylineItem + jira:issuePanel).
// @forge/resolver is only available inside the Forge runtime, so this module — not the actions — imports it.
// Tests must not import this file; they exercise the actions and store directly.

import { Resolver } from '@forge/resolver';
import { createAtlassianClient } from './handlers/atlassian.js';
import { createStore } from './handlers/store.js';
import { createActions } from './handlers/actions.js';

const client = createAtlassianClient();
const store = createStore();
const actions = createActions({ client, store });

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

/** Re-run verification for the item in context. */
resolver.define('verifyNow', async (req) => actions.verifyContent(req?.payload ?? {}, req?.context ?? {}));

/** Post the report back to the item in context (Confluence comment or Jira comment + label). */
resolver.define('postReport', async (req) => {
  const ext = req?.context?.extension ?? {};
  if (ext?.content?.id) return actions.postConfluenceReport(req?.payload ?? {}, req?.context ?? {});
  if (ext?.issue?.key) return actions.postJiraReport(req?.payload ?? {}, req?.context ?? {});
  return { error: 'NO_TARGET', message: 'Open this panel on a Confluence page or Jira work item.' };
});

export const handler = resolver.getDefinitions();
