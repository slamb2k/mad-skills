'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('fs');
const { tmpdir } = require('os');
const { join, resolve } = require('path');
const { execFileSync } = require('child_process');

const guard = resolve(__dirname, '../hooks/session-guard.cjs');
const stateModule = resolve(__dirname, '../hooks/lib/state.cjs');
const ledgerModule = resolve(__dirname, '../hooks/lib/logbook.cjs');

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'session-guard-'));
  const project = join(root, 'project');
  mkdirSync(project);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env, HOME: root, USERPROFILE: root, CLAUDE_PROJECT_DIR: project,
    CODEX_THREAD_ID: '', MAD_SKILLS_SESSION_ID: '' };
  const run = (command, input = {}, overrides = {}) => execFileSync(process.execPath, [guard, command], {
    cwd: root, env: { ...env, ...overrides }, input: JSON.stringify(input), encoding: 'utf8', timeout: 15000,
  });
  const script = (body) => execFileSync(process.execPath, ['-e',
    `const state = require(${JSON.stringify(stateModule)}); const project = ${JSON.stringify(project)}; ${body}`,
  ], { cwd: root, env, encoding: 'utf8', timeout: 15000 });
  return { root, project, run, script };
}

test('session state isolates pending reminders, deduplication, and cleanup', (t) => {
  const { script } = fixture(t);
  const result = JSON.parse(script(`
    state.save(project, { context: 'legacy' });
    state.saveInProgress(project, 'first');
    const unrelated = state.isRecentlyChecked(project, 5, 'second');
    state.save(project, { context: 'second' }, 'second');
    state.save(project, { context: 'first' }, 'first');
    state.clear(project, 'second');
    console.log(JSON.stringify({ unrelated, first: state.waitForReady(project, 100, 10, 'first').context,
      second: state.load(project, 'second'), legacy: state.load(project).context,
      recent: state.isRecentlyChecked(project, 5, 'first') }));
  `));
  assert.deepEqual(result, { unrelated: false, first: 'first', second: null, legacy: 'legacy', recent: true });
});

test('remind consumes only its session and emits valid event JSON once', (t) => {
  const { project, run, script } = fixture(t);
  script(`state.save(project, { context: '[SESSION GUARD] ⚠️ first banner' }, 'first');
    state.save(project, { context: '[SESSION GUARD] ⚠️ second banner' }, 'second');`);
  assert.match(JSON.parse(run('remind', { cwd: project, session_id: 'second' }))
    .hookSpecificOutput.additionalContext, /second banner/);
  assert.equal(JSON.parse(script("console.log(JSON.stringify(state.load(project, 'first')))")).context, '[SESSION GUARD] ⚠️ first banner');
  assert.deepEqual(JSON.parse(run('remind', { cwd: project, session_id: 'second' })), {});
});

test('identified sessions never consume legacy project reminders', (t) => {
  const { project, run, script } = fixture(t);
  script("state.save(project, { context: '[SESSION GUARD] ⚠️ legacy banner' });");
  assert.deepEqual(JSON.parse(run('remind', { cwd: project, session_id: 'new' })), {});
  assert.match(JSON.parse(run('remind', { cwd: project })).hookSpecificOutput.additionalContext, /legacy banner/);
});

test('Codex thread ID scopes reminders when input lacks a session ID', (t) => {
  const { project, run, script } = fixture(t);
  script("state.save(project, { context: '[SESSION GUARD] ⚠️ thread banner' }, 'thread');");
  assert.match(JSON.parse(run('remind', { cwd: project }, { CODEX_THREAD_ID: 'thread' }))
    .hookSpecificOutput.additionalContext, /thread banner/);
});

test('background check preserves payload cwd and session identity for AGENTS projects', (t) => {
  const { root, project, run, script } = fixture(t);
  writeFileSync(join(project, 'AGENTS.md'), '# Project\n');
  assert.deepEqual(JSON.parse(run('check', { cwd: project, session_id: 'background' }, { CLAUDE_PROJECT_DIR: root })), {});
  const pending = JSON.parse(script("console.log(JSON.stringify(state.waitForReady(project, 10000, 20, 'background')))"));
  assert.match(pending.context, /AGENTS\.md found/);
  assert.doesNotMatch(pending.context, /No CLAUDE\.md/);
  assert.equal(JSON.parse(script('console.log(JSON.stringify(state.load(project)))')), null);
});

test('main-conversation reminders exempt inherited side questions and subagents', (t) => {
  const { project, run, script } = fixture(t);
  script("state.save(project, { context: 'banner\\n[SESSION GUARD] ⚠️ Review setup' }, 'main');");
  const context = JSON.parse(run('remind', { cwd: project, session_id: 'main' }))
    .hookSpecificOutput.additionalContext;
  assert.match(context, /primary conversation only/);
  assert.match(context, /Side questions \(including \/btw and \/side\) and subagents must ignore this inherited banner/);
  assert.match(context, /must ignore these inherited reminders/);
});

test('banner-only reminders also exempt inherited side questions', (t) => {
  const { project, run, script } = fixture(t);
  script("state.save(project, { context: 'banner\\n[SESSION GUARD] ✅ Ready' }, 'main');");
  const context = JSON.parse(run('remind', { cwd: project, session_id: 'main' }))
    .hookSpecificOutput.additionalContext;
  assert.match(context, /Side questions \(including \/btw and \/side\) and subagents must ignore/);
  assert.doesNotMatch(context, /FIRST PROMPT REMINDER/);
});

test('existing CLAUDE.md takes precedence when both instruction files exist', (t) => {
  const { project, run, script } = fixture(t);
  writeFileSync(join(project, 'CLAUDE.md'), '# Project\n');
  writeFileSync(join(project, 'AGENTS.md'), '# Project\n');
  run('check', { cwd: project, session_id: 'both' });
  const pending = JSON.parse(script("console.log(JSON.stringify(state.waitForReady(project, 10000, 20, 'both')))"));
  assert.match(pending.context, /CLAUDE\.md found/);
});

test('logbook startup hints return structured SessionStart output', (t) => {
  const { project, run, script } = fixture(t);
  script(`const ledger = require(${JSON.stringify(ledgerModule)});
    ledger.add(project, { title: 'Review follow-up', category: 'follow-up', source: 'test' });`);
  const output = JSON.parse(run('logbook-hint', { cwd: project, session_id: 'hint' }));
  assert.equal(output.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(output.hookSpecificOutput.additionalContext, /open follow-up/);
});

test('empty logbook remains a silent no-op', (t) => {
  const { project, run } = fixture(t);
  assert.equal(run('logbook-hint', { cwd: project }), '');
});
