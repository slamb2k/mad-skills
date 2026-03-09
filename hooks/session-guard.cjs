#!/usr/bin/env node
'use strict';

/**
 * Session Guard — Claude Code project health validation
 *
 * Replaces the shell-based session-guard.sh + session-guard-prompt.sh with a
 * single Node.js entry point using subcommand dispatch (modelled on claude-mem's
 * worker-service.cjs pattern).
 *
 * Subcommands:
 *   check   — SessionStart: validate git, CLAUDE.md, tasks, staleness
 *   remind  — UserPromptSubmit: re-emit pending context on first prompt
 *
 * Usage:
 *   node session-guard.js check
 *   node session-guard.js remind
 */

const { existsSync } = require('fs');
const { join } = require('path');

const config = require('./lib/config.cjs');
const state = require('./lib/state.cjs');
const { OutputBuilder } = require('./lib/output.cjs');
const { getBanner, BANNER_MARKER } = require('./lib/banner.cjs');
const { checkGit } = require('./lib/git-checks.cjs');
const { checkTaskList } = require('./lib/task-checks.cjs');
const { checkStaleness } = require('./lib/staleness.cjs');

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const CLAUDE_MD = join(PROJECT_DIR, 'CLAUDE.md');

// ─── check ─────────────────────────────────────────────────────────────
// Runs at SessionStart. Validates project health and emits context.

function check() {
  // Dedup: skip if recently checked (handles dual global+project registration)
  if (state.isRecentlyChecked(PROJECT_DIR)) {
    console.log(JSON.stringify({}));
    return;
  }

  const output = new OutputBuilder();

  // Banner — shown once per session at start
  output.add(getBanner());
  output.blank();

  // 0) Git repository validation
  const { gitRoot } = checkGit(PROJECT_DIR, output);

  // 1) CLAUDE.md existence
  if (!existsSync(CLAUDE_MD)) {
    output.add('[SESSION GUARD] \u26A0\uFE0F  No CLAUDE.md found in project root.');
    output.addQuestion(
      'No CLAUDE.md found. Want me to set up this project for Claude Code?',
      'single_select',
      [
        '"Initialise" \u2014 run `/init` to scaffold CLAUDE.md',
        '"Skip" \u2014 continue without one',
      ],
    );
    emit(output);
    return;
  }

  output.add(`[SESSION GUARD] \u2705 CLAUDE.md found in: ${PROJECT_DIR}`);

  // 2) Task List ID
  checkTaskList(PROJECT_DIR, gitRoot, output);

  // 3) Staleness evaluation
  checkStaleness(PROJECT_DIR, CLAUDE_MD, gitRoot, output);

  // 4) Staleness summary
  if (output.score >= config.staleness.threshold) {
    output.blank();
    output.add(`[SESSION GUARD] \u26A0\uFE0F  CLAUDE.md appears STALE (score: ${output.score}/${config.staleness.threshold})`);
    output.blank();
    output.add('Signals:');
    output.signals.forEach(sig => output.add(`  ${sig}`));
    output.addQuestion(
      `CLAUDE.md appears out of date (${output.signals.length} signals detected). What would you like to do?`,
      'single_select',
      [
        '"Update it" \u2014 review project structure, deps, recent changes and update CLAUDE.md (preserve user-written notes)',
        '"Show signals" \u2014 list what\'s drifted before deciding',
        '"Skip" \u2014 continue with current CLAUDE.md',
      ],
    );
  } else if (output.signals.length > 0) {
    output.blank();
    output.add(`[SESSION GUARD] \u2139\uFE0F  Minor drift (score: ${output.score}/${config.staleness.threshold}) \u2014 not flagging:`);
    output.signals.forEach(sig => output.add(`  ${sig}`));
  }

  emit(output);
}

// ─── remind ────────────────────────────────────────────────────────────
// Runs at UserPromptSubmit. Re-emits pending context from check, once.

function remind() {
  const pending = state.load(PROJECT_DIR);

  if (!pending || !pending.context) {
    console.log(JSON.stringify({}));
    return;
  }

  state.clear(PROJECT_DIR);

  // Skip re-emit if no warnings were found
  if (!pending.context.includes('\u26A0\uFE0F') && !pending.context.includes('\u2139\uFE0F')) {
    console.log(JSON.stringify({}));
    return;
  }

  // Strip banner from re-emission (already shown at SessionStart)
  const lines = pending.context.split('\n');
  const guardIdx = lines.findIndex(l => l.startsWith('[SESSION GUARD]'));
  const body = guardIdx >= 0 ? lines.slice(guardIdx).join('\n') : pending.context;

  const wrapped = [
    '[SESSION GUARD \u2014 FIRST PROMPT REMINDER]',
    'The following was detected at session start. Act on these items NOW using',
    'AskUserQuestion BEFORE proceeding with the user\'s request.',
    '',
    body,
  ].join('\n');

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: wrapped,
    },
  }));
}

// ─── helpers ───────────────────────────────────────────────────────────

function emit(output) {
  console.log(output.toJson());
  state.save(PROJECT_DIR, {
    context: output.parts.join('\n'),
    score: output.score,
    signals: output.signals,
  });
}

// ─── dispatch ──────────────────────────────────────────────────────────

const command = process.argv[2];

switch (command) {
  case 'check':
    check();
    break;
  case 'remind':
    remind();
    break;
  default:
    console.error(`Session Guard v${config.version}`);
    console.error('Usage: node session-guard.js <check|remind>');
    process.exit(1);
}
