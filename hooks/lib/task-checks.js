'use strict';

const { existsSync } = require('fs');
const { join, basename } = require('path');
const { homedir } = require('os');
const config = require('./config');
const { readJson, git } = require('./utils');

/**
 * Check if a persistent Task List ID is configured.
 */
function checkTaskList(projectDir, gitRoot, output) {
  if (isTaskListConfigured(projectDir)) return;
  if (!gitRoot) return;

  const commitCount = parseInt(git('rev-list --count HEAD', projectDir) || '0', 10);
  const fileOutput = git('ls-files', projectDir);
  const fileCount = fileOutput ? fileOutput.split('\n').filter(Boolean).length : 0;

  if (commitCount <= config.taskList.minCommits && fileCount <= config.taskList.minFiles) return;

  const repoName = basename(gitRoot);
  output.add('[SESSION GUARD] \u2139\uFE0F  No persistent Task List ID configured.');
  output.add(`  Project: ${commitCount} commits, ${fileCount} tracked files.`);
  output.addQuestion(
    'No persistent Task List ID configured. For a project this size, tasks won\'t survive across sessions. Add one?',
    'single_select',
    [
      `"Yes" \u2014 add {"env": {"CLAUDE_CODE_TASK_LIST_ID": "${repoName}"}} to .claude/settings.json`,
      '"Skip" \u2014 continue without persistent tasks',
    ],
    'low',
  );
}

function isTaskListConfigured(projectDir) {
  if (process.env.CLAUDE_CODE_TASK_LIST_ID) return true;

  const candidates = [
    join(projectDir, '.claude', 'settings.json'),
    join(homedir(), '.claude', 'settings.json'),
  ];

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const settings = readJson(path);
    if (settings?.env?.CLAUDE_CODE_TASK_LIST_ID) return true;
  }

  return false;
}

module.exports = { checkTaskList };
