'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync, rmSync } = require('fs');
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

test('AGENTS.md takes precedence when both instruction files exist', (t) => {
  const { project, run, script } = fixture(t);
  writeFileSync(join(project, 'CLAUDE.md'), '@AGENTS.md\n');
  writeFileSync(join(project, 'AGENTS.md'), '# Project\n');
  run('check', { cwd: project, session_id: 'both' });
  const pending = JSON.parse(script("console.log(JSON.stringify(state.waitForReady(project, 10000, 20, 'both')))"));
  assert.match(pending.context, /AGENTS\.md found/);
  assert.doesNotMatch(pending.context, /CLAUDE\.md found/);
  assert.doesNotMatch(pending.context, /CLAUDE\.md also carries its own content/);
});

test('CLAUDE.md with its own content alongside AGENTS.md is flagged for migration', (t) => {
  const { project, run, script } = fixture(t);
  writeFileSync(join(project, 'CLAUDE.md'), '# Project\n\nUse bun for scripts.\n');
  writeFileSync(join(project, 'AGENTS.md'), '# Project\n');
  run('check', { cwd: project, session_id: 'migrate' });
  const pending = JSON.parse(script("console.log(JSON.stringify(state.waitForReady(project, 10000, 20, 'migrate')))"));
  assert.match(pending.context, /AGENTS\.md found/);
  assert.match(pending.context, /CLAUDE\.md also carries its own content/);
});

test('Claude-only notes under an @AGENTS.md import are not flagged for migration', (t) => {
  const { project, run, script } = fixture(t);
  writeFileSync(join(project, 'CLAUDE.md'), '@AGENTS.md\n\n## Claude only\n- Use plan mode for refactors.\n');
  writeFileSync(join(project, 'AGENTS.md'), '# Project\n');
  run('check', { cwd: project, session_id: 'extras' });
  const pending = JSON.parse(script("console.log(JSON.stringify(state.waitForReady(project, 10000, 20, 'extras')))"));
  assert.match(pending.context, /AGENTS\.md found/);
  assert.doesNotMatch(pending.context, /CLAUDE\.md also carries its own content/);
  assert.doesNotMatch(pending.context, /does not reference AGENTS\.md/);
});

test('CLAUDE.md-only projects are told the next update migrates to AGENTS.md', (t) => {
  const { project, run, script } = fixture(t);
  writeFileSync(join(project, 'CLAUDE.md'), '# Project\n');
  run('check', { cwd: project, session_id: 'legacy-only' });
  const pending = JSON.parse(script("console.log(JSON.stringify(state.waitForReady(project, 10000, 20, 'legacy-only')))"));
  assert.match(pending.context, /CLAUDE\.md found/);
  assert.match(pending.context, /No AGENTS\.md .* migrate CLAUDE\.md to AGENTS\.md/);
});

test('missing instructions prompt scaffolds AGENTS.md with a CLAUDE.md pointer', (t) => {
  const { project, run, script } = fixture(t);
  run('check', { cwd: project, session_id: 'none' });
  const pending = JSON.parse(script("console.log(JSON.stringify(state.waitForReady(project, 10000, 20, 'none')))"));
  assert.match(pending.context, /No AGENTS\.md or CLAUDE\.md found/);
  assert.match(pending.context, /scaffold AGENTS\.md \(with a CLAUDE\.md pointer\)/);
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

// ─── unified session handoff ───────────────────────────────────────────

function gitRepo(t) {
  const fx = fixture(t);
  const git = (args, cwd = fx.project) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  git(['init', '-q']);
  git(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init']);
  mkdirSync(join(fx.project, 'specs'));
  writeFileSync(join(fx.project, 'specs', 'x.md'), '---\ntitle: "X"\n---\n# X\n');
  writeFileSync(join(fx.project, 'AGENTS.md'), '# Project\n');
  const cli = (command, ...args) => execFileSync(process.execPath, [guard, command, ...args], {
    cwd: fx.root, encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HOME: fx.root, USERPROFILE: fx.root, CLAUDE_PROJECT_DIR: fx.project,
      CODEX_THREAD_ID: '', MAD_SKILLS_SESSION_ID: '' },
  });
  const context = (out) => (JSON.parse(out).hookSpecificOutput || {}).additionalContext || '';
  return { ...fx, git, cli, context };
}

test('handoff injects an armed build slot on a healthy repo (AC-001)', (t) => {
  const { project, run, cli, context } = gitRepo(t);
  cli('handoff-arm', '--kind', 'build', '--spec', 'specs/x.md', '--dir', project);
  const out = JSON.parse(run('handoff', { cwd: project, session_id: 's1' }));
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(out.hookSpecificOutput.additionalContext, /specs\/x\.md/);
  assert.match(context(run('handoff', { cwd: project, session_id: 's2' })), /Pending: \/build specs\/x\.md/);
});

test('check-bg no longer emits the old pending-spec banner', (t) => {
  const { project, run, cli, script } = gitRepo(t);
  cli('handoff-arm', '--kind', 'build', '--spec', 'specs/x.md', '--dir', project);
  run('check', { cwd: project, session_id: 'bg' });
  const pending = JSON.parse(script("console.log(JSON.stringify(state.waitForReady(project, 10000, 20, 'bg')))"));
  assert.doesNotMatch(pending.context, /Pending spec ready/);
});

test('waybill handoff is one-shot across consumes (AC-002)', (t) => {
  const { project, run, cli, context } = gitRepo(t);
  const way = join(project, 'w.md');
  writeFileSync(way, '# Waybill — t\nresume here\n');
  cli('handoff-arm', '--kind', 'waybill', '--waybill', way, '--dir', project);
  assert.match(context(run('handoff', { cwd: project })), /resume here/);
  assert.deepEqual(JSON.parse(run('handoff', { cwd: project })), {});
  assert.deepEqual(JSON.parse(run('handoff', { cwd: project })), {});
});

test('arm with a subdirectory --dir finds the spec at the repo root (AC-003)', (t) => {
  const { project, cli, run, context } = gitRepo(t);
  const sub = join(project, 'src', 'deep');
  mkdirSync(sub, { recursive: true });
  assert.match(cli('handoff-arm', '--kind=build', '--spec=specs/x.md', `--dir=${sub}`), /handoff: armed build for /);
  assert.match(context(run('handoff', { cwd: project })), /specs\/x\.md/);
});

test('bad arm arguments exit 1 with usage', (t) => {
  const { project, cli } = gitRepo(t);
  assert.throws(() => cli('handoff-arm', '--kind', 'build', '--dir', project), (e) => e.status === 1 && /Usage/.test(e.stderr));
});

test('handoff-clear removes the slot so lifecycle-next no longer lists it (AC-004)', (t) => {
  const { project, cli } = gitRepo(t);
  cli('handoff-arm', '--kind', 'build', '--spec', 'specs/x.md', '--dir', project);
  assert.match(cli('lifecycle-next'), /\/build specs\/x\.md — spec ready since \d{4}-\d{2}-\d{2}/);
  assert.match(cli('handoff-clear', '--kind', 'build', '--dir', project), /cleared build/);
  assert.doesNotMatch(cli('lifecycle-next'), /spec ready since/);
});

test('owned waybill is swept on the third session, edited ones kept (AC-008, AC-009)', (t) => {
  const { project, run, cli, context } = gitRepo(t);
  const way = join(project, 'w.md');
  const edited = join(project, 'w2.md');
  writeFileSync(way, '# Waybill — t\nbody\n');
  cli('handoff-arm', '--kind', 'waybill', '--waybill', way, '--dir', project);
  run('handoff', { cwd: project });
  assert.ok(existsSync(way), 'file exists during the resume session');
  run('handoff', { cwd: project });
  assert.ok(!existsSync(way));

  writeFileSync(edited, '# Waybill — t\nbody\n');
  cli('handoff-arm', '--kind', 'waybill', '--waybill', edited, '--dir', project);
  run('handoff', { cwd: project });
  writeFileSync(edited, `${readFileSync(edited, 'utf8')}my notes\n`);
  assert.match(context(run('handoff', { cwd: project })), /was edited — kept/);
  assert.ok(existsSync(edited));
});

test('specs are never deleted by clear or sweep (AC-010)', (t) => {
  const { project, run, cli } = gitRepo(t);
  cli('handoff-arm', '--kind', 'build', '--spec', 'specs/x.md', '--dir', project);
  run('handoff', { cwd: project });
  run('handoff', { cwd: project });
  cli('handoff-clear', '--kind', 'all', '--dir', project);
  assert.ok(existsSync(join(project, 'specs', 'x.md')));
});

test('legacy root waybill survives sweep and is listed by handoff-clean (AC-011)', (t) => {
  const { project, run, cli } = gitRepo(t);
  const legacy = join(project, 'waybill.md');
  writeFileSync(legacy, '# Waybill — old\nstuff\n');
  appendFileSync(join(project, '.git', 'info', 'exclude'), 'waybill.md # mad-skills:ferry\n');
  run('handoff', { cwd: project });
  run('handoff', { cwd: project });
  assert.ok(existsSync(legacy));
  assert.match(cli('handoff-clean', '--dir', project), /legacy .*waybill\.md/);
  cli('handoff-clean', '--yes', '--dir', project);
  assert.ok(existsSync(legacy));
  cli('handoff-clean', '--yes', '--legacy', '--dir', project);
  assert.ok(!existsSync(legacy));
});

test('build and waybill slots are independent (AC-012)', (t) => {
  const { project, run, cli, context } = gitRepo(t);
  const way = join(project, 'w.md');
  writeFileSync(way, '# Waybill — t\nwb\n');
  cli('handoff-arm', '--kind', 'build', '--spec', 'specs/x.md', '--dir', project);
  cli('handoff-arm', '--kind', 'waybill', '--waybill', way, '--dir', project);
  const both = context(run('handoff', { cwd: project }));
  assert.ok(both.indexOf('waybill document') < both.indexOf('[HANDOFF] The previous session'));
  cli('handoff-clear', '--kind', 'waybill', '--dir', project);
  assert.match(context(run('handoff', { cwd: project })), /Pending: \/build/);
  assert.ok(!existsSync(way));
});

test('worktrees share the repo key: clear from a linked worktree; waybill stays per-toplevel', (t) => {
  const { root, project, git, cli, run, context } = gitRepo(t);
  const wt = join(root, 'wt');
  git(['worktree', 'add', '-q', '-b', 'feat', wt]);
  cli('handoff-arm', '--kind', 'build', '--spec', 'specs/x.md', '--dir', project);
  const way = join(wt, 'w.md');
  writeFileSync(way, '# Waybill — t\nwt body\n');
  cli('handoff-arm', '--kind', 'waybill', '--waybill', way, '--dir', wt);
  assert.doesNotMatch(context(run('handoff', { cwd: project })), /wt body/);
  assert.match(context(run('handoff', { cwd: wt })), /wt body/);
  cli('handoff-clear', '--kind', 'build', '--dir', wt);
  assert.doesNotMatch(cli('lifecycle-next'), /spec ready since/);
});

test('handoff-path prints a stable default waybill path', (t) => {
  const { project, cli } = gitRepo(t);
  const a = cli('handoff-path', '--dir', project).trim();
  assert.equal(a, cli('handoff-path', '--dir', project).trim());
  assert.match(a, /waybill\.md$/);
  assert.ok(existsSync(join(a, '..')));
});

test('handoff-path --kind selects distinct build and waybill paths', (t) => {
  const { project, cli } = gitRepo(t);
  const w = cli('handoff-path', '--dir', project).trim();
  const b = cli('handoff-path', '--kind', 'build', '--dir', project).trim();
  assert.notEqual(w, b);
  assert.match(b, /build-waybill\.md$/);
});

test('compact/resume SessionStart sources do not advance the handoff', (t) => {
  const { project, run, cli, context } = gitRepo(t);
  const way = join(project, 'w.md');
  writeFileSync(way, '# Waybill — t\nbody\n');
  cli('handoff-arm', '--kind', 'waybill', '--waybill', way, '--dir', project);
  assert.deepEqual(JSON.parse(run('handoff', { cwd: project, source: 'compact' })), {});
  assert.deepEqual(JSON.parse(run('handoff', { cwd: project, source: 'resume' })), {});
  assert.match(context(run('handoff', { cwd: project, source: 'clear' })), /body/);
  assert.deepEqual(JSON.parse(run('handoff', { cwd: project, source: 'compact' })), {});
  assert.ok(existsSync(way));
});

test('handoff-arm auto-checkpoint keeps a pending ferry waybill; handoff-clear --source is selective', (t) => {
  const { project, cli } = gitRepo(t);
  const way = join(project, 'w.md');
  const cp = join(project, 'cp.md');
  writeFileSync(way, '# Waybill — t\nbody\n');
  writeFileSync(cp, '# Waybill — cp\n');
  cli('handoff-arm', '--kind', 'waybill', '--waybill', way, '--dir', project);
  assert.match(cli('handoff-arm', '--kind', 'waybill', '--source', 'auto-checkpoint', '--waybill', cp, '--dir', project),
    /handoff: kept existing ferry waybill; auto-checkpoint skipped/);
  cli('handoff-clear', '--kind', 'waybill', '--source', 'auto-checkpoint', '--dir', project);
  assert.ok(existsSync(way));
  cli('handoff-clear', '--kind', 'waybill', '--source', 'ferry', '--dir', project);
  assert.ok(!existsSync(way));
});
