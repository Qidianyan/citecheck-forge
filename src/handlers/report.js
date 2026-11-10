// Results → agent-facing JSON, Markdown, Confluence storage XHTML and Jira ADF.
// Pure renderers; the only core dependency is the taxonomy helper `enrich`.

import { enrich } from '../core/taxonomy.js';
import { cpSlice } from '../core/normalize.js';

export const MAX_ROWS = 60;
export const MAX_EXCERPT_CP = 600;

const ROW_FIELDS = ['n', 'citation', 'type', 'law', 'law_title', 'article', 'clause', 'verdict',
  'verdict_label', 'icon', 'flagged', 'hallucination_types', 'reason_en', 'quote_score', 'evidence',
  'original_excerpt', 'law_inferred_from_context', 'translation'];

const VERIFIED = new Set(['EXISTS_CONSISTENT', 'EXISTS_UNQUOTED']);

function rowOf(r, n) {
  const e = enrich(r);
  const out = {};
  for (const f of ROW_FIELDS) {
    switch (f) {
      case 'n': out.n = n; break;
      case 'original_excerpt': out.original_excerpt = e.original_excerpt == null ? null : cpSlice(String(e.original_excerpt), 0, MAX_EXCERPT_CP); break;
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

/** One-line human summary shared by all renderers. */
export function summaryLine(report) {
  const s = report?.summary ?? {};
  let line = `CiteCheck citation report — ${s.total ?? 0} citation(s): ${s.flagged ?? 0} flagged, ${s.verified ?? 0} verified, ${s.unverifiable ?? 0} unverifiable.`;
  if (report?.source) line += ` Source: ${report.source}.`;
  if (report?.asOf) line += ` As of ${report.asOf}.`;
  if (report?.verifiedAt) line += ` Verified at ${report.verifiedAt}.`;
  return line;
}

const lawCell = (r) => r.law_title || r.law || r.law_hint || '—';

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
    lines.push([
      r.n, esc(r.citation), esc(lawCell(r)), esc(`${r.icon} ${r.verdict_label}`), esc(r.type), esc(r.reason_en),
      r.evidence ? `[official text](${r.evidence})` : '—',
    ].join(' | '));
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
    + `<td>${escHtml(lawCell(r))}</td><td>${escHtml(`${r.icon} ${r.verdict_label}`)}</td><td>${escHtml(r.type)}</td>`
    + `<td>${escHtml(r.reason_en)}</td>`
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
    { type: 'tableCell', content: [para(r.type ?? '')] },
    { type: 'tableCell', content: [para(r.reason_en ?? '')] },
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
