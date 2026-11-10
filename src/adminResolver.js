// Resolver for the CiteCheck admin page (confluence:globalSettings). Imports @forge/resolver, so tests
// exercise src/adminResolverDefs.js instead.
import { Resolver } from '@forge/resolver';
import { createAtlassianClient } from './handlers/atlassian.js';
import { createOrgSourceStore } from './orgsources/store.js';
import { createOrgSourceAdmin } from './orgsources/admin.js';
import { createAuditStore } from './audit/auditStore.js';
import { createAuditResolvers } from './audit/resolvers.js';
import { createAdminDefinitions } from './adminResolverDefs.js';

const client = createAtlassianClient();
const orgAdmin = createOrgSourceAdmin({ store: createOrgSourceStore(), client });
const auditResolvers = createAuditResolvers({ audit: createAuditStore() });

const resolver = new Resolver();
for (const [name, fn] of Object.entries(createAdminDefinitions({ orgAdmin, auditResolvers }))) resolver.define(name, fn);

export const handler = resolver.getDefinitions();
