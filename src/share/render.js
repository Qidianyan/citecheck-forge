// Renderers for share / forward / publish. Pure functions; every dynamic string is escaped and the
// only attribute value that comes from input (the Atlassian account id) is validated, not just escaped.

import { toConfluenceStorage, toJiraAdf, summaryLine } from '../handlers/report.js';

export const ACCOUNT_ID_RE = /^[A-Za-z0-9:_-]{6,128}$/;
export const MAX_NOTE = 500;
export const MAX_TITLE = 255;
export const DEFAULT_NOTE = 'Please review the flagged citations in this citation check.';

export const escXml = (v) => String(v ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

/** Strip control characters (except newline/tab) so notes cannot smuggle odd bytes into posted content. */
export const cleanNote = (note) => String(note ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '').trim();

function itemName(report) {
  const s = report?.source ?? {};
  return s.title || s.summary || s.key || (s.id ? `page ${s.id}` : 'this content');
}

/** "Citation check — <title> — <YYYY-MM-DD>", title cut so the whole string stays ≤ 255 characters. */
export function reportPageTitle(report, date) {
  const prefix = 'Citation check — ';
  const suffix = ` — ${date}`;
  const room = MAX_TITLE - prefix.length - suffix.length;
  const name = Array.from(String(itemName(report)).replace(/\s+/gu, ' ').trim());
  const cut = name.length > room ? name.slice(0, room - 1).join('') + '…' : name.join('');
  return `${prefix}${cut}${suffix}`;
}

export function exportFilename(product, id, date) {
  const safe = (v) => String(v ?? '').replace(/[^A-Za-z0-9-]/g, '_').slice(0, 64) || 'item';
  return `citecheck-${safe(product)}-${safe(id)}-${date}.md`;
}

/** Storage body of the published report page: intro, link back to the checked page, full report. */
export function toReportPageStorage(report, { link } = {}) {
  const href = typeof link === 'string' && /^(https:\/\/|\/)[^\s"'<>]*$/.test(link) ? link : null;
  return [
    `<p>Citation check of <strong>${escXml(itemName(report))}</strong>${href ? ` (<a href="${escXml(href)}">open the checked page</a>)` : ''}. `
      + 'Verdicts are deterministic and link to the official text; unverifiable citations need a person.</p>',
    toConfluenceStorage(report),
  ].join('\n');
}

function assertAccountId(accountId) {
  if (!ACCOUNT_ID_RE.test(String(accountId ?? ''))) throw new Error('INVALID_ACCOUNT');
}

/** Confluence footer comment that mentions the teammate, then the report. */
export function toForwardStorage(report, { accountId, note, link } = {}) {
  assertAccountId(accountId);
  const text = cleanNote(note) || DEFAULT_NOTE;
  const href = typeof link === 'string' && /^(https:\/\/|\/)[^\s"'<>]*$/.test(link) ? link : null;
  return [
    `<p><ac:link><ri:user ri:account-id="${accountId}" /></ac:link> ${escXml(text)}</p>`,
    href ? `<p><a href="${escXml(href)}">${escXml(itemName(report))}</a></p>` : '',
    toConfluenceStorage(report),
  ].filter(Boolean).join('\n');
}

/** Jira comment ADF: mention node + note, link, then the report document content. */
export function toForwardAdf(report, { accountId, note, link } = {}) {
  assertAccountId(accountId);
  const text = cleanNote(note) || DEFAULT_NOTE;
  const href = typeof link === 'string' && /^(https:\/\/|\/)[^\s"'<>]*$/.test(link) ? link : null;
  const doc = toJiraAdf(report);
  const intro = { type: 'paragraph', content: [
    { type: 'mention', attrs: { id: accountId, text: '@teammate' } },
    { type: 'text', text: ` ${text}` },
  ] };
  const linkPara = href ? [{ type: 'paragraph', content: [{ type: 'text', text: itemName(report), marks: [{ type: 'link', attrs: { href } }] }] }] : [];
  return { ...doc, content: [intro, ...linkPara, ...doc.content] };
}

export { summaryLine };
