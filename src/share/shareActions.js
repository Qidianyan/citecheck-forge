// Share / forward / export for a stored CiteCheck report. These run only after the user confirmed
// in the UI (Share modal) or in Rovo chat; none of them re-verifies — they use the stored report.
// Forwarding uses Atlassian mentions (Atlassian sends the notification); CiteCheck never emails anyone.

import { CONTENT_ID_RE, ISSUE_KEY_RE } from '../handlers/actions.js';
import { toMarkdown, fitPayload } from '../handlers/report.js';
import {
  ACCOUNT_ID_RE, MAX_NOTE, cleanNote, reportPageTitle, exportFilename,
  toReportPageStorage, toForwardStorage, toForwardAdf,
} from './render.js';

const NO_REPORT = { error: 'NO_REPORT', message: 'Run a verification first.' };
const noTarget = (message = 'Open this on a Confluence page or Jira work item, or pass a valid contentId / issueKey.') => ({ error: 'NO_TARGET', message });

function apiError(e, what) {
  const status = Number(e?.status) || Number(/HTTP (\d{3})/.exec(String(e?.message ?? ''))?.[1]) || 0;
  let message = `Couldn't ${what}. Try again in a moment.`;
  if (status === 401 || status === 403) message = `You don't have permission to ${what}. Ask a space or project admin for access.`;
  else if (status === 404) message = `Couldn't ${what}: the page or work item was not found.`;
  return { error: 'API_ERROR', status, message };
}

/** { product, id } from explicit inputs or the Forge context. */
export function targetOf(input = {}, context = {}) {
  const ext = context?.extension ?? {};
  const contentId = input.contentId ?? (input.product === 'confluence' ? input.id : null) ?? ext?.content?.id ?? null;
  const issueKey = input.issueKey ?? (input.product === 'jira' ? input.id : null) ?? ext?.issue?.key ?? null;
  if (contentId != null && CONTENT_ID_RE.test(String(contentId))) return { product: 'confluence', id: String(contentId) };
  if (issueKey != null && ISSUE_KEY_RE.test(String(issueKey))) return { product: 'jira', id: String(issueKey) };
  return null;
}

export function createShareActions({ client, store, now, audit } = {}) {
  const nowFn = now ?? (() => new Date());
  const today = () => nowFn().toISOString().slice(0, 10);

  async function load(input, context) {
    const t = targetOf(input, context);
    if (!t) return { err: noTarget() };
    const report = await store.getResult(t.product, t.id);
    if (!report) return { err: { ...NO_REPORT } };
    return { t, report };
  }

  async function record(t, report, context, trigger) {
    if (!audit) return;
    // Event time as the key time so a share never overwrites the verification record.
    // Never stored: the note text and the teammate's account id.
    await audit.record({
      product: t.product, id: t.id, accountId: context?.accountId ?? null,
      verifiedAt: nowFn().toISOString(), summary: report.summary ?? null, trigger,
    });
  }

  const itemUrl = (t, report) => report?.source?.url || (t.product === 'jira' ? `/browse/${t.id}` : `/wiki/pages/${t.id}`);

  function link(t, report, context) {
    const rel = itemUrl(t, report);
    if (/^https:\/\//.test(rel)) return { url: rel, absolute: true };
    const site = typeof context?.siteUrl === 'string' && /^https:\/\/[^\s"'<>]+$/.test(context.siteUrl) ? context.siteUrl.replace(/\/$/, '') : null;
    return site ? { url: `${site}${rel}`, absolute: true } : { url: rel, absolute: false };
  }

  return {
    /** Markdown + file name for download / copy. */
    async exportReport(input = {}, context = {}) {
      const { t, report, err } = await load(input, context);
      if (err) return err;
      await record(t, report, context, 'share:export');
      return fitPayload({ markdown: toMarkdown(report), filename: exportFilename(t.product, t.id, today()), summary: report.summary });
    },

    /** Absolute link when the site URL is known, otherwise site-relative. */
    async getShareLink(input = {}, context = {}) {
      const { t, report, err } = await load(input, context);
      if (err) return err;
      return link(t, report, context);
    },

    /** Child page "Citation check — <title> — <date>" under the checked Confluence page. */
    async publishReportPage(input = {}, context = {}) {
      const t = targetOf(input, context);
      if (!t) return noTarget();
      if (t.product !== 'confluence') return { error: 'CONFLUENCE_ONLY', message: 'Publishing a report page is available on Confluence pages.' };
      const report = await store.getResult(t.product, t.id);
      if (!report) return { ...NO_REPORT };
      let page;
      try {
        page = await client.getConfluencePage(t.id);
      } catch (e) { return apiError(e, 'read this page'); }
      if (!page?.spaceId) return { error: 'API_ERROR', status: 0, message: "Couldn't find the space of this page." };
      const title = reportPageTitle({ ...report, source: { ...report.source, title: page.title || report.source?.title } }, today());
      let created;
      try {
        created = await client.createConfluencePage({
          spaceId: page.spaceId, parentId: t.id, title,
          storage: toReportPageStorage(report, { link: link(t, report, context).url }),
        });
      } catch (e) { return apiError(e, 'create a page in this space'); }
      await record(t, report, context, 'share:page');
      return fitPayload({ published: true, pageId: created.id, url: created.url, title });
    },

    /** Mention a teammate in a comment with the report; on Jira optionally assign the work item. */
    async forwardReport(input = {}, context = {}) {
      const accountId = String(input.accountId ?? '').trim();
      if (!ACCOUNT_ID_RE.test(accountId)) return { error: 'INVALID_ACCOUNT', message: 'Pick a teammate from the list.' };
      const rawNote = input.note == null ? '' : String(input.note);
      if (Array.from(rawNote).length > MAX_NOTE) return { error: 'NOTE_TOO_LONG', message: `Keep the note under ${MAX_NOTE} characters.` };
      const t = targetOf(input, context);
      if (!t) return noTarget();
      if (input.assign === true && t.product !== 'jira') return { error: 'ASSIGN_JIRA_ONLY', message: 'Assigning is only available on Jira work items.' };
      const report = await store.getResult(t.product, t.id);
      if (!report) return { ...NO_REPORT };
      const note = cleanNote(rawNote);
      const url = link(t, report, context).url;
      try {
        if (t.product === 'confluence') await client.postConfluenceFooterComment(t.id, toForwardStorage(report, { accountId, note, link: url }));
        else await client.postJiraComment(t.id, toForwardAdf(report, { accountId, note, link: url }));
      } catch (e) { return apiError(e, 'comment here'); }
      let assigned = false;
      if (input.assign === true) {
        try {
          await client.assignJiraIssue(t.id, accountId);
          assigned = true;
        } catch (e) {
          await record(t, report, context, 'share:forward');
          return { ...apiError(e, 'assign this work item'), forwarded: true, assigned: false };
        }
      }
      await record(t, report, context, 'share:forward');
      return { forwarded: true, mentioned: accountId, assigned };
    },
  };
}
