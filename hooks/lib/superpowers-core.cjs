'use strict';

/**
 * Plugin anchor detection (registered + enabled plugins) — single source of truth for the soft-dependency
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

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Enabled state for a plugin key (`name@marketplace`). Later settings files
 * win: user, then project, then project-local. A registered plugin with no
 * explicit entry anywhere counts as enabled.
 */
function isPluginEnabled(key, { homedir, cwd }) {
  const files = [
    path.join(homedir, '.claude', 'settings.json'),
    path.join(cwd, '.claude', 'settings.json'),
    path.join(cwd, '.claude', 'settings.local.json'),
  ];
  let enabled = true;
  for (const file of files) {
    const value = readJson(file)?.enabledPlugins?.[key];
    if (typeof value === 'boolean') enabled = value;
  }
  return enabled;
}

/**
 * Find `anchor` inside plugins Claude Code has registered and enabled.
 * Returns undefined when there is no readable registry, so the caller can
 * fall back to a plain disk walk (older hosts, non-Claude agents). Leftover
 * cache folders and marketplace clones are never registered, so they no
 * longer count as installed.
 */
function findRegisteredAnchor(anchor, { homedir, cwd }) {
  const registry = readJson(path.join(homedir, '.claude', 'plugins', 'installed_plugins.json'));
  const plugins = registry?.plugins;
  if (!plugins || typeof plugins !== 'object') return undefined;

  for (const [key, installs] of Object.entries(plugins)) {
    for (const install of Array.isArray(installs) ? installs : [installs]) {
      const installPath = install?.installPath;
      if (!installPath) continue;
      if (install.projectPath && !isInside(cwd, install.projectPath)) continue;
      if (!isPluginEnabled(key, { homedir, cwd })) continue;
      const hit = findAnchorDir(installPath, anchor);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Look for a directory containing `anchor` as a relative subpath.
 *
 * Plugins: when Claude Code's plugin registry exists, only registered and
 * enabled plugins count. Without a registry, fall back to walking
 * `.claude/plugins` on disk. Standalone skill roots (`extraRoots` and the
 * project's `.claude/skills`) are always walked on disk.
 *
 * This still cannot tell whether a plugin's agents are callable as a
 * subagent_type in the current session.
 */
function detectPluginAnchor(anchor, { homedir = os.homedir(), cwd = process.cwd(), extraRoots = [] } = {}) {
  const registered = findRegisteredAnchor(anchor, { homedir, cwd });
  if (registered) return { installed: true, basePath: registered };

  const roots = [
    ...(registered === undefined ? [path.join(homedir, '.claude', 'plugins')] : []),
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

module.exports = { detectSuperpowers, detectFeatureDev, detectPluginAnchor, isPluginEnabled };
