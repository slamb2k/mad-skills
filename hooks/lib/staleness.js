'use strict';

const { existsSync } = require('fs');
const { join } = require('path');
const config = require('./config');
const { fileMtime, git, readJson, readText, getDirectories } = require('./utils');

/**
 * Evaluate all staleness signals for CLAUDE.md.
 * Mutates output.addStaleness() with weighted signals.
 */
function checkStaleness(projectDir, claudeMdPath, gitRoot, output) {
  const now = Math.floor(Date.now() / 1000);
  const mdMtime = fileMtime(claudeMdPath);
  const mdAgeDays = Math.floor((now - mdMtime) / 86400);

  checkAge(mdAgeDays, output);
  checkDirectoryDrift(projectDir, claudeMdPath, output);
  checkPackageJson(projectDir, claudeMdPath, mdMtime, output);
  checkPythonDeps(projectDir, mdMtime, output);
  checkConfigFiles(projectDir, mdMtime, output);
  checkGitActivity(projectDir, gitRoot, mdMtime, output);
  checkLockFiles(projectDir, mdMtime, output);
}

// ─── Individual checks ─────────────────────────────────────────────────

function checkAge(ageDays, output) {
  const { warn, critical } = config.staleness.age;
  if (ageDays > critical) {
    output.addStaleness(`CLAUDE.md last modified ${ageDays} days ago`, 2);
  } else if (ageDays > warn) {
    output.addStaleness(`CLAUDE.md last modified ${ageDays} days ago`, 1);
  }
}

function checkDirectoryDrift(projectDir, claudeMdPath, output) {
  const dirs = getDirectories(projectDir);
  if (dirs.length === 0) return;

  const claudeMd = readText(claudeMdPath);
  if (!claudeMd) return;

  const mdLower = claudeMd.toLowerCase();
  const missing = dirs.filter(d => !mdLower.includes(d.toLowerCase()));

  if (missing.length > config.staleness.missingDirs.many) {
    output.addStaleness(`Directories not in CLAUDE.md: ${missing.join(' ')}`, 2);
  } else if (missing.length > config.staleness.missingDirs.few) {
    output.addStaleness(`Directories not in CLAUDE.md: ${missing.join(' ')}`, 1);
  }
}

function checkPackageJson(projectDir, claudeMdPath, mdMtime, output) {
  const pkgPath = join(projectDir, 'package.json');
  if (!existsSync(pkgPath)) return;

  const pkgMtime = fileMtime(pkgPath);
  if (pkgMtime > mdMtime) {
    const delta = Math.floor((pkgMtime - mdMtime) / 86400);
    output.addStaleness(`package.json modified ${delta} day(s) after CLAUDE.md`, 1);
  }

  const pkg = readJson(pkgPath);
  if (!pkg) return;

  const depCount = Object.keys(pkg.dependencies || {}).length
    + Object.keys(pkg.devDependencies || {}).length;

  const claudeMd = readText(claudeMdPath) || '';
  const documented = claudeMd.match(/(\d+)\s*(dependencies|deps)/i);
  if (documented) {
    const docCount = parseInt(documented[1], 10);
    const drift = Math.abs(depCount - docCount);
    if (drift > config.staleness.depDrift.major) {
      output.addStaleness(`Dep count drift: CLAUDE.md ~${docCount}, actual ${depCount} (\u0394${depCount - docCount})`, 2);
    } else if (drift > config.staleness.depDrift.minor) {
      output.addStaleness(`Dep count drift: CLAUDE.md ~${docCount}, actual ${depCount}`, 1);
    }
  }

  // Check for undocumented production deps
  const prodDeps = Object.keys(pkg.dependencies || {});
  const mdLower = claudeMd.toLowerCase();
  const undocumented = prodDeps.filter(d => !mdLower.includes(d.toLowerCase()));
  if (undocumented.length > config.staleness.undocumentedDeps) {
    output.addStaleness(
      `${undocumented.length} production deps not in CLAUDE.md (e.g. ${undocumented.slice(0, 5).join(', ')})`,
      2,
    );
  }
}

function checkPythonDeps(projectDir, mdMtime, output) {
  for (const file of config.pythonFiles) {
    const path = join(projectDir, file);
    if (!existsSync(path)) continue;
    if (fileMtime(path) > mdMtime) {
      output.addStaleness(`${file} modified after CLAUDE.md`, 1);
    }
  }
}

function checkConfigFiles(projectDir, mdMtime, output) {
  for (const file of config.configFiles) {
    const path = join(projectDir, file);
    if (!existsSync(path)) continue;
    if (fileMtime(path) > mdMtime) {
      output.addStaleness(`${file} modified after CLAUDE.md`, 1);
    }
  }
}

function checkGitActivity(projectDir, gitRoot, mdMtime, output) {
  if (!gitRoot) return;

  // Convert epoch to ISO date for git --since
  const mdDate = new Date(mdMtime * 1000).toISOString();

  const commitsSince = parseInt(
    git(`rev-list --count --since="${mdDate}" HEAD`, projectDir) || '0',
    10,
  );

  if (commitsSince > config.staleness.commits.critical) {
    output.addStaleness(`${commitsSince} commits since CLAUDE.md updated`, 2);
  } else if (commitsSince > config.staleness.commits.warn) {
    output.addStaleness(`${commitsSince} commits since CLAUDE.md updated`, 1);
  }

  // Check for top-level file churn
  const changed = git('diff --name-only --diff-filter=AD HEAD~20..HEAD', projectDir);
  if (changed) {
    const topLevel = changed.split('\n')
      .filter(f => f && !f.includes('/') && !f.startsWith('.'));
    if (topLevel.length > config.staleness.topLevelFiles) {
      output.addStaleness(`${topLevel.length} top-level files added/removed recently`, 1);
    }
  }
}

function checkLockFiles(projectDir, mdMtime, output) {
  for (const file of config.lockFiles) {
    const path = join(projectDir, file);
    if (!existsSync(path)) continue;
    const delta = Math.floor((fileMtime(path) - mdMtime) / 86400);
    if (delta > config.staleness.lockFileDays) {
      output.addStaleness(`${file} is ${delta} days newer than CLAUDE.md`, 1);
      return; // Only flag once
    }
  }
}

module.exports = { checkStaleness };
