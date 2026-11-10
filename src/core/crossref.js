// Deterministic misattribution check (H3): does the claim around a citation match another article of the
// same law clearly better than the cited one? No LLM, no network. Only used in enhanced mode with
// `{ crossref: true }`; legacy behaviour is untouched.
import { ART_RE, LAWNUM_RE } from './extract.js';
import { cpSlice } from './normalize.js';

// Function words and citation vocabulary for the corpus languages (lower case). Kept small on purpose:
// IDF weighting does the rest.
const STOP = new Set((
  'và của các được theo này có cho với trong là không người tại đến để khi hoặc phải một những về từ do thì bị nếu đã đó như cũng ' +
  'quy định trường hợp tại điều khoản điểm luật nghị định bộ số năm ' +
  'yang dan di dalam untuk dengan atau pada dari ini oleh sebagaimana tersebut adalah ' +
  'pasal ayat huruf undang nomor tahun peraturan ' +
  'the of and to in or for by a an is be are shall may with on as that this which under article section law act ' +
  'pdp ite uu khususnya diatur menurut berdasarkan sesuai sampai dengan hak ketentuan perundang undangan berlaku setiap orang'
).split(/\s+/u).filter(Boolean));

// Light Indonesian/Malay affix stripping (dicatat / pencatatan / mencatat → catat). Only for long,
// diacritic-free words, so Vietnamese syllables and short words are untouched.
const ID_PREFIX = /^(?:mem|men|meng|meny|me|pem|pen|peng|peny|pe|di|ber|ter|ke)(?=[a-z]{4,})/u;
const ID_SUFFIX = /(?:kan|an|nya|i)$/u;
export function stem(w) {
  if (w.length < 6 || !/^[a-z]+$/u.test(w)) return w;
  let t = w.replace(ID_SUFFIX, '');
  if (t.length >= 5) t = t.replace(ID_PREFIX, '');
  return t.length >= 4 ? t : w;
}

const THAI_RUN = /[\u0e00-\u0e7f]+/gu;
const WORD = /\p{L}{2,}/gu;

/** Content tokens: Thai character trigrams + Latin-script unigrams and bigrams. CJK text is ignored. */
export function claimTokens(s) {
  s = String(s || '').normalize('NFC').toLowerCase();
  const out = [];
  for (const m of s.matchAll(THAI_RUN)) {
    const c = Array.from(m[0]);
    for (let i = 0; i + 3 <= c.length; i++) out.push(c.slice(i, i + 3).join(''));
  }
  const latin = s.replace(/[\u0e00-\u0e7f\u3000-\u9fff\uff00-\uffef]/gu, ' ');
  const words = [...latin.matchAll(WORD)].map((m) => m[0]).filter((w) => !STOP.has(w));
  for (let i = 0; i < words.length; i++) {
    out.push(words[i]);
    if (i + 1 < words.length) out.push(`${words[i]} ${words[i + 1]}`);
  }
  return out;
}

/** Lazily built per-law index: article → token set, IDF, and the law's own name tokens (excluded from claims). */
export function createCrossIndex(corpus) {
  const cache = new Map();
  return function lawIndex(law) {
    if (!law || law.stub || !law.articles) return null;
    let ix = cache.get(law.law_id);
    if (ix) return ix;
    const arts = Object.entries(law.articles).map(([k, t]) => [k, new Set(claimTokens(t))]);
    const df = new Map();
    for (const [, set] of arts) for (const t of set) df.set(t, (df.get(t) || 0) + 1);
    const n = arts.length;
    const nameTokens = new Set(claimTokens([law.title, ...(law.aliases || [])].join(' ')));
    // Articles far longer than usual carry appended elucidations / schedules: never suggest them.
    const lens = Object.values(law.articles).map((t) => t.length).sort((a, b) => a - b);
    const median = lens[lens.length >> 1] || 1;
    const blob = new Set(Object.entries(law.articles).filter(([, t]) => t.length > 8 * median).map(([k]) => k));
    const lensBy = Object.fromEntries(Object.entries(law.articles).map(([k, t]) => [k, t.length]));
    ix = { arts, n, nameTokens, blob, median, lens: lensBy, idf: (t) => Math.log((n + 1) / ((df.get(t) || 0) + 0.5)) };
    cache.set(law.law_id, ix);
    return ix;
  };
}

/** Rank all articles of `law` by IDF-weighted coverage of the claim's tokens. */
export function rankArticles(claim, ix) {
  const toks = [...new Set(claimTokens(claim))].filter((t) => !ix.nameTokens.has(t) && ix.idf(t) > 0);
  const total = toks.reduce((a, t) => a + ix.idf(t), 0);
  if (!toks.length || total === 0) return { n: toks.length, ranked: [] };
  const ranked = ix.arts.filter(([k]) => !ix.blob.has(k)).map(([k, set]) => {
    const cov = toks.reduce((a, t) => a + (set.has(t) ? ix.idf(t) : 0), 0) / total;
    // Soft length normalisation: long articles cover more words by chance.
    return [k, cov / Math.sqrt(Math.max(1, ix.lens[k] / (2 * ix.median)))];
  });
  ranked.sort((a, b) => b[1] - a[1] || Number.parseInt(a[0], 10) - Number.parseInt(b[0], 10));
  return { n: toks.length, ranked };
}

const hasArticleRef = (line) => { ART_RE.lastIndex = 0; const ok = ART_RE.test(line); ART_RE.lastIndex = 0; return ok; };

/**
 * Claim window per result: its own line plus following lines (bullets, explanations) until the next line
 * that cites an article, a blank-separated heading, or `maxChars`. Results are matched to lines in order.
 */
export function claimWindows(text, results, { maxLines = 4, maxChars = 700 } = {}) {
  const lines = String(text || '').split(/\n+/u).map((l) => l.trim()).filter(Boolean);
  const windows = new Array(results.length).fill(null);
  let li = 0;
  for (let ri = 0; ri < results.length; ri++) {
    const s = results[ri].sentence;
    if (!s) continue;
    let j = li;
    while (j < lines.length && cpSlice(lines[j], 0, 800) !== s) j++;
    if (j === lines.length) { j = lines.findIndex((l) => cpSlice(l, 0, 800) === s); if (j < 0) continue; }
    li = j;
    let w = lines[j];
    for (let k = j + 1; k < lines.length && k <= j + maxLines; k++) {
      // Stop at the next article reference, heading, or a line about another numbered law.
      LAWNUM_RE.lastIndex = 0;
      if (hasArticleRef(lines[k]) || /^#{1,6}\s/u.test(lines[k]) || LAWNUM_RE.test(lines[k])) break;
      w += '\n' + lines[k];
      if (w.length >= maxChars) break;
    }
    windows[ri] = w.slice(0, maxChars);
  }
  return windows;
}

export const CROSSREF_DEFAULTS = { minBest: 0.2, ratio: 3, minTokens: 6, skipMulti: 'range', skipCjk: true, unsupportedMaxCited: 0.06, unsupportedMinTokens: 30 };

const RANGE_RE = /(?:\d\s*(?:[-–—~]|sampai(?:\s+dengan)?|s\.d\.|đến|tới|ถึง|至|到)\s*(?:Pasal|Điều|มาตรา|Article|Section|第)?\s*\d)/iu;
const countArticleRefs = (line) => { ART_RE.lastIndex = 0; const n = [...String(line).matchAll(ART_RE)].length; ART_RE.lastIndex = 0; return n; };
/** Share of CJK characters among letters. */
export function cjkShare(s) {
  const cjk = (String(s).match(/[\u3400-\u9fff]/gu) || []).length;
  const letters = (String(s).match(/\p{L}/gu) || []).length;
  return letters ? cjk / letters : 0;
}

/**
 * Decide misattribution for one EXISTS_UNQUOTED result. Returns null or
 * { suggested_article, suggested_law, score_cited, score_best, tokens, excerpt }.
 */
export function crossCheck(r, claim, law, ix, opts = CROSSREF_DEFAULTS) {
  if (!ix || !claim) return null;
  const line = r.sentence || '';
  // A line that cites several articles or a range does not describe one article.
  if (opts.skipMulti === 'range' ? RANGE_RE.test(line) : opts.skipMulti && (countArticleRefs(line) > 1 || RANGE_RE.test(line))) return null;
  // Chinese paraphrases only carry a few embedded local-language words: too little evidence.
  if (opts.skipCjk && cjkShare(claim) > 0.3) return null;
  const { n, ranked } = rankArticles(claim, ix);
  if (n < opts.minTokens || !ranked.length) return null;
  const [bestArt, best] = ranked[0];
  const cited = (ranked.find(([k]) => k === String(r.article)) || [null, 0])[1];
  const base = { score_cited: Number(cited.toFixed(3)), tokens: n };
  const misattributed = bestArt !== String(r.article) && best >= opts.minBest && best >= opts.ratio * Math.max(cited, 0.01);
  if (!misattributed) {
    // H4: a long, specific statement that shares almost nothing with the cited article.
    if (opts.unsupportedMaxCited != null && n >= opts.unsupportedMinTokens && cited <= opts.unsupportedMaxCited) {
      return { kind: 'unsupported', ...base, score_best: Number(best.toFixed(3)) };
    }
    return null;
  }
  return { kind: 'misattributed', suggested_article: bestArt, suggested_law: law.law_id, score_cited: Number(cited.toFixed(3)),
    score_best: Number(best.toFixed(3)), tokens: n, excerpt: cpSlice(law.articles[bestArt] || '', 0, 600) };
}
