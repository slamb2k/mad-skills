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
        '"Set up with /brace" \u2014 scaffold CLAUDE.md + project structure (specs, tools, context)',
        '"Basic init" \u2014 run `/init` to scaffold CLAUDE.md only',
        '"Skip" \u2014 continue without one',
      ],
    );
    emit(output);
    return;
  }

  output.add(`[SESSION GUARD] \u2705 CLAUDE.md found in: ${PROJECT_DIR}`);

  // 1b) Project scaffold check
  checkBrace(PROJECT_DIR, output);

  // 1c) Rig (dev tooling) check
  checkRig(PROJECT_DIR, output);

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

  // Split into banner and SESSION GUARD body
  const lines = pending.context.split('\n');
  const guardIdx = lines.findIndex(l => l.startsWith('[SESSION GUARD]'));
  const banner = guardIdx >= 0 ? lines.slice(0, guardIdx).join('\n').trim() : '';
  const body = guardIdx >= 0 ? lines.slice(guardIdx).join('\n') : pending.context;

  const hasWarnings = pending.context.includes('\u26A0\uFE0F') || pending.context.includes('\u2139\uFE0F');
  const parts = [];

  // Always include banner with display directive
  if (banner) {
    parts.push(
      '[SESSION GUARD] DISPLAY: Render the banner below in a fenced code block before any other response.',
      '',
      banner,
      '',
    );
  }

  // Include warnings/signals if present
  if (hasWarnings) {
    parts.push(
      '[SESSION GUARD \u2014 FIRST PROMPT REMINDER]',
      'The following was detected at session start. Act on these items NOW using',
      'AskUserQuestion BEFORE proceeding with the user\'s request.',
      '',
      body,
    );
  }

  // Nothing to emit (no banner, no warnings)
  if (parts.length === 0) {
    console.log(JSON.stringify({}));
    return;
  }

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: parts.join('\n'),
    },
  }));
}

// ─── brace check ──────────────────────────────────────────────────

function checkBrace(projectDir, output) {
  const specsDir = join(projectDir, 'specs');
  if (existsSync(specsDir)) return; // scaffold already set up

  const prefs = state.loadPrefs(projectDir);
  if (prefs.braceDismissed) return; // User said don't ask again

  output.add('[SESSION GUARD] \u2139\uFE0F  CLAUDE.md exists but no project scaffold detected.');
  output.add('[SESSION GUARD] BRACE_DISMISS: If the user selects "Don\'t ask again", run: node <path-to-session-guard.cjs> dismiss-brace');
  output.addQuestion(
    'This project has a CLAUDE.md but no project scaffold (specs/, tools/, context/). Want to set it up?',
    'single_select',
    [
      '"Set up with /brace" \u2014 add project scaffold structure',
      '"Not now" \u2014 skip for this session',
      '"Don\'t ask again" \u2014 dismiss permanently for this project',
    ],
    'low',
  );
}

// ─── rig check ────────────────────────────────────────────────────

const PLATFORM_MARKERS = [
  'package.json', 'pyproject.toml', 'requirements.txt', 'setup.py',
  'go.mod', 'Cargo.toml', 'Gemfile', 'pom.xml', 'build.gradle',
];

const INFRA_MARKERS = [
  'lefthook.yml', '.lefthook.yml',                                    // git hooks
  '.husky',                                                           // git hooks (alt)
  '.gitmessage',                                                      // commit template
  '.github/pull_request_template.md',                                 // PR template (GitHub)
  '.azuredevops/pull_request_template.md',                            // PR template (Azure)
  '.github/workflows',                                                // CI (GitHub Actions)
  'azure-pipelines.yml',                                              // CI (Azure DevOps)
  '.gitlab-ci.yml',                                                   // CI (GitLab)
  'Jenkinsfile',                                                      // CI (Jenkins)
  '.circleci',                                                        // CI (CircleCI)
];

function checkRig(projectDir, output) {
  const prefs = state.loadPrefs(projectDir);
  if (prefs.rigDismissed) return;

  // Need at least one platform
  const hasPlatform = PLATFORM_MARKERS.some(f => existsSync(join(projectDir, f)));
  if (!hasPlatform) return;

  // If any infra marker exists, rig is (at least partially) set up
  const hasInfra = INFRA_MARKERS.some(f => existsSync(join(projectDir, f)));
  if (hasInfra) return;

  output.add('[SESSION GUARD] \u2139\uFE0F  Project has code but no dev tooling (hooks, CI, PR templates) detected.');
  output.add('[SESSION GUARD] RIG_DISMISS: If the user selects "Don\'t ask again", run: node <path-to-session-guard.cjs> dismiss-rig');
  output.addQuestion(
    'No dev tooling detected (git hooks, CI, PR templates, commit templates). Want to set it up?',
    'single_select',
    [
      '"Set up with /rig" \u2014 configure lefthook, CI workflow, PR template, commit template',
      '"Not now" \u2014 skip for this session',
      '"Don\'t ask again" \u2014 dismiss permanently for this project',
    ],
    'low',
  );
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
  case 'dismiss-brace': {
    const prefs = state.loadPrefs(PROJECT_DIR);
    prefs.braceDismissed = true;
    state.savePrefs(PROJECT_DIR, prefs);
    console.log(`BRACE prompt dismissed for ${PROJECT_DIR}`);
    break;
  }
  case 'dismiss-rig': {
    const prefs = state.loadPrefs(PROJECT_DIR);
    prefs.rigDismissed = true;
    state.savePrefs(PROJECT_DIR, prefs);
    console.log(`Rig prompt dismissed for ${PROJECT_DIR}`);
    break;
  }
  default:
    console.error(`Session Guard v${config.version}`);
    console.error('Usage: node session-guard.js <check|remind|dismiss-brace|dismiss-rig>');
    process.exit(1);
}
