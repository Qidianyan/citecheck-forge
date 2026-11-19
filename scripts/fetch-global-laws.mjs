#!/usr/bin/env node
// Fetches official English statutory texts for CiteCheck's global flagship pack:
//  1) EU GDPR — Regulation (EU) 2016/679 (Articles 1–99) via EU Publications Office CELLAR open-data API
//  2) EU AI Act — Regulation (EU) 2024/1689 (Articles 1–113) via EU Publications Office CELLAR open-data API
//  3) US Federal Rules of Civil Procedure — Rules 1–86 (incl. Rule 11) via Cornell LII / U.S. Courts text
// Writes deterministic per-law JSON files into src/corpus/global/*.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = fileURLToPath(new URL('../src/corpus/global/', import.meta.url));
const FETCHED_AT = '2026-11-18 (PT)';

function decodeEntities(html) {
  return String(html)
    .replace(/&#x([0-9a-fA-F]+);/gu, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/gu, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/gu, ' ')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&#39;/gu, "'")
    .replace(/&lsquo;|&rsquo;/gu, "'")
    .replace(/&ldquo;|&rdquo;/gu, '"')
    .replace(/&ndash;/gu, '–')
    .replace(/&mdash;/gu, '—')
    .replace(/&sect;/gu, '§')
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>');
}

function htmlToCleanText(fragment) {
  return decodeEntities(
    String(fragment)
      .replace(/<script[\s\S]*?<\/script>/giu, ' ')
      .replace(/<style[\s\S]*?<\/style>/giu, ' ')
      .replace(/<\/(?:p|div|tr|li|h[1-6])>/giu, '\n')
      .replace(/<br\s*\/?>/giu, '\n')
      .replace(/<td[^>]*>/giu, ' ')
      .replace(/<[^>]+>/gu, ' '),
  )
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/gu, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Parse Official Journal CONVEX XHTML (EU Publications Office CELLAR) into { "1": "Article 1 ...", ... }.
 * Stops strictly before final signatory block ("This Regulation shall be binding in its entirety") or ANNEX I.
 */
function parseEuCellarRegulation(xhtml, expectedMax) {
  // Cut off anything from ANNEX I onwards so Annex tables never bleed into the final article.
  let body = xhtml;
  const annexCut = /<p[^>]*class="[^"]*oj-doc-ti[^"]*"[^>]*>\s*ANNEX(?:\s+I)?\b/iu.exec(body);
  if (annexCut && annexCut.index > body.length * 0.4) {
    body = body.slice(0, annexCut.index);
  }

  const artRe = /<p[^>]*class="[^"]*oj-ti-art[^"]*"[^>]*>\s*Article\s+(\d+)\s*<\/p>/giu;
  const matches = [...body.matchAll(artRe)];
  const articles = {};

  for (let i = 0; i < matches.length; i++) {
    const num = matches[i][1];
    if (parseInt(num, 10) > expectedMax) continue;
    // Only take the first occurrence if amending articles inside quotes appear, though top-level oj-ti-art is unique.
    if (articles[num]) continue;
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : body.length;
    let slice = body.slice(start, end);

    // Trim trailing chapter/section headings that belong to the NEXT chapter, and the OJ closing formula.
    const nextChapter = /<p[^>]*class="[^"]*(?:oj-ti-section|oj-ti-grseq)[^"]*"[^>]*>\s*(?:CHAPTER|SECTION)\b/iu.exec(slice);
    if (nextChapter) slice = slice.slice(0, nextChapter.index);
    const bindingIdx = slice.indexOf('This Regulation shall be binding in its entirety');
    if (bindingIdx !== -1) slice = slice.slice(0, bindingIdx);

    const text = htmlToCleanText(slice);
    if (text) articles[num] = text;
  }

  const count = Object.keys(articles).length;
  if (count !== expectedMax) {
    const missing = [];
    for (let k = 1; k <= expectedMax; k++) if (!articles[String(k)]) missing.push(k);
    throw new Error(`Expected ${expectedMax} articles, got ${count} (missing: ${missing.join(', ')})`);
  }
  return articles;
}

async function fetchText(url, headers = {}) {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/xhtml+xml, text/html;q=0.9',
      'Accept-Language': 'eng,en',
      ...headers,
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/** Fetch Rules 1–86 of the US Federal Rules of Civil Procedure from Cornell LII (concurrency-limited). */
async function fetchUsFrcp() {
  const articles = {};
  const abrogated = {};
  const nums = Array.from({ length: 86 }, (_, i) => i + 1);
  const CONCURRENCY = 8;

  for (let offset = 0; offset < nums.length; offset += CONCURRENCY) {
    const batch = nums.slice(offset, offset + CONCURRENCY);
    await Promise.all(batch.map(async (n) => {
      const url = `https://www.law.cornell.edu/rules/frcp/rule_${n}`;
      const html = await fetchText(url, { Accept: 'text/html' });
      const h1Match = /<h1[^>]*id="page-title"[^>]*>([\s\S]*?)<\/h1>/iu.exec(html)
        || /<h1[^>]*>([\s\S]*?)<\/h1>/iu.exec(html);
      const heading = h1Match ? htmlToCleanText(h1Match[1]) : `Rule ${n}`;

      const artMatch = /<article\b[^>]*>([\s\S]*?)<\/article>/iu.exec(html);
      let inner = artMatch ? artMatch[1] : '';
      // Remove Advisory Committee Notes / Amendment history tabs so only the operative rule text remains.
      const notesIdx = inner.search(/Notes of Advisory Committee|<div[^>]*class="[^"]*field-name-field-notes[^"]*"|<h2[^>]*>\s*Notes\b/iu);
      if (notesIdx !== -1) inner = inner.slice(0, notesIdx);
      const creditsIdx = inner.search(/<p>\s*\((?:As amended|Added|Amended)\b/iu);
      if (creditsIdx !== -1) inner = inner.slice(0, creditsIdx);

      const ruleBody = htmlToCleanText(inner);
      const combined = ruleBody ? `${heading}\n${ruleBody}` : heading;
      articles[String(n)] = combined;

      if (/\[(?:Abrogated|Repealed)/iu.test(heading) || /^Rule \d+\.\s*\[?(?:Abrogated|Repealed)/iu.test(combined)) {
        const yr = /(?:19|20)\d{2}/u.exec(combined);
        abrogated[String(n)] = yr ? `${yr[0]}-12-01` : '2015-12-01';
      }
    }));
  }

  // Known historical abrogation dates in the official FRCP table:
  abrogated['74'] = '1997-04-11';
  abrogated['75'] = '1997-04-11';
  abrogated['76'] = '1997-04-11';
  abrogated['84'] = '2015-12-01';

  return { articles, abrogated };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('1/3 Fetching EU GDPR (CELEX:32016R0679) from EU Publications Office CELLAR...');
  const gdprXhtml = await fetchText('https://publications.europa.eu/resource/celex/32016R0679');
  const gdprArticles = parseEuCellarRegulation(gdprXhtml, 99);
  const gdpr = {
    law_id: 'EU-GDPR-2016-679',
    country: 'EU',
    lang: 'en',
    title: 'Regulation (EU) 2016/679 (General Data Protection Regulation)',
    number: '2016/679',
    aliases: [
      'GDPR',
      'EU GDPR',
      'Regulation (EU) 2016/679',
      'Regulation 2016/679',
      'General Data Protection Regulation',
    ],
    chinese_aliases: [
      '通用数据保护条例',
      '一般数据保护条例',
      '欧盟通用数据保护条例',
    ],
    issued: '2016-04-27',
    effective: '2018-05-25',
    content_current: true,
    translation: false,
    global_pack: true,
    source_page: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj',
    source_pdf: 'https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:32016R0679',
    fetched_at: FETCHED_AT,
    max_article: 99,
    articles: gdprArticles,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'EU-GDPR-2016-679.json'), JSON.stringify(gdpr, null, 1));
  console.log(`   -> GDPR saved: ${Object.keys(gdprArticles).length} articles`);

  console.log('2/3 Fetching EU AI Act (CELEX:32024R1689) from EU Publications Office CELLAR...');
  const aiActXhtml = await fetchText('https://publications.europa.eu/resource/celex/32024R1689');
  const aiActArticles = parseEuCellarRegulation(aiActXhtml, 113);
  const aiAct = {
    law_id: 'EU-AI-ACT-2024-1689',
    country: 'EU',
    lang: 'en',
    title: 'Regulation (EU) 2024/1689 (Artificial Intelligence Act)',
    number: '2024/1689',
    aliases: [
      'EU AI Act',
      'AI Act',
      'Regulation (EU) 2024/1689',
      'Regulation 2024/1689',
      'Artificial Intelligence Act',
      'European AI Act',
    ],
    chinese_aliases: [
      '人工智能法案',
      '欧盟人工智能法案',
    ],
    issued: '2024-06-13',
    effective: '2024-08-01',
    content_current: true,
    translation: false,
    global_pack: true,
    source_page: 'https://eur-lex.europa.eu/eli/reg/2024/1689/oj',
    source_pdf: 'https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:32024R1689',
    fetched_at: FETCHED_AT,
    max_article: 113,
    articles: aiActArticles,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'EU-AI-ACT-2024-1689.json'), JSON.stringify(aiAct, null, 1));
  console.log(`   -> EU AI Act saved: ${Object.keys(aiActArticles).length} articles`);

  console.log('3/3 Fetching US Federal Rules of Civil Procedure (Rules 1–86) from Cornell LII...');
  const { articles: frcpArticles, abrogated } = await fetchUsFrcp();
  const frcp = {
    law_id: 'US-FRCP',
    country: 'US',
    lang: 'en',
    title: 'Federal Rules of Civil Procedure (United States)',
    number: 'FRCP',
    aliases: [
      'FRCP',
      'Fed. R. Civ. P.',
      'Fed. R. Civ. P',
      'Federal Rules of Civil Procedure',
      'Federal Rule of Civil Procedure',
      'U.S. Federal Rules of Civil Procedure',
      'US FRCP',
    ],
    chinese_aliases: [
      '联邦民事诉讼规则',
      '美国联邦民事诉讼规则',
    ],
    issued: '1938-09-16',
    effective: '1938-09-16',
    repealed_exceptions: abrogated,
    content_current: true,
    translation: false,
    global_pack: true,
    source_page: 'https://www.uscourts.gov/rules-policies/current-rules-practice-procedure/federal-rules-civil-procedure',
    source_pdf: 'https://www.law.cornell.edu/rules/frcp',
    fetched_at: FETCHED_AT,
    max_article: 86,
    articles: frcpArticles,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'US-FRCP.json'), JSON.stringify(frcp, null, 1));
  console.log(`   -> US FRCP saved: ${Object.keys(frcpArticles).length} rules (Rule 11 length=${frcpArticles['11']?.length})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
