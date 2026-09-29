'use strict';

const { existsSync } = require('fs');
const { join, basename } = require('path');
const { createHash } = require('crypto');
const config = require('./config.cjs');
const typesafe = require('./typesafe.cjs');
const state = require('./state.cjs');
const { fileMtime, git, gitArgs, readJson, readText, getDirectories } = require('./utils.cjs');

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
  const missing = dirs.filter(d => !isDirectoryMentioned(d.toLowerCase(), mdLower));

  if (missing.length > config.staleness.missingDirs.many) {
    output.addStaleness(`Directories not in ${instructionsName}: ${missing.join(' ')}`, 2);
  } else if (missing.length > config.staleness.missingDirs.few) {
    output.addStaleness(`Directories not in ${instructionsName}: ${missing.join(' ')}`, 1);
  }
}

// A nested directory counts as mentioned when its full path appears, or when
// its parent is mentioned and the leaf appears tree-style with a trailing
// slash (e.g. `skills/` with `├── brace/` beneath it).
function isDirectoryMentioned(dir, mdLower) {
  if (mdLower.includes(dir)) return true;
  const slash = dir.lastIndexOf('/');
  if (slash < 0) return false;
  const parent = dir.slice(0, slash);
  const leaf = dir.slice(slash + 1);
  return isDirectoryMentioned(parent, mdLower) && mdLower.includes(`${leaf}/`);
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

// ─── Optional semantic materiality check ──────────────────────────────
// The weighted signals above are cheap proxies (dates, counts, substring
// matches) and fire on changes an instructions file already covers. When the
// TypeSafe judge is enabled, ask whether the actual changes since the file
// was last committed make it materially out of date. Returns P(update needed)
// or null (disabled, no committed baseline, or the call failed).

const STALENESS_QUESTION = {
  type: 'noul',
  instructions: {
    task: '`instructions_file` is the project\'s agent instructions file. `changes_since_last_update` is what changed in the repository after that file was last committed; `heuristic_signals` are automated drift warnings, which are often false positives. Decide whether the instructions file now needs updating: something it states has become inaccurate, or a significant new element a contributor would need to know about (a directory, command, dependency, workflow, or component) is missing from it.',
  },
  criteria: {
    true: 'An update is needed — a reader following the file would now be misled or miss something significant.',
    false: 'No meaningful update needed — the changes are internal, already covered by the file (including by general patterns or globs), or too minor to document.',
  },
};

const CHANGE_FILES = ['package.json', ...config.pythonFiles, ...config.configFiles];

function capLines(text, max) {
  const lines = (text || '').split('\n').filter(Boolean);
  return lines.length > max ? [...lines.slice(0, max), `… ${lines.length - max} more`] : lines;
}

/**
 * What changed since `instructionsName` was last committed, as of `head`
 * (a commit) or — when `head` is omitted — the working tree.
 */
function changeEvidence(projectDir, instructionsName, head, since) {
  const base = since || gitArgs(['log', '-1', '--format=%H', head || 'HEAD', '--', instructionsName], projectDir);
  if (!base) return null;
  const range = head ? [base, head] : [base];
  const diff = gitArgs(['diff', ...range, '--', ...CHANGE_FILES], projectDir) || '';
  return {
    commit_subjects: capLines(gitArgs(['log', '--format=%s', `${base}..${head || 'HEAD'}`], projectDir), 60),
    changed_files: capLines(gitArgs(['diff', '--name-status', ...range, '--', '.', `:!${instructionsName}`], projectDir), 120),
    config_diff: diff.length > 6000 ? `${diff.slice(0, 6000)}\n… truncated` : diff,
  };
}

function judgeStaleness(projectDir, instructionsPath, signals, opts = {}) {
  if (!opts.judgeAll && !typesafe.enabled()) return null;
  const name = basename(instructionsPath);
  const text = (opts.instructionsText ?? readText(instructionsPath) ?? '').slice(0, 60000);
  const changes = changeEvidence(projectDir, name, opts.head, opts.since);
  if (!text || !changes) return null;

  const key = createHash('sha1').update(JSON.stringify([typesafe.MODEL, text, changes, signals])).digest('hex');
  const prefs = opts.cache === false ? {} : state.loadPrefs(projectDir);
  if (prefs.stalenessJudgement && prefs.stalenessJudgement.key === key) return prefs.stalenessJudgement.p;

  const judgeAll = opts.judgeAll || typesafe.judgeAllSync;
  const answers = judgeAll([{
    state: { instructions_file: text, changes_since_last_update: changes, heuristic_signals: signals },
    questions: { needs_update: STALENESS_QUESTION },
  }], { timeoutMs: 2500, retries: 0 });
  const p = typesafe.noul(answers && answers[0], 'needs_update');
  if (p !== null && opts.cache !== false) {
    state.savePrefs(projectDir, { ...state.loadPrefs(projectDir), stalenessJudgement: { key, p } });
  }
  return p;
}

module.exports = { checkStaleness, judgeStaleness, changeEvidence };
