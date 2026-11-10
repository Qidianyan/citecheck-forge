// Enhanced-mode content checks layered on top of the rule verdicts (opt-in via `verify(text, { crossref: true })`):
//  - H3 misattribution: the claim matches another article of the same law far better (crossref.js)
//  - H7 numeric error: the claim's durations / percentages / amounts contradict the cited article (numbers.js)
// Only EXISTS_UNQUOTED results are touched; the original rule verdict stays in `rule_verdict`.
import { createCrossIndex, crossCheck, claimWindows, CROSSREF_DEFAULTS } from './crossref.js';
import { compareNumbers } from './numbers.js';

const indexes = new WeakMap();
function indexFor(corpus) {
  let ix = indexes.get(corpus);
  if (!ix) { ix = createCrossIndex(corpus); indexes.set(corpus, ix); }
  return ix;
}

export function applyCrossChecks(text, results, corpus, options = {}) {
  // numbers: 'advisory' (default: note only, verdict unchanged), 'flag' (H7 flips the verdict) or false.
  const opts = { ...CROSSREF_DEFAULTS, numbers: 'advisory', ...options };
  const lawIndex = indexFor(corpus);
  const windows = claimWindows(text, results);
  results.forEach((r, i) => {
    if (r.type !== 'statute' || r.verdict !== 'EXISTS_UNQUOTED' || !r.law) return;
    const law = corpus.byId[r.law];
    const articleText = law?.articles?.[String(r.article)];
    if (!articleText) return;
    const claim = windows[i] || r.sentence;
    const types = [];
    const xr = crossCheck(r, claim, law, lawIndex(law), opts);
    if (xr) { r.crossref = xr; types.push(xr.kind === 'unsupported' ? 'H4' : 'H3'); }
    if (opts.numbers) {
      const num = compareNumbers(r.sentence, articleText);
      if (num && num.mismatches.length && !num.matched) {
        if (opts.numbers === 'flag') { r.numbers = num; types.push('H7'); }
        else r.advisories = [...(r.advisories || []), { kind: 'numbers', ...num,
          message_en: `Check the figures: ${num.mismatches.map((m) => `${m.claimed} ${m.unit} vs ${m.official.join('/')} in the cited article`).join('; ')}.` }];
      }
    }
    if (!types.length) return;
    r.verdict = 'CONTENT_MISMATCH';
    r.content_types = types;
    r.checks = { ...(r.checks || {}), crossref: Boolean(xr), numbers: Boolean(r.numbers) };
    const parts = [];
    if (xr && xr.kind === 'misattributed') parts.push(`转述内容与第${xr.suggested_article}条更吻合（${xr.score_best} vs 被引条 ${xr.score_cited}）`);
    if (xr && xr.kind === 'unsupported') parts.push(`转述内容与被引条文几乎无重合（${xr.score_cited}）`);
    if (r.numbers) parts.push(`数字与原文不符（${r.numbers.mismatches.map((m) => `${m.claimed} vs ${m.official.join('/')}`).join('；')}）`);
    r.reason = parts.join('；');
  });
  return results;
}
