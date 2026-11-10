// Task F tests: fresh held-out set generator, scorer (fake verifyFn only), and CLIs.
// No @forge/* imports; no network; the real verifier is never run on generated items.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { corpus, lawStatus } from '../src/core/index.js';
import { buildFresh, computeUsed, VERDICT_BY_TYPE, AS_OF, artKey } from '../eval/fresh/make-fresh.mjs';
import { scoreFresh } from '../eval/fresh/score-fresh.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loadRecs = () => fs.readFileSync(path.join(ROOT, 'eval/data/dataset.jsonl'), 'utf8')
  .split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const loadZh = () => {
  const para = JSON.parse(fs.readFileSync(path.join(ROOT, 'eval/fresh/zh_paraphrases.json'), 'utf8'));
  const inp = JSON.parse(fs.readFileSync(path.join(ROOT, 'eval/fresh/zh_input.json'), 'utf8'));
  const byId = new Map(inp.map((x) => [x.id, x]));
  return para.map((p) => (byId.get(p.id) ? { ...byId.get(p.id), text: p.zh ?? p.text } : null)).filter(Boolean);
};

let cache;
const fresh = () => cache ??= buildFresh({ corpus, recs: loadRecs(), zh: loadZh() });

const DIG = /[0-9]+|[๐-๙]+/u;
const QUOTE_RE = /"([^"]{60,240})"/u;

test('determinism: same seed produces identical output', () => {
  const a = buildFresh({ corpus, recs: loadRecs(), zh: loadZh(), seed: 'fresh-2026-11' });
  const b = buildFresh({ corpus, recs: loadRecs(), zh: loadZh(), seed: 'fresh-2026-11' });
  assert.deepStrictEqual(a, b);
});

test('determinism: a different seed produces a different selection', () => {
  const a = fresh();
  const b = buildFresh({ corpus, recs: loadRecs(), zh: loadZh(), seed: 'fresh-2026-12' });
  const sig = (xs) => JSON.stringify(xs.map((i) => [i.law_id, i.article, i.type]).sort());
  assert.notEqual(sig(a), sig(b));
});

test('untouched articles: neither the cited article nor the content-source article is used in dataset.jsonl', () => {
  const used = computeUsed(loadRecs());
  for (const it of fresh()) {
    assert.equal(used.has(`${it.law_id}|${artKey(it.article)}`), false, `${it.id} cites a used article`);
    const src = it.source.cited_article_text_from;
    if (src) {
      const [lid, art] = src.split('#');
      assert.equal(used.has(`${lid}|${artKey(art)}`), false, `${it.id} content comes from a used article`);
    }
  }
});

test('every type present with zh; ZH types skipped when zh is missing', () => {
  const types = new Set(fresh().map((i) => i.type));
  for (const t of ['C_QUOTE', 'C_CLAIM', 'H3_CLAIM', 'H4_QUOTE', 'H1_ARTICLE', 'H7_NUMBER', 'H5_REPEALED', 'ZH_SAME', 'ZH_H3']) {
    assert.ok(types.has(t), `missing type ${t}`);
  }
  const noZh = buildFresh({ corpus, recs: loadRecs(), zh: undefined });
  assert.ok(noZh.length > 0);
  assert.ok(noZh.every((i) => !i.type.startsWith('ZH')));
  const noZhTypes = new Set(noZh.map((i) => i.type));
  for (const t of ['C_QUOTE', 'C_CLAIM', 'H3_CLAIM', 'H4_QUOTE', 'H1_ARTICLE', 'H7_NUMBER', 'H5_REPEALED']) {
    assert.ok(noZhTypes.has(t), `missing type ${t} without zh`);
  }
});

test('country balance: per-country counts within ±30% of each other, total near 300', () => {
  const items = fresh();
  const by = {};
  for (const i of items) by[i.country] = (by[i.country] || 0) + 1;
  const counts = Object.values(by);
  assert.ok(items.length > 250 && items.length < 360, `expected ~300 items, got ${items.length}`);
  assert.ok(Math.max(...counts) / Math.min(...counts) <= 1.3, `imbalanced: ${JSON.stringify(by)}`);
});

test('expected labels are consistent with the item type', () => {
  for (const it of fresh()) {
    const [verdict, flagged, types] = VERDICT_BY_TYPE[it.type];
    assert.equal(it.expected.verdict, verdict, `${it.id} verdict`);
    assert.equal(it.expected.flagged, flagged, `${it.id} flagged`);
    assert.deepStrictEqual(it.expected.types, types, `${it.id} types`);
  }
});

test('H1 numbers exceed max_article and stay untouched', () => {
  const used = computeUsed(loadRecs());
  for (const it of fresh().filter((i) => i.type === 'H1_ARTICLE')) {
    const law = corpus.byId[it.law_id];
    const maxn = law.max_article || Math.max(...Object.keys(law.articles).map(Number));
    assert.ok(Number(it.article) > maxn, `${it.id} article ${it.article} not > max ${maxn}`);
    assert.equal(used.has(`${it.law_id}|${it.article}`), false, `${it.id} H1 number is used`);
  }
});

test('H7: changed number absent from the original article text and span is not verbatim', () => {
  for (const it of fresh().filter((i) => i.type === 'H7_NUMBER')) {
    const q = QUOTE_RE.exec(it.text);
    assert.ok(q, `${it.id} has no quoted span`);
    const at = corpus.byId[it.law_id].articles[it.article];
    const num = DIG.exec(q[1]);
    assert.ok(num, `${it.id} quote has no number`);
    assert.ok(!new RegExp(`(?<!\\d)${num[0]}(?!\\d)`, 'u').test(at), `${it.id} changed number present in original text`);
    assert.ok(!at.includes(q[1]), `${it.id} quote is verbatim`);
  }
});

test('C_QUOTE and H4_QUOTE quotes are verbatim spans of the source article', () => {
  for (const it of fresh()) {
    if (it.type !== 'C_QUOTE' && it.type !== 'H4_QUOTE') continue;
    const q = QUOTE_RE.exec(it.text);
    assert.ok(q, `${it.id} has no quoted span`);
    const [lid, art] = it.source.cited_article_text_from.split('#');
    // verbatim modulo the PDF's hard line breaks (whitespace collapsed), as the verifier also normalises whitespace
    const at = corpus.byId[lid].articles[art].split('\n').map((x) => x.trim()).filter(Boolean).join(' ').replace(/\s+/gu, ' ');
    assert.ok(at.includes(q[1]), `${it.id} quote is not verbatim`);
    assert.ok(q[1].length >= 60 && q[1].length <= 240, `${it.id} span length out of range`);
  }
});

test('Thai-digit TH items exist (about half of TH items)', () => {
  const th = fresh().filter((i) => i.country === 'TH');
  assert.ok(th.length > 0);
  const mention = (t) => {
    const m = /มาตรา\s*([0-9๐-๙]+)/u.exec(t);
    return m ? m[1] : '';
  };
  const withThai = th.filter((i) => /[๐-๙]/u.test(mention(i.text)));
  const share = withThai.length / th.length;
  assert.ok(withThai.length >= 10, 'no Thai-digit items');
  assert.ok(share > 0.25 && share < 0.75, `Thai-digit share ${share} not ~half`);
});

test('scoreFresh with a FAKE verifyFn computes the right P/R, treats missing rows as not flagged, and takes the most severe verdict', async () => {
  const opts = [];
  const FLAG_ARTS = new Set([2, 3, 5, 8]);
  const fakeVerify = async (text, o) => {
    opts.push(o);
    const m = /\[\[(\d+)\]\]/u.exec(text);
    if (!m) return [];
    const n = Number(m[1]);
    const rows = [{ law: 'LAW-1', article: String(n), verdict: FLAG_ARTS.has(n) ? 'CONTENT_MISMATCH' : 'EXISTS_CONSISTENT' }];
    if (n === 8) rows.push({ law: 'LAW-1', article: '8', verdict: 'ARTICLE_NOT_FOUND' }); // most severe wins
    return rows;
  };
  const mk = (n, flagged, text) => ({
    id: `X${n}`, type: 'T', country: 'VN', lang: 'vi', law_id: 'LAW-1', article: String(n),
    as_of: AS_OF, text: text ?? `cite [[${n}]]`,
    expected: { verdict: flagged ? 'ARTICLE_NOT_FOUND' : 'EXISTS_CONSISTENT', flagged, types: flagged ? ['H1'] : [] },
    source: { cited_article_text_from: null },
  });
  // positives 1,3,5,7,9 ; fake flags 2,3,5,8 ; item 9 gets no result row -> not flagged
  const items = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => mk(n, n % 2 === 1));
  items.push(mk(9, true, 'no citation here at all'));
  const r = await scoreFresh(items, fakeVerify);
  assert.equal(r.overall.n, 9);
  assert.equal(r.overall.n_positive, 5);
  assert.equal(r.overall.tp, 2);
  assert.equal(r.overall.fp, 2);
  assert.equal(r.overall.fn, 3);
  assert.equal(r.overall.precision, 0.5);
  assert.equal(r.overall.recall, 2 / 5);
  assert.equal(r.overall.f1, (2 * 0.5 * 0.4) / 0.9);
  // most-severe rule: article 8 is negative but two rows -> ARTICLE_NOT_FOUND wins -> counted as fp above
  const row8 = r.rows.find((x) => x.id === 'X8');
  assert.equal(row8.pred_verdict, 'ARTICLE_NOT_FOUND');
  assert.equal(row8.predFlagged, true);
  // missing row (no [[n]] match) counts as not flagged: verified by X-none; here opts check
  assert.ok(opts.every((o) => o.asOf === AS_OF && o.country === 'VN' && o.crossref === true));
  // groups
  assert.equal(r.by_type.T.n, 9);
  assert.equal(r.by_country.VN.n, 9);
  assert.equal(r.by_lang.vi.n, 9);
});

test('make-fresh CLI writes fresh.jsonl and fresh_stats.json (no precision/recall output)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-cli-'));
  const out = execFileSync(process.execPath, [path.join(ROOT, 'eval/fresh/make-fresh.mjs'), '--out-dir', tmp], { encoding: 'utf8' });
  const jsonl = fs.readFileSync(path.join(tmp, 'fresh.jsonl'), 'utf8');
  const stats = JSON.parse(fs.readFileSync(path.join(tmp, 'fresh_stats.json'), 'utf8'));
  const lines = jsonl.split('\n').filter((l) => l.trim());
  assert.ok(lines.length > 250, 'CLI produced too few items');
  assert.equal(stats.total, lines.length);
  assert.ok(!/precision|recall/i.test(out + JSON.stringify(stats)), 'CLI must not print or compute P/R');
  assert.ok(lines.every((l) => JSON.parse(l).as_of === AS_OF));
});

test('committed fresh.jsonl is reproducible by the CLI', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-cli-'));
  execFileSync(process.execPath, [path.join(ROOT, 'eval/fresh/make-fresh.mjs'), '--out-dir', tmp], { encoding: 'utf8' });
  const committed = fs.readFileSync(path.join(ROOT, 'eval/fresh/fresh.jsonl'), 'utf8');
  const regenerated = fs.readFileSync(path.join(tmp, 'fresh.jsonl'), 'utf8');
  assert.equal(regenerated, committed);
});

test('per-(law, type) cap of 6 and local article formats', () => {
  const cap = new Map();
  for (const it of fresh()) {
    const k = `${it.law_id}|${it.type}`;
    cap.set(k, (cap.get(k) || 0) + 1);
  }
  assert.ok(Math.max(...cap.values()) <= 6);
  for (const it of fresh()) {
    if (it.lang === 'zh') assert.ok(new RegExp(`第${it.article}条`).test(it.text), `${it.id} zh format`);
    else if (it.country === 'VN') assert.ok(new RegExp(`Điều\\s+${it.article}(?!\\d)`).test(it.text), `${it.id} VN format`);
    else if (it.country === 'ID') assert.ok(new RegExp(`Pasal\\s+${it.article}(?!\\d)`).test(it.text), `${it.id} ID format`);
    else {
      const m = /มาตรา\s*([0-9๐-๙]+)/u.exec(it.text);
      assert.ok(m, `${it.id} TH format`);
      const thai = /[๐-๙]/u.test(m[1]);
      const n = thai ? m[1].replace(/[๐-๙]/g, (c) => '๐๑๒๓๔๕๖๗๘๙'.indexOf(c)) : m[1];
      assert.equal(n, it.article, `${it.id} TH article number mismatch`);
    }
  }
});

test('item schema conformance', () => {
  const LAWS = new Set(Object.keys(corpus.byId));
  for (const it of fresh()) {
    assert.deepEqual(Object.keys(it), ['id', 'type', 'country', 'lang', 'law_id', 'article', 'as_of', 'text', 'expected', 'source']);
    assert.equal(it.as_of, AS_OF);
    assert.ok(LAWS.has(it.law_id), `${it.id} unknown law`);
    assert.ok(['vi', 'id', 'th', 'zh'].includes(it.lang), `${it.id} lang`);
    assert.ok(typeof it.text === 'string' && it.text.length > 0);
    assert.ok((it.text.match(/\n/g) || []).length <= 2, `${it.id} more than 3 lines`);
    assert.equal(typeof it.expected.flagged, 'boolean');
    assert.ok(Array.isArray(it.expected.types));
    assert.equal(corpus.byId[it.law_id].articles[it.article] !== undefined || it.type === 'H1_ARTICLE', true, `${it.id} article not in corpus`);
    if (it.type === 'H5_REPEALED') assert.notEqual(lawStatus(corpus.byId[it.law_id], AS_OF)[0], 'in_force');
  }
});
