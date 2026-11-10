// Results → agent-facing JSON, Markdown, Confluence storage XHTML and Jira ADF.
// Pure renderers; the only core dependency is the taxonomy helper `enrich`.

import { enrich } from '../core/taxonomy.js';
import { cpSlice } from '../core/normalize.js';

export const MAX_ROWS = 60;
export const MAX_EXCERPT_CP = 600;
export const MAX_SENTENCE_CP = 300;
export const MAX_CROSSREF_EXCERPT_CP = 300;
export const MAX_ADVISORIES = 3;
export const MAX_PAYLOAD_BYTES = 200 * 1024; // every action / resolver result must serialise under 200 KB

const ROW_FIELDS = ['n', 'citation', 'type', 'law', 'law_title', 'article', 'clause', 'verdict',
  'verdict_label', 'icon', 'flagged', 'hallucination_types', 'reason_en', 'quote_score', 'evidence',
  'original_excerpt', 'law_inferred_from_context', 'translation', 'sentence', 'advisories',
  'suggested_article', 'crossref'];

const VERIFIED = new Set(['EXISTS_CONSISTENT', 'EXISTS_UNQUOTED']);

function rowOf(r, n) {
  const e = enrich(r);
  const out = {};
  for (const f of ROW_FIELDS) {
    switch (f) {
      case 'n': out.n = n; break;
      case 'original_excerpt': out.original_excerpt = e.original_excerpt == null ? null : cpSlice(String(e.original_excerpt), 0, MAX_EXCERPT_CP); break;
      case 'sentence': out.sentence = e.sentence == null ? null : cpSlice(String(e.sentence), 0, MAX_SENTENCE_CP); break;
      // Content-check extras: English advisory notes + the article the statement actually matches.
      case 'advisories': out.advisories = Array.isArray(e.advisories)
        ? e.advisories.slice(0, MAX_ADVISORIES).map((a) => String(a?.message_en ?? a)).filter(Boolean) : []; break;
      case 'suggested_article': out.suggested_article = e.crossref?.kind === 'misattributed' ? (e.crossref.suggested_article ?? null) : null; break;
      case 'crossref': out.crossref = e.crossref
        ? { ...e.crossref, excerpt: e.crossref.excerpt == null ? null : cpSlice(String(e.crossref.excerpt), 0, MAX_CROSSREF_EXCERPT_CP) }
        : null; break;
      case 'hallucination_types': out.hallucination_types = e.hallucination_types || []; break;
      case 'flagged': out.flagged = Boolean(e.flagged); break;
      case 'law_inferred_from_context': out.law_inferred_from_context = Boolean(e.law_inferred_from_context); break;
      case 'translation': out.translation = Boolean(e.translation); break;
      default: out[f] = e[f] ?? null;
    }
  }
  return out;
}

function summarize(enriched) {
  const by_verdict = {};
  const by_h_type = {};
  let flagged = 0, verified = 0, unverifiable = 0;
  for (const r of enriched) {
    by_verdict[r.verdict] = (by_verdict[r.verdict] || 0) + 1;
    for (const h of r.hallucination_types || []) by_h_type[h] = (by_h_type[h] || 0) + 1;
    if (r.flagged) flagged++;
    if (VERIFIED.has(r.verdict)) verified++;
    if (r.verdict === 'UNVERIFIABLE') unverifiable++;
  }
  return { total: enriched.length, flagged, verified, unverifiable, by_verdict, by_h_type };
}

/**
 * Build the trimmed report object: enriched rows (≤60; flagged first when truncated) + summary.
 */
export function buildReport(results, { source = null, asOf = null, verifiedAt = null } = {}) {
  const enriched = (results || []).map((r, i) => rowOf(r, i + 1));
  const tooMany = enriched.length > MAX_ROWS;
  const ordered = tooMany
    ? [...enriched.filter((r) => r.flagged), ...enriched.filter((r) => !r.flagged)]
    : enriched;
  const rows = ordered.slice(0, MAX_ROWS);
  const report = { source, asOf, verifiedAt, summary: summarize(enriched), rows };
  if (tooMany) report.truncated = true;
  return report;
}

/** Render the report source (object or string) as a short readable label, never `[object Object]`. */
function sourceLabel(source) {
  if (source == null) return '';
  if (typeof source === 'string') return source;
  if (typeof source !== 'object') return String(source);
  if (source.type === 'confluence') return source.title || (source.id ? `Confluence page ${source.id}` : 'Confluence page');
  if (source.type === 'jira') return source.key || source.summary || 'Jira work item';
  if (source.type === 'text') return 'pasted text';
  return source.title || source.name || source.summary || 'pasted text';
}

/** Serialised size of a value in bytes. */
export function byteSize(v) {
  return Buffer.byteLength(JSON.stringify(v ?? null), 'utf8');
}

/** Belt-and-braces size guard: drop the heaviest per-row fields, then rows, until under the cap. */
export function fitPayload(x) {
  if (byteSize(x) < MAX_PAYLOAD_BYTES) return x;
  let out = x;
  if (Array.isArray(out?.rows)) {
    out = { ...out, rows: out.rows.map(({ original_excerpt, sentence, evidence, crossref, ...rest }) => rest) };
  }
  if (byteSize(out) >= MAX_PAYLOAD_BYTES && Array.isArray(out?.rows)) {
    out = { ...out, rows: out.rows.slice(0, Math.floor(MAX_ROWS / 2)), truncated: true };
  }
  if (byteSize(out) >= MAX_PAYLOAD_BYTES && Array.isArray(out?.citations)) {
    out = { ...out, citations: out.citations.slice(0, 150), truncated: true, total: out.total ?? out.citations.length };
  }
  return out;
}

/** One-line human summary shared by all renderers. */
export function summaryLine(report) {
  const s = report?.summary ?? {};
  let line = `CiteCheck citation report — ${s.total ?? 0} citation(s): ${s.flagged ?? 0} flagged, ${s.verified ?? 0} verified, ${s.unverifiable ?? 0} unverifiable.`;
  const src = sourceLabel(report?.source);
  if (src) line += ` Source: ${src}.`;
  if (report?.asOf) line += ` As of ${report.asOf}.`;
  if (report?.verifiedAt) line += ` Verified at ${report.verifiedAt}.`;
  return line;
}

const lawCell = (r) => r.law_title || r.law || r.law_hint || '—';

/** "Why" cell: the English reason plus any content-check advisories as "Note: …" lines. */
function whyCell(r) {
  const parts = [r.reason_en ?? ''];
  for (const a of r.advisories || []) parts.push(`Note: ${a}`);
  return parts.filter(Boolean).join(' ');
}

/** "Type" column: hallucination types (H1, H4, H7, …) or an em dash when the citation passed. */
const typeCell = (r) => (Array.isArray(r.hallucination_types) && r.hallucination_types.length
  ? r.hallucination_types.join(', ') : '—');

/** Report → Markdown: summary line + `| # | Citation | Law | Verdict | Type | Why | Source |` table. */
export function toMarkdown(report) {
  const esc = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/gu, ' ');
  const lines = [
    summaryLine(report),
    '',
    '| # | Citation | Law | Verdict | Type | Why | Source |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of report.rows || []) {
    lines.push(`| ${[
      r.n, esc(r.citation), esc(lawCell(r)), esc(`${r.icon} ${r.verdict_label}`), esc(typeCell(r)), esc(whyCell(r)),
      r.evidence ? `[official text](${r.evidence})` : '—',
    ].join(' | ')} |`);
  }
  if (report.truncated) lines.push('', `_(first ${MAX_ROWS} rows; flagged citations listed first)_`);
  return lines.join('\n');
}

const escHtml = (v) => String(v ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

/** Report → Confluence storage-format XHTML (h3, summary paragraph, table; all dynamic text escaped). */
export function toConfluenceStorage(report) {
  const cell = (v) => `<td>${escHtml(v)}</td>`;
  const rows = (report.rows || []).map((r) => `<tr><td>${r.n}</td><td>${escHtml(r.citation)}</td>`
    + `<td>${escHtml(lawCell(r))}</td><td>${escHtml(`${r.icon} ${r.verdict_label}`)}</td><td>${escHtml(typeCell(r))}</td>`
    + `<td>${escHtml(whyCell(r))}</td>`
    + `<td>${r.evidence ? `<a href="${escHtml(r.evidence)}">official text</a>` : '—'}</td></tr>`);
  return [
    '<h3>CiteCheck citation report</h3>',
    `<p>${escHtml(summaryLine(report))}</p>`,
    '<table><thead>',
    '<tr><th>#</th><th>Citation</th><th>Law</th><th>Verdict</th><th>Type</th><th>Why</th><th>Source</th></tr>',
    '</thead><tbody>',
    ...rows,
    '</tbody></table>',
  ].join('\n');
}

/** Report → Jira ADF document (version 1): heading, summary paragraph, table with link marks. */
export function toJiraAdf(report) {
  const text = (t) => ({ type: 'text', text: String(t ?? '') });
  const para = (t) => ({ type: 'paragraph', content: [text(t)] });
  const linkText = (url, label = 'official text') => ({
    type: 'text', text: label, marks: [{ type: 'link', attrs: { href: url } }],
  });
  const headerCells = ['#', 'Citation', 'Law', 'Verdict', 'Type', 'Why', 'Source']
    .map((h) => ({ type: 'tableHeader', content: [para(h)] }));
  const cellsOf = (r) => [
    { type: 'tableCell', content: [para(String(r.n))] },
    { type: 'tableCell', content: [para(r.citation ?? '')] },
    { type: 'tableCell', content: [para(lawCell(r))] },
    { type: 'tableCell', content: [para(`${r.icon} ${r.verdict_label}`)] },
    { type: 'tableCell', content: [para(typeCell(r))] },
    { type: 'tableCell', content: [para(whyCell(r))] },
    r.evidence
      ? { type: 'tableCell', content: [{ type: 'paragraph', content: [linkText(r.evidence)] }] }
      : { type: 'tableCell', content: [para('—')] },
  ];
  return {
    type: 'doc',
    version: 1,
    content: [
      { type: 'heading', attrs: { level: 3 }, content: [text('CiteCheck citation report')] },
      para(summaryLine(report)),
      {
        type: 'table',
        content: [
          { type: 'tableRow', content: headerCells },
          ...(report.rows || []).map((r) => ({ type: 'tableRow', content: cellsOf(r) })),
        ],
      },
    ],
  };
}

/** Label to apply after posting: flagged → citecheck-flagged, else citecheck-verified; no citations → null. */
export function labelFor(report) {
  const total = report?.summary?.total ?? 0;
  if (total === 0) return null;
  return (report.summary.flagged ?? 0) > 0 ? 'citecheck-flagged' : 'citecheck-verified';
}
