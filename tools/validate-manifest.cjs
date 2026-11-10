// Offline manifest validation with the @forge/manifest package bundled in the Forge CLI
// (same validators `forge lint` uses for the manifest; no Atlassian login needed).
const path = require('path');
const M = process.env.FORGE_MANIFEST_PKG ||
  '/workspace/competitions/shared/tools/forge-cli/lib/node_modules/@forge/cli/node_modules/@forge/manifest';
const { validate } = require(M);
(async () => {
  const res = await validate(false, path.resolve(__dirname, '..', 'manifest.yml'));
  const errs = res.errors || [];
  for (const e of errs) console.log(`${e.level || 'error'}: ${e.message}${e.reference ? ' [' + e.reference + ']' : ''}${e.line ? ' line ' + e.line : ''}`);
  console.log(res.success ? 'MANIFEST VALID' : `MANIFEST INVALID (${errs.length} issues)`);
  process.exit(res.success ? 0 : 1);
})();
