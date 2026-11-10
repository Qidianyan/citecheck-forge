// Citation extraction and law linking — port of verify.py (extract, alias_hits, resolve_by_number, detect_country).
import { thaiDigits, cn2int, scriptOf, strip, cpSlice, W, D } from './normalize.js';

export const COUNTRY_WORDS = {
  VN: ['越南', 'Việt Nam', 'Viet Nam', 'Vietnam', 'Luật ', 'Điều ', 'Bộ luật'],
  ID: ['印尼', '印度尼西亚', 'Indonesia', 'Pasal ', 'Undang-Undang', 'UU '],
  TH: ['泰国', 'Thailand', 'ไทย', 'มาตรา', 'พระราชบัญญัติ', 'B.E.'],
};

const CN_DIG = '零〇一二三四五六七八九十百千两';
export const ART_RE = new RegExp(
  `(?<lat>(?:Điều|Dieu|Pasal|Section|Sec\\.|Article|Art\\.)\\s*(?<n1>${D}+)[A-Za-z]?)` +
  `|(?<th>มาตรา\\s*(?<n2>${D}+)(?:/${D}+)?)` +
  `|(?<zh>第\\s*(?<n3>${D}+|[${CN_DIG}]+)\\s*条(?:之[一二三四五六七八九十${D}]+)?)`, 'giu');
export const LAWNUM_RE = new RegExp(
  `(?<![${D}/])${D}+/${D}{4}/(?:QH${D}+|NĐ-CP|ND-CP|NQ-CP|QĐ-TTg|TT-[A-ZĐ]+|UBTVQH${D}+|VBHN-[A-ZĐ]+)(?![A-Za-z0-9])` +
  `|(?<![A-Za-z])(?:UU|PP|Perpres|Permen[${W}]*|Perppu|POJK)\\s*(?:No\\.?|Nomor)?\\s*${D}+\\s*(?:Tahun|/)\\s*${D}{4}` +
  `|(?:Undang-Undang|Peraturan Pemerintah|Peraturan Presiden)\\s+(?:Republik Indonesia\\s+)?(?:No\\.?|Nomor)\\s*${D}+\\s+Tahun\\s+${D}{4}`, 'giu');
const NB = `(?<![${W}])`, NA = `(?![${W}])`; // Python \b emulation around word chars
export const CASE_RE = new RegExp(
  `(?:Bản án số|Án lệ số)\\s*[${W}/.\\-]+|Putusan\\s+(?:MK\\s+)?(?:No\\.?|Nomor)\\s*[${W}/.\\-]+|` +
  `${NB}${D}+/PUU-[IVXL]+/${D}{4}${NA}|คำพิพากษาศาลฎีกาที่\\s*[${D}/]+|\\(${D}{4}\\)\\s*[^\\s，。]{0,10}字第${D}+号`, 'giu');
export const QUOTE_RE = /["“«「『]([^"”»」』]{15,})["”»」』]/gu;
export const BOOK_RE = /《([^《》]{2,60})》/gu;
const CLAUSE_RE = new RegExp(`(?:khoản|ayat|วรรค|第)\\s*\\(?(${D}+|[一二三四五六七八九十]+)\\)?\\s*(?:款)?`, 'u');

function countOcc(text, w) {
  let n = 0, i = 0;
  while ((i = text.indexOf(w, i)) !== -1) { n++; i += w.length; }
  return n;
}

export function detectCountry(text) {
  let best = null, bestScore = -1;
  for (const [c, ws] of Object.entries(COUNTRY_WORDS)) {
    const s = ws.reduce((acc, w) => acc + countOcc(text, w), 0);
    if (s > bestScore) { best = c; bestScore = s; }
  }
  return bestScore > 0 ? best : null;
}

/** Returns [{start, end, law, alias}] — longest alias per position; generic aliases only for the matching country. */
export function aliasHits(line, country, corpus) {
  const n = line.normalize('NFC').toLowerCase();
  const hits = [];
  for (const { key, law, alias, generic } of corpus.aliases) {
    if (generic && law.country !== country) continue;
    if (!key) continue;
    let i = 0;
    while ((i = n.indexOf(key, i)) !== -1) { hits.push({ start: i, end: i + key.length, law, alias }); i += key.length; }
  }
  hits.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start)
    || (a.law.translation ? 1 : 0) - (b.law.translation ? 1 : 0));
  const out = []; let lastEnd = -1;
  for (const h of hits) if (h.start >= lastEnd) { out.push(h); lastEnd = h.end; }
  return out;
}

const stripYear = (t) => t.replace(/\s*\(\d{4}\)$/u, '');

export function resolveByNumber(law, line, corpus) {
  const same = corpus.laws.filter((l) => l !== law && l.country === law.country && stripYear(l.title) === stripYear(law.title));
  if (!same.length) return law;
  for (const cand of [law, ...same]) {
    const num = cand.number;
    const yr = (cand.issued || '').slice(0, 4);
    if ((num && line.includes(num)) || (yr && new RegExp(`(?<!${D})${yr}(?!${D})`, 'u').test(line))) return cand;
  }
  return law;
}

const dist = (p, pos, zh) => Math.abs(p - pos) + (zh ? (p > pos ? 30 : 0) : (p > pos ? 0 : 15));

/** Extract citations: [{citation,type,article,clause,law,law_hint,inferred,sentence,quote,quote_lang}] */
export function extract(text, corpus, country = null) {
  country = country || detectCountry(text);
  const out = [];
  let ctx = null; // last mentioned law (object) or uncached law reference (string)
  for (const line of text.split(/\n+/u)) {
    if (!strip(line)) continue;
    const lineT = thaiDigits(line);
    const lc = ['越南', '印尼', '印度尼西亚', '泰国'].some((w) => lineT.includes(w)) ? detectCountry(lineT) : country;
    const hits = aliasHits(lineT, lc, corpus);
    const spans = hits.map((h) => [h.start, h.end]);
    const unknown = [];
    for (const m of lineT.matchAll(LAWNUM_RE)) {
      if (!spans.some(([s, e]) => s <= m.index && m.index < e)) unknown.push([m.index, m[0]]);
    }
    for (const m of lineT.matchAll(BOOK_RE)) {
      const s1 = m.index + 1, e1 = s1 + m[1].length;
      if (!spans.some(([s, e]) => (s <= s1 && s1 < e) || (s1 <= s && s < e1))) unknown.push([m.index, '《' + m[1] + '》']);
    }
    const sentence600 = cpSlice(strip(line), 0, 600), sentence800 = cpSlice(strip(line), 0, 800);
    for (const c of lineT.matchAll(CASE_RE)) out.push({ citation: strip(c[0]), type: 'case', sentence: sentence600 });
    const quotes = [...lineT.matchAll(QUOTE_RE)].map((m) => [m.index, m[1]]);
    for (const m of lineT.matchAll(ART_RE)) {
      const g = m.groups;
      const art = String(cn2int(g.n1 || g.n2 || g.n3));
      const pos = m.index;
      const zh = Boolean(g.zh);
      const cands = [];
      for (const h of hits) cands.push([dist(h.start, pos, zh), 'law', h.law]);
      for (const [p, u] of unknown) cands.push([dist(p, pos, zh), 'hint', u]);
      let law = null, hint = null, inferred = false;
      if (cands.length) {
        let best = cands[0];
        for (const c of cands) if (c[0] < best[0]) best = c;
        if (best[1] === 'law') law = resolveByNumber(best[2], lineT, corpus); else hint = best[2];
      } else if (ctx && typeof ctx === 'object') { law = ctx; inferred = true; }
      else if (typeof ctx === 'string') { hint = ctx; inferred = true; }
      let q = null;
      if (quotes.length) {
        const after = quotes.filter((x) => x[0] >= pos);
        q = (after.length ? after[0] : quotes[quotes.length - 1])[1];
      }
      const end = m.index + m[0].length;
      const cm = CLAUSE_RE.exec(lineT.slice(end, end + 25));
      out.push({ citation: strip(m[0]), type: 'statute', article: art, clause: cm ? cm[1] : null, law, law_hint: hint,
        inferred, sentence: sentence800, quote: q, quote_lang: q ? scriptOf(q) : null });
    }
    const mentions = [...hits.map((h) => [h.start, resolveByNumber(h.law, lineT, corpus)]), ...unknown];
    if (mentions.length) {
      let best = mentions[0];
      for (const x of mentions) if (x[0] > best[0]) best = x;
      ctx = best[1];
    }
  }
  return out;
}
