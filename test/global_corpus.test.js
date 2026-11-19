// Global flagship statutory pack tests: EU GDPR (Regulation (EU) 2016/679), EU AI Act (Regulation (EU) 2024/1689),
// and US Federal Rules of Civil Procedure (FRCP Rules 1–86 incl. Rule 11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { corpus, verify, enrich } from '../src/core/index.js';
import { createActions } from '../src/handlers/actions.js';

const AS_OF = '2026-11-18';

test('corpus ships full authentic English texts for GDPR (99 articles), EU AI Act (113 articles), and US FRCP (86 rules)', () => {
  const gdpr = corpus.byId['EU-GDPR-2016-679'];
  const aiAct = corpus.byId['EU-AI-ACT-2024-1689'];
  const frcp = corpus.byId['US-FRCP'];

  assert.ok(gdpr && aiAct && frcp);
  assert.equal(Object.keys(gdpr.articles).length, 99);
  assert.equal(Object.keys(aiAct.articles).length, 113);
  assert.equal(Object.keys(frcp.articles).length, 86);

  for (const k of ['5', '6', '17', '28', '32', '33', '34', '83']) {
    assert.ok(gdpr.articles[k] && gdpr.articles[k].length > 200, `GDPR Article ${k}`);
  }
  for (const k of ['5', '6', '9', '10', '11', '12', '13', '14', '15', '50', '99']) {
    assert.ok(aiAct.articles[k] && aiAct.articles[k].length > 200, `EU AI Act Article ${k}`);
  }
  assert.match(frcp.articles['11'], /Signing Pleadings, Motions, and Other Papers/i);
  assert.match(frcp.articles['11'], /warranted by existing law or by a nonfrivolous argument/i);
});

test('GDPR Article 33: verifies 72-hour breach quote, flags H3 when cited under Article 5, flags H7 on wrong deadline, flags H1 on Art 105', () => {
  // Exact quote match (EXISTS_CONSISTENT)
  const [okQuote] = verify(
    'GDPR Article 33: "In the case of a personal data breach, the controller shall without undue delay and, where feasible, not later than 72 hours after having become aware of it, notify the personal data breach"',
    { asOf: AS_OF, crossref: true },
  ).map(enrich);
  assert.equal(okQuote.law, 'EU-GDPR-2016-679');
  assert.equal(okQuote.article, '33');
  assert.equal(okQuote.verdict, 'EXISTS_CONSISTENT');
  assert.ok(okQuote.quote_score >= 0.9);

  // H3 misattribution: 72-hour supervisory notification cited under GDPR Article 5 -> redirects to Article 33
  const [h3] = verify(
    'Under GDPR Article 5, in the case of a personal data breach, the controller must notify the personal data breach to the supervisory authority not later than 72 hours after becoming aware of it.',
    { asOf: AS_OF, crossref: true },
  ).map(enrich);
  assert.equal(h3.law, 'EU-GDPR-2016-679');
  assert.equal(h3.verdict, 'CONTENT_MISMATCH');
  assert.deepEqual(h3.hallucination_types, ['H3']);
  assert.equal(h3.crossref.suggested_article, '33');

  // H7 numeric deadline mismatch: 7 days / 96 hours vs official 72 hours
  const [h7Adv] = verify(
    'Under GDPR Article 33, breach notification to the supervisory authority may wait 96 hours after discovery.',
    { asOf: AS_OF, crossref: true },
  ).map(enrich);
  assert.equal(h7Adv.verdict, 'EXISTS_UNQUOTED');
  assert.ok(h7Adv.advisories?.some((a) => a.message_en.includes('96') && a.message_en.includes('72')));

  // H7 numeric fine mismatch on GDPR Article 83 (EUR currency support)
  const [h7Fine] = verify(
    'Under Article 83 of Regulation (EU) 2016/679, administrative fines reach 50,000,000 EUR.',
    { asOf: AS_OF, crossref: true, crossrefOptions: { numbers: 'flag' } },
  ).map(enrich);
  assert.equal(h7Fine.verdict, 'CONTENT_MISMATCH');
  assert.deepEqual(h7Fine.hallucination_types, ['H7']);

  // H1 non-existent article (GDPR ends at Article 99)
  const [h1] = verify('GDPR Article 105 creates a private criminal prosecution right.', { asOf: AS_OF, crossref: true }).map(enrich);
  assert.equal(h1.verdict, 'ARTICLE_NOT_FOUND');
  assert.deepEqual(h1.hallucination_types, ['H1']);

  // H5 temporal check before GDPR took effect on 2018-05-25
  const [h5] = verify('GDPR Article 33 applied to incidents in 2017.', { asOf: '2017-06-01', crossref: true }).map(enrich);
  assert.equal(h5.verdict, 'NOT_IN_FORCE');
  assert.deepEqual(h5.hallucination_types, ['H5']);
});

test('EU AI Act (Regulation (EU) 2024/1689): verifies Art 5/6/9-15/50/99, catches H3 misattribution & H1/H5', () => {
  const [art5] = verify(
    'EU AI Act Article 5: "The following AI practices shall be prohibited: the placing on the market, the putting into service or the use of an AI system that deploys subliminal techniques beyond a person’s consciousness"',
    { asOf: AS_OF, crossref: true },
  ).map(enrich);
  assert.equal(art5.law, 'EU-AI-ACT-2024-1689');
  assert.equal(art5.verdict, 'EXISTS_CONSISTENT');

  // H3: High-risk AI risk management lifecycle (Article 9) wrongly attributed to Article 5
  const [h3] = verify(
    'Under EU AI Act Article 5, a risk management system shall be established, implemented, documented and maintained in relation to high-risk AI systems throughout the entire lifecycle.',
    { asOf: AS_OF, crossref: true },
  ).map(enrich);
  assert.equal(h3.law, 'EU-AI-ACT-2024-1689');
  assert.equal(h3.verdict, 'CONTENT_MISMATCH');
  assert.deepEqual(h3.hallucination_types, ['H3']);
  assert.equal(h3.crossref.suggested_article, '9');

  // Range expansion on high-risk obligations Articles 9 to 15
  const range = verify('Articles 9 to 15 of Regulation (EU) 2024/1689 govern high-risk AI system requirements.', { asOf: AS_OF, crossref: true });
  assert.equal(range.length, 7);
  assert.ok(range.every((r) => r.law === 'EU-AI-ACT-2024-1689' && r.verdict === 'EXISTS_UNQUOTED'));

  // H1 beyond Article 113 & H5 before entry into force (2024-08-01)
  const [h1] = verify('EU AI Act Article 125 bans open-source weights.', { asOf: AS_OF, crossref: true }).map(enrich);
  assert.equal(h1.verdict, 'ARTICLE_NOT_FOUND');
  assert.deepEqual(h1.hallucination_types, ['H1']);

  const [h5] = verify('EU AI Act Article 5 applied in May 2024.', { asOf: '2024-05-01', crossref: true }).map(enrich);
  assert.equal(h5.verdict, 'NOT_IN_FORCE');
  assert.deepEqual(h5.hallucination_types, ['H5']);
});

test('US FRCP Rule 11: supports "FRCP Rule 11", "Rule 11 of the Federal Rules of Civil Procedure" and "Fed. R. Civ. P. 11", plus H1/H3/H5', () => {
  for (const expr of [
    'FRCP Rule 11: "Every pleading, written motion, and other paper must be signed by at least one attorney of record in the attorney\'s name"',
    'Rule 11 of the Federal Rules of Civil Procedure: "Every pleading, written motion, and other paper must be signed by at least one attorney of record in the attorney\'s name"',
    'Fed. R. Civ. P. 11: "Every pleading, written motion, and other paper must be signed by at least one attorney of record in the attorney\'s name"',
  ]) {
    const [r] = verify(expr, { asOf: AS_OF, crossref: true }).map(enrich);
    assert.equal(r.law, 'US-FRCP', expr);
    assert.equal(r.article, '11', expr);
    assert.equal(r.verdict, 'EXISTS_CONSISTENT', expr);
  }

  // H5 abrogated Rule 84 (abrogated Dec 1, 2015)
  const [abrogated] = verify('Under FRCP Rule 84, the forms in the Appendix suffice under these rules.', { asOf: AS_OF, crossref: true }).map(enrich);
  assert.equal(abrogated.law, 'US-FRCP');
  assert.equal(abrogated.verdict, 'NOT_IN_FORCE');
  assert.deepEqual(abrogated.hallucination_types, ['H5']);

  // H1 non-existent Rule 99
  const [missing] = verify('FRCP Rule 99 requires mandatory AI watermarking on court exhibits.', { asOf: AS_OF, crossref: true }).map(enrich);
  assert.equal(missing.law, 'US-FRCP');
  assert.equal(missing.verdict, 'ARTICLE_NOT_FOUND');
  assert.deepEqual(missing.hallucination_types, ['H1']);

  // Chinese references to EU GDPR, EU AI Act, and US FRCP
  const zh = verify([
    '根据欧盟《通用数据保护条例》第33条，控制者应在72小时内向监管机构通报个人数据泄露。',
    '根据欧盟《人工智能法案》第5条，禁止部署潜意识操纵系统。',
    '根据美国《联邦民事诉讼规则》第11条，律师向法院提交诉状须经合理核查。',
  ].join('\n'), { asOf: AS_OF, crossref: true });
  assert.deepEqual(zh.map((r) => [r.law, r.article, r.verdict]), [
    ['EU-GDPR-2016-679', '33', 'EXISTS_UNQUOTED'],
    ['EU-AI-ACT-2024-1689', '5', 'EXISTS_UNQUOTED'],
    ['US-FRCP', '11', 'EXISTS_UNQUOTED'],
  ]);
});

test('Rovo verifyCitation action handles GDPR Article 33, EU AI Act Article 5, and FRCP Rule 11 in sub-second latency', async () => {
  const acts = createActions({ now: () => new Date('2026-11-18T12:00:00Z') });
  const t0 = performance.now();
  const out = await acts.verifyCitation({
    citation: 'GDPR Article 33',
    quote: 'In the case of a personal data breach, the controller shall without undue delay and, where feasible, not later than 72 hours after having become aware of it, notify the personal data breach',
    asOf: AS_OF,
  });
  const elapsedMs = performance.now() - t0;
  assert.ok(elapsedMs < 250, `expected sub-250ms deterministic check, got ${elapsedMs.toFixed(1)}ms`);
  assert.equal(out.results[0].law, 'EU-GDPR-2016-679');
  assert.equal(out.results[0].verdict, 'EXISTS_CONSISTENT');
});
