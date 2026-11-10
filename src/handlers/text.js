// Confluence storage format (XHTML) and Jira ADF → plain text.
// Pure functions, no dependencies (injectable by design: nothing here touches @forge/*).

const BLOCK_TAG_RE = /<\/?(?:p|h[1-6]|li|div|blockquote|pre|ac:task-body)\b[^>]*>/giu;
const BR_RE = /<br\b[^>]*>/giu;
const ROW_RE = /<tr\b[^>]*>[\s\S]*?<\/tr>/giu;
const CELL_OPEN_RE = /<t[dh]\b[^>]*>/giu;
const CELL_CLOSE_RE = /<\/t[dh]\b[^>]*>/giu;
const TAG_RE = /<[^>]+>/g;
const NLOPT_RE = /\n{3,}/g;
const CDATA_RE = /<!\[CDATA\[([\s\S]*?)\]\]>/gu;

// &nbsp; is U+00A0 (no-break space), written via fromCharCode to keep this file pure ASCII.
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', nbsp: String.fromCharCode(160) };

/** Decode the entities Confluence storage format can carry (&amp; &lt; &gt; &quot; &#39; &nbsp; &#NNN; &#xHH;). */
export function decodeEntities(s) {
  return String(s).replace(/&(amp|lt|gt|quot|nbsp);|&#(\d+);|&#x([0-9a-f]+);/giu, (m, name, dec, hex) => {
    if (dec !== undefined) {
      const cp = Number(dec);
      return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    if (hex !== undefined) {
      const cp = parseInt(hex, 16);
      return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? m;
  });
}

function cellText(inner) {
  return inner.replace(BR_RE, '\n').replace(BLOCK_TAG_RE, '\n').replace(TAG_RE, '').trim();
}

function processXhtml(s) {
  // Table rows: cells joined by ' | ', one line per row.
  s = s.replace(ROW_RE, (row) => {
    const inner = row.replace(/^<tr\b[^>]*>/iu, '').replace(/<\/tr>\s*$/iu, '');
    const cells = inner.split(CELL_OPEN_RE).slice(1).map((c) => cellText(c.replace(CELL_CLOSE_RE, '')));
    return `${cells.join(' | ')}\n`;
  });
  s = s.replace(BR_RE, '\n');
  s = s.replace(BLOCK_TAG_RE, '\n'); // p, h1-h6, li, tr, div, blockquote, pre, ac:task-body → newline
  s = s.replace(TAG_RE, ''); // strip every other tag (macro wrappers, links, spans, ac:task-id/status, …)
  s = decodeEntities(s);
  s = s.replace(NLOPT_RE, '\n\n'); // collapse 3+ newlines to 2
  return s; // no per-segment trim: segment edges must stay glued to CDATA neighbours
}

/** Confluence storage format → plain text. Block elements become newlines, table cells ` | `-separated. */
export function storageToText(xhtml) {
  if (xhtml == null) return '';
  // CDATA sections (e.g. the body of <ac:structured-macro ac:name="code">) are literal text: split them
  // out first so the tag stripper cannot eat code that happens to contain '<' … '>' pairs. Code text is
  // kept, never dropped, and its whitespace is preserved verbatim.
  const segments = String(xhtml).split(CDATA_RE);
  return segments.map((seg, i) => (i % 2 ? seg : processXhtml(seg))).join('').trim();
}

const ADF_BLOCKS = new Set(['paragraph', 'heading', 'listItem', 'tableRow', 'blockquote', 'codeBlock']);

function mentionText(node) {
  const a = node.attrs || {};
  const name = typeof a.text === 'string' && a.text ? a.text : (a.id ?? '');
  return name.startsWith('@') ? name : `@${name}`;
}

function walkAdf(node, out) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'text') { out.push(node.text ?? ''); return; }
  if (node.type === 'mention') { out.push(mentionText(node)); return; }
  if (node.type === 'hardBreak') { out.push('\n'); return; }
  if (ADF_BLOCKS.has(node.type)) {
    for (const child of node.content || []) walkAdf(child, out);
    if (out.length && out[out.length - 1] !== '\n') out.push('\n'); // one newline per block, no stacking
    return;
  }
  for (const child of node.content || []) walkAdf(child, out);
}

/** Jira ADF document → plain text (blocks newline-separated, mentions @name, hardBreak → newline). */
export function adfToText(adf) {
  if (!adf || typeof adf !== 'object') return '';
  const out = [];
  walkAdf(adf, out);
  return out.join('').replace(NLOPT_RE, '\n\n').trim();
}
