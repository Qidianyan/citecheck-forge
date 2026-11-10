// Public API of the verifier core, bound to the bundled statute corpus.
import laws from '../corpus/laws.js';
import { createCorpus } from './corpus.js';
import { extract as extractWith, detectCountry } from './extract.js';
import { verify as verifyWith, summarize, quoteScore, lawStatus, contentCheckable, ruleVerdict, FLAGGED, PASSED, MIN_QUOTE_CHARS } from './verify.js';

export const corpus = createCorpus(laws);
export const today = () => new Date().toISOString().slice(0, 10);

export function verify(text, opts = {}) {
  return verifyWith(text, { ...opts, asOf: opts.asOf || today(), corpus: opts.corpus || corpus });
}
export function extract(text, opts = {}) {
  return extractWith(text, opts.corpus || corpus, opts.country || null);
}
export { summarize, quoteScore, lawStatus, contentCheckable, ruleVerdict, detectCountry, createCorpus, FLAGGED, PASSED, MIN_QUOTE_CHARS };
export { cn2int, norm, tokens, scriptOf } from './normalize.js';
export { matchingBlocks } from './difflib.js';
export { enrich, hallucinationTypes, reasonEn, H_TYPES, VERDICTS } from './taxonomy.js';
