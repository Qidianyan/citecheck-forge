// Verdicts for organisation-source citations — upgraded with full statute-grade parity:
//  - H1: Non-existent clause in registered Confluence policy
//  - H3: IDF-weighted misattributed clause detection (English + CJK/multilingual) with suggested clause
//  - H4: Fabricated or misquoted policy text
//  - H5: Archived / superseded / retired Confluence policy blocking (NOT_IN_FORCE)
import { quoteScore as defaultQuoteScore } from '../core/index.js';
import { cpSlice } from '../core/normalize.js';
import { extractOrgCitations } from './extract.js';

const EXCERPT_MAX_CP = 1200;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;

const ARCHIVED_STATUS_SET = new Set([
  'archived', 'trashed', 'deleted', 'historical', 'superseded', 'deprecated', 'repealed', 'obsolete',
]);
const ARCHIVED_LABEL_RE = /^(?:archived|superseded|deprecated|repealed|obsolete)$/iu;
const ARCHIVED_TITLE_RE = /^\s*\[(?:ARCHIVED|SUPERSEDED|DEPRECATED|REPEALED|OBSOLETE|已归档|已废止)\]/iu;

const EN_STOP = new Set((
  'the of and to in or for by a an is be are was were shall may must can should will would with on at as from ' +
  'that this these those which under per into all any every each team policy clause section article rule ' +
  'applies apply stated states says claims according pursuant'
).split(/\s+/u).filter(Boolean));

const ZH_STOP_BIGRAMS = new Set([
  '根据', '按照', '依据', '规定', '制度', '公司', '企业', '条款', '本条', '应当', '必须', '可以', '不得',
  '需要', '进行', '相关', '要求', '管理', '办法', '细则', '规范', '执行', '适用', '其中', '以及', '或者',
]);

export const ORG_CROSSREF_DEFAULTS = {
  minBest: 0.22,
  ratio: 2.5,
  minTokens: 3,
};

/**
 * Determine whether a registered Confluence policy source is archived, superseded, or repealed.
 * Returns { archived: boolean, why: string }.
 */
export function orgSourceLifecycle(src, asOf = null) {
  if (!src) return { archived: false, why: '' };
  const checkDate = typeof asOf === 'string' && DATE_RE.test(asOf) ? asOf : new Date().toISOString().slice(0, 10);
  const status = String(src.status ?? '').trim().toLowerCase();
  const sup = src.supersededBy ? ` (superseded by ${src.supersededBy})` : '';
  if (src.repealed && DATE_RE.test(String(src.repealed)) && String(src.repealed) <= checkDate) {
    return {
      archived: true,
      why: `was retired/repealed on ${src.repealed}${sup} before the check date (${checkDate})`,
    };
  }
  if (status && ARCHIVED_STATUS_SET.has(status)) {
    return {
      archived: true,
      why: `has Confluence status "${status}"${sup} and is no longer an active policy`,
    };
  }
  if (src.archived === true) {
    return {
      archived: true,
      why: `is marked archived in Confluence${sup} and is no longer an active policy`,
    };
  }
  if (Array.isArray(src.labels)) {
    const hit = src.labels.find((l) => ARCHIVED_LABEL_RE.test(String(l).trim()));
    if (hit) {
      return {
        archived: true,
        why: `carries the "${hit}" lifecycle label in Confluence${sup} and is no longer an active policy`,
      };
    }
  }
  if (ARCHIVED_TITLE_RE.test(String(src.title ?? ''))) {
    return {
      archived: true,
      why: `is marked archived/superseded in its Confluence title${sup} and is no longer an active policy`,
    };
  }
  return { archived: false, why: '' };
}

/** Tokenise policy clauses and claims across Latin words/bigrams, numbers, and CJK character bigrams. */
export function orgClaimTokens(text) {
  const s = String(text ?? '').normalize('NFC').toLowerCase();
  const out = [];

  // CJK character bigrams (enables deterministic H3 on Chinese/Japanese corporate policies).
  for (const m of s.matchAll(/[\u3400-\u9fff]{2,}/gu)) {
    const chars = Array.from(m[0]);
    for (let i = 0; i + 2 <= chars.length; i++) {
      const bg = chars.slice(i, i + 2).join('');
      if (!ZH_STOP_BIGRAMS.has(bg)) out.push(bg);
    }
  }

  // Distinct figures (numbers >= 2 digits or currency/threshold figures like 50,000 / 72 / 90).
  for (const m of s.matchAll(/\b\d+(?:[.,]\d{3})*(?:\.\d+)?%?\b/gu)) {
    const normNum = m[0].replace(/,/gu, '');
    if (normNum.length >= 2 || normNum.endsWith('%')) out.push(`num:${normNum}`);
  }

  // Latin words and adjacent word bigrams.
  const latin = s.replace(/[\u3000-\u9fff\uff00-\uffef]/gu, ' ');
  const words = [...latin.matchAll(/\p{L}{2,}/gu)].map((m) => m[0]).filter((w) => !EN_STOP.has(w));
  for (let i = 0; i < words.length; i++) {
    out.push(words[i]);
    if (i + 1 < words.length) out.push(`${words[i]} ${words[i + 1]}`);
  }
  return out;
}

/** Build an IDF-weighted index over all clauses of a registered organisation policy. */
export function buildOrgCrossIndex(src) {
  const clauses = Array.isArray(src?.clauses) ? src.clauses : [];
  if (clauses.length < 2) return null;
  const docs = clauses.map((cl) => {
    const full = [cl.heading || '', cl.text || ''].filter(Boolean).join(' ').trim();
    return {
      id: String(cl.id),
      heading: cl.heading || '',
      text: String(cl.text ?? ''),
      full,
      tokens: new Set(orgClaimTokens(full)),
      len: Math.max(1, full.length),
    };
  });
  const df = new Map();
  for (const d of docs) for (const t of d.tokens) df.set(t, (df.get(t) || 0) + 1);
  const n = docs.length;
  const lens = docs.map((d) => d.len).sort((a, b) => a - b);
  const median = lens[lens.length >> 1] || 1;
  const nameTokens = new Set(orgClaimTokens([src.sourceKey || '', src.title || ''].join(' ')));
  const idf = (t) => Math.log((n + 1) / ((df.get(t) || 0) + 0.5));
  return { docs, n, median, nameTokens, idf };
}

/** Rank all clauses of an org source against a claim string by IDF-weighted token coverage. */
export function rankOrgClauses(claim, ix) {
  if (!ix || !claim) return { n: 0, ranked: [] };
  const toks = [...new Set(orgClaimTokens(claim))].filter((t) => !ix.nameTokens.has(t) && ix.idf(t) > 0);
  const total = toks.reduce((acc, t) => acc + ix.idf(t), 0);
  if (!toks.length || total <= 0) return { n: toks.length, ranked: [] };
  const ranked = ix.docs.map((d) => {
    const cov = toks.reduce((acc, t) => acc + (d.tokens.has(t) ? ix.idf(t) : 0), 0) / total;
    const normScore = cov / Math.sqrt(Math.max(1, d.len / (2 * ix.median)));
    return [d.id, normScore, d];
  });
  ranked.sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true }));
  return { n: toks.length, ranked };
}

/**
 * Check whether an org-policy citation actually matches a sibling clause much better than the cited clause (H3).
 */
export function checkOrgMisattribution(c, src, ix, opts = ORG_CROSSREF_DEFAULTS) {
  if (!ix || !c) return null;
  const cfg = { ...ORG_CROSSREF_DEFAULTS, ...opts };
  // Strip the citation marker span itself so clause numbers don't bias token matching.
  const cleanedSentence = String(c.sentence || '').replace(c.citation || '', ' ');
  const probe = c.quote ? `${c.quote} ${cleanedSentence}` : cleanedSentence;
  const { n, ranked } = rankOrgClauses(probe, ix);
  if (n < cfg.minTokens || !ranked.length) return null;
  const [bestId, best, bestDoc] = ranked[0];
  const citedEntry = ranked.find(([id]) => id === String(c.clause));
  const cited = citedEntry ? citedEntry[1] : 0;
  if (bestId === String(c.clause)) return null;
  if (best < cfg.minBest || best < cfg.ratio * Math.max(cited, 0.01)) return null;
  return {
    kind: 'misattributed',
    suggested_article: bestId,
    suggested_law: c.sourceKey,
    score_cited: Number(cited.toFixed(3)),
    score_best: Number(best.toFixed(3)),
    tokens: n,
    heading: bestDoc.heading || null,
    excerpt: cpSlice(bestDoc.text || bestDoc.full || '', 0, 600),
  };
}

function row(c, src, verdict, types, reason_en, original_excerpt, quote_score, extras = null) {
  const out = {
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
  if (extras?.crossref) {
    out.crossref = extras.crossref;
    out.suggested_article = extras.crossref.suggested_article ?? null;
  }
  return out;
}

function policyLabel(sourceKey, src) {
  return src?.title ? `${sourceKey} (${src.title})` : sourceKey;
}

function misattributionReason(c, src, xr) {
  const targetHeading = xr.heading ? ` (${xr.heading})` : '';
  return `You cited clause ${c.clause} of ${policyLabel(c.sourceKey, src)}, but this statement matches clause ${xr.suggested_article}${targetHeading} much better (IDF overlap ${xr.score_best} vs ${xr.score_cited}) — likely a misattributed policy clause; did you mean clause ${xr.suggested_article}?`;
}

/**
 * Verify every org citation in `text` against the registered sources in `store`.
 * @param {string} text
 * @param {{ store: object, quoteScore?: (quote: string, clauseText: string) => number|null, asOf?: string|null, crossref?: boolean, crossrefOptions?: object }} opts
 * @returns {Promise<Array<object>>} rows in the core result shape (verdict, types, reason_en, …).
 */
export async function verifyOrgCitations(text, { store, quoteScore, asOf = null, crossref = true, crossrefOptions } = {}) {
  const score = quoteScore ?? defaultQuoteScore;
  const keys = await store.keys();
  const citations = extractOrgCitations(text, keys);
  const rows = [];
  const srcCache = new Map();
  const ixCache = new Map();

  for (const c of citations) {
    if (!srcCache.has(c.sourceKey)) srcCache.set(c.sourceKey, await store.get(c.sourceKey));
    const src = srcCache.get(c.sourceKey);
    if (!src) {
      rows.push(row(c, null, 'UNVERIFIABLE', [],
        `Source ${c.sourceKey} is not registered in CiteCheck, so this citation cannot be verified.`, null, null));
      continue;
    }

    const clauses = Array.isArray(src.clauses) ? src.clauses : [];
    const lifecycle = orgSourceLifecycle(src, asOf);
    const clause = clauses.find((cl) => String(cl.id) === String(c.clause));

    // Archived policy with no parsed clauses (e.g. stub retired page) immediately blocks with H5.
    if (!clause && clauses.length === 0 && lifecycle.archived) {
      rows.push(row(c, src, 'NOT_IN_FORCE', ['H5'],
        `${policyLabel(c.sourceKey, src)} ${lifecycle.why}.`, null, null));
      continue;
    }

    if (!clause) {
      rows.push(row(c, src, 'ARTICLE_NOT_FOUND', ['H1'],
        `Clause ${c.clause} does not exist in ${c.sourceKey} (${src.title || 'untitled source'}).`, null, null));
      continue;
    }

    const excerpt = cpSlice(String(clause.text ?? ''), 0, EXCERPT_MAX_CP);

    // H5: Block citations to archived, superseded, or repealed Confluence policy pages.
    if (lifecycle.archived) {
      rows.push(row(c, src, 'NOT_IN_FORCE', ['H5'],
        `${policyLabel(c.sourceKey, src)} ${lifecycle.why}.`, excerpt, null));
      continue;
    }

    const getIndex = () => {
      if (!ixCache.has(c.sourceKey)) ixCache.set(c.sourceKey, buildOrgCrossIndex(src));
      return ixCache.get(c.sourceKey);
    };

    if (!c.quote) {
      if (crossref) {
        const xr = checkOrgMisattribution(c, src, getIndex(), crossrefOptions);
        if (xr) {
          rows.push(row(c, src, 'CONTENT_MISMATCH', ['H3'],
            misattributionReason(c, src, xr), excerpt, null, { crossref: xr }));
          continue;
        }
      }
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
      // Check if the misquoted span actually comes from another clause of the same policy (H3).
      if (crossref && clauses.length >= 2) {
        let siblingMatch = null;
        for (const other of clauses) {
          if (String(other.id) === String(c.clause)) continue;
          const os = score(c.quote, other.text);
          if (os != null && os >= 0.8 && (!siblingMatch || os > siblingMatch.score)) {
            siblingMatch = { clause: other, score: os };
          }
        }
        const xr = siblingMatch
          ? {
              kind: 'misattributed',
              suggested_article: String(siblingMatch.clause.id),
              suggested_law: c.sourceKey,
              score_cited: s,
              score_best: siblingMatch.score,
              tokens: orgClaimTokens(c.quote).length,
              heading: siblingMatch.clause.heading || null,
              excerpt: cpSlice(String(siblingMatch.clause.text ?? ''), 0, 600),
            }
          : checkOrgMisattribution(c, src, getIndex(), crossrefOptions);
        if (xr) {
          rows.push(row(c, src, 'CONTENT_MISMATCH', ['H3'],
            misattributionReason(c, src, xr), excerpt, s, { crossref: xr }));
          continue;
        }
      }
      rows.push(row(c, src, 'CONTENT_MISMATCH', ['H4'],
        `The quote does not match clause ${c.clause} of ${c.sourceKey} (similarity ${s}).`, excerpt, s));
    } else {
      rows.push(row(c, src, 'EXISTS_UNQUOTED', [], 'partial match', excerpt, s));
    }
  }
  return rows;
}
