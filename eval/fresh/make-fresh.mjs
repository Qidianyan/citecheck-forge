// Task F — deterministic generator for the FRESH held-out evaluation set.
// Labels are correct BY CONSTRUCTION: every item is assembled from cached official
// article text that never appears in eval/data/dataset.jsonl (any split).
// This script never runs the verifier and never computes precision/recall.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { corpus, lawStatus, contentCheckable, tokens } from '../../src/core/index.js';

export const AS_OF = '2026-11-10';
export const DEFAULT_SEED = 'fresh-2026-11';
export const QUOTA_PER_TYPE = 14; // per (country, local type); with ~37 zh items the total lands near 300
export const CAP_PER_LAW_TYPE = 6;
export const COUNTRIES = ['VN', 'ID', 'TH'];
export const LOCAL_TYPES = ['C_QUOTE', 'C_CLAIM', 'H3_CLAIM', 'H4_QUOTE', 'H1_ARTICLE', 'H7_NUMBER'];
export const ZH_TYPES = ['ZH_SAME', 'ZH_H3'];

/** type -> [verdict, flagged, types]. Negative items carry an empty types array. */
export const VERDICT_BY_TYPE = {
  C_QUOTE: ['EXISTS_CONSISTENT', false, []],
  C_CLAIM: ['EXISTS_UNQUOTED', false, []],
  H3_CLAIM: ['CONTENT_MISMATCH', true, ['H3']],
  H4_QUOTE: ['CONTENT_MISMATCH', true, ['H4']],
  H1_ARTICLE: ['ARTICLE_NOT_FOUND', true, ['H1']],
  H7_NUMBER: ['CONTENT_MISMATCH', true, ['H4', 'H7']],
  H5_REPEALED: ['NOT_IN_FORCE', true, ['H5']],
  ZH_SAME: ['EXISTS_UNQUOTED', false, []],
  ZH_H3: ['CONTENT_MISMATCH', true, ['H3']],
};

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
const QUOTE_CH = /["“«「『”»」』]/u;
const HEAD_RE = /^(Điều|Pasal|มาตรา|มำตรำ|มำตรา|มตราส|มาตรำ)\s*[\d๐-๙]+\s*\.?\s*/u;
const DIGIT_RE = /[0-9]+|[๐-๙]+/u;
const COUNTRY_ZH = { VN: '越南', ID: '印尼', TH: '泰国' };

const h = (s) => createHash('sha256').update(String(s)).digest('hex');
const hInt = (s) => parseInt(h(s).slice(0, 8), 16);
export const artKey = (a) => {
  const m = /^\s*(\d+)/u.exec(String(a ?? ''));
  return m ? m[1] : null;
};

/** Every (gold.law_id, leading integer of article) pair in the dataset, any split. */
export function computeUsed(recs) {
  const used = new Set();
  for (const r of recs || []) {
    for (const c of r.citations || []) {
      const lawId = c.gold && c.gold.law_id;
      if (!lawId) continue;
      const k = artKey(c.article);
      if (k == null) continue;
      used.add(`${lawId}|${k}`);
    }
  }
  return used;
}

// --- text shaping helpers ---------------------------------------------------

/**
 * Article body as ONE line: the cached texts keep the PDF's hard line breaks (mid-sentence), so lines are
 * joined; the "Điều N." / "Pasal N" / "มาตรา N" heading and a Vietnamese article title (text before "1. ")
 * are dropped. (Reviewer fix, phase 4: before, claims/spans were cut at PDF line breaks.)
 */
export function bodyLines(text) {
  let t = String(text).split('\n').map((x) => x.trim()).filter(Boolean).join(' ').replace(/\s+/gu, ' ').trim();
  const m = HEAD_RE.exec(t);
  if (m) t = t.slice(m[0].length).trim();
  t = t.replace(/^[.:\s]+/u, '');
  const clause1 = /(?:^|\s)1\.\s/u.exec(t);
  if (/^Điều\b/u.test(String(text).trim()) && clause1 && clause1.index > 0 && clause1.index < 250) t = t.slice(clause1.index).trim();
  return t ? [t] : [];
}

/** First body sentence (40–300 chars, cut at a word boundary), lightly trimmed; null when unusable. */
export function firstSentence(text) {
  for (const line of bodyLines(text)) {
    let x = line.replace(/^(\(?\d+\)?[\.\)]\s*|\([0-9๐-๙]+\)\s*|[a-z]\.\s*)/u, '').trim();
    const term = /[.;:!?。](?=\s|$)/u.exec(x);
    if (term) x = x.slice(0, term.index);
    const qi = x.search(QUOTE_CH);
    if (qi >= 0) x = x.slice(0, qi);
    if (x.length > 300) x = x.slice(0, x.lastIndexOf(' ', 300) > 40 ? x.lastIndexOf(' ', 300) : 300);
    x = x.trim().replace(/[,;،\s]+$/u, '');
    if (x.length >= 40 && !QUOTE_CH.test(x)) return x;
  }
  return null;
}

/** A verbatim 60–200 char single-line span of the article body, no quote chars inside. */
export function pickSpan(lines, salt, { digits = false } = {}) {
  const pool = lines.filter((l) => l.length >= 60 && !QUOTE_CH.test(l) && (!digits || DIGIT_RE.test(l)));
  if (!pool.length) return null;
  const line = pool[hInt(salt + '|line') % pool.length];
  const maxLen = Math.min(200, line.length);
  if (maxLen < 60) return null;
  for (let a = 0; a < 8; a++) {
    const len = 60 + (hInt(`${salt}|len|${a}`) % (maxLen - 60 + 1));
    const start = hInt(`${salt}|start|${a}`) % (line.length - len + 1);
    let st = start, en = Math.min(line.length, start + len);
    while (st > 0 && line[st - 1] !== ' ') st--; // snap to word boundaries (spaces; Thai phrases are space-separated)
    while (en < line.length && line[en] !== ' ') en++;
    const span = line.slice(st, en).trim();
    if (span.length >= 60 && span.length <= 240 && !QUOTE_CH.test(span)) return span;
  }
  const fb = line.slice(0, maxLen).trim();
  return fb.length >= 60 && !QUOTE_CH.test(fb) ? fb : null;
}

const toThai = (n) => String(n).replace(/\d/g, (d) => THAI_DIGITS[Number(d)]);
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replace the first number in a span (x2 or +7); null when no clean change exists. */
export function changeNumber(span, salt, articleText) {
  const m = DIGIT_RE.exec(span);
  if (!m) return null;
  const isThai = /[๐-๙]/u.test(m[0]);
  const v = parseInt(isThai ? m[0].replace(/[๐-๙]/g, (c) => String(THAI_DIGITS.indexOf(c))) : m[0], 10);
  const ops = hInt(salt + '|op') % 2 === 0 ? ['mul', 'add'] : ['add', 'mul'];
  for (const op of ops) {
    const nv = op === 'mul' ? v * 2 : v + 7;
    if (nv === v) continue;
    const ns = isThai ? toThai(nv) : String(nv);
    if (ns === m[0]) continue;
    // the changed number must not occur anywhere in the original article text
    if (new RegExp(`(?<!\\d)${escRe(ns)}(?!\\d)`, 'u').test(articleText)) continue;
    const out = span.slice(0, m.index) + ns + span.slice(m.index + m[0].length);
    if (out.length < 60 || out.length > 200 || QUOTE_CH.test(out)) continue;
    return { span: out, from: m[0], to: ns, op };
  }
  return null;
}

/** Word-token overlap of two article texts; the <30% rule keeps H3/H4 honest. */
export function tokenShare(ta, tb) {
  const sa = new Set(tokens(ta));
  const sb = new Set(tokens(tb));
  if (!sa.size || !sb.size) return 1;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return Math.max(inter / sa.size, inter / sb.size);
}

// --- templates ---------------------------------------------------------------

const TMPL = {
  VN: {
    quote: (a, m, x) => `Theo ${a}, ${m} quy định: "${x}".`,
    claim: (a, m, x) => `Theo ${a}, ${m} quy định ${x}.`,
    missing: (a, m) => `Theo ${a}, ${m} quy định về việc xử phạt vi phạm hành chính trong lĩnh vực bảo vệ dữ liệu cá nhân và bồi thường thiệt hại cho người bị ảnh hưởng.`,
  },
  ID: {
    quote: (a, n, x) => `Menurut ${a}, ${n} menyatakan: "${x}".`,
    claim: (a, n, x) => `Menurut ${a}, ${n} menyatakan ${x}.`,
    missing: (a, n) => `Menurut ${a}, ${n} mengatur tentang sanksi administratif berupa denda dan pidana penjara bagi setiap pelanggaran ketentuan dalam undang-undang ini.`,
  },
  TH: {
    quote: (a, m, x) => `ตาม${a} ${m} กำหนดว่า: "${x}"`,
    claim: (a, m, x) => `ตาม${a} ${m} ระบุว่า ${x}`,
    missing: (a, m) => `ตาม${a} ${m} กำหนดบทลงโทษสำหรับผู้ใดฝ่าฝืนหรือไม่ปฏิบัติตามบทบัญญัติของพระราชบัญญัตินี้ให้เป็นไปตามที่กฎหมายกำหนด`,
  },
};

const pickAlias = (law, seed) => {
  const list = law.aliases && law.aliases.length ? law.aliases : [law.title];
  return list[hInt(`${seed}|alias|${law.law_id}`) % list.length];
};
const pickZhAlias = (law, seed) => {
  const list = law.chinese_aliases && law.chinese_aliases.length ? law.chinese_aliases : (law.aliases || [law.title]);
  return list[hInt(`${seed}|zhalias|${law.law_id}`) % list.length];
};

/** Local article mention: VN Điều N / ID Pasal N (sometimes ayat (1)) / TH มาตรา N (half Thai digits). */
function articleMention(country, n, salt) {
  if (country === 'ID') return hInt(salt + '|ayat') % 2 === 0 ? `Pasal ${n} ayat (1)` : `Pasal ${n}`;
  if (country === 'TH') return hInt(salt + '|thai') % 2 === 0 ? `มาตรา ${toThai(n)}` : `มาตรา ${n}`;
  return `Điều ${n}`;
}

// --- builder -----------------------------------------------------------------

export function buildFresh({ corpus: corp, recs, zh, seed = DEFAULT_SEED } = {}) {
  if (!corp || !Array.isArray(corp.laws)) throw new TypeError('buildFresh: corpus required');
  const used = computeUsed(recs || []);
  const mainPool = { VN: [], ID: [], TH: [] };
  const h5Pool = [];

  for (const law of corp.laws) {
    if (!law.articles || law.stub || law.law_id === 'TH-PDPA-2562-EN') continue;
    for (const [num, text] of Object.entries(law.articles)) {
      const key = artKey(num);
      if (key == null || used.has(`${law.law_id}|${key}`)) continue;
      const len = String(text).length;
      if (len < 250 || len > 1500) continue;
      const order = h(`${seed}|${law.law_id}|${num}`);
      const entry = { law, num, key, text, order };
      if (lawStatus(law, AS_OF, num)[0] === 'in_force' && contentCheckable(law, num)[0]) {
        (mainPool[law.country] || []).push(entry);
      } else if (lawStatus(law, AS_OF, num)[0] !== 'in_force') {
        h5Pool.push(entry); // only for H5_REPEALED, cited with its own number
      }
    }
  }
  for (const p of [...Object.values(mainPool), h5Pool]) p.sort((x, y) => (x.order < y.order ? -1 : x.order > y.order ? 1 : 0));

  const findB = (lawId, aEntry, salt, need) => {
    for (const b of mainPool[aEntry.law.country]) {
      if (b.law.law_id !== lawId || b.key === aEntry.key) continue;
      if (tokenShare(aEntry.text, b.text) >= 0.3 && need !== 'any') continue;
      if (need === 'span' && !pickSpan(bodyLines(b.text), salt + '|b')) continue;
      if (need === 'sentence' && !firstSentence(b.text)) continue;
      return b;
    }
    return null;
  };

  const items = [];
  const lawTypeCount = new Map();
  const track = (lawId, type) => {
    const k = `${lawId}|${type}`;
    const n = lawTypeCount.get(k) || 0;
    if (n >= CAP_PER_LAW_TYPE) return false;
    lawTypeCount.set(k, n + 1);
    return true;
  };

  const make = (type, entry, extra = {}) => {
    const [verdict, flagged, types] = VERDICT_BY_TYPE[type];
    return {
      type,
      country: entry.law.country,
      lang: entry.law.lang,
      law_id: entry.law.law_id,
      article: extra.article ?? String(entry.key),
      as_of: AS_OF,
      text: extra.text,
      expected: { verdict, flagged, types },
      source: { cited_article_text_from: extra.from ? `${extra.from.law.law_id}#${extra.from.key}` : null },
    };
  };

  for (const country of COUNTRIES) {
    const pool = mainPool[country];
    for (const type of LOCAL_TYPES) {
      let quota = QUOTA_PER_TYPE;
      for (const entry of pool) {
        if (quota === 0) break;
        const salt = `${seed}|${country}|${type}|${entry.law.law_id}|${entry.key}`;
        const alias = pickAlias(entry.law, seed);
        const mention = articleMention(country, entry.key, salt);
        let text = null;
        let from = entry;
        let article = null;
        if (type === 'C_QUOTE') {
          const span = pickSpan(bodyLines(entry.text), salt + '|span');
          if (span) text = TMPL[country].quote(alias, mention, span);
        } else if (type === 'C_CLAIM') {
          const sent = firstSentence(entry.text);
          if (sent) text = TMPL[country].claim(alias, mention, sent);
        } else if (type === 'H3_CLAIM' || type === 'H4_QUOTE') {
          const b = findB(entry.law.law_id, entry, salt, type === 'H4_QUOTE' ? 'span' : 'sentence');
          if (b) {
            from = b;
            text = type === 'H3_CLAIM'
              ? TMPL[country].claim(alias, mention, firstSentence(b.text))
              : TMPL[country].quote(alias, mention, pickSpan(bodyLines(b.text), salt + '|bspan'));
          }
        } else if (type === 'H1_ARTICLE') {
          const maxn = entry.law.max_article || Math.max(...Object.keys(entry.law.articles).map(Number));
          let k = 3 + (hInt(salt + '|k') % 38);
          let n = maxn + k;
          while (used.has(`${entry.law.law_id}|${n}`) && k < 40) { k += 1; n = maxn + k; }
          if (!used.has(`${entry.law.law_id}|${n}`) && n > maxn) {
            text = TMPL[country].missing(alias, articleMention(country, String(n), salt));
            article = String(n);
            from = null;
          }
        } else if (type === 'H7_NUMBER') {
          const span = pickSpan(bodyLines(entry.text), salt + '|span', { digits: true });
          const ch = span ? changeNumber(span, salt, entry.text) : null;
          if (ch) text = TMPL[country].quote(alias, mention, ch.span);
        }
        if (!text) continue;
        if (!track(entry.law.law_id, type)) continue;
        items.push(make(type, entry, { text, from: type === 'H1_ARTICLE' ? null : from, article }));
        quota--;
      }
    }
    // H5_REPEALED: articles of laws not in force on as_of, cited with their own number.
    let quota = QUOTA_PER_TYPE;
    for (const entry of h5Pool) {
      if (quota === 0) break;
      if (entry.law.country !== country) continue;
      const salt = `${seed}|${country}|H5_REPEALED|${entry.law.law_id}|${entry.key}`;
      const sent = firstSentence(entry.text);
      if (!sent) continue;
      if (!track(entry.law.law_id, 'H5_REPEALED')) continue;
      const alias = pickAlias(entry.law, seed);
      const text = TMPL[country].claim(alias, articleMention(country, entry.key, salt), sent);
      items.push(make('H5_REPEALED', entry, { text, from: entry }));
      quota--;
    }
  }

  // ZH_SAME / ZH_H3: Chinese-language items built from the (optional) paraphrase file.
  if (Array.isArray(zh) && zh.length) {
    const eligible = zh.filter((z) => {
      const law = corp.byId[z.law_id];
      if (!law || !law.articles || law.stub || law.law_id === 'TH-PDPA-2562-EN') return false;
      if (!z.text || !z.id) return false;
      const key = artKey(z.article);
      if (key == null || used.has(`${z.law_id}|${key}`)) return false;
      if (lawStatus(law, AS_OF, z.article)[0] !== 'in_force') return false;
      if (!contentCheckable(law, z.article)[0]) return false;
      const t = String(law.articles[z.article] || '');
      return t.length >= 250 && t.length <= 1500;
    });
    for (let i = 0; i < eligible.length; i++) {
      const z = eligible[i];
      const type = i % 2 === 0 ? 'ZH_SAME' : 'ZH_H3';
      const law = corp.byId[z.law_id];
      const key = artKey(z.article);
      const zhAlias = pickZhAlias(law, seed);
      const para = String(z.text).trim().replace(/[。！？!?.\s]+$/u, '') + '。';
      let text;
      let from;
      if (type === 'ZH_SAME') {
        text = `根据${COUNTRY_ZH[z.country]}《${zhAlias}》第${key}条，${para}`;
        from = { law, key };
      } else {
        const aEntry = { law, key, text: law.articles[z.article] };
        const b = findB(z.law_id, aEntry, `${seed}|zh|${z.id}`, 'any');
        if (!b) continue;
        from = b;
        text = `根据${COUNTRY_ZH[z.country]}《${zhAlias}》第${b.key}条，${para}`;
      }
      if (!track(z.law_id, type)) continue;
      const [verdict, flagged, types] = VERDICT_BY_TYPE[type];
      items.push({
        type,
        country: z.country,
        lang: 'zh',
        law_id: z.law_id,
        article: String(type === 'ZH_SAME' ? key : from.key),
        as_of: AS_OF,
        text,
        expected: { verdict, flagged, types },
        source: { cited_article_text_from: `${z.law_id}#${key}` },
      });
    }
  }

  return items.map((it, i) => ({ id: `FR-${String(i + 1).padStart(4, '0')}`, ...it }));
}

// --- CLI ----------------------------------------------------------------------

function parseArgs(argv) {
  const a = { seed: DEFAULT_SEED, out: path.dirname(fileURLToPath(import.meta.url)) };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--seed') a.seed = argv[++i];
    else if (argv[i] === '--out-dir') a.out = argv[++i];
    else if (argv[i] === '--dataset') a.dataset = argv[++i];
  }
  return a;
}

function poolSizes(recs) {
  const used = computeUsed(recs);
  const sizes = { VN: 0, ID: 0, TH: 0, not_in_force: 0 };
  for (const law of corpus.laws) {
    if (!COUNTRIES.includes(law.country)) continue;
    if (!law.articles || law.stub || law.law_id === 'TH-PDPA-2562-EN') continue;
    for (const [num, text] of Object.entries(law.articles)) {
      const key = artKey(num);
      if (key == null || used.has(`${law.law_id}|${key}`)) continue;
      const len = String(text).length;
      if (len < 250 || len > 1500) continue;
      const st = lawStatus(law, AS_OF, num)[0];
      if (st === 'in_force' && contentCheckable(law, num)[0]) sizes[law.country]++;
      else if (st !== 'in_force') sizes.not_in_force++;
    }
  }
  return sizes;
}

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const a = parseArgs(process.argv.slice(2));
  const datasetPath = a.dataset || path.join(here, '..', 'data', 'dataset.jsonl');
  const recs = fs.readFileSync(datasetPath, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));

  let zh;
  const pPath = path.join(here, 'zh_paraphrases.json');
  const iPath = path.join(here, 'zh_input.json');
  if (fs.existsSync(pPath) && fs.existsSync(iPath)) {
    const paraphrases = JSON.parse(fs.readFileSync(pPath, 'utf8'));
    const inputs = JSON.parse(fs.readFileSync(iPath, 'utf8'));
    const byId = new Map(inputs.map((x) => [x.id, x]));
    zh = paraphrases
      .map((p) => {
        const inp = byId.get(p.id);
        return inp ? { ...inp, text: p.zh ?? p.text ?? p.paraphrase } : null;
      })
      .filter(Boolean);
  }

  const items = buildFresh({ corpus, recs, zh, seed: a.seed });
  const outDir = path.resolve(a.out);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'fresh.jsonl'), items.map((i) => JSON.stringify(i)).join('\n') + '\n');

  const countBy = (list, fn) => list.reduce((m, x) => { const k = fn(x); m[k] = (m[k] || 0) + 1; return m; }, {});
  const stats = {
    seed: a.seed,
    as_of: AS_OF,
    total: items.length,
    by_type: countBy(items, (i) => i.type),
    by_country: countBy(items, (i) => i.country),
    by_lang: countBy(items, (i) => i.lang),
    per_law: countBy(items, (i) => i.law_id),
    used_article_pairs: computeUsed(recs).size,
    candidate_pool: poolSizes(recs),
    zh_provided: Boolean(zh),
    note: 'Labels correct by construction. Scored exactly once after the verifier config is frozen; never tune on this set.',
  };
  fs.writeFileSync(path.join(outDir, 'fresh_stats.json'), JSON.stringify(stats, null, 2));
  console.log(`wrote ${items.length} fresh items -> ${path.join(outDir, 'fresh.jsonl')}`);
  console.log(`by_type: ${JSON.stringify(stats.by_type)}`);
  console.log(`by_country: ${JSON.stringify(stats.by_country)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
