// Verdicts for organisation-source citations — the same verdict model as statutes, rendered in the
// same row shape so src/handlers/report.js can display them unchanged.
import { quoteScore as defaultQuoteScore } from '../core/index.js';
import { cpSlice } from '../core/normalize.js';
import { extractOrgCitations } from './extract.js';

const EXCERPT_MAX_CP = 1200;

function row(c, src, verdict, types, reason_en, original_excerpt, quote_score) {
  return {
    citation: c.citation,
    type: 'org',
    sentence: c.sentence,
    law: c.sourceKey,
    law_title: src ? src.title : null,
    article: c.clause,
    clause: null,
    verdict,
    hallucination_types: types,
    reason_en,
    evidence: src ? src.pageUrl : null,
    original_excerpt,
    quote_score: quote_score ?? null,
  };
}

/**
 * Verify every org citation in `text` against the registered sources in `store`.
 * @param {string} text
 * @param {{ store: object, quoteScore?: (quote: string, clauseText: string) => number|null }} opts
 * @returns {Promise<Array<object>>} rows in the core result shape (verdict, types, reason_en, …).
 */
export async function verifyOrgCitations(text, { store, quoteScore } = {}) {
  const score = quoteScore ?? defaultQuoteScore;
  const keys = await store.keys();
  const citations = extractOrgCitations(text, keys);
  const rows = [];
  for (const c of citations) {
    const src = await store.get(c.sourceKey);
    if (!src) {
      rows.push(row(c, null, 'UNVERIFIABLE', [],
        `Source ${c.sourceKey} is not registered in CiteCheck, so this citation cannot be verified.`, null, null));
      continue;
    }
    const clause = (Array.isArray(src.clauses) ? src.clauses : [])
      .find((cl) => String(cl.id) === String(c.clause));
    if (!clause) {
      rows.push(row(c, src, 'ARTICLE_NOT_FOUND', ['H1'],
        `Clause ${c.clause} does not exist in ${c.sourceKey} (${src.title || 'untitled source'}).`, null, null));
      continue;
    }
    const excerpt = cpSlice(String(clause.text ?? ''), 0, EXCERPT_MAX_CP);
    if (!c.quote) {
      rows.push(row(c, src, 'EXISTS_UNQUOTED', [],
        `Clause ${c.clause} of ${c.sourceKey} exists; no verbatim quote was given to compare.`, excerpt, null));
      continue;
    }
    const s = score(c.quote, clause.text);
    if (s == null) {
      rows.push(row(c, src, 'EXISTS_UNQUOTED', [], 'partial match', excerpt, null));
    } else if (s >= 0.8) {
      rows.push(row(c, src, 'EXISTS_CONSISTENT', [],
        `The quote matches clause ${c.clause} of ${c.sourceKey} (similarity ${s}).`, excerpt, s));
    } else if (s < 0.5) {
      rows.push(row(c, src, 'CONTENT_MISMATCH', ['H4'],
        `The quote does not match clause ${c.clause} of ${c.sourceKey} (similarity ${s}).`, excerpt, s));
    } else {
      rows.push(row(c, src, 'EXISTS_UNQUOTED', [], 'partial match', excerpt, s));
    }
  }
  return rows;
}
