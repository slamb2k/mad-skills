'use strict';

const { execSync } = require('child_process');
const { statSync, existsSync, readFileSync, readdirSync } = require('fs');
const { join } = require('path');

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.venv', 'venv',
  'dist', 'build', '.next', '.nuxt', 'coverage', '.claude',
  '.idea', '.vscode', 'target', '.cache', '.turbo',
]);

/** Epoch seconds of file mtime — falls back to now on error. */
function fileMtime(filePath) {
  try {
    return Math.floor(statSync(filePath).mtimeMs / 1000);
  } catch {
    return Math.floor(Date.now() / 1000);
  }
}

/** Run a git command, return trimmed stdout or null on failure. */
function git(args, cwd) {
  try {
    return execSync(`git ${args}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    }).trim();
  } catch {
    return null;
  }
}

/** Parse a JSON file, return null on failure. */
function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/** Read file as string, return null on failure. */
function readText(filePath) {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * List directories up to maxDepth (replaces `tree -L 2 -d`).
 * Returns flat array of relative dir names.
 */
function getDirectories(dir, maxDepth = 2, _depth = 0) {
  if (_depth >= maxDepth) return [];
  const dirs = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || IGNORE_DIRS.has(entry.name)) continue;
      dirs.push(entry.name);
      if (_depth + 1 < maxDepth) {
        for (const sub of getDirectories(join(dir, entry.name), maxDepth, _depth + 1)) {
          dirs.push(`${entry.name}/${sub}`);
        }
      }
    }
  } catch { /* directory not readable */ }
  return dirs;
}

/**
 * Count files matching a glob pattern in a directory (non-recursive).
 */
function countFiles(dir, pattern) {
  try {
    return readdirSync(dir).filter(f => {
      if (pattern) return f.match(pattern);
      return true;
    }).length;
  } catch {
    return 0;
  }
}

module.exports = { fileMtime, git, readJson, readText, getDirectories, countFiles, existsSync };
