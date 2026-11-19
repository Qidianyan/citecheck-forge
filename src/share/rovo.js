// Rovo action adapters for share-report (CREATE) and export-report (GET).
// Rovo passes the page / work item in payload.context; the actor comes from the Forge context only.

function ctxTarget(payload = {}) {
  const c = payload.context ?? {};
  return {
    contentId: payload.contentId || c.confluence?.contentId || undefined,
    issueKey: payload.issueKey || c.jira?.issueKey || undefined,
  };
}

function actorContext(payload = {}, context = {}) {
  return { ...context, accountId: context?.accountId ?? payload?.context?.accountId ?? null, siteUrl: context?.siteUrl ?? payload?.context?.siteUrl };
}

export function createRovoShareActions(share) {
  return {
    async shareReport(payload = {}, context = {}) {
      const target = ctxTarget(payload);
      const ctx = actorContext(payload, context);
      const mode = String(payload.mode ?? '').toLowerCase();
      if (mode === 'page') return share.publishReportPage(target, ctx);
      if (mode === 'forward') {
        return share.forwardReport({ ...target, accountId: payload.accountId, note: payload.note,
          assign: payload.assign === true || payload.assign === 'true' }, ctx);
      }
      return { error: 'BAD_MODE', message: 'mode must be "page" or "forward".' };
    },
    async exportReport(payload = {}, context = {}) {
      const target = ctxTarget(payload);
      const ctx = actorContext(payload, context);
      const out = await share.exportReport(target, ctx);
      if (out?.error) return out;
      const link = await share.getShareLink(target, ctx);
      return { ...out, link: link?.url ?? null };
    },
  };
}
