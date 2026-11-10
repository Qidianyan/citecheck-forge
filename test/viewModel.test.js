import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toViewModel } from '../src/frontend/viewModel.js';

const row = (over = {}) => ({
  n: 1,
  citation: 'Điều 9 Luật 91/2025/QH15',
  law: 'LUẬT SỐ 91/2025/QH15',
  law_title: 'Law on Digital Technology Industry',
  law_hint: 'Law 91/2025',
  type: 'H1',
  verdict: 'NOT_FOUND',
  verdict_label: 'Not found',
  icon: '✖',
  flagged: false,
  hallucination_types: [],
  reason_en: 'Article not found in the official text.',
  evidence: 'https://example.com/law',
  original_excerpt: 'quote text',
  ...over,
});

const report = (rows, over = {}) => ({
  source: 'https://example.com/page',
  asOf: '2026-01-02',
  verifiedAt: '2026-01-02T10:00:00Z',
  summary: {
    total: rows.length,
    flagged: rows.filter((r) => r.flagged).length,
    verified: rows.filter((r) => ['EXISTS_CONSISTENT', 'EXISTS_UNQUOTED'].includes(r.verdict)).length,
    unverifiable: rows.filter((r) => r.verdict === 'UNVERIFIABLE').length,
    by_verdict: {},
    by_h_type: {},
  },
  rows,
  ...over,
});

describe('toViewModel', () => {
  it('handles a null report (nothing checked yet)', () => {
    const vm = toViewModel(null, { product: 'confluence' });
    assert.equal(vm.status, 'none');
    assert.equal(vm.chipText, 'Not checked yet');
    assert.equal(vm.chipAppearance, 'default');
    assert.deepEqual(vm.rows, []);
    assert.equal(vm.footer, '');
  });

  it('handles a report with zero citations', () => {
    const vm = toViewModel(report([]), { product: 'jira' });
    assert.equal(vm.status, 'none');
    assert.equal(vm.chipText, 'No citations found');
    assert.equal(vm.chipAppearance, 'default');
    assert.deepEqual(vm.rows, []);
  });

  it('orders flagged rows first, keeping original order within each group', () => {
    const vm = toViewModel(report([
      row({ n: 1, flagged: false, verdict: 'EXISTS_CONSISTENT' }),
      row({ n: 2, flagged: true, verdict: 'NOT_FOUND' }),
      row({ n: 3, flagged: true, verdict: 'QUOTE_MISMATCH' }),
      row({ n: 4, flagged: false, verdict: 'EXISTS_CONSISTENT' }),
    ]));
    assert.deepEqual(vm.rows.map((r) => r.n), [2, 3, 1, 4]);
  });

  it('shows "flagged" status and removed lozenge when any row is flagged', () => {
    const vm = toViewModel(report([
      row({ n: 1, flagged: true, verdict: 'NOT_FOUND' }),
      row({ n: 2, flagged: false, verdict: 'EXISTS_CONSISTENT' }),
    ]));
    assert.equal(vm.status, 'flagged');
    assert.equal(vm.chipText, '1 flagged · 1 verified · 0 unverifiable');
    assert.equal(vm.chipAppearance, 'removed');
  });

  it('shows "clean" status and success lozenge when all citations verify', () => {
    const vm = toViewModel(report([
      row({ n: 1, flagged: false, verdict: 'EXISTS_CONSISTENT' }),
      row({ n: 2, flagged: false, verdict: 'EXISTS_UNQUOTED' }),
    ]));
    assert.equal(vm.status, 'clean');
    assert.equal(vm.chipText, '0 flagged · 2 verified · 0 unverifiable');
    assert.equal(vm.chipAppearance, 'success');
  });

  it('shows "unverifiable-only" status and moved lozenge for unverifiable citations', () => {
    const vm = toViewModel(report([
      row({ n: 1, flagged: false, verdict: 'UNVERIFIABLE' }),
    ]));
    assert.equal(vm.status, 'unverifiable-only');
    assert.equal(vm.chipText, '0 flagged · 0 verified · 1 unverifiable');
    assert.equal(vm.chipAppearance, 'moved');
  });

  it('joins H-type hallucination types with ", "', () => {
    const vm = toViewModel(report([
      row({ n: 1, flagged: true, hallucination_types: ['H1', 'H5'] }),
    ]));
    assert.equal(vm.rows[0].types, 'H1, H5');
  });

  it('maps law title / law / fallback and verdict label per row', () => {
    const vm = toViewModel(report([
      row({ n: 1, law_title: 'Tên luật', verdict_label: 'Not found' }),
    ]));
    assert.equal(vm.rows[0].lawLabel, 'Tên luật');
    assert.equal(vm.rows[0].verdictLabel, 'Not found');
    const vm2 = toViewModel(report([row({ n: 1, law_title: null, law: null, law_hint: 'Law 91/2025' })]));
    assert.equal(vm2.rows[0].lawLabel, 'Law 91/2025');
    const vm3 = toViewModel(report([row({ n: 1, law_title: null, law: null, law_hint: null })]));
    assert.equal(vm3.rows[0].lawLabel, '—');
  });

  it('truncates long excerpts to ≤ 300 chars ending with an ellipsis', () => {
    const long = 'x'.repeat(500);
    const vm = toViewModel(report([row({ n: 1, original_excerpt: long })]));
    assert.equal(vm.rows[0].excerpt.length, 300);
    assert.ok(vm.rows[0].excerpt.endsWith('…'));
    assert.equal(vm.rows[0].excerpt.slice(0, -1), 'x'.repeat(299));
  });

  it('keeps short excerpts unchanged and without ellipsis', () => {
    const vm = toViewModel(report([row({ n: 1, original_excerpt: 'short quote' })]));
    assert.equal(vm.rows[0].excerpt, 'short quote');
  });

  it('formats the footer from verifiedAt and asOf', () => {
    const vm = toViewModel(report([row()]));
    assert.equal(vm.footer, 'Checked 2026-01-02T10:00:00Z against official texts as of 2026-01-02');
  });

  it('carries the product option through to the view-model', () => {
    const vm = toViewModel(report([]), { product: 'jira' });
    assert.equal(vm.product, 'jira');
  });
});
