// Rovo action handlers (the six `index.*` functions in manifest.yml).
// All external effects go through the injected `client` / `store`, so tests run on fakes only.

import { verify, extract, today } from '../core/index.js';
import { verifyOrgCitations } from '../orgsources/verify.js';
import { buildReport, toMarkdown, toConfluenceStorage, toJiraAdf, labelFor, fitPayload } from './report.js';
import lawsJson from '../corpus/index.json' with { type: 'json' };

export const ISSUE_KEY_RE = /^[A-Z][A-Z0-9_]+-\d+$/;
export const CONTENT_ID_RE = /^\d+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;
const NO_TARGET = {
  error: 'NO_TARGET',
  message: 'Provide text, contentId or issueKey, or run this action from a Confluence page or Jira work item.',
};

/** extractCitations is capped at this many entries; larger pages are reported with `truncated` + `total`. */
export const MAX_CITATIONS = 300;

function str(v) {
  return v == null ? null : String(v).trim() || null;
}

/**
 * Resolve the verification target.
 * Precedence: payload.text > payload.contentId > payload.issueKey > payload.context.confluence.contentId
 * > payload.context.jira.issueKey. Explicit ids are validated; invalid ones fall back to context.
 * Returns { kind, ... } or null.
 */
export function resolveTarget(payload) {
  const p = payload || {};
  const text = typeof p.text === 'string' ? p.text.trim() : '';
  if (text) return { kind: 'text', text };
  const contentId = str(p.contentId);
  if (contentId && CONTENT_ID_RE.test(contentId)) return { kind: 'confluence', contentId };
  const issueKey = str(p.issueKey);
  if (issueKey && ISSUE_KEY_RE.test(issueKey)) return { kind: 'jira', issueKey };
  const ctx = p.context || {};
  const ctxContentId = str(ctx.confluence && ctx.confluence.contentId);
  if (ctxContentId && CONTENT_ID_RE.test(ctxContentId)) return { kind: 'confluence', contentId: ctxContentId };
  const ctxIssueKey = str(ctx.jira && ctx.jira.issueKey);
  if (ctxIssueKey && ISSUE_KEY_RE.test(ctxIssueKey)) return { kind: 'jira', issueKey: ctxIssueKey };
  return null;
}

/** accountId comes from the Forge context only — never from action inputs. */
function accountIdOf(context, payload) {
  return str(context?.accountId) ?? str(payload?.context?.accountId) ?? null;
}

export function createActions({ client, store, now, audit, orgStore } = {}) {
  const nowFn = now ?? (() => new Date());

  /**
   * Statute verdicts (with content checks) plus organisation-source verdicts when an org-source store
   * is injected. A statute row with no linked law that duplicates an org citation in the same sentence
   * (e.g. "Section 3" of "Section 3 of POL-7") is dropped in favour of the org row.
   */
  async function verifyAll(text, asOf) {
    const core = verify(text, { asOf, crossref: true });
    if (!orgStore) return core;
    let org = [];
    try {
      org = await verifyOrgCitations(text, { store: orgStore });
    } catch {
      org = []; // org sources are optional: never fail a statute check because of them
    }
    if (!org.length) return core;
    const dup = (r) => !r.law && org.some((o) => o.sentence === r.sentence && String(o.article) === String(r.article));
    return [...core.filter((r) => !dup(r)), ...org];
  }

  /** One audit entry per verification; only written when an audit store was injected. */
  async function recordAudit(product, id, report, context, payload) {
    if (!audit) return;
    await audit.record({
      product,
      id,
      accountId: accountIdOf(context, payload),
      verifiedAt: report?.verifiedAt ?? null,
      summary: report?.summary ?? null,
      trigger: context?.trigger ?? 'rovo',
    });
  }

  /** Default asOf = today from the injected clock; anything not YYYY-MM-DD falls back to today. */
  const asOfOf = (raw) => (typeof raw === 'string' && DATE_RE.test(raw.trim()) ? raw.trim() : nowFn().toISOString().slice(0, 10));

  function sourceOf(target, extra = {}) {
    if (!target || target.kind === 'text') return { type: 'text', ...extra };
    if (target.kind === 'confluence') return { type: 'confluence', id: target.contentId, ...extra };
    return { type: 'jira', key: target.issueKey, ...extra };
  }

  async function textOf(target) {
    if (target.kind === 'text') return target.text;
    if (target.kind === 'confluence') return (await client.getConfluencePage(target.contentId)).text;
    return (await client.getJiraIssue(target.issueKey)).text;
  }

  async function readTarget(target) {
    if (target.kind === 'text') return { text: target.text, source: { type: 'text' } };
    if (target.kind === 'confluence') {
      const page = await client.getConfluencePage(target.contentId);
      return { text: page.text, source: { type: 'confluence', id: page.id, title: page.title, url: page.url } };
    }
    const issue = await client.getJiraIssue(target.issueKey);
    return { text: issue.text, source: { type: 'jira', key: issue.key, summary: issue.summary, url: issue.url } };
  }

  return {
    /** Scan text/page/issue and return the citations found (no verification). */
    async extractCitations(payload, context = {}) {
      const target = resolveTarget(payload);
      if (!target) return { ...NO_TARGET };
      const { text } = await readTarget(target);
      const all = extract(text).map((c) => ({
        citation: c.citation,
        type: c.type,
        article: c.article ?? null,
        clause: c.clause ?? null,
        law: c.law ? (c.law.law_id ?? String(c.law)) : null,
        law_hint: c.law_hint ?? null,
        quote: c.quote ?? null,
      }));
      const out = { source: sourceOf(target), citations: all.slice(0, MAX_CITATIONS) };
      if (all.length > MAX_CITATIONS) { out.truncated = true; out.total = all.length; }
      return fitPayload(out);
    },

    /** Verify a single citation (with optional quote) written by the user. */
    async verifyCitation(payload, context = {}) {
      const citation = str(payload?.citation);
      const quote = typeof payload?.quote === 'string' ? payload.quote : '';
      const asOf = asOfOf(payload?.asOf);
      const input = `${citation}${quote ? `: "${quote}"` : ''}`;
      const results = verify(input, { asOf, crossref: true });
      if (!results.length) {
        return {
          error: 'NOT_A_CITATION',
          hint: 'Accepted patterns: "Điều 45 Luật 91/2025/QH15", "Pasal 13 UU 27/2022", "Article 12 of Vietnam\'s Law on Cyber Security No. 24/2018/QH14", "Section 19 of the Personal Data Protection Act B.E. 2562" — an article/section plus a law name or number.',
        };
      }
      const report = buildReport(results, { source: { type: 'text' }, asOf, verifiedAt: nowFn().toISOString() });
      return fitPayload({ input, results: report.rows, summary: report.summary });
    },

    /** Verify every citation in the target; return the report JSON plus a Markdown rendering; persist when possible. */
    async verifyContent(payload, context = {}) {
      const target = resolveTarget(payload);
      if (!target) return { ...NO_TARGET };
      const asOf = asOfOf(payload?.asOf);
      const { text, source } = await readTarget(target);
      const report = buildReport(await verifyAll(text, asOf), { source, asOf, verifiedAt: nowFn().toISOString() });
      const out = { ...report, markdown: toMarkdown(report) };
      if (target.kind === 'confluence') {
        await store.saveResult('confluence', target.contentId, out, accountIdOf(context, payload));
        await recordAudit('confluence', target.contentId, out, context, payload);
      } else if (target.kind === 'jira') {
        await store.saveResult('jira', target.issueKey, out, accountIdOf(context, payload));
        await recordAudit('jira', target.issueKey, out, context, payload);
      }
      return fitPayload(out);
    },

    /** True when the actions own the audit store (verifyContent records entries itself). */
    recordsAudit: Boolean(audit),

    /** List the verifiable laws from the bundled corpus, optionally filtered by country (VN/ID/TH). */
    async listSources(payload = {}) {
      const country = str(payload?.country)?.toUpperCase();
      const t = today();
      // English-only output: corpus free-text notes may carry CJK, so pass dates through and drop the rest.
      const dateOr = (v) => (typeof v === 'string' && DATE_RE.test(v.trim()) ? v.trim() : null);
      const rows = lawsJson
        .filter((l) => !country || l.country === country)
        .map((l) => ({
          law_id: l.law_id,
          country: l.country,
          title: l.title,
          number: l.number,
          effective: dateOr(l.effective),
          repealed: dateOr(l.repealed),
          in_force: !(l.repealed && l.repealed <= t) && !(l.effective && l.effective > t),
          translation: Boolean(l.translation),
          article_count: l.article_count ?? null,
          source_page: l.source_page ?? null,
          fetched_at: l.fetched_at ?? null,
        }));
      const counts = { total: rows.length, VN: 0, ID: 0, TH: 0 };
      for (const r of rows) counts[r.country] = (counts[r.country] ?? 0) + 1;
      return fitPayload({ sources: rows, counts });
    },

    /** Verify a Confluence page, post the report as a footer comment, label it, and save it. */
    async postConfluenceReport(payload, context = {}) {
      const target = resolveTarget(payload);
      const contentId = target?.kind === 'confluence'
        ? target.contentId
        : str(context?.extension?.content?.id) ?? str(context?.confluence?.contentId);
      if (!contentId || !CONTENT_ID_RE.test(contentId)) return { ...NO_TARGET };
      const asOf = asOfOf(payload?.asOf);
      const page = await client.getConfluencePage(contentId);
      const report = buildReport(await verifyAll(page.text, asOf), {
        source: { type: 'confluence', id: page.id, title: page.title, url: page.url },
        asOf, verifiedAt: nowFn().toISOString(),
      });
      const label = labelFor(report);
      await client.postConfluenceFooterComment(contentId, toConfluenceStorage(report));
      if (label) await client.addConfluenceLabels(contentId, [label]);
      await store.saveResult('confluence', contentId, report, accountIdOf(context, payload));
      return fitPayload({ posted: true, label, summary: report.summary });
    },

    /** Verify a Jira work item, post the report as a comment, label it, and save it. */
    async postJiraReport(payload, context = {}) {
      const target = resolveTarget(payload);
      const issueKey = target?.kind === 'jira'
        ? target.issueKey
        : str(context?.extension?.issue?.key) ?? str(context?.jira?.issueKey);
      if (!issueKey || !ISSUE_KEY_RE.test(issueKey)) return { ...NO_TARGET };
      const asOf = asOfOf(payload?.asOf);
      const issue = await client.getJiraIssue(issueKey);
      const report = buildReport(await verifyAll(issue.text, asOf), {
        source: { type: 'jira', key: issue.key, summary: issue.summary, url: issue.url },
        asOf, verifiedAt: nowFn().toISOString(),
      });
      const label = labelFor(report);
      await client.postJiraComment(issueKey, toJiraAdf(report));
      if (label) await client.addJiraLabels(issueKey, [label]);
      await store.saveResult('jira', issueKey, report, accountIdOf(context, payload));
      return fitPayload({ posted: true, label, summary: report.summary });
    },
  };
}
