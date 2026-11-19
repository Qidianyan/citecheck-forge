// Web companion + isolated storyboard checks: build, zero-mock production dist, zero blue/cyan/teal/purple palette guard,
// verifier parity, and static server safety.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../web/build.mjs';
import { buildStoryboard, MOCK_LABEL, STATE_TITLES } from '../tools/storyboard/build-storyboard.mjs';
import { createServer } from '../web/serve.mjs';
import { verify } from '../src/core/index.js';
import { buildReport, toMarkdown } from '../src/handlers/report.js';
import { toViewModel } from '../src/frontend/viewModel.js';
import { SAMPLES } from '../web/src/samples.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'web/dist');
const MEMO = fs.readFileSync(path.join(ROOT, 'demo/demo_memo_v2_en.txt'), 'utf8');
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
const read = (rel) => fs.readFileSync(path.join(DIST, rel), 'utf8');
let storyboard;
let server; let base;

/** Assert a hex colour (3 or 6 hex digits) never falls in teal/cyan/blue/purple hues (155°..330°). */
function assertWarmIndustrialPalette(text, label) {
  assert.ok(!/(?:linear|radial|conic)-gradient\s*\(/i.test(text), `${label} contains a CSS gradient`);
  for (const m of text.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const raw = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(raw.slice(i, i + 2), 16) / 255);
    const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn;
    if (!d) continue;
    const l = (mx + mn) / 2; const s = d / (1 - Math.abs(2 * l - 1));
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    if (s > 0.15) {
      assert.ok(!(h >= 155 && h <= 330), `${label}: forbidden blue/teal/cyan/purple colour #${m[1]} (hue ${h.toFixed(1)}°, sat ${s.toFixed(2)})`);
    }
  }
}

before(async () => {
  storyboard = await buildStoryboard();
  await build({ quiet: true });
  server = createServer(DIST);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => {
  server?.close();
  if (storyboard?.out) fs.rmSync(storyboard.out, { recursive: true, force: true });
});

test('build produces pages, core, corpus, samples, icons, hero and BUILD.json with NO /mock/ directory', () => {
  for (const f of ['index.html', 'playground.html', 'styles.css', 'app.js', 'render.js', 'samples.js', 'icons.js', 'hero.json', 'BUILD.json',
    'core/index.js', 'corpus/laws.js', 'corpus/aliases_en.js', 'handlers/report.js']) {
    assert.ok(fs.existsSync(path.join(DIST, f)), f);
  }
  assert.equal(fs.existsSync(path.join(DIST, 'mock')), false, 'web/dist/mock must not exist in production build');
  assert.equal(fs.existsSync(path.join(ROOT, 'web/mock')), false, 'web/mock directory must be removed from web/');
  const b = JSON.parse(read('BUILD.json'));
  assert.ok(b.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256) && !f.path.startsWith('mock/')));
});

test('shipped core has no Node builtin imports', () => {
  for (const f of fs.readdirSync(path.join(DIST, 'core'))) assert.ok(!/from\s+['"](node:|fs|path|crypto)['"]/.test(read(`core/${f}`)), f);
  assert.ok(!/from\s+['"]node:/.test(read('handlers/report.js')));
});

test('pages: no emoji, no mock links, no external src/href except https official sources, icons inline from Phosphor', () => {
  for (const f of ['index.html', 'playground.html']) {
    const html = read(f);
    assert.ok(!EMOJI.test(html), f);
    assert.ok(!/mock\/index\.html/i.test(html), `${f} must not link to mock renders`);
    assert.ok(!/\ssrc=["']https?:/i.test(html), f);
    assert.ok(!/<link[^>]+href=["']https?:/i.test(html), f);
    assert.ok(!/data-icon=/.test(html), `${f} has an unresolved icon`);
    for (const m of html.matchAll(/href="(https?:[^"]+)"/g)) assert.match(m[1], /^https:\/\//, m[1]);
  }
  assert.ok(!/https?:\/\//.test(read('app.js')));
  assert.ok(!/@import|url\(\s*['"]?https?:/.test(read('styles.css')));
});

test('CSS, HTML & SVG assets: zero blue, deep teal, cyan or purple hues; 480px media block; mobile-safe widths', () => {
  const css = read('styles.css');
  assertWarmIndustrialPalette(css, 'web/dist/styles.css');
  assertWarmIndustrialPalette(read('index.html'), 'web/dist/index.html');
  assertWarmIndustrialPalette(read('playground.html'), 'web/dist/playground.html');
  assertWarmIndustrialPalette(fs.readFileSync(path.join(ROOT, 'prompts/icon.svg'), 'utf8'), 'prompts/icon.svg');
  assertWarmIndustrialPalette(storyboard.css, 'tools/storyboard CSS');
  assert.match(css, /@media \(max-width: 480px\)/);
  const outside = css.replace(/@media[^{]+\{([^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  for (const m of outside.matchAll(/(?<![-\w])width:\s*(\d+)px/g)) assert.ok(Number(m[1]) <= 375, m[0]);
});

test('text contrast ≥ 4.5:1 for ink, secondary ink and verdict colours on their backgrounds', () => {
  const lum = (hex) => { const c = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const [fg, bg] of [['1F1D1A', 'F5F0E6'], ['4A4640', 'F5F0E6'], ['5F5205', 'ECE8CF'], ['B3201E', 'F6DEDA'], ['7A4B0C', 'F6E6CC'], ['5B5750', 'ECE7DD'], ['B3201E', 'F5F0E6'], ['F5F0E6', '2E5A36']]) {
    assert.ok(ratio(fg, bg) >= 4.5, `${fg} on ${bg}: ${ratio(fg, bg).toFixed(2)}`);
  }
});

test('hero.json verdicts equal the Node verifier on the demo memo', () => {
  const hero = JSON.parse(read('hero.json'));
  const live = verify(MEMO, { asOf: '2026-11-10', crossref: true });
  assert.deepEqual(hero.verdicts.map((v) => [v.citation, v.verdict]), live.map((r) => [r.citation, r.verdict]));
  assert.ok(read('index.html').includes('Misattributed'));
});

test('every sample (EU GDPR/AI Act, US FRCP Rule 11, VN, ID, TH, ZH) yields citations and at least one flagged verdict', () => {
  assert.ok(SAMPLES.some((s) => s.id === 'eu') && SAMPLES.some((s) => s.id === 'us'));
  for (const s of SAMPLES) {
    const r = verify(s.text, { asOf: '2026-11-10', crossref: true, country: s.country || null });
    assert.ok(r.length >= 1, s.id);
    assert.ok(r.some((x) => ['ARTICLE_NOT_FOUND', 'CONTENT_MISMATCH', 'NOT_IN_FORCE'].includes(x.verdict)), s.id);
  }
});

test('Markdown export in the browser is the same function as the Forge app', () => {
  assert.equal(read('handlers/report.js'), fs.readFileSync(path.join(ROOT, 'src/handlers/report.js'), 'utf8'));
  const md = toMarkdown(buildReport(verify(MEMO, { asOf: '2026-11-10', crossref: true }), { asOf: '2026-11-10' }));
  assert.ok(!EMOJI.test(md));
});

test('serve.mjs: MIME types, 404 on /mock/, and no path traversal', async () => {
  let r = await fetch(`${base}/`); assert.match(r.headers.get('content-type'), /text\/html/);
  r = await fetch(`${base}/core/index.js`); assert.match(r.headers.get('content-type'), /text\/javascript/);
  r = await fetch(`${base}/styles.css`); assert.match(r.headers.get('content-type'), /text\/css/);
  r = await fetch(`${base}/mock/index.html`); assert.equal(r.status, 404);
  for (const p of ['/..%2fpackage.json', '/%2e%2e/package.json', '/core/..%2f..%2fpackage.json']) {
    r = await fetch(`${base}${p}`); assert.ok([403, 404].includes(r.status), `${p} → ${r.status}`);
  }
});

test('isolated storyboard: every page labelled, no emoji, no external src, zero blue hues', () => {
  assert.equal(storyboard.pages.length, 6);
  for (const f of storyboard.pages) {
    const html = fs.readFileSync(path.join(storyboard.out, f), 'utf8');
    assert.ok(html.includes(MOCK_LABEL.slice(0, 40)), f);
    assert.ok(!EMOJI.test(html), f);
    assert.ok(!/\ssrc=["']https?:/i.test(html), f);
    assertWarmIndustrialPalette(html, f);
  }
});

test('isolated storyboard: byline rows match the view-model order; Jira storyboard shows flagged Section 99', () => {
  const byline = fs.readFileSync(path.join(storyboard.out, 'byline-flagged.html'), 'utf8');
  const cites = [...byline.matchAll(/<span class="cite">([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(cites, toViewModel(storyboard.memo.report).rows.map((r) => r.citation));
  const jira = fs.readFileSync(path.join(storyboard.out, 'panel-jira.html'), 'utf8');
  assert.match(jira, /No such article|Article does not exist/);
  assert.match(jira, /Section 99/);
});

test('isolated storyboard: states page shows all six state titles from copy.js', () => {
  const html = fs.readFileSync(path.join(storyboard.out, 'states.html'), 'utf8');
  for (const t of STATE_TITLES) assert.ok(html.includes(t.replace(/'/g, '&#39;')), t);
});
