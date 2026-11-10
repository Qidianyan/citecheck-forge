// Citation extraction for organisation-specific sources. Only registered keys are returned
// (case-insensitive, word boundaries); the marker may come before or after the key.

const NUM = '(\\d+(?:\\.\\d+)*)';
// "cl." must come before the bare-word markers: alternation is ordered, and "clause" would
// otherwise never match against "cl.".
const MARKER = '(?:section|clause|article|cl\\.|§)';
const QUOTE_RE = /["“]([^"”]{1,})["”]/u;
// Sentence boundaries; never split after the "cl." abbreviation (it would break "MSA-2025 cl. 12.4").
const SENTENCE_SPLIT_RE = /(?<=[.!?])(?<!\bcl\.)\s+|\n+/u;

function escapeRegEx(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** First straight- or curly-quoted span in the sentence (>= 1 char), else null. */
function firstQuote(sentence) {
  const m = QUOTE_RE.exec(sentence);
  if (!m) return null;
  const quote = m[1].trim();
  return quote ? quote : null;
}

/**
 * @returns {Array<{ citation: string, sourceKey: string, clause: string, quote: string|null, sentence: string }>}
 *   One row per citation found, in order of appearance; `sourceKey` keeps the registered casing.
 */
export function extractOrgCitations(text, sourceKeys) {
  const keys = [...new Set((sourceKeys ?? []).map((k) => String(k).trim()).filter(Boolean))];
  const out = [];
  if (!text || !keys.length) return out;
  const sentences = String(text).split(SENTENCE_SPLIT_RE).map((s) => s.trim()).filter(Boolean);
  for (const sentence of sentences) {
    for (const key of keys) {
      const esc = escapeRegEx(key);
      const patterns = [
        // Key first: "Policy POL-7 §3", "POL-7 § 3.1", "POL-7 section 3", "MSA-2025 cl. 12.4", "MSA-2025, clause 12.4".
        {
          re: new RegExp(`(?:policy[ \\t]+)?\\b(${esc})\\b[ \\t]*,?[ \\t]*(?:\\b${MARKER}|§)[ \\t]*${NUM}`, 'giu'),
          keyG: 1, numG: 2,
        },
        // Number first: "Section 3 of POL-7", "Clause 12.4 of MSA-2025", "Article 5 of the MSA-2025".
        {
          re: new RegExp(`(?:\\b${MARKER}|§)[ \\t]+${NUM}[ \\t]+of[ \\t]+(?:the[ \\t]+)?${esc}(?![\\w-])`, 'giu'),
          keyG: 2, numG: 1,
        },
      ];
      for (const { re, keyG, numG } of patterns) {
        for (const m of sentence.matchAll(re)) {
          out.push({
            citation: m[0].replace(/\s+/gu, ' ').trim(),
            sourceKey: key,
            clause: m[numG],
            quote: firstQuote(sentence),
            sentence,
          });
        }
      }
    }
  }
  return out;
}
