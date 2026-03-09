'use strict';

const { existsSync } = require('fs');
const { join, dirname, basename } = require('path');
const config = require('./config');
const { git, readJson, countFiles } = require('./utils');

/**
 * Validate git repository state.
 * Returns { gitRoot: string|null }.
 */
function checkGit(projectDir, output) {
  const gitRoot = git('rev-parse --show-toplevel', projectDir);

  if (gitRoot === null) {
    output.add('[SESSION GUARD] \u26A0\uFE0F  This directory is NOT tracked by Git.');
    output.addQuestion(
      'This directory isn\'t inside a Git repository. What would you like to do?',
      'single_select',
      [
        '"Initialise Git" \u2014 run `git init` and suggest creating .gitignore',
        '"Skip" \u2014 continue without version control',
      ],
    );
    return { gitRoot: null };
  }

  if (gitRoot !== projectDir) {
    checkNestedGit(projectDir, gitRoot, output);
  }

  return { gitRoot };
}

function checkNestedGit(projectDir, gitRoot, output) {
  // Calculate depth
  let depth = 0;
  let check = projectDir;
  while (check !== gitRoot && check !== '/') {
    check = dirname(check);
    depth++;
  }

  const signals = detectMonorepo(gitRoot);
  const relative = projectDir.slice(gitRoot.length + 1);

  if (signals.length >= config.monorepo.minSignals) {
    output.add(`[SESSION GUARD] \u2139\uFE0F  Git root is ${depth} level(s) above CWD.`);
    output.add(`  Git root:    ${gitRoot}`);
    output.add(`  Working dir: ${projectDir}`);
    output.add(`  Monorepo signals: ${signals.join(', ')}`);
    output.addQuestion(
      `Git root is at \`${gitRoot}\` (monorepo). Working in \`${relative}\`. Correct context?`,
      'single_select',
      ['"Yes, correct package"', '"No, switch to repo root"'],
      'low',
    );
  } else {
    const fileCount = countFiles(gitRoot);
    output.add(`[SESSION GUARD] \u26A0\uFE0F  Git root is ${depth} level(s) above CWD \u2014 does NOT look like a monorepo.`);
    output.add(`  Git root:    ${gitRoot} (${fileCount} files)`);
    output.add(`  Working dir: ${projectDir}`);
    if (signals.length > 0) {
      output.add(`  Weak signals: ${signals.join(', ')}`);
    }
    output.addQuestion(
      `Git root is at \`${gitRoot}\` (${depth} levels up), which doesn't look like a monorepo. May have been created accidentally.`,
      'single_select',
      [
        '"It\'s correct" \u2014 continue normally',
        '"Initialise here instead" \u2014 run `git init` here (warn ancestor .git still exists)',
        '"Investigate" \u2014 list git root contents and recent commits',
      ],
    );
  }
}

function detectMonorepo(gitRoot) {
  const signals = [];

  // Check workspaces in package.json
  const pkg = readJson(join(gitRoot, 'package.json'));
  if (pkg && pkg.workspaces) {
    signals.push('package.json has \'workspaces\' field');
  }

  // Check marker files
  for (const marker of config.monorepo.markers) {
    if (existsSync(join(gitRoot, marker))) {
      signals.push(`${marker} exists`);
    }
  }

  // Check common monorepo directories
  for (const dir of config.monorepo.dirs) {
    if (existsSync(join(gitRoot, dir))) {
      signals.push(`'${dir}/' directory exists at git root`);
    }
  }

  // Count package.json files (crude monorepo signal)
  const pkgCount = git('ls-files --cached --others --exclude-standard -- "*/package.json" "package.json"', gitRoot);
  if (pkgCount) {
    const count = pkgCount.split('\n').filter(Boolean).length;
    if (count > 2) signals.push(`${count} package.json files found`);
  }

  // Count CLAUDE.md files
  const claudeCount = git('ls-files --cached -- "*/CLAUDE.md" "CLAUDE.md"', gitRoot);
  if (claudeCount) {
    const count = claudeCount.split('\n').filter(Boolean).length;
    if (count > 1) signals.push(`${count} CLAUDE.md files found (per-package setup)`);
  }

  return signals;
}

module.exports = { checkGit };
