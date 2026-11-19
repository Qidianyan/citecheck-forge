// Public API of the verifier core, bound to the bundled statute corpus.
import laws from '../corpus/laws.js';
import aliasesEn from '../corpus/aliases_en.js';
import { createCorpus } from './corpus.js';
import { applyCrossChecks } from './contentChecks.js';
import { extract as extractWith, detectCountry } from './extract.js';
import { verify as verifyWith, summarize, quoteScore, lawStatus, contentCheckable, ruleVerdict, FLAGGED, PASSED, MIN_QUOTE_CHARS } from './verify.js';

/** Default: enhanced corpus (33 laws: EU GDPR, EU AI Act, US FRCP + VN/ID/TH official gazettes). */
export const corpus = createCorpus(laws, { extraAliases: aliasesEn });
/** Legacy corpus: exact 30-law behaviour of the reference Python verifier (used by the golden parity test). */
export const legacyCorpus = createCorpus(laws.filter((l) => !l.global_pack));
export const today = () => new Date().toISOString().slice(0, 10);

export function verify(text, opts = {}) {
  const c = opts.corpus || (opts.legacy ? legacyCorpus : corpus);
  const results = verifyWith(text, { ...opts, asOf: opts.asOf || today(), corpus: c });
  if (opts.crossref && !opts.legacy && c.enhanced) applyCrossChecks(text, results, c, opts.crossrefOptions);
  return results;
}
export function extract(text, opts = {}) {
  return extractWith(text, opts.corpus || (opts.legacy ? legacyCorpus : corpus), opts.country || null);
}
export { summarize, quoteScore, lawStatus, contentCheckable, ruleVerdict, detectCountry, createCorpus, FLAGGED, PASSED, MIN_QUOTE_CHARS };
export { cn2int, norm, tokens, scriptOf } from './normalize.js';
export { matchingBlocks } from './difflib.js';
export { enrich, hallucinationTypes, reasonEn, H_TYPES, VERDICTS } from './taxonomy.js';
export { claimTokens, rankArticles, crossCheck, claimWindows, createCrossIndex, cjkShare, CROSSREF_DEFAULTS } from './crossref.js';
export { numericFacts, compareNumbers } from './numbers.js';
export { applyCrossChecks } from './contentChecks.js';
