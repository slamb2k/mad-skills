'use strict';

const { existsSync } = require('fs');
const { join, basename } = require('path');
const config = require('./config.cjs');
const { fileMtime, git, readJson, readText, getDirectories } = require('./utils.cjs');

/**
 * Evaluate all staleness signals for the selected project instructions.
 * Mutates output.addStaleness() with weighted signals.
 */
function checkStaleness(projectDir, instructionsPath, gitRoot, output) {
  const now = Math.floor(Date.now() / 1000);
  const mdMtime = fileMtime(instructionsPath);
  const mdAgeDays = Math.floor((now - mdMtime) / 86400);
  const instructionsName = basename(instructionsPath);

  checkAge(mdAgeDays, instructionsName, output);
  checkDirectoryDrift(projectDir, instructionsPath, instructionsName, output);
  checkPackageJson(projectDir, instructionsPath, instructionsName, mdMtime, output);
  checkPythonDeps(projectDir, instructionsName, mdMtime, output);
  checkConfigFiles(projectDir, instructionsName, mdMtime, output);
  checkGitActivity(projectDir, gitRoot, instructionsName, mdMtime, output);
  checkLockFiles(projectDir, instructionsName, mdMtime, output);
}

// ─── Individual checks ─────────────────────────────────────────────────

function checkAge(ageDays, instructionsName, output) {
  const { warn, critical } = config.staleness.age;
  if (ageDays > critical) {
    output.addStaleness(`${instructionsName} last modified ${ageDays} days ago`, 2);
  } else if (ageDays > warn) {
    output.addStaleness(`${instructionsName} last modified ${ageDays} days ago`, 1);
  }
}

function checkDirectoryDrift(projectDir, instructionsPath, instructionsName, output) {
  const dirs = getDirectories(projectDir);
  if (dirs.length === 0) return;

  const instructions = readText(instructionsPath);
  if (!instructions) return;

  const mdLower = instructions.toLowerCase();
  const missing = dirs.filter(d => !mdLower.includes(d.toLowerCase()));

  if (missing.length > config.staleness.missingDirs.many) {
    output.addStaleness(`Directories not in ${instructionsName}: ${missing.join(' ')}`, 2);
  } else if (missing.length > config.staleness.missingDirs.few) {
    output.addStaleness(`Directories not in ${instructionsName}: ${missing.join(' ')}`, 1);
  }
}

function checkPackageJson(projectDir, instructionsPath, instructionsName, mdMtime, output) {
  const pkgPath = join(projectDir, 'package.json');
  if (!existsSync(pkgPath)) return;

  const pkgMtime = fileMtime(pkgPath);
  if (pkgMtime > mdMtime) {
    const delta = Math.floor((pkgMtime - mdMtime) / 86400);
    output.addStaleness(`package.json modified ${delta} day(s) after ${instructionsName}`, 1);
  }

  const pkg = readJson(pkgPath);
  if (!pkg) return;

  const depCount = Object.keys(pkg.dependencies || {}).length
    + Object.keys(pkg.devDependencies || {}).length;

  const instructions = readText(instructionsPath) || '';
  const documented = instructions.match(/(\d+)\s*(dependencies|deps)/i);
  if (documented) {
    const docCount = parseInt(documented[1], 10);
    const drift = Math.abs(depCount - docCount);
    if (drift > config.staleness.depDrift.major) {
      output.addStaleness(`Dep count drift: ${instructionsName} ~${docCount}, actual ${depCount} (\u0394${depCount - docCount})`, 2);
    } else if (drift > config.staleness.depDrift.minor) {
      output.addStaleness(`Dep count drift: ${instructionsName} ~${docCount}, actual ${depCount}`, 1);
    }
  }

  // Check for undocumented production deps
  const prodDeps = Object.keys(pkg.dependencies || {});
  const mdLower = instructions.toLowerCase();
  const undocumented = prodDeps.filter(d => !mdLower.includes(d.toLowerCase()));
  if (undocumented.length > config.staleness.undocumentedDeps) {
    output.addStaleness(
      `${undocumented.length} production deps not in ${instructionsName} (e.g. ${undocumented.slice(0, 5).join(', ')})`,
      2,
    );
  }
}

function checkPythonDeps(projectDir, instructionsName, mdMtime, output) {
  for (const file of config.pythonFiles) {
    const path = join(projectDir, file);
    if (!existsSync(path)) continue;
    if (fileMtime(path) > mdMtime) {
      output.addStaleness(`${file} modified after ${instructionsName}`, 1);
    }
  }
}

function checkConfigFiles(projectDir, instructionsName, mdMtime, output) {
  for (const file of config.configFiles) {
    const path = join(projectDir, file);
    if (!existsSync(path)) continue;
    if (fileMtime(path) > mdMtime) {
      output.addStaleness(`${file} modified after ${instructionsName}`, 1);
    }
  }
}

function checkGitActivity(projectDir, gitRoot, instructionsName, mdMtime, output) {
  if (!gitRoot) return;

  // Convert epoch to ISO date for git --since
  const mdDate = new Date(mdMtime * 1000).toISOString();

  const commitsSince = parseInt(
    git(`rev-list --count --since="${mdDate}" HEAD`, projectDir) || '0',
    10,
  );

  if (commitsSince > config.staleness.commits.critical) {
    output.addStaleness(`${commitsSince} commits since ${instructionsName} updated`, 2);
  } else if (commitsSince > config.staleness.commits.warn) {
    output.addStaleness(`${commitsSince} commits since ${instructionsName} updated`, 1);
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

function checkLockFiles(projectDir, instructionsName, mdMtime, output) {
  for (const file of config.lockFiles) {
    const path = join(projectDir, file);
    if (!existsSync(path)) continue;
    const delta = Math.floor((fileMtime(path) - mdMtime) / 86400);
    if (delta > config.staleness.lockFileDays) {
      output.addStaleness(`${file} is ${delta} days newer than ${instructionsName}`, 1);
      return; // Only flag once
    }
  }
}

module.exports = { checkStaleness };
