// Offline UI Kit checks for src/frontend/*.jsx (no Forge site available):
// 1) every file parses as JSX (TypeScript transpiler from the Forge CLI, skipped when not installed);
// 2) every named import from '@forge/react' exists in @forge/react 12.5.0 (tools/uikit/components.txt);
// 3) every <Icon glyph="..."> literal is a valid Atlassian icon glyph (tools/uikit/icon-glyphs.txt);
// 4) no emoji used as icons inside JSX text (one icon system: the UI Kit Icon component).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONT = path.join(ROOT, 'src/frontend');
const files = fs.readdirSync(FRONT).filter((f) => f.endsWith('.jsx')).map((f) => path.join(FRONT, f));
const components = new Set(fs.readFileSync(path.join(ROOT, 'tools/uikit/components.txt'), 'utf8').split('\n').filter(Boolean));
const glyphs = new Set(fs.readFileSync(path.join(ROOT, 'tools/uikit/icon-glyphs.txt'), 'utf8').split('\n').filter(Boolean));
const TS_PATH = process.env.CITECHECK_TS || '/workspace/competitions/shared/tools/forge-cli/lib/node_modules/@forge/cli/node_modules/typescript';
let ts = null;
try { ts = createRequire(import.meta.url)(TS_PATH); } catch { ts = null; }

test('frontend JSX files parse', { skip: ts ? false : 'TypeScript (Forge CLI) not installed' }, () => {
  for (const f of files) {
    const out = ts.transpileModule(fs.readFileSync(f, 'utf8'), { fileName: f, reportDiagnostics: true, compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
    const errs = (out.diagnostics || []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    assert.deepEqual(errs, [], path.basename(f));
  }
});

test('@forge/react named imports exist in UI Kit', () => {
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/import\s+(?:[A-Za-z_$][\w$]*\s*,\s*)?\{([^}]*)\}\s*from\s*['"]@forge\/react['"]/g)) {
      for (const raw of m[1].split(',')) {
        const name = raw.trim().split(/\s+as\s+/)[0].trim();
        if (name) assert.ok(components.has(name), `${path.basename(f)} imports unknown UI Kit export ${name}`);
      }
    }
  }
});

test('Icon glyphs are valid Atlassian glyph names', () => {
  for (const f of files.concat(fs.readdirSync(FRONT).filter((x) => x.endsWith('.js')).map((x) => path.join(FRONT, x)))) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/glyph[=:]\s*["']([a-z0-9-]+)["']/g)) assert.ok(glyphs.has(m[1]), `${path.basename(f)} uses unknown glyph ${m[1]}`);
  }
});

test('no emoji used as icons in frontend files', () => {
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{274C}\u{2753}\u{26A0}]/u;
  for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((l, i) => assert.ok(!EMOJI.test(l), `${path.basename(f)}:${i + 1} contains an emoji`));
  }
});
