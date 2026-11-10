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

// Task K (enhanced mode only): article ranges and lists, e.g. "第67–74条", "Pasal 5 sampai dengan Pasal 13",
// "Điều 5, 6 và 7", "มาตรา 78 ถึง 82", "Articles 5 to 10". One statute row per article.
const SEP = String.raw`(?:[-–—~]|sampai\s+dengan|sampai|s\.d\.|s/d|đến|tới|ถึง|(?<![A-Za-z])to(?![A-Za-z])|(?<![A-Za-z])through(?![A-Za-z])|至|到)`;
const MARK = String.raw`(Pasal|Điều|Dieu|มาตรา|Articles|Sections|Article|Section|Art\.|Sec\.)`;
const NUM = String.raw`(${D}+|[${CN_DIG}]+)`;
const RANGE_RE = new RegExp(String.raw`${MARK}\s*(${D}+)\s*${SEP}\s*(?:${MARK}\s*)?(${D}+)`, 'giu');
const ZH_RANGE_RE = new RegExp(String.raw`第\s*${NUM}\s*条?\s*(?:[-–—~]|至|到)\s*(?:第\s*)?${NUM}\s*条?`, 'giu');
const LIST_RE = new RegExp(String.raw`${MARK}\s*(${D}+)(?:(?:\s*,\s*|\s+)(?:dan|và|และ|and)?\s*(?:${MARK}\s*)?(${D}+))+`, 'giu');
const ZH_LIST_RE = new RegExp(String.raw`第\s*${NUM}\s*条?(?:(?:\s*(?:、|，|和|与)\s*)(?:第\s*)?${NUM}\s*条?)+`, 'giu');
const digitsOf = (s) => [...s.matchAll(new RegExp(`${D}+|[${CN_DIG}]+`, 'gu'))].map((x) => cn2int(x[0])).filter((n) => Number.isFinite(n) && n > 0);

/** Group candidates on one line: {start,end,kind,zh,marker,nums,firstEnd}. Overlaps dropped, order kept. */
function findGroups(lineT) {
  const cand = [];
  const add = (m, kind, zh) => {
    if (zh && !/条\s*$/u.test(m[0])) return; // "第2、3句" (sentences) is not an article group: the last number needs 条
    let nums = digitsOf(m[0]);
    if (kind === 'range') {
      const a = nums[0], b = nums[nums.length - 1];
      if (!(b > a) || b - a + 1 > 15) return; // cap: invalid or oversized ranges keep current behaviour
      nums = []; for (let n = a; n <= b; n++) nums.push(n);
    }
    const numStr = zh ? m[1] : (m[2] || m[1]);
    const numEnd = m[0].indexOf(numStr) + numStr.length;
    const zhTail = zh ? (/^\s*条/u.exec(m[0].slice(numEnd)) || [''])[0] : '';
    const firstLocal = numEnd + zhTail.length;
    const firstEnd = m.index + firstLocal;
    const firstText = m[0].slice(0, firstLocal);
    if (!nums.length) return;
    const seen = new Set(); const uniq = [];
    for (const n of nums) if (!seen.has(n)) { seen.add(n); uniq.push(n); }
    cand.push({ start: m.index, end: m.index + m[0].length, kind, zh, marker: zh ? null : m[1], nums: uniq, firstEnd, firstText });
  };
  for (const m of lineT.matchAll(RANGE_RE)) add(m, 'range', false);
  for (const m of lineT.matchAll(ZH_RANGE_RE)) add(m, 'range', true);
  for (const m of lineT.matchAll(LIST_RE)) add(m, 'list', false);
  for (const m of lineT.matchAll(ZH_LIST_RE)) add(m, 'list', true);
  cand.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const out = []; let lastEnd = -1;
  for (const g of cand) if (g.start >= lastEnd) { out.push(g); lastEnd = g.end; }
  return out;
}

function countOcc(text, w) {
  let n = 0, i = 0;
  while ((i = text.indexOf(w, i)) !== -1) { n++; i += w.length; }
  return n;
}

// Enhanced mode: extra English cues so a line about another country is linked to that country's laws.
export const COUNTRY_WORDS_EN = {
  VN: [...COUNTRY_WORDS.VN, 'Vietnamese', 'Decree ', '/QH1'],
  ID: [...COUNTRY_WORDS.ID, 'Indonesian', 'Tahun '],
  TH: [...COUNTRY_WORDS.TH, 'Thai ', 'Thai\u2019', "Thai'"],
};

export function detectCountry(text, words = COUNTRY_WORDS) {
  let best = null, bestScore = -1;
  for (const [c, ws] of Object.entries(words)) {
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

// Enhanced mode: document-level version pinning for same-title law families (Investment Law 2014/2020/2025,
// Cybersecurity Law 2018/2025, ...). Markers that name one specific version: its number, or an alias with a year.
const familyKey = (l) => `${l.country}|${stripYear(l.title)}`;
function versionMarkers(l) {
  const out = [];
  if (l.number) out.push(l.number.toLowerCase());
  for (const a of l.aliases || []) if (/\d{4}/u.test(a)) out.push(a.normalize('NFC').toLowerCase());
  return out;
}
/** family → the single version the document names explicitly (no entry when 0 or ≥ 2 versions are named). */
export function pinnedVersions(text, corpus) {
  const t = thaiDigits(text).normalize('NFC').toLowerCase();
  const named = new Map();
  for (const l of corpus.laws) {
    if (!versionMarkers(l).some((m) => t.includes(m))) continue;
    const k = familyKey(l);
    if (!named.has(k)) named.set(k, new Set());
    named.get(k).add(l);
  }
  const pins = new Map();
  for (const [k, set] of named) if (set.size === 1) pins.set(k, [...set][0]);
  return pins;
}
/** The cached law mentioned most often in the document (ties: first mentioned). */
function dominantLaw(text, corpus, country) {
  const counts = new Map();
  for (const line of text.split(/\n+/u)) for (const h of aliasHits(thaiDigits(line), country, corpus)) counts.set(h.law, (counts.get(h.law) || 0) + 1);
  let best = null, n = 0;
  for (const [l, c] of counts) if (c > n) { best = l; n = c; }
  return best;
}

const dist = (p, pos, zh) => Math.abs(p - pos) + (zh ? (p > pos ? 30 : 0) : (p > pos ? 0 : 15));

/** Extract citations: [{citation,type,article,clause,law,law_hint,inferred,sentence,quote,quote_lang}] */
export function extract(text, corpus, country = null, opts = {}) {
  country = country || detectCountry(text, corpus.enhanced ? COUNTRY_WORDS_EN : COUNTRY_WORDS);
  const out = [];
  let ctx = null; // last mentioned law (object) or uncached law reference (string)
  const pins = corpus.enhanced ? pinnedVersions(text, corpus) : null;
  const docLaw = corpus.enhanced ? dominantLaw(text, corpus, country) : null;
  const pin = (law, line) => {
    if (!pins || !law) return law;
    const p = pins.get(familyKey(law));
    if (!p || p === law) return law;
    const l = line.normalize('NFC').toLowerCase();
    return versionMarkers(law).some((m) => l.includes(m)) ? law : p; // the line itself names this version: keep it
  };
  const lines = text.split(/\n+/u);
  const ART1 = new RegExp(ART_RE.source, ART_RE.flags.replace('g', ''));
  /** Enhanced: a quotation in the block-quote that directly follows a citation line (Markdown "> "…""). */
  const nextQuote = (i) => {
    for (let j = i + 1, seen = 0; j < lines.length && seen < 3; j++) {
      const l = lines[j];
      if (!strip(l)) continue;
      seen++;
      if (!/^\s*>/u.test(l)) return null;
      const lt = thaiDigits(l);
      const qm = [...lt.matchAll(QUOTE_RE)];
      if (qm.length) return ART1.test(lt.slice(0, qm[0].index)) ? null : qm[0][1];
      if (ART1.test(lt)) return null;
    }
    return null;
  };
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (!strip(line)) continue;
    const before = out.length;
    const lineT = thaiDigits(line);
    let lc;
    if (corpus.enhanced) lc = detectCountry(lineT, COUNTRY_WORDS_EN) || country;
    else lc = ['越南', '印尼', '印度尼西亚', '泰国'].some((w) => lineT.includes(w)) ? detectCountry(lineT) : country;
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
    const resolveAt = (pos, zh) => {
      const cands = [];
      for (const h of hits) cands.push([dist(h.start, pos, zh), 'law', h.law]);
      for (const [p, u] of unknown) cands.push([dist(p, pos, zh), 'hint', u]);
      let law = null, hint = null, inferred = false;
      if (cands.length) {
        let best = cands[0];
        for (const c of cands) if (c[0] < best[0]) best = c;
        if (best[1] === 'law') law = resolveByNumber(best[2], lineT, corpus); else hint = best[2];
      } else if (docLaw && /^\s*#{1,6}\s/u.test(line)) { law = docLaw; inferred = true; } // section heading: the document's main law
      else if (ctx && typeof ctx === 'object') { law = ctx; inferred = true; }
      else if (typeof ctx === 'string') { hint = ctx; inferred = true; }
      law = pin(law, lineT);
      return { law, hint, inferred };
    };
    const statuteRow = (m) => {
      const g = m.groups;
      const art = String(cn2int(g.n1 || g.n2 || g.n3));
      const pos = m.index;
      const zh = Boolean(g.zh);
      const { law, hint, inferred } = resolveAt(pos, zh);
      let q = null;
      if (quotes.length) {
        const after = quotes.filter((x) => x[0] >= pos);
        q = (after.length ? after[0] : quotes[quotes.length - 1])[1];
      }
      const end = m.index + m[0].length;
      const cm = CLAUSE_RE.exec(lineT.slice(end, end + 25));
      const row = { citation: strip(m[0]), type: 'statute', article: art, clause: cm ? cm[1] : null, law, law_hint: hint,
        inferred, sentence: sentence800, quote: q, quote_lang: q ? scriptOf(q) : null };
      if (corpus.enhanced) row.multi = null;
      return row;
    };
    /** Enhanced: expand a range/list group into one row per article, inheriting the first article's resolution. */
    const groupRows = (g) => {
      const r0 = resolveAt(g.start, g.zh);
      const cm0 = CLAUSE_RE.exec(lineT.slice(g.firstEnd, g.firstEnd + 25));
      let q = null;
      if (quotes.length) {
        const after = quotes.filter((x) => x[0] >= g.start);
        q = (after.length ? after[0] : quotes[quotes.length - 1])[1];
      }
      const rows = [];
      for (const n of g.nums) {
        const first = rows.length === 0;
        const citation = first
          ? (g.zh ? (g.firstText.endsWith('条') ? strip(g.firstText) : `第${n}条`) : `${g.marker} ${n}`)
          : (g.zh ? `第${n}条` : `${g.marker} ${n}`);
        rows.push({ citation, type: 'statute', article: String(n),
          clause: first && cm0 ? cm0[1] : null, law: r0.law, law_hint: r0.hint, inferred: r0.inferred,
          sentence: sentence800, quote: first ? q : null, quote_lang: first && q ? scriptOf(q) : null, multi: g.kind });
      }
      return rows;
    };
    const groups = corpus.enhanced ? findGroups(lineT) : [];
    if (groups.length) {
      const covered = (pos, len) => groups.some((gr) => pos < gr.end && gr.start < pos + len);
      const items = groups.map((gr) => ({ pos: gr.start, gr }));
      for (const m of lineT.matchAll(ART_RE)) if (!covered(m.index, m[0].length)) items.push({ pos: m.index, m });
      items.sort((a, b) => a.pos - b.pos);
      for (const it of items) if (it.gr) out.push(...groupRows(it.gr)); else out.push(statuteRow(it.m));
    } else {
      for (const m of lineT.matchAll(ART_RE)) out.push(statuteRow(m));
    }
    if (corpus.enhanced && opts.followQuotes !== false) {
      const added = out.slice(before).filter((r) => r.type === 'statute');
      if (added.length === 1 && !added[0].quote) {
        const q = nextQuote(li);
        if (q) { added[0].quote = q; added[0].quote_lang = scriptOf(q); added[0].quote_from = 'blockquote'; }
      }
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
