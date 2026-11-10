// Clause parsing for organisation-specific sources (Confluence pages registered as extra authorities).
// Pure: plain text in (callers convert Confluence storage/ADF via src/handlers/text.js), clauses out.

// A clause id is the number string: "3", "3.1", "12.4".
const NUM = '(\\d+(?:\\.\\d+)*)';

// Labelled clause starts at line begin: "§ 3", "§3.1", "Section 3", "Clause 12.4", "Article 5".
const LABELLED_RE = new RegExp(
  `^[ \\t]*(?:#{1,6}[ \\t]+)?(?:§[ \\t]*|section[ \\t]+|clause[ \\t]+|article[ \\t]+)${NUM}(?=[ \\t).:]|$)(?:[ \\t]*[.):]?[ \\t]*(.*))?$`,
  'iu',
);

// Bare numbered headings at line begin: "12.4", "12.4.", "3)", "3.", "3:", "3. Data retention", "12.4 Title".
const BARE_RE = new RegExp(
  `^[ \\t]*(?:#{1,6}[ \\t]+)?${NUM}(?:[ \\t]*[.):][ \\t]*(.*)|[ \\t]+(?=[A-Z])(.*)|[ \\t]*$)`,
  'u',
);

/** The clause id and heading of one clause-start line, or null when the line is not a clause start. */
function clauseStartOf(line) {
  let m = LABELLED_RE.exec(line);
  if (m) return { id: m[1], heading: (m[2] ?? '').trim() };
  m = BARE_RE.exec(line);
  if (m) return { id: m[1], heading: (m[2] ?? m[3] ?? '').trim() };
  return null;
}

/**
 * Plain text → { sourceKey, title, clauses: [{ id, heading, text }] }.
 * Clause text runs until the next clause start (nested ids such as 3.1 are separate clauses; the
 * parent keeps only its own lines). Numbering inside sentences is ignored because only line
 * beginnings are considered.
 */
export function parseClauses(text, { sourceKey = null, title = null } = {}) {
  const clauses = [];
  let current = null;
  let body = [];
  const close = () => {
    if (current) current.text = body.join('\n').trim();
  };
  for (const raw of String(text ?? '').split(/\r?\n/u)) {
    const start = clauseStartOf(raw);
    if (start) {
      close();
      current = { id: start.id, heading: start.heading, text: '' };
      clauses.push(current);
      body = [];
    } else if (current) {
      body.push(raw);
    }
  }
  close();
  return { sourceKey, title, clauses };
}
