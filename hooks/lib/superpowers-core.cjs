'use strict';

/**
 * Superpowers detection — single source of truth for the on-disk anchor check.
 *
 * Authored as CommonJS on purpose: it is the one module format that both the
 * ESM helper (scripts/lib/superpowers.js, which re-exports this) and the CJS
 * session-guard engine (hooks/lib/lifecycle.cjs, which requires this) can share.
 * Keep the logic here only — do not fork a copy into either consumer.
 */

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const ANCHOR = 'using-superpowers/SKILL.md';
const MAX_DEPTH = 7;

function anchorExists(dir) {
  try {
    return fs.existsSync(path.join(dir, ANCHOR));
  } catch {
    return false;
  }
}

function findAnchorDir(root, depth = 0) {
  if (depth > MAX_DEPTH) return null;
  if (anchorExists(root)) return root;

  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const hit = findAnchorDir(path.join(root, entry.name), depth + 1);
    if (hit) return hit;
  }

  return null;
}

function detectSuperpowers({ homedir = os.homedir(), cwd = process.cwd() } = {}) {
  const roots = [
    path.join(homedir, '.claude', 'plugins'),
    path.join(homedir, '.claude', 'skills', 'superpowers'),
    path.join(cwd, '.claude', 'skills'),
  ];

  for (const root of roots) {
    const hit = findAnchorDir(root);
    if (hit) {
      return { installed: true, basePath: hit };
    }
  }

  return { installed: false, basePath: null };
}

module.exports = { detectSuperpowers };
