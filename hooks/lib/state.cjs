'use strict';

const { mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync, renameSync } = require('fs');
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

/** Atomic write: write to .tmp then rename to avoid partial reads. */
function save(projectDir, data) {
  ensureDir();
  const target = statePath(projectDir);
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify({
    ...data,
    projectDir,
    timestamp: Date.now(),
  }, null, 2));
  try {
    renameSync(tmp, target);
  } catch {
    // Rename failed (rare on Windows if target locked) — fall back to direct write
    writeFileSync(target, readFileSync(tmp, 'utf-8'));
    try { unlinkSync(tmp); } catch { /* noop */ }
  }
}

/** Write an in-progress marker so remind() knows to wait. */
function saveInProgress(projectDir) {
  ensureDir();
  const target = statePath(projectDir);
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, JSON.stringify({
    status: 'in-progress',
    projectDir,
    timestamp: Date.now(),
  }, null, 2));
  try {
    renameSync(tmp, target);
  } catch {
    writeFileSync(target, JSON.stringify({
      status: 'in-progress',
      projectDir,
      timestamp: Date.now(),
    }, null, 2));
    try { unlinkSync(tmp); } catch { /* noop */ }
  }
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

/**
 * Dedup: true if check ran (or is running) within the last `seconds`.
 * Also returns true if a background check is in-progress.
 */
function isRecentlyChecked(projectDir, seconds = 5) {
  const data = load(projectDir);
  if (!data) return false;
  if (data.status === 'in-progress') return true;
  return (Date.now() - data.timestamp) < seconds * 1000;
}

/**
 * Wait for the background check to complete.
 * Polls until state file has actual results (not in-progress), or timeout.
 * Returns loaded data or null on timeout / no data.
 */
function waitForReady(projectDir, timeoutMs = 4000, intervalMs = 200) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const data = load(projectDir);
    if (!data) return null; // No state file at all — nothing pending
    if (data.status === 'in-progress') {
      // Check for stale in-progress marker (background worker crashed)
      if (Date.now() - data.timestamp > 30000) return null;
      // Busy-wait with sleep
      const sleepUntil = Date.now() + intervalMs;
      while (Date.now() < sleepUntil) { /* spin */ }
      continue;
    }
    return data; // Ready — has actual results
  }
  return null; // Timed out
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

module.exports = { save, saveInProgress, load, clear, isRecentlyChecked, waitForReady, loadPrefs, savePrefs, savePendingBuild, loadPendingBuild, clearPendingBuild };
