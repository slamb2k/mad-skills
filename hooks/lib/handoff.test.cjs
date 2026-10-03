'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-home-')));
process.env.HOME = home;
process.env.USERPROFILE = home;

const handoff = require('./handoff.cjs');

function sh(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function mkRepo(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-repo-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  sh('git', ['init', '-q'], root);
  sh('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init'], root);
  fs.mkdirSync(path.join(root, 'specs'));
  fs.writeFileSync(path.join(root, 'specs', 'x.md'), '---\ntitle: "X Feature"\nautonomy_ready: yes\n---\n# X\n');
  return root;
}

function mkWaybill(dir, body = '# Waybill — test\nstate\n') {
  const file = path.join(dir, 'w.md');
  fs.writeFileSync(file, body);
  return file;
}

test('repo key is shared by a linked worktree and the main checkout', (t) => {
  const root = mkRepo(t);
  const wt = path.join(root, '.claude', 'wt');
  sh('git', ['worktree', 'add', '-q', '-b', 'wt', wt], root);
  const a = handoff.resolveRepo(root);
  const b = handoff.resolveRepo(wt);
  assert.equal(a.key, b.key);
  assert.equal(b.repoRoot, root);
  assert.equal(b.toplevel, fs.realpathSync(wt));
  assert.notEqual(handoff.defaultWaybillPath(a), handoff.defaultWaybillPath(b));
});

test('outside git the directory itself is the key root', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-nogit-')));
  const r = handoff.resolveRepo(dir);
  assert.equal(r.repoRoot, dir);
  assert.equal(r.toplevel, dir);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('cksum matches POSIX cksum', () => {
  for (const s of ['/home/user/project', '', 'a']) {
    let expected;
    try {
      expected = Number(execFileSync('cksum', { input: s, encoding: 'utf8' }).split(' ')[0]);
    } catch { continue; }
    assert.equal(handoff.cksum(s), expected);
  }
});

test('stamp is idempotent and guarded delete refuses edits', (t) => {
  const root = mkRepo(t);
  const file = mkWaybill(root);
  const a = handoff.stampWaybill(file);
  const b = handoff.stampWaybill(file);
  assert.equal(a.id, b.id);
  assert.equal(a.sha256, b.sha256);
  assert.match(fs.readFileSync(file, 'utf8'), /^<!-- mad-skills:waybill id=/);
  const art = { owned: true, path: file, ...a };
  fs.appendFileSync(file, 'edited');
  assert.equal(handoff.guardedDelete(art, root), 'kept-edited');
  assert.ok(fs.existsSync(file));
  assert.equal(handoff.guardedDelete({ ...art, owned: false }, root), 'not-owned');
});

test('guarded delete removes the file and only tagged exclude lines', (t) => {
  const root = mkRepo(t);
  const exclude = path.join(root, '.git', 'info', 'exclude');
  fs.mkdirSync(path.dirname(exclude), { recursive: true });
  fs.writeFileSync(exclude, 'keep-me\nwaybill.md # mad-skills:ferry\n');
  const file = mkWaybill(root);
  const art = { owned: true, path: file, ...handoff.stampWaybill(file) };
  assert.equal(handoff.guardedDelete(art, root), 'deleted');
  assert.equal(handoff.guardedDelete(art, root), 'missing');
  assert.equal(fs.readFileSync(exclude, 'utf8'), 'keep-me\n');
});

test('arm from a subdirectory finds the spec at the repo root', (t) => {
  const root = mkRepo(t);
  const sub = path.join(root, 'src', 'deep');
  fs.mkdirSync(sub, { recursive: true });
  handoff.arm({ kind: 'build', spec: 'specs/x.md', dir: sub });
  const { build } = handoff.peek(root);
  assert.equal(build.resume, '/build specs/x.md');
  assert.equal(handoff.specArtifact(build).path, path.join('specs', 'x.md'));
  assert.throws(() => handoff.arm({ kind: 'build', spec: 'specs/nope.md', dir: sub }), /not found/);
  handoff.clear({ kind: 'all', dir: root });
});

test('build slot injects full text once then a one-line reminder', (t) => {
  const root = mkRepo(t);
  handoff.arm({ kind: 'build', spec: 'specs/x.md', dir: root });
  const first = handoff.consume(root);
  assert.match(first, /\[HANDOFF\] The previous session \(\/speccy\) left a spec ready to build: specs\/x\.md — "X Feature" \(autonomy_ready: yes\)/);
  assert.match(first, /Next action: \/build specs\/x\.md\./);
  assert.match(handoff.consume(root), /^\[HANDOFF\] Pending: \/build specs\/x\.md \(spec ready since \d{4}-\d{2}-\d{2}\)$/);
  handoff.clear({ kind: 'build', dir: root });
  assert.equal(handoff.consume(root), '');
});

test('owned waybill is injected, survives one session, swept on the next', (t) => {
  const root = mkRepo(t);
  const file = mkWaybill(root, 'plan body\n');
  handoff.arm({ kind: 'waybill', waybill: file, dir: root });
  const first = handoff.consume(root);
  assert.match(first, /left a waybill document at /);
  assert.match(first, /plan body/);
  assert.doesNotMatch(first, /mad-skills:waybill/);
  assert.ok(fs.existsSync(file));
  assert.equal(handoff.consume(root), '');
  assert.ok(!fs.existsSync(file));
});

test('edited waybill is kept with a notice', (t) => {
  const root = mkRepo(t);
  const file = mkWaybill(root);
  handoff.arm({ kind: 'waybill', waybill: file, dir: root });
  handoff.consume(root);
  fs.appendFileSync(file, 'user notes');
  assert.match(handoff.consume(root), /waybill .* was edited — kept/);
  assert.ok(fs.existsSync(file));
});

test('build slot with a waybill appends it and keeps the reminder after sweep', (t) => {
  const root = mkRepo(t);
  const file = mkWaybill(root, 'clarifications\n');
  handoff.arm({ kind: 'build', spec: 'specs/x.md', waybill: file, dir: root });
  assert.equal(handoff.peek(root).build.source, 'build-handoff');
  const first = handoff.consume(root);
  assert.match(first, /Plan and clarifications were captured in .*w\.md; treat it as primary context\./);
  assert.match(first, /clarifications/);
  assert.match(handoff.consume(root), /\[HANDOFF\] Pending: /);
  assert.ok(!fs.existsSync(file));
  assert.ok(handoff.peek(root).build);
  handoff.clear({ kind: 'all', dir: root });
});

test('slots are independent and the waybill slot is scoped to its toplevel', (t) => {
  const root = mkRepo(t);
  const wt = path.join(root, '.claude', 'wt');
  sh('git', ['worktree', 'add', '-q', '-b', 'wt2', wt], root);
  const file = mkWaybill(wt);
  handoff.arm({ kind: 'waybill', waybill: file, dir: wt });
  handoff.arm({ kind: 'build', spec: 'specs/x.md', dir: root });
  const main = handoff.consume(root);
  assert.match(main, /left a spec ready to build/);
  assert.doesNotMatch(main, /waybill document/);
  assert.match(handoff.consume(wt), /waybill document/);
  handoff.clear({ kind: 'all', dir: wt });
});

test('expired slots are pruned silently', (t) => {
  const root = mkRepo(t);
  handoff.arm({ kind: 'build', spec: 'specs/x.md', dir: root });
  const rec = path.join(handoff.storeDir(), `${handoff.resolveRepo(root).key}.json`);
  const data = JSON.parse(fs.readFileSync(rec, 'utf8'));
  data.slots.build.createdAt = Date.now() - 15 * 86400000;
  fs.writeFileSync(rec, JSON.stringify(data));
  assert.equal(handoff.consume(root), '');
  assert.equal(handoff.peek(root).build, null);
});

test('slots whose spec vanished are pruned', (t) => {
  const root = mkRepo(t);
  handoff.arm({ kind: 'build', spec: 'specs/x.md', dir: root });
  fs.unlinkSync(path.join(root, 'specs', 'x.md'));
  assert.equal(handoff.peek(root).build, null);
  assert.equal(handoff.consume(root), '');
});

test('clean lists owned and legacy waybills; --yes --legacy deletes legacy', (t) => {
  const root = mkRepo(t);
  const file = mkWaybill(root);
  handoff.arm({ kind: 'waybill', waybill: file, dir: root });
  const legacy = path.join(root, 'waybill.md');
  fs.writeFileSync(legacy, '# Waybill — old\n');
  let out = handoff.clean({ dir: root });
  assert.deepEqual(out, [`owned ${file}`, `legacy ${legacy}`]);
  out = handoff.clean({ yes: true, dir: root });
  assert.deepEqual(out, [`deleted ${file}`, `legacy ${legacy}`]);
  out = handoff.clean({ yes: true, legacy: true, dir: root });
  assert.deepEqual(out, [`deleted ${legacy}`]);
  assert.ok(!fs.existsSync(legacy));
});

test('legacy pending-build marker and ferry signal migrate into slots', (t) => {
  const root = mkRepo(t);
  const crypto = require('node:crypto');
  const stateDir = path.join(home, '.claude', 'session-guard');
  fs.mkdirSync(stateDir, { recursive: true });
  const marker = path.join(stateDir, `${crypto.createHash('md5').update(root).digest('hex')}-pending-build.json`);
  fs.writeFileSync(marker, JSON.stringify({ specPath: 'specs/x.md', projectDir: root, timestamp: Date.now() }));
  const wb = mkWaybill(root, 'legacy body\n');
  const sigDir = path.join(os.tmpdir(), 'claude-ferry');
  fs.mkdirSync(sigDir, { recursive: true });
  const signal = path.join(sigDir, `${handoff.cksum(root)}.signal`);
  fs.writeFileSync(signal, `${wb}\n`);
  const out = handoff.consume(root);
  assert.match(out, /legacy body/);
  assert.match(out, /left a spec ready to build/);
  assert.ok(!fs.existsSync(marker));
  assert.ok(!fs.existsSync(signal));
  assert.ok(fs.existsSync(wb), 'unowned migrated waybill is never deleted');
  handoff.consume(root);
  assert.ok(fs.existsSync(wb));
});
