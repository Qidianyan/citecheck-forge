// Offline manifest validation with @forge/manifest (same schema + business validators `forge lint` uses;
// runs cleanly from local node_modules or FORGE_MANIFEST_PKG without needing an Atlassian cloud login).
const path = require('path');

function loadValidator() {
  const candidates = [
    process.env.FORGE_MANIFEST_PKG,
    '@forge/manifest',
    '/workspace/competitions/shared/tools/forge-cli/lib/node_modules/@forge/cli/node_modules/@forge/manifest',
  ].filter(Boolean);
  for (const mod of candidates) {
    try {
      return require(mod);
    } catch {
      // Try next candidate.
    }
  }
  throw new Error('Could not resolve @forge/manifest; run `npm install` inside code/.');
}

const { validate } = loadValidator();
(async () => {
  const res = await validate(false, path.resolve(__dirname, '..', 'manifest.yml'));
  const errs = res.errors || [];
  for (const e of errs) console.log(`${e.level || 'error'}: ${e.message}${e.reference ? ' [' + e.reference + ']' : ''}${e.line ? ' line ' + e.line : ''}`);
  console.log(res.success ? 'MANIFEST VALID' : `MANIFEST INVALID (${errs.length} issues)`);
  process.exit(res.success ? 0 : 1);
})();
