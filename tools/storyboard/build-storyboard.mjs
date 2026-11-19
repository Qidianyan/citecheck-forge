#!/usr/bin/env node
// Offline UI Kit storyboard verifier & preview generator (isolated from web/dist production static site).
// Uses the warm gazette / ink / copper-amber / forest / vermilion palette (zero blue/cyan/purple hues).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { COPY } from '../../src/frontend/copy.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const AS_OF = '2026-11-10';
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

export const MOCK_LABEL = 'Storyboard preview: offline UI Kit layout check (never shipped in web/dist). Icons are Phosphor stand-ins for Atlassian glyphs.';
export const STATE_TITLES = [COPY.loadingVerify, COPY.neverHeader, COPY.noneHeader, COPY.cleanHeader, COPY.errorHeader, COPY.staleHeader];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function icons() {
  const dir = path.join(ROOT, 'web/assets/icons'); const o = {};
  for (const f of fs.readdirSync(dir)) if (f.endsWith('.svg')) o[f.slice(0, -4)] = fs.readFileSync(path.join(dir, f), 'utf8').trim().replace('<svg ', '<svg class="i" aria-hidden="true" focusable="false" ');
  return o;
}

const CSS = `
*{box-sizing:border-box} body{margin:0;font:14px/20px -apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif;color:#1F1D1A;background:#F5F0E6}
.i{width:16px;height:16px;vertical-align:-3px;flex:none} a{color:#7A4B0C;text-decoration:none} a:hover{text-decoration:underline;color:#B3201E}
.top{height:56px;background:#FBF8F1;border-bottom:1px solid #D9D1C1;display:flex;align-items:center;gap:16px;padding:0 20px;font-weight:600}
.top .crumb{color:#5B5750;font-weight:400}
.page{max-width:1100px;margin:0 auto;padding:28px 32px;background:#FBF8F1;min-height:calc(100vh - 56px)}
h1{font:600 28px/32px "Iowan Old Style","Georgia",serif;margin:0 0 8px} h2{font-size:20px;line-height:24px;margin:0 0 12px} h3{font-size:16px;margin:0 0 8px}
.byline{display:flex;gap:12px;align-items:center;color:#5B5750;font-size:12px;margin-bottom:20px;flex-wrap:wrap}
.chip{display:inline-flex;gap:6px;align-items:center;border:1px solid #D9D1C1;border-radius:3px;padding:2px 8px;color:#1F1D1A;background:#FBF8F1;font-size:12px}
.chip.on{border-color:#7A4B0C;box-shadow:0 0 0 1px #7A4B0C}
.loz{display:inline-block;font:700 11px/16px -apple-system,"Segoe UI",sans-serif;text-transform:uppercase;padding:0 4px;border-radius:3px;white-space:nowrap}
.loz.success{background:#ECE8CF;color:#5F5205}.loz.removed{background:#F6DEDA;color:#B3201E}.loz.moved{background:#F6E6CC;color:#7A4B0C}.loz.default{background:#ECE7DD;color:#5B5750}
.pop{position:absolute;width:640px;max-width:calc(100vw - 32px);background:#FBF8F1;border:1px solid #D9D1C1;border-radius:4px;padding:16px}
.panel{border:1px solid #D9D1C1;border-radius:4px;padding:16px;background:#FBF8F1}
.hdr{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:3px;border:1px solid #D9D1C1;background:#EFE8DA;color:#1F1D1A;font:500 14px/1 inherit;cursor:pointer}
.btn.primary{background:#1F1D1A;color:#F5F0E6;border-color:#1F1D1A}.btn.subtle{background:transparent;border-color:transparent}
.row{border-top:1px solid #D9D1C1;padding:10px 0;display:grid;grid-template-columns:150px 1fr;gap:4px 10px}
.row .cite{font-family:ui-monospace,Menlo,monospace;font-weight:600}
.row .law{color:#5B5750;font-size:12px}.row .why{grid-column:2}.row .src{grid-column:2;font-size:12px}
.sugg{grid-column:2;color:#B3201E;font-weight:600}
.msg{display:flex;gap:8px;padding:12px;border-radius:3px;margin:8px 0}.msg.info{background:#EFE8DA}.msg.warn{background:#F6E6CC}.msg.err{background:#F6DEDA}.msg.ok{background:#ECE8CF}
.foot{font-size:12px;color:#5B5750;margin-top:12px}
.mocklabel{position:fixed;left:0;right:0;bottom:0;background:#1F1D1A;color:#F5F0E6;font-size:12px;padding:6px 12px;text-align:center;z-index:9}
.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.modal-back{position:fixed;inset:0;background:rgba(31,29,26,.54);display:flex;align-items:flex-start;justify-content:center;padding-top:60px}
.modal{width:600px;max-width:calc(100vw - 32px);background:#FBF8F1;border-radius:4px;border:1px solid #D9D1C1}
.modal header,.modal footer{padding:20px 24px;display:flex;justify-content:space-between;align-items:center}.modal footer{justify-content:flex-end;gap:8px}
.modal .body{padding:0 24px}
.opt{display:flex;gap:12px;padding:12px;border:1px solid #D9D1C1;border-radius:3px;margin-bottom:8px}.opt.sel{border-color:#7A4B0C;background:#F6E6CC}
.field{margin:12px 0}.field label{display:block;font-size:12px;font-weight:600;color:#5B5750;margin-bottom:4px}
.input{border:1.5px solid #D9D1C1;border-radius:3px;padding:6px 8px;background:#F5F0E6;min-height:36px;display:flex;align-items:center;gap:8px}
.avatar{width:24px;height:24px;border-radius:50%;background:#D9D1C1;display:inline-flex;align-items:center;justify-content:center}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid #D9D1C1;vertical-align:top}th{color:#5B5750;font-size:12px}
.tabs{display:flex;gap:16px;border-bottom:2px solid #D9D1C1;margin-bottom:16px}.tabs span{padding:8px 0}.tabs .on{border-bottom:2px solid #7A4B0C;margin-bottom:-2px;color:#7A4B0C;font-weight:600}
.jira{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:24px}.side dl{display:grid;grid-template-columns:110px 1fr;gap:8px;font-size:13px}.side dt{color:#5B5750}
@media (max-width:760px){.grid,.jira{grid-template-columns:1fr}.pop{position:static}}
`;

function page(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} (storyboard)</title><style>${CSS}</style></head><body>${body}<div class="mocklabel" role="note">${esc(MOCK_LABEL)}</div></body></html>`;
}

function rowsHtml(vm, I) {
  return vm.rows.map((r) => {
    const tone = /does not exist|Misquoted|Not in force/.test(r.verdictLabel) ? 'removed' : r.verdictLabel === 'Unverifiable' ? 'default' : 'success';
    return `<div class="row"><span><span class="loz ${tone}">${esc(r.suggestedArticle ? 'Misattributed' : (r.verdictLabel.startsWith('Exists') ? 'Exists' : r.verdictLabel))}</span></span><div><span class="cite">${esc(r.citation)}</span> <span class="law">${esc(r.lawLabel)}</span>${r.types ? ` <span class="loz default">${esc(r.types)}</span>` : ''}</div>
<div class="why">${esc(r.reason)}</div>${r.suggestedArticle ? `<div class="sugg">Did you mean Article ${esc(r.suggestedArticle)}?</div>` : ''}${r.sourceUrl ? `<div class="src"><a href="${esc(r.sourceUrl)}">Official source ${I['arrow-square-out']}</a></div>` : ''}</div>`;
  }).join('');
}

function panelHeader(vm, I, { title = 'CiteCheck' } = {}) {
  return `<div class="hdr"><div style="display:flex;gap:8px;align-items:center">${I['seal-check']}<strong>${esc(title)}</strong><span class="loz ${vm.chipAppearance}">${esc(vm.chipText)}</span></div>
<div style="display:flex;gap:8px"><button class="btn subtle">${I['arrow-clockwise']}${esc(COPY.checkAgain)}</button><button class="btn primary">${I['share-network']}${esc(COPY.share)}</button></div></div>`;
}

export async function buildStoryboard({ outDir } = {}) {
  const OUT = outDir || fs.mkdtempSync(path.join(os.tmpdir(), 'citecheck-storyboard-'));
  const core = await imp('src/core/index.js');
  const rep = await imp('src/handlers/report.js');
  const { toViewModel } = await imp('src/frontend/viewModel.js');
  const I = icons();
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  const check = (file) => {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const report = rep.buildReport(core.verify(text, { asOf: AS_OF, crossref: true }), { asOf: AS_OF, verifiedAt: `${AS_OF}T09:30:00Z` });
    return { report, vm: toViewModel(report, { product: file.includes('LEGAL') ? 'jira' : 'confluence' }) };
  };
  const memo = check('demo/demo_memo_v2_en.txt');
  const jira = check('demo/LEGAL-12_jira_issue.md');
  const footer = (vm) => `<div class="foot">${esc(vm.footer.replace('T09:30:00Z', ' 09:30 UTC'))}. Verdicts are deterministic; anything unverifiable goes to a person.</div>`;
  const pages = {};

  pages['byline-flagged.html'] = page('Confluence byline', `<div class="top">Confluence <span class="crumb">/ Legal / Memos</span></div>
<div class="page" style="position:relative"><h1>Data retention memo</h1>
<div class="byline"><span>Owned by Legal Ops</span><span>Last updated 10 Nov 2026</span><span class="chip on">${I['seal-warning']}CiteCheck: ${memo.report.summary.flagged} flagged</span></div>
<div class="pop" style="top:120px;left:32px" role="dialog" aria-label="CiteCheck report">${panelHeader(memo.vm, I)}
<div class="msg warn">${I['warning']}<div><strong>${memo.report.summary.flagged} citations need a fix before this page is approved.</strong> Start with the flagged rows; each one links to the official text.</div></div>
${rowsHtml(memo.vm, I)}${footer(memo.vm)}</div></div>`);

  pages['panel-jira.html'] = page('Jira issue panel', `<div class="top">Jira <span class="crumb">/ LEGAL / LEGAL-12</span></div>
<div class="page"><div class="jira"><div><h1>Verify AI-drafted citations in the Thailand launch memo</h1>
<p>AI-drafted citations to check before the Q1 launch.</p>
<div class="panel">${panelHeader(jira.vm, I)}${rowsHtml(jira.vm, I)}${footer(jira.vm)}</div></div>
<aside class="side"><dl><dt>Status</dt><dd><span class="loz default">In review</span></dd><dt>Assignee</dt><dd><span class="avatar">${I['user-circle']}</span> Unassigned</dd><dt>Labels</dt><dd><span class="loz default">legal-review</span></dd></dl></aside></div></div>`);

  pages['share-modal.html'] = page('Share report', `<div class="top">Jira <span class="crumb">/ LEGAL / LEGAL-12</span></div><div class="page"></div>
<div class="modal-back"><div class="modal" role="dialog" aria-labelledby="mt"><header><h2 id="mt" style="margin:0">${esc(COPY.shareModal.title)}</h2><button class="btn subtle" aria-label="Close">${I['x']}</button></header>
<div class="body">
<div class="opt">${I['chat-circle-text']}<div><strong>Post as a comment</strong><br><span class="law">Adds the report as a comment and the legal-review label.</span></div></div>
<div class="opt" aria-disabled="true" style="opacity:.6">${I['file-text']}<div><strong>Publish as a page</strong><br><span class="law">Available on Confluence pages: creates a child page "Citation check: &lt;title&gt;: &lt;date&gt;" for sign-off.</span></div></div>
<div class="opt sel">${I['paper-plane-tilt']}<div style="flex:1"><strong>Forward to a teammate</strong><br><span class="law">Mentions them in a comment. Atlassian sends the notification; CiteCheck never emails anyone.</span>
<div class="field"><label>Teammate</label><div class="input"><span class="avatar">${I['user-circle']}</span>Alex Reviewer</div></div>
<div class="field"><label>Note (optional, max 500 characters, not stored)</label><div class="input" style="min-height:56px">Please confirm Section 99 before Friday's launch review.</div></div>
<div class="field"><label><input type="checkbox" checked> Also assign LEGAL-12 to Alex Reviewer</label></div>
<div class="msg info">${I['info']}<div>This will add a comment on LEGAL-12 mentioning <strong>Alex Reviewer</strong> with the report (1 flagged), and assign the work item to them.</div></div></div></div>
<div class="opt">${I['markdown-logo']}<div><strong>Copy Markdown or link</strong><br><span class="law">Paste the report into e-mail, chat or a ticket.</span></div></div>
</div><footer><button class="btn subtle">Cancel</button><button class="btn primary">Forward and assign</button></footer></div></div>`);

  const st = (t, tone, icon, body, action) => `<div class="panel"><div class="hdr"><div style="display:flex;gap:8px;align-items:center">${I['seal-check']}<strong>CiteCheck</strong></div></div><div class="msg ${tone}">${I[icon]}<div><strong>${esc(t)}</strong><br>${esc(body)}</div></div>${action ? `<button class="btn${action.primary ? ' primary' : ''}">${esc(action.label)}</button>` : ''}</div>`;
  pages['states.html'] = page('Panel states', `<div class="top">CiteCheck panel states</div><div class="page"><h1>Panel states</h1><div class="grid">
${st(STATE_TITLES[0], 'info', 'arrow-clockwise', 'Reading the page and matching each citation against the official text. This usually takes under a second.')}
${st(STATE_TITLES[1], 'info', 'info', COPY.neverBody, { label: COPY.neverAction, primary: true })}
${st(STATE_TITLES[2], 'info', 'magnifying-glass', COPY.noneBody)}
${st(STATE_TITLES[3], 'ok', 'seal-check', '5 citations match the official text and are in force on 2026-11-10.', { label: 'Share report' })}
${st(STATE_TITLES[4], 'err', 'warning-circle', COPY.errors.FORBIDDEN, { label: COPY.tryAgain })}
${st(STATE_TITLES[5], 'warn', 'clock-counter-clockwise', COPY.staleBody, { label: COPY.checkAgain, primary: true })}
</div></div>`);

  const audit = [
    ['2026-11-10 09:30', 'verify', 'Data retention memo', '11 citations, 4 flagged'],
    ['2026-11-10 09:31', 'share:page', 'Data retention memo', 'Published child page'],
    ['2026-11-10 09:40', 'verify', 'LEGAL-12', '3 citations, 1 flagged'],
    ['2026-11-10 09:42', 'share:forward', 'LEGAL-12', 'Forwarded with assignment (recipient and note not stored)'],
    ['2026-11-10 09:45', 'share:export', 'LEGAL-12', 'Markdown copied'],
  ];
  pages['admin.html'] = page('Admin', `<div class="top">Confluence <span class="crumb">/ Settings / CiteCheck</span></div><div class="page"><h1>CiteCheck</h1>
<div class="tabs"><span class="on">Organisation sources</span><span>Audit trail</span></div>
<p>Register Confluence pages (policies, clause libraries) as sources. Citations like "Policy POL-7 §3" are checked against them, including H3 misattribution and H5 archived-policy checks.</p>
<table><thead><tr><th>Code</th><th>Page</th><th>Sections</th><th>Last refreshed</th><th></th></tr></thead><tbody>
<tr><td class="cite">POL-7</td><td><a href="#">POL-7 Data Retention Policy</a></td><td>8</td><td>2026-11-10 09:12</td><td><button class="btn subtle">Refresh</button> <button class="btn subtle">Remove</button></td></tr></tbody></table>
<div style="margin:12px 0"><button class="btn primary">${I['upload-simple']}Register a page</button></div>
<h2 style="margin-top:32px">Audit trail</h2>
<table><thead><tr><th>Time (UTC)</th><th>Event</th><th>Content</th><th>Result</th></tr></thead><tbody>
${audit.map((a) => `<tr><td>${a[0]}</td><td><span class="loz default">${a[1]}</span></td><td>${esc(a[2])}</td><td>${esc(a[3])}</td></tr>`).join('')}
</tbody></table><div style="margin-top:12px"><button class="btn">${I['download-simple']}Export CSV</button></div></div>`);

  pages['index.html'] = page('Storyboard previews', `<div class="top">CiteCheck: UI Kit storyboard</div><div class="page"><h1>Offline UI Kit layout storyboard</h1>
<p>Built from real verifier output on the demo data. Isolated from web/dist production deployment.</p><ul>
<li><a href="byline-flagged.html">Confluence byline popup (flagged)</a></li><li><a href="panel-jira.html">Jira issue panel (LEGAL-12)</a></li>
<li><a href="share-modal.html">Share dialog: forward to a teammate</a></li><li><a href="states.html">Panel states</a></li><li><a href="admin.html">Admin: organisation sources and audit</a></li></ul></div>`);

  for (const [f, html] of Object.entries(pages)) fs.writeFileSync(path.join(OUT, f), html);
  return { out: OUT, memo, jira, pages: Object.keys(pages), css: CSS };
}
export { buildStoryboard as buildMocks };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildStoryboard().then((r) => console.log(`storyboard: ${r.pages.length} pages -> ${r.out}`)).catch((e) => { console.error(e); process.exit(1); });
}
