// Rule-layer verification — port of verify.py (quote_score, law_status, content_checkable, rule_verdict, verify, summarize).
import { tokens, scriptOf, cpSlice, cpLen } from './normalize.js';
import { matchingBlocks } from './difflib.js';
import { extract } from './extract.js';

export const FLAGGED = ['ARTICLE_NOT_FOUND', 'CONTENT_MISMATCH', 'NOT_IN_FORCE'];
export const PASSED = ['EXISTS_CONSISTENT', 'EXISTS_UNQUOTED'];
export const MIN_QUOTE_CHARS = 40;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;

export function quoteScore(quote, articleText) {
  const q = tokens(quote), a = tokens(articleText);
  if (!q.length) return null;
  const matched = matchingBlocks(a, q).reduce((s, b) => s + b[2], 0);
  return Number((matched / q.length).toFixed(3));
}

export function lawStatus(law, asOf, art = null) {
  const exc = art ? (law.repealed_exceptions || {})[String(art)] : null;
  const rep = exc || law.repealed;
  const eff = law.effective || '';
  if (rep && DATE_RE.test(rep) && rep <= asOf) return ['repealed', `已于 ${rep} 失效（${law.repealed_by || ''}）`];
  if (DATE_RE.test(eff) && eff > asOf) return ['not_yet', `生效日 ${eff} 晚于核验基准日 ${asOf}`];
  return ['in_force', ''];
}

export function contentCheckable(law, art) {
  const cc = law.content_current === undefined ? true : law.content_current;
  if (cc === false) return [false, law.version_note || '缓存为非现行版本'];
  if (cc === 'partial' && String(art) in (law.amended_articles || {})) return [false, `第${art}条已被 ${law.amended_articles[String(art)]} 修改，缓存原文非现行`];
  return [true, ''];
}

export function ruleVerdict(c, asOf, corpus) {
  const r = { citation: c.citation, type: c.type, sentence: c.sentence, checks: {} };
  if (c.type === 'case') {
    Object.assign(r, { verdict: 'UNVERIFIABLE', reason: '案号/判决库尚未接入缓存，拒绝判定', evidence: null });
    return [r, null];
  }
  const law = c.law;
  r.article = c.article; r.clause = c.clause ?? null;
  if (!law) {
    Object.assign(r, { verdict: 'UNVERIFIABLE', law: null, law_hint: c.law_hint ?? null,
      reason: '引用的法规不在已缓存官方文本中（或未写明法规名），找不到原文，拒绝判定', evidence: null });
    r.checks.law_in_cache = false;
    return [r, null];
  }
  if (law.stub) {
    const ev = corpus.byId[law.evidence_law] || {};
    Object.assign(r, { law: law.law_id, law_title: law.title, evidence: ev.source_page || ev.source_pdf || null,
      evidence_pdf: ev.source_pdf || null, law_inferred_from_context: Boolean(c.inferred) });
    Object.assign(r.checks, { law_in_cache: 'registry_only', article_exists: null });
    const [st, why] = lawStatus(law, asOf);
    r.checks.in_force = st === 'in_force';
    if (st === 'repealed') {
      Object.assign(r, { verdict: 'NOT_IN_FORCE',
        reason: why + `；证据：${law.evidence_law} 第${law.evidence_article}条原文“${cpSlice(law.evidence_quote || '', 0, 120)}”`,
        original_excerpt: cpSlice((ev.articles || {})[String(law.evidence_article)] || '', 0, 1200) });
    } else {
      Object.assign(r, { verdict: 'UNVERIFIABLE', reason: '该法规仅在失效登记表中、无全文缓存，拒绝判定内容' });
    }
    return [r, null];
  }
  Object.assign(r, { law: law.law_id, law_title: law.title, evidence: law.source_page || law.source_pdf || null,
    evidence_pdf: law.source_pdf || null, translation: Boolean(law.translation), law_inferred_from_context: Boolean(c.inferred) });
  r.checks.law_in_cache = true;
  const arts = law.articles || {}, art = c.article;
  const maxn = law.max_article || Math.max(...Object.keys(arts).map((k) => parseInt(k, 10)));
  if (!(art in arts)) {
    if (parseInt(art, 10) > maxn) {
      r.checks.article_exists = false;
      Object.assign(r, { verdict: 'ARTICLE_NOT_FOUND', reason: `官方文本共 ${maxn} 条，不存在第 ${art} 条` });
    } else {
      r.checks.article_exists = null;
      Object.assign(r, { verdict: 'UNVERIFIABLE', reason: '该条在缓存切分中缺失（扫描件 OCR 问题），需人工查原文' });
    }
    return [r, null];
  }
  r.checks.article_exists = true;
  const [st, why] = lawStatus(law, asOf, art);
  r.checks.in_force = st === 'in_force';
  r.original_excerpt = cpSlice(arts[art], 0, 1200);
  if (st !== 'in_force') {
    Object.assign(r, { verdict: 'NOT_IN_FORCE', reason: why });
    return [r, arts[art]];
  }
  const notes = [];
  if (c.inferred) notes.push('法规由上文推断');
  if (law.translation) notes.push('证据为非官方英译本');
  const [ok, whyCc] = contentCheckable(law, art);
  r.checks.content_checkable = ok;
  if (!ok) {
    Object.assign(r, { verdict: 'UNVERIFIABLE', reason: '条文存在且法律现行，但' + whyCc + '，内容无法核实' + (notes.length ? '；' + notes.join('；') : '') });
    return [r, null];
  }
  let srcText = arts[art];
  let srcScript = scriptOf(cpSlice(srcText, 0, 400));
  // Enhanced mode: a quote in another script than the official text is compared with an official-number
  // translation of the same law when one is bundled (e.g. English quote vs Thai PDPA → unofficial English text).
  if (corpus.enhanced && c.quote && c.quote_lang !== srcScript) {
    const sib = corpus.laws.find((l) => l !== law && l.translation && l.country === law.country && l.number === law.number && (l.articles || {})[art]);
    if (sib && scriptOf(cpSlice(sib.articles[art], 0, 400)) === c.quote_lang) {
      srcText = sib.articles[art]; srcScript = c.quote_lang;
      r.compared_with = sib.law_id; r.translation_excerpt = cpSlice(srcText, 0, 1200);
      notes.push('引文与非官方英译本比对');
    }
  }
  if (c.quote && cpLen(c.quote) < MIN_QUOTE_CHARS) {
    notes.push(`引号内文字过短（<${MIN_QUOTE_CHARS}字符），视为术语而非引文`);
    c = { ...c, quote: null };
  }
  let v, w;
  if (c.quote && c.quote_lang === srcScript) {
    const sc = quoteScore(c.quote, srcText);
    Object.assign(r, { quote: c.quote, quote_score: sc });
    r.checks.quote_score = sc;
    if (sc >= 0.8) [v, w] = ['EXISTS_CONSISTENT', `引文与原文字面匹配率 ${sc}`];
    else if (sc < 0.5) [v, w] = ['CONTENT_MISMATCH', `引文与原文字面匹配率仅 ${sc}`];
    else if (c.quote_from === 'blockquote') [v, w] = ['EXISTS_UNQUOTED', `下一行块引用匹配率 ${sc} 处于灰区，按转述处理`]; // enhanced only
    else [v, w] = ['QUOTE_GRAY', `引文匹配率 ${sc} 处于灰区`];
  } else {
    if (c.quote) notes.push('引文为译文/转述（语言与原文不同），不做字面比对');
    [v, w] = ['EXISTS_UNQUOTED', '条文存在且现行；回答未逐字引用原文'];
  }
  Object.assign(r, { verdict: v, reason: [w, ...notes].join('；') });
  return [r, arts[art]];
}

export function verify(text, { asOf, country = null, corpus } = {}) {
  asOf = asOf || new Date().toISOString().slice(0, 10);
  const results = extract(text, corpus, country).map((c) => {
    const [r] = ruleVerdict(c, asOf, corpus);
    r.rule_verdict = r.verdict;
    return r;
  });
  for (const r of results) if (r.verdict === 'QUOTE_GRAY') { r.verdict = 'UNVERIFIABLE'; r.reason += '，转人工/LLM复核'; }
  return results;
}

export function summarize(results) {
  const by = {};
  for (const r of results) by[r.verdict] = (by[r.verdict] || 0) + 1;
  const sum = (vs) => vs.reduce((s, v) => s + (by[v] || 0), 0);
  return { total: results.length, by_verdict: by, flagged: sum(FLAGGED), passed: sum(PASSED), unverifiable: by.UNVERIFIABLE || 0 };
}
