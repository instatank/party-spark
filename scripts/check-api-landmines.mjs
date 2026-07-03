#!/usr/bin/env node
// Landmine linter for api/ — catches the three "works locally, FUNCTION_INVOCATION_FAILED
// on Vercel" traps documented in CLAUDE.md ("Critical landmines"). Plain Node, no deps.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
let failures = 0;
const fail = (msg) => { failures++; console.error(`FAIL ${msg}`); };

function tsFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsFiles(p);
    return name.endsWith('.ts') ? [p] : [];
  });
}

const files = tsFiles(join(ROOT, 'api'));
// Matches static import/export-from and dynamic import('...') specifiers.
const specRe = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

for (const file of files) {
  const rel = relative(ROOT, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return; // skip comments
    for (const m of line.matchAll(specRe)) {
      const spec = m[1] ?? m[2];
      // (a) relative imports must end in .js (Node ESM resolver on Vercel won't guess).
      if ((spec.startsWith('./') || spec.startsWith('../')) && !spec.endsWith('.js'))
        fail(`${rel}:${i + 1} relative import '${spec}' must end in .js (crashes Vercel cold start)`);
      // (b) static top-level @google/genai import — only the lazy await import() in clients.ts is allowed.
      if (spec === '@google/genai' && m[1] !== undefined)
        fail(`${rel}:${i + 1} static import of '@google/genai' (CJS/ESM interop crashes cold start; use getGemini() in api/_lib/clients.ts)`);
    }
  });
}
console.log(`OK  checked ${files.length} api/*.ts files: relative imports end in .js`);
console.log('OK  no static @google/genai imports outside the lazy getter');

// (c) root tsconfig.json must keep the tsconfig.api.json reference (else api/ type errors only surface on Vercel).
const tsconfig = readFileSync(join(ROOT, 'tsconfig.json'), 'utf8');
if (!tsconfig.includes('tsconfig.api.json'))
  fail(`tsconfig.json: missing { "path": "./tsconfig.api.json" } reference — api/ drops out of the local typecheck`);
else console.log('OK  tsconfig.json references tsconfig.api.json');

if (failures) { console.error(`\n${failures} landmine(s) found — fix before pushing anything under api/.`); process.exit(1); }
console.log('\nAll api/ landmine checks passed.');
