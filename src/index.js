// Forge entry point: the six action functions + the UI resolver, named exactly as manifest.yml's
// `function: handler: index.<name>` entries expect. Client and store are created lazily — the
// @forge/* modules are only imported when a method actually needs them, so this file is safe to
// load in tests without @forge/* installed.

import { createAtlassianClient } from './handlers/atlassian.js';
import { createStore } from './handlers/store.js';
import { createActions } from './handlers/actions.js';
import { createEventHandlers } from './triggers/events.js';
import { createAuditStore } from './audit/auditStore.js';
import { createOrgSourceStore } from './orgsources/store.js';

const client = createAtlassianClient();
const store = createStore();
const audit = createAuditStore();
const actions = createActions({ client, store, audit, orgStore: createOrgSourceStore() });
const events = createEventHandlers({ actions, store, client, audit });

export const extractCitations = actions.extractCitations;
export const verifyCitation = actions.verifyCitation;
export const verifyContent = actions.verifyContent;
export const listSources = actions.listSources;
export const postConfluenceReport = actions.postConfluenceReport;
export const postJiraReport = actions.postJiraReport;

// Forge events: product triggers and the async re-check consumer.
export const onConfluenceUpdated = (event, context) => events.onConfluenceUpdated(event, context);
export const onJiraUpdated = (event, context) => events.onJiraUpdated(event, context);
export const recheckConsumer = (event, context) => events.consumer(event, context);

export { handler as uiResolver } from './resolver.js';
export { handler as adminResolver } from './adminResolver.js';
