// Admin-only resolver definitions (organisation sources + audit trail). Pure factory so tests can
// call it without @forge/resolver; src/adminResolver.js binds it to a Resolver.
// Every call must come from the admin module: Forge resolvers are invocable from any of the app's
// frontends, so the module key is checked server-side.
export const ADMIN_MODULE_KEY = 'citecheck-admin';

export function createAdminDefinitions({ orgAdmin, auditResolvers }) {
  const guard = (fn) => async (req) => {
    if (req?.context?.moduleKey !== ADMIN_MODULE_KEY) {
      return { error: 'FORBIDDEN', message: 'This operation is only available on the CiteCheck admin page.' };
    }
    try {
      return await fn(req?.payload ?? {}, req);
    } catch (e) {
      return { error: 'FAILED', message: e?.message ?? String(e) };
    }
  };
  return {
    orgList: guard(() => orgAdmin.list()),
    orgRegister: guard((p, req) => orgAdmin.registerPage({ pageId: p.pageId, sourceKey: p.sourceKey }, req?.context)),
    orgRefresh: guard((p) => orgAdmin.refresh(p.sourceKey)),
    orgRemove: guard((p) => orgAdmin.remove(p.sourceKey)),
    auditList: guard((p, req) => auditResolvers.auditList(req)),
    auditCsv: guard((p, req) => auditResolvers.auditCsv(req)),
  };
}
