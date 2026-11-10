// Corpus wrapper: law lookup and alias table (port of verify.py load_laws / _alias_table).
const GENERIC = new Set(['PDPA', 'Personal Data Protection Act']);

export function createCorpus(laws) {
  const byId = Object.fromEntries(laws.map((l) => [l.law_id, l]));
  const aliases = [];
  for (const law of laws) {
    for (const a of law.aliases || []) aliases.push({ key: a.normalize('NFC').toLowerCase(), law, alias: a, generic: GENERIC.has(a) });
    for (const a of law.chinese_aliases || []) aliases.push({ key: a.normalize('NFC').toLowerCase(), law, alias: a, generic: true });
  }
  return { laws, byId, aliases };
}
