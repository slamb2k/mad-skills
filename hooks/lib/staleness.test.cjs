'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkStaleness } = require('./staleness.cjs');
const { OutputBuilder } = require('./output.cjs');

for (const instructionsName of ['CLAUDE.md', 'AGENTS.md']) {
  test(`staleness signals identify ${instructionsName} and retain their scores`, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-staleness-'));
    try {
      const instructionsPath = path.join(dir, instructionsName);
      fs.writeFileSync(instructionsPath, '# Project\n0 dependencies\n');
      const oldTime = new Date(Date.now() - 21 * 86400000);
      fs.utimesSync(instructionsPath, oldTime, oldTime);
      for (const name of ['src', 'tools', 'tests']) fs.mkdirSync(path.join(dir, name));
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
        dependencies: { alpha: '1', beta: '1', gamma: '1', delta: '1', epsilon: '1', zeta: '1' },
      }));
      for (const name of ['requirements.txt', 'Dockerfile', 'bun.lock']) {
        fs.writeFileSync(path.join(dir, name), 'fixture\n');
      }

      const output = new OutputBuilder();
      checkStaleness(dir, instructionsPath, null, output);

      assert.equal(output.signals.length, 8);
      assert.equal(output.score, 12);
      for (const signal of output.signals) {
        assert.ok(signal.includes(instructionsName), signal);
        assert.ok(!signal.includes(instructionsName === 'AGENTS.md' ? 'CLAUDE.md' : 'AGENTS.md'), signal);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('nested directories listed tree-style under their parent are not reported as missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-staleness-tree-'));
  try {
    for (const d of ['skills/brace', 'skills/ship', 'skills/sync', 'tests/results', 'archive/old']) {
      fs.mkdirSync(path.join(dir, d), { recursive: true });
    }
    const instructionsPath = path.join(dir, 'AGENTS.md');
    fs.writeFileSync(instructionsPath, [
      '# Project', '```', 'project/', '├── skills/', '│   ├── brace/', '│   ├── ship/',
      '│   └── sync/', '├── tests/', '│   └── results/', '```', '',
    ].join('\n'));

    const output = new OutputBuilder();
    checkStaleness(dir, instructionsPath, null, output);
    const drift = output.signals.find(sig => sig.includes('Directories not in')) || '';
    assert.doesNotMatch(drift, /skills\/|tests\/results/);
    assert.match(drift, /archive\/old/, 'unmentioned parent still reports its children');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a nested directory whose leaf is unmentioned is still reported', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-staleness-leaf-'));
  try {
    for (const d of ['skills/brace', 'skills/newskill', 'skills/other', 'skills/more', 'src', 'lib']) {
      fs.mkdirSync(path.join(dir, d), { recursive: true });
    }
    const instructionsPath = path.join(dir, 'AGENTS.md');
    fs.writeFileSync(instructionsPath, '# Project\n├── skills/\n│   └── brace/\n');
    const output = new OutputBuilder();
    checkStaleness(dir, instructionsPath, null, output);
    const drift = output.signals.find(sig => sig.includes('Directories not in')) || '';
    assert.match(drift, /skills\/newskill/);
    assert.doesNotMatch(drift, /skills\/brace/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ─── optional semantic materiality check ────────────────────────────────

const { execSync } = require('node:child_process');
const { judgeStaleness, changeEvidence } = require('./staleness.cjs');

function repoWithUpdate() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-judge-'));
  const sh = (cmd) => execSync(cmd, { cwd: dir, stdio: 'pipe' });
  sh('git init -q && git config user.email t@t.co && git config user.name t');
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Project\nRun `npm test`.\n');
  fs.writeFileSync(path.join(dir, 'package.json'), '{"scripts":{"test":"node --test a.test.js"}}\n');
  sh('git add -A && git commit -qm "docs: instructions"');
  fs.writeFileSync(path.join(dir, 'package.json'), '{"scripts":{"test":"node --test a.test.js b.test.js"}}\n');
  fs.writeFileSync(path.join(dir, 'b.test.js'), '\n');
  sh('git add -A && git commit -qm "test: add b"');
  return dir;
}

test('changeEvidence reports commits, files, and config diff since the instructions commit', () => {
  const dir = repoWithUpdate();
  try {
    const ev = changeEvidence(dir, 'AGENTS.md');
    assert.deepEqual(ev.commit_subjects, ['test: add b']);
    assert.deepEqual(ev.changed_files, ['A\tb.test.js', 'M\tpackage.json']);
    assert.match(ev.config_diff, /\+.*b\.test\.js/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('changeEvidence is null when the instructions file was never committed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-judge-'));
  try {
    execSync('git init -q', { cwd: dir });
    assert.equal(changeEvidence(dir, 'AGENTS.md'), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('judgeStaleness is null when the judge is disabled', () => {
  const dir = repoWithUpdate();
  const saved = process.env.MAD_SKILLS_JUDGE;
  delete process.env.MAD_SKILLS_JUDGE;
  try {
    assert.equal(judgeStaleness(dir, path.join(dir, 'AGENTS.md'), [], { cache: false }), null);
  } finally {
    if (saved !== undefined) process.env.MAD_SKILLS_JUDGE = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('judgeStaleness sends file, evidence, and signals and returns P(update needed)', () => {
  const dir = repoWithUpdate();
  try {
    let seen;
    const judgeAll = (batches) => { seen = batches[0]; return [{ needs_update: { type: 'noul', noul: 0.12 } }]; };
    const p = judgeStaleness(dir, path.join(dir, 'AGENTS.md'), ['⚠ package.json modified'], { judgeAll, cache: false });
    assert.equal(p, 0.12);
    assert.match(seen.state.instructions_file, /npm test/);
    assert.deepEqual(seen.state.heuristic_signals, ['⚠ package.json modified']);
    assert.equal(seen.questions.needs_update.type, 'noul');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('judgeStaleness is null when the judge call fails', () => {
  const dir = repoWithUpdate();
  try {
    assert.equal(judgeStaleness(dir, path.join(dir, 'AGENTS.md'), [], { judgeAll: () => null, cache: false }), null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
