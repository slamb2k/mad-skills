'use strict';

const { mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync } = require('fs');
const { join } = require('path');
const { createHash } = require('crypto');
const { homedir } = require('os');

const STATE_DIR = join(homedir(), '.claude', 'session-guard');

function ensureDir() {
  mkdirSync(STATE_DIR, { recursive: true });
}

function projectKey(projectDir) {
  return createHash('md5').update(projectDir).digest('hex');
}

function statePath(projectDir) {
  return join(STATE_DIR, `${projectKey(projectDir)}.json`);
}

function save(projectDir, data) {
  ensureDir();
  writeFileSync(statePath(projectDir), JSON.stringify({
    ...data,
    projectDir,
    timestamp: Date.now(),
  }, null, 2));
}

function load(projectDir) {
  const path = statePath(projectDir);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function clear(projectDir) {
  try { unlinkSync(statePath(projectDir)); } catch { /* noop */ }
}

/** Dedup: true if check ran within the last `seconds`. */
function isRecentlyChecked(projectDir, seconds = 5) {
  const data = load(projectDir);
  if (!data) return false;
  return (Date.now() - data.timestamp) < seconds * 1000;
}

// ─── persistent per-project preferences ───────────────────────────────

function prefsPath(projectDir) {
  return join(STATE_DIR, `${projectKey(projectDir)}-prefs.json`);
}

function loadPrefs(projectDir) {
  const path = prefsPath(projectDir);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return {};
  }
}

function savePrefs(projectDir, prefs) {
  ensureDir();
  writeFileSync(prefsPath(projectDir), JSON.stringify(prefs, null, 2));
}

// ─── pending build marker ─────────────────────────────────────────────

function pendingBuildPath(projectDir) {
  return join(STATE_DIR, `${projectKey(projectDir)}-pending-build.json`);
}

function savePendingBuild(projectDir, specPath) {
  ensureDir();
  writeFileSync(pendingBuildPath(projectDir), JSON.stringify({
    specPath,
    projectDir,
    timestamp: Date.now(),
  }, null, 2));
}

function loadPendingBuild(projectDir) {
  const path = pendingBuildPath(projectDir);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

function clearPendingBuild(projectDir) {
  try { unlinkSync(pendingBuildPath(projectDir)); } catch { /* noop */ }
}

module.exports = { save, load, clear, isRecentlyChecked, loadPrefs, savePrefs, savePendingBuild, loadPendingBuild, clearPendingBuild };
