// Forge entry point: the six action functions + the UI resolver, named exactly as manifest.yml's
// `function: handler: index.<name>` entries expect. Client and store are created lazily — the
// @forge/* modules are only imported when a method actually needs them, so this file is safe to
// load in tests without @forge/* installed.

import { createAtlassianClient } from './handlers/atlassian.js';
import { createStore } from './handlers/store.js';
import { createActions } from './handlers/actions.js';

const client = createAtlassianClient();
const store = createStore();
const actions = createActions({ client, store });

export const extractCitations = actions.extractCitations;
export const verifyCitation = actions.verifyCitation;
export const verifyContent = actions.verifyContent;
export const listSources = actions.listSources;
export const postConfluenceReport = actions.postConfluenceReport;
export const postJiraReport = actions.postJiraReport;

export { handler as uiResolver } from './resolver.js';
