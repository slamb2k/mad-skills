'use strict';

/**
 * Plugin on-disk anchor detection — single source of truth for the soft-dependency
 * checks (superpowers, feature-dev) shared across pre-flight tables and the
 * session-guard engine.
 *
 * Authored as CommonJS on purpose: it is the one module format that both the
 * ESM helpers (scripts/lib/superpowers.js, scripts/lib/feature-dev.js, which
 * re-export this) and the CJS session-guard engine (hooks/lib/lifecycle.cjs,
 * which requires this) can share. Keep the logic here only — do not fork a
 * copy into either consumer.
 */

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const MAX_DEPTH = 7;

function anchorExists(dir, anchor) {
  try {
    return fs.existsSync(path.join(dir, anchor));
  } catch {
    return false;
  }
}

function findAnchorDir(root, anchor, depth = 0) {
  if (depth > MAX_DEPTH) return null;
  if (anchorExists(root, anchor)) return root;

  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const hit = findAnchorDir(path.join(root, entry.name), anchor, depth + 1);
    if (hit) return hit;
  }

  return null;
}

/**
 * Walk `.claude/plugins` (global) and `.claude/skills` (project-local) looking
 * for a directory containing `anchor` as a relative subpath. Detects presence
 * on disk only — not whether the plugin's agents are actually registered and
 * callable as a subagent_type, which no on-disk check can determine.
 */
function detectPluginAnchor(anchor, { homedir = os.homedir(), cwd = process.cwd(), extraRoots = [] } = {}) {
  const roots = [
    path.join(homedir, '.claude', 'plugins'),
    ...extraRoots,
    path.join(cwd, '.claude', 'skills'),
  ];

  for (const root of roots) {
    const hit = findAnchorDir(root, anchor);
    if (hit) {
      return { installed: true, basePath: hit };
    }
  }

  return { installed: false, basePath: null };
}

function detectSuperpowers({ homedir = os.homedir(), cwd = process.cwd() } = {}) {
  return detectPluginAnchor('using-superpowers/SKILL.md', {
    homedir,
    cwd,
    extraRoots: [path.join(homedir, '.claude', 'skills', 'superpowers')],
  });
}

function detectFeatureDev({ homedir = os.homedir(), cwd = process.cwd() } = {}) {
  return detectPluginAnchor('commands/feature-dev.md', { homedir, cwd });
}

module.exports = { detectSuperpowers, detectFeatureDev, detectPluginAnchor };
