// DEV-ONLY error analysis (phase 4): categorises missed hallucinations of one country on the 70% dev split.
// Never reads or prints test-split rows. Usage: node eval/analysis/dev-error-analysis.mjs ID|TH|VN
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const C=fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/,'');
const { verify, corpus } = await import(C+'/src/core/index.js');
const { align, makeSplit, HALL } = await import(C+'/eval/metrics.mjs');
const recs = fs.readFileSync(C+'/eval/data/dataset.jsonl','utf8').trim().split('\n').map(JSON.parse);
const splitOf = makeSplit(recs);
const lawById = new Map(corpus.laws.map(l=>[l.law_id,l]));
const cats = {}; const ex = {};
const want = process.argv[2] || 'ID';
for (const r of recs) {
  if (splitOf(r.qid)!=='dev' || r.country!==want) continue;
  const res = verify(r.answer_text,{asOf:r.as_of||'2026-10-18',crossref:true,country:r.country});
  const { pairs } = align(r,res);
  for (const [c,v] of pairs) {
    const g=c.gold?.verdict; if (!HALL.includes(g)) continue;
    if (v && HALL.includes(v.verdict)) { cats.TP=(cats.TP||0)+1; continue; }
    const law = lawById.get(c.gold?.law_id);
    let cat;
    if (!c.gold?.law_id) cat='gold_no_law';
    else if (!law) cat='law_not_in_corpus';
    else if (!v) {
      // was the citation extracted at all with some other law/article?
      const same = res.filter(x=>x.type==='statute' && String(x.article).match(/^\d+/)?.[0]===String(c.article).match(/^\d+/)?.[0]);
      cat = same.length ? 'extracted_wrong_law:'+[...new Set(same.map(x=>x.law||'null'))].join('/') : 'not_extracted';
    } else cat = 'pred_'+v.verdict+'_gold_'+g+(law.stub?'_stub':'');
    const key = cat.replace(/:.*/,'');
    cats[key]=(cats[key]||0)+1;
    (ex[key]=ex[key]||[]).push({aid:r.id,lang:r.lang,law:c.gold.law_id,art:c.article,cl:c.clause,written:c.law_as_written,cat,claim:(c.claim||'').slice(0,140),quote:(c.quoted_text||'').slice(0,100),basis:(c.gold.basis||'').slice(0,160), v: v?{law:v.law,art:v.article,score:v.quote_score,xr:v.crossref?.kind}:null});
  }
}
console.log(JSON.stringify(cats));
fs.writeFileSync(C+'/eval/analysis/dev_misses_'+want+'.json', JSON.stringify(ex,null,1));
