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

module.exports = { save, load, clear, isRecentlyChecked };
