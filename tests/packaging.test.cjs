'use strict';

// Regression guard: hooks/ MUST be self-contained. The plugin distribution
// reliably ships hooks/ (and skills/, references/, .claude-plugin/), but NOT
// scripts/ — so any runtime require from a hook that escapes hooks/ (a `../../`
// path into scripts/ or elsewhere) ships a broken plugin: the installed
// session-guard then crashes with MODULE_NOT_FOUND. This caught
// hooks/lib/lifecycle.cjs requiring ../../scripts/lib/superpowers-core.cjs.
//
// Rule: every relative require inside hooks/ must resolve to a path still under
// hooks/. Bare specifiers (node builtins, node_modules) are fine.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync, readFileSync } = require('fs');
const { join, resolve, relative } = require('path');

const HOOKS = join(__dirname, '..', 'hooks');

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(cjs|mjs|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

test('every relative require inside hooks/ stays within hooks/', () => {
  const escapes = [];
  for (const file of walk(HOOKS)) {
    const src = readFileSync(file, 'utf-8');
    for (const m of src.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
      const target = resolve(file, '..', m[1]);
      const rel = relative(HOOKS, target);
      if (rel.startsWith('..')) {
        escapes.push(`${relative(HOOKS, file)} -> ${m[1]}`);
      }
    }
  }
  assert.deepEqual(escapes, [], `hooks/ requires that escape the shipped tree:\n  ${escapes.join('\n  ')}`);
});
