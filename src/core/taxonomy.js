// Verdict → hallucination taxonomy (H1–H7), severity and English presentation.
// Taxonomy defined in the earlier ASEAN eval set (eval/SCHEMA.md), reused and extended here.

export const H_TYPES = {
  H1: 'Non-existent article',
  H2: 'Non-existent law or case',
  H3: 'Misattributed provision',
  H4: 'Fabricated or misquoted content',
  H5: 'Temporal error (repealed / not yet in force)',
  H6: 'Translation drift',
  H7: 'Numeric error',
};

export const VERDICTS = {
  EXISTS_CONSISTENT: { icon: '✅', label: 'Verified', severity: 0, flagged: false },
  EXISTS_UNQUOTED: { icon: '🟡', label: 'Exists, wording not compared', severity: 1, flagged: false },
  UNVERIFIABLE: { icon: '❔', label: 'Unverifiable', severity: 2, flagged: false },
  NOT_IN_FORCE: { icon: '⚠️', label: 'Not in force', severity: 3, flagged: true },
  CONTENT_MISMATCH: { icon: '❌', label: 'Misquoted', severity: 4, flagged: true },
  ARTICLE_NOT_FOUND: { icon: '❌', label: 'Article does not exist', severity: 5, flagged: true },
};

const NUM_RE = /\d+(?:[.,]\d+)*/gu;

/** Hallucination types for one verifier result (empty array when not a hallucination). */
export function hallucinationTypes(r) {
  switch (r.verdict) {
    case 'ARTICLE_NOT_FOUND': return ['H1'];
    case 'NOT_IN_FORCE': return ['H5'];
    case 'CONTENT_MISMATCH': {
      if (Array.isArray(r.content_types) && r.content_types.length) return [...r.content_types];
      const t = ['H4'];
      const q = (r.quote || '').match(NUM_RE) || [];
      const src = new Set((r.original_excerpt || '').match(NUM_RE) || []);
      if (q.length && q.some(n => !src.has(n))) t.push('H7');
      return t;
    }
    default: return [];
  }
}

/** Plain-English reason built from structured checks (the ported core keeps the legacy Chinese text in `reason`). */
export function reasonEn(r) {
  const c = r.checks || {};
  const law = r.law_title ? `${r.law_title}${r.law ? ` (${r.law})` : ''}` : (r.law || r.law_hint || 'the cited law');
  switch (r.verdict) {
    case 'EXISTS_CONSISTENT':
      return `The quoted text matches the official text of ${law}${r.quote_score != null ? ` (similarity ${r.quote_score})` : ''}.`;
    case 'EXISTS_UNQUOTED':
      return `The article exists in ${law} and is in force; the text paraphrases or translates it, so the wording was not compared word-for-word.`;
    case 'CONTENT_MISMATCH': {
      if (r.crossref || r.numbers) {
        const out = [];
        if (r.crossref?.kind === 'unsupported') out.push(`The statement shares almost no specific wording with article ${r.article} of ${law} (overlap ${r.crossref.score_cited}); its content may not come from this article.`);
        else if (r.crossref) out.push(`The statement matches article ${r.crossref.suggested_article} of ${law} much better than the cited article ${r.article} (overlap ${r.crossref.score_best} vs ${r.crossref.score_cited}) — likely a misattributed provision; did you mean article ${r.crossref.suggested_article}?`);
        if (r.numbers) out.push(`The figures do not match the cited article (${r.numbers.mismatches.map((m) => `${m.claimed} ${m.unit} vs official ${m.official.join('/')}`).join('; ')}).`);
        return out.join(' ');
      }
      return `The article exists, but the quoted text does not match the official text (similarity ${r.quote_score ?? 'low'}).`;
    }
    case 'ARTICLE_NOT_FOUND': {
      const m = /共\s*(\d+)\s*条/u.exec(r.reason || '');
      return `${law} has ${m ? m[1] : 'fewer'} articles in its official text; article ${r.article} does not exist.`;
    }
    case 'NOT_IN_FORCE': {
      const rep = /已于\s*(\d{4}-\d{2}-\d{2})\s*失效（([^）]*)）/u.exec(r.reason || '');
      if (rep) return `${law} was repealed on ${rep[1]}${rep[2] ? ` by ${rep[2]}` : ''}, before the check date.`;
      const ny = /生效日\s*(\d{4}-\d{2}-\d{2})/u.exec(r.reason || '');
      if (ny) return `${law} only takes effect on ${ny[1]}, after the check date.`;
      return `${law} is not in force on the check date.`;
    }
    case 'UNVERIFIABLE':
    default:
      if (r.type === 'case') return 'Case-law databases are not connected yet, so this case number cannot be verified.';
      if (c.law_in_cache === false) return `${r.law_hint ? `"${r.law_hint}"` : 'The cited law'} is not in the CiteCheck corpus (or no law was named), so it cannot be verified.`;
      if (c.law_in_cache === 'registry_only') return 'Only repeal information is available for this law; its text is not in the corpus.';
      if (c.article_exists === null) return 'This article is missing from the digitised official text (scan/OCR gap); check the official PDF.';
      if (c.content_checkable === false) return 'The cached official text is not the current consolidated version for this article, so its content cannot be verified.';
      if (c.quote_score != null) return `The quote is only partly similar to the official text (similarity ${c.quote_score}); needs human review.`;
      return 'Not enough information to verify this citation.';
  }
}

/** Enrich a core result with taxonomy and presentation fields. */
export function enrich(r) {
  const v = VERDICTS[r.verdict] || VERDICTS.UNVERIFIABLE;
  return { ...r, icon: v.icon, verdict_label: v.label, severity: v.severity, flagged: v.flagged,
    hallucination_types: hallucinationTypes(r), reason_en: reasonEn(r) };
}
