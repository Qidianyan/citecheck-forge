// Playground: runs the real CiteCheck verifier core in the browser. The verdict makes no network calls.
// Optional: an advisory LLM re-check that the user switches on (OFF by default, and the server can disable it).
import { verify } from './core/index.js';
import { buildReport, toMarkdown } from './handlers/report.js';
import { reportHtml, esc } from './render.js';
import { SAMPLES } from './samples.js';
import { ICONS } from './icons.js';
import { advisoryCandidates, advisoryHtml, fetchStatus, recheck } from './advisoryClient.js';

const $ = (id) => document.getElementById(id);
let lastMarkdown = '';

function runCheck() {
  const text = $('text').value;
  const asOf = $('asof').value || '2026-11-10';
  const country = $('country').value || null;
  const t0 = performance.now();
  try {
    const results = verify(text, { asOf, country, crossref: true });
    const report = buildReport(results, { asOf, source: { kind: 'playground' } });
    $('out').innerHTML = reportHtml(report, ICONS);
    lastMarkdown = toMarkdown(report);
    $('copy').disabled = report.rows.length === 0;
    if ($('adv').checked && !$('adv').disabled) runAdvisory(report.rows);
    const ms = Math.round(performance.now() - t0);
    $('status').textContent = report.rows.length
      ? `${report.summary.total} citation(s) checked in ${ms} ms, law in force as of ${asOf}.`
      : 'No citations found.';
  } catch (e) {
    $('out').innerHTML = `<p class="err">Something went wrong while checking: ${esc(e && e.message)}. Try a shorter text or reload the page.</p>`;
    $('copy').disabled = true;
    $('status').textContent = 'Check failed.';
  }
}

async function copyMarkdown() {
  if (!lastMarkdown) return;
  try {
    await navigator.clipboard.writeText(lastMarkdown);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = lastMarkdown; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  $('status').textContent = 'Markdown report copied to the clipboard.';
}

async function runAdvisory(rows) {
  const items = $('out').querySelectorAll('li.row');
  for (const { r, i } of advisoryCandidates(rows)) {
    const li = items[i]; if (!li) continue;
    const slot = document.createElement('div'); slot.className = 'adv adv--muted'; slot.textContent = 'Advisory re-check running…';
    li.querySelector('.row__body').appendChild(slot);
    const res = await recheck(r);
    slot.outerHTML = advisoryHtml(res);
  }
}

async function initAdvisory() {
  const st = await fetchStatus();
  $('adv').checked = false;
  if (st.enabled) { $('adv').disabled = false; $('adv-note').textContent = 'Off by default. When on, an LLM gives a second opinion on up to 3 statements. The verdict itself never changes.'; }
  else { $('adv').disabled = true; $('adv-note').textContent = 'Switched off on this server. Every verdict here comes from the deterministic checker.'; }
}

function loadSample(s, btn) {
  $('text').value = s.text;
  $('country').value = s.country || '';
  for (const b of document.querySelectorAll('#samples .chip')) b.setAttribute('aria-pressed', String(b === btn));
  runCheck();
}

function init() {
  const box = $('samples');
  for (const s of SAMPLES) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = s.label; b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => loadSample(s, b));
    box.appendChild(b);
  }
  $('form').addEventListener('submit', (e) => { e.preventDefault(); runCheck(); });
  $('copy').addEventListener('click', copyMarkdown);
  initAdvisory();
  const first = box.querySelector('.chip');
  loadSample(SAMPLES[0], first);
}

init();
