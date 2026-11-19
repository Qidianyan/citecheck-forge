#!/usr/bin/env node
// Build the static web companion into web/dist/. Plain Node, no dependencies.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WEB = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(WEB, '..');
const SRC = path.join(WEB, 'src');
const DIST = path.join(WEB, 'dist');
const AS_OF = '2026-11-10';
const NODE_BUILTIN_RE = /^\s*import\s[^'"]*['"](node:|fs['"]|path['"]|crypto['"]|os['"]|child_process|http['"]|https['"]|url['"])/m;

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
function copy(from, to) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); }

export function loadIcons() {
  const dir = path.join(WEB, 'assets', 'icons');
  const icons = {};
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.svg')) continue;
    icons[f.slice(0, -4)] = fs.readFileSync(path.join(dir, f), 'utf8').trim()
      .replace('<svg ', '<svg class="ico" aria-hidden="true" focusable="false" ');
  }
  return icons;
}

export function inlineIcons(html, icons) {
  return html.replace(/<i data-icon="([a-z0-9-]+)"><\/i>/g, (m, name) => {
    if (!icons[name]) throw new Error(`unknown icon ${name}`);
    return icons[name];
  });
}

export async function build({ quiet = false } = {}) {
  rmrf(DIST);
  fs.mkdirSync(DIST, { recursive: true });
  const icons = loadIcons();

  // 1. verifier core + corpus + report renderer, keeping relative import paths
  const coreFiles = fs.readdirSync(path.join(ROOT, 'src/core')).filter((f) => f.endsWith('.js'));
  const shipped = [
    ...coreFiles.map((f) => `src/core/${f}`),
    'src/corpus/laws.js', 'src/corpus/aliases_en.js', 'src/handlers/report.js',
  ];
  for (const rel of shipped) {
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    if (NODE_BUILTIN_RE.test(code)) throw new Error(`${rel} imports a Node builtin; it cannot run in the browser`);
    copy(path.join(ROOT, rel), path.join(DIST, rel.replace(/^src\//, '')));
  }

  // 2. icons module + assets
  fs.writeFileSync(path.join(DIST, 'icons.js'), `// Generated from web/assets/icons (Phosphor 2.1.1, MIT)\nexport const ICONS = ${JSON.stringify(icons)};\n`);
  for (const f of fs.readdirSync(path.join(WEB, 'assets', 'icons'))) copy(path.join(WEB, 'assets/icons', f), path.join(DIST, 'assets/icons', f));

  // 3. real results, computed now with the same code the browser runs
  const core = await import(pathToFileURL(path.join(ROOT, 'src/core/index.js')).href);
  const rep = await import(pathToFileURL(path.join(ROOT, 'src/handlers/report.js')).href);
  const render = await import(pathToFileURL(path.join(SRC, 'render.js')).href);
  const { SAMPLES } = await import(pathToFileURL(path.join(SRC, 'samples.js')).href);
  const laws = (await import(pathToFileURL(path.join(ROOT, 'src/corpus/laws.js')).href)).default;

  const memo = fs.readFileSync(path.join(ROOT, 'demo/demo_memo_v2_en.txt'), 'utf8');
  const results = core.verify(memo, { asOf: AS_OF, crossref: true });
  const report = rep.buildReport(results, { asOf: AS_OF, source: { kind: 'demo', file: 'demo/demo_memo_v2_en.txt' } });
  fs.writeFileSync(path.join(DIST, 'hero.json'), JSON.stringify({ asOf: AS_OF, verdicts: results.map((r) => ({ citation: r.citation, law: r.law, article: r.article, verdict: r.verdict })), summary: report.summary }, null, 1));

  // hero: one flagged misattribution + one verified + one non-existent article
  const pick = (pred) => report.rows.find(pred);
  const heroRows = [
    pick((r) => r.suggested_article),
    pick((r) => r.verdict === 'EXISTS_CONSISTENT'),
    pick((r) => r.verdict === 'ARTICLE_NOT_FOUND'),
  ].filter(Boolean);
  const heroHtml = render.summaryHtml(report.summary) + `<ol class="rows">${heroRows.map((r) => render.rowHtml(r, icons)).join('\n')}</ol>`
    + `<p class="fine">${report.summary.total} citations in the memo. Showing three. <a href="playground.html">Run the whole memo</a>.</p>`;

  const ex = (v, extra = () => true) => report.rows.find((r) => r.verdict === v && extra(r));
  const catches = [
    ['H1', 'Articles that do not exist', ex('ARTICLE_NOT_FOUND')],
    ['H3', 'Real articles cited for content that is elsewhere', pick((r) => r.suggested_article)],
    ['H4', 'Quotes that are not in the official text', ex('CONTENT_MISMATCH', (r) => !r.suggested_article)],
    ['H5', 'Laws repealed or not yet in force on the date', ex('NOT_IN_FORCE')],
    ['H7', 'Changed numbers (deadlines, amounts), flagged as advisories', null],
  ].map(([h, title, row]) => `<li><span class="htag">${h}</span><div><h3>${render.esc(title)}</h3><p class="fine">${row
    ? `<code class="mono">${render.esc(row.citation)}</code> ${render.esc(row.law_title || '')}: ${render.esc(row.reason_en)}`
    : 'Example: a quote that says "7 days" where the article says "72 hours". Numbers are reported as advisory notes for a reviewer.'}</p></div></li>`).join('\n');

  const byCountry = {};
  for (const l of laws) byCountry[l.country] = (byCountry[l.country] || 0) + 1;
  const names = { EU: 'European Union', US: 'United States', VN: 'Vietnam', ID: 'Indonesia', TH: 'Thailand' };
  const coverage = Object.keys(names).filter((k) => byCountry[k]).map((k) => `<div><b>${byCountry[k]}</b>${names[k]}</div>`).join('');

  // 4. pages
  const fill = (html) => inlineIcons(html, icons)
    .replaceAll('{{HERO}}', heroHtml).replaceAll('{{CATCHES}}', catches).replaceAll('{{COVERAGE}}', coverage)
    .replaceAll('{{LAWS}}', String(laws.length)).replaceAll('{{JURISDICTIONS}}', String(Object.keys(byCountry).length)).replaceAll('{{AS_OF}}', AS_OF);
  for (const f of ['index.html', 'playground.html']) fs.writeFileSync(path.join(DIST, f), fill(fs.readFileSync(path.join(SRC, f), 'utf8')));
  for (const f of ['styles.css', 'app.js', 'render.js', 'advisoryClient.js']) copy(path.join(SRC, f), path.join(DIST, f));
  const allSamples = [{ id: 'memo', label: 'Full demo memo', country: '', text: memo }, ...SAMPLES];
  fs.writeFileSync(path.join(DIST, 'samples.js'), `// Generated: demo memo + web/src/samples.js\nexport const SAMPLES = ${JSON.stringify(allSamples, null, 1)};\n`);

  // 5. BUILD.json (git-free manifest; mock directory permanently excluded from production dist)
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(p); } };
  walk(DIST);
  const manifest = files.sort().map((p) => { const b = fs.readFileSync(p); return { path: path.relative(DIST, p), bytes: b.length, sha256: crypto.createHash('sha256').update(b).digest('hex') }; });
  fs.writeFileSync(path.join(DIST, 'BUILD.json'), JSON.stringify({ asOf: AS_OF, files: manifest }, null, 1));
  if (!quiet) console.log(`web/dist: ${manifest.length} files, ${report.summary.total} demo citations (${report.summary.flagged} flagged)`);
  return { dist: DIST, report, files: manifest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build().catch((e) => { console.error(e.message); process.exit(1); });
}
