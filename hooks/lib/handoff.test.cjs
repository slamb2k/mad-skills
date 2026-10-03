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
  const file = path.join(root, 'waybill.md');
  fs.writeFileSync(file, '# Waybill — test\n');
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
  fs.appendFileSync(path.join(root, '.git', 'info', 'exclude'), 'waybill.md # mad-skills:ferry\n');
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
  const sigDir = process.platform === 'win32' ? path.join(os.tmpdir(), 'claude-ferry') : '/tmp/claude-ferry';
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

function record(root) {
  return JSON.parse(fs.readFileSync(path.join(handoff.storeDir(), `${handoff.resolveRepo(root).key}.json`), 'utf8'));
}

test('default waybill paths: build and waybill kinds never collide, toplevel hash always present', (t) => {
  const root = mkRepo(t);
  const repo = handoff.resolveRepo(root);
  const w = handoff.defaultWaybillPath(repo);
  const b = handoff.defaultWaybillPath(repo, 'build');
  const c = handoff.defaultWaybillPath(repo, 'checkpoint');
  assert.equal(new Set([w, b, c]).size, 3);
  assert.match(path.basename(w), /^[0-9a-f]{8}-waybill\.md$/);
  assert.equal(path.basename(b), 'build-waybill.md');
  assert.match(path.basename(c), /^[0-9a-f]{8}-checkpoint\.md$/);
});

test('compact/resume never inject, sweep or change state', (t) => {
  const root = mkRepo(t);
  const file = mkWaybill(root);
  handoff.arm({ kind: 'waybill', waybill: file, dir: root });
  assert.equal(handoff.consume(root, 'compact'), '');
  assert.equal(handoff.consume(root, 'resume'), '');
  assert.ok(fs.existsSync(file));
  assert.equal(record(root).slots.waybill.injectedAt, null);
  assert.match(handoff.consume(root, 'clear'), /left a waybill document/);
  assert.equal(handoff.consume(root, 'compact'), '');
  assert.ok(fs.existsSync(file));
  assert.equal(handoff.consume(root, 'clear'), '');
  assert.ok(!fs.existsSync(file));
});

test('exclude line survives while another worktree still has a waybill.md', (t) => {
  const root = mkRepo(t);
  const wt = path.join(root, '.claude', 'wtx');
  sh('git', ['worktree', 'add', '-q', '-b', 'wtx', wt], root);
  const exclude = path.join(root, '.git', 'info', 'exclude');
  fs.mkdirSync(path.dirname(exclude), { recursive: true });
  fs.writeFileSync(exclude, 'waybill.md # mad-skills:ferry\n');
  fs.writeFileSync(path.join(wt, 'waybill.md'), '# Waybill — other\n');
  const mine = path.join(root, 'waybill.md');
  fs.writeFileSync(mine, '# Waybill — mine\n');
  const art = { owned: true, path: mine, ...handoff.stampWaybill(mine) };
  assert.equal(handoff.guardedDelete(art, root), 'deleted');
  assert.match(fs.readFileSync(exclude, 'utf8'), /mad-skills:ferry/);
  fs.unlinkSync(path.join(wt, 'waybill.md'));
  fs.writeFileSync(mine, '# Waybill — mine\n');
  const art2 = { owned: true, path: mine, ...handoff.stampWaybill(mine) };
  assert.equal(handoff.guardedDelete(art2, root), 'deleted');
  assert.doesNotMatch(fs.readFileSync(exclude, 'utf8'), /mad-skills:ferry/);
});

test('exclude is untouched when the deleted waybill is not <toplevel>/waybill.md', (t) => {
  const root = mkRepo(t);
  const exclude = path.join(root, '.git', 'info', 'exclude');
  fs.mkdirSync(path.dirname(exclude), { recursive: true });
  fs.writeFileSync(exclude, 'waybill.md # mad-skills:ferry\n');
  const file = mkWaybill(root);
  const art = { owned: true, path: file, ...handoff.stampWaybill(file) };
  assert.equal(handoff.guardedDelete(art, root), 'deleted');
  assert.match(fs.readFileSync(exclude, 'utf8'), /mad-skills:ferry/);
});

test('auto-checkpoint does not displace an uninjected ferry waybill; --source clear is selective', (t) => {
  const root = mkRepo(t);
  const ferry = mkWaybill(root, 'ferry body\n');
  handoff.arm({ kind: 'waybill', waybill: ferry, dir: root });
  const cp = path.join(root, 'cp.md');
  fs.writeFileSync(cp, '# Waybill — cp\n');
  const r = handoff.arm({ kind: 'waybill', waybill: cp, source: 'auto-checkpoint', dir: root });
  assert.equal(r.skipped, 'ferry');
  assert.equal(record(root).slots.waybill.source, 'ferry');
  handoff.clear({ kind: 'waybill', source: 'auto-checkpoint', dir: root });
  assert.equal(record(root).slots.waybill.source, 'ferry');
  handoff.clear({ kind: 'waybill', dir: root });
  handoff.arm({ kind: 'waybill', waybill: cp, source: 'auto-checkpoint', dir: root });
  assert.equal(record(root).slots.waybill.source, 'auto-checkpoint');
  handoff.clear({ kind: 'waybill', source: 'auto-checkpoint', dir: root });
  assert.equal(handoff.peek(root).waybill, null);
  assert.ok(!fs.existsSync(cp));
});

test('legacy signal is found via a symlinked cwd; migrated toplevel is the repo toplevel', (t) => {
  if (process.platform === 'win32') return;
  const root = mkRepo(t);
  const link = path.join(os.tmpdir(), `handoff-link-${process.pid}-${Date.now()}`);
  fs.symlinkSync(root, link);
  t.after(() => fs.rmSync(link, { force: true }));
  const wb = mkWaybill(root, 'via symlink\n');
  fs.mkdirSync('/tmp/claude-ferry', { recursive: true });
  const signal = `/tmp/claude-ferry/${handoff.cksum(link)}.signal`;
  fs.writeFileSync(signal, `${wb}\n`);
  assert.match(handoff.consume(link), /via symlink/);
  assert.ok(!fs.existsSync(signal));
  assert.equal(record(root).slots.waybill.toplevel, root);
});

test('edited waybills are tracked in kept and cleaned by id on --yes', (t) => {
  const root = mkRepo(t);
  const file = mkWaybill(root);
  handoff.arm({ kind: 'waybill', waybill: file, dir: root });
  handoff.consume(root);
  fs.appendFileSync(file, 'my notes');
  handoff.consume(root);
  assert.equal(record(root).kept.length, 1);
  assert.deepEqual(handoff.clean({ dir: root }), [`kept ${file} (edited)`]);
  assert.deepEqual(handoff.clean({ yes: true, dir: root }), [`deleted ${file}`]);
  assert.ok(!fs.existsSync(file));
  assert.ok(!fs.existsSync(path.join(handoff.storeDir(), `${handoff.resolveRepo(root).key}.json`)));
});

test('kept entry survives arm-replace and is dropped once the file is gone', (t) => {
  const root = mkRepo(t);
  const a = mkWaybill(root);
  handoff.arm({ kind: 'waybill', waybill: a, dir: root });
  fs.appendFileSync(a, 'edit');
  const b = path.join(root, 'b.md');
  fs.writeFileSync(b, '# Waybill — b\n');
  const r = handoff.arm({ kind: 'waybill', waybill: b, dir: root });
  assert.match(r.notices[0], /was edited — kept/);
  assert.equal(record(root).kept[0].path, a);
  fs.unlinkSync(a);
  assert.deepEqual(handoff.clean({ dir: root }), [`owned ${b}`]);
  assert.equal(record(root).kept.length, 0);
  handoff.clear({ kind: 'all', dir: root });
});

test('lock: stale locks are broken; a held lock makes consume a silent no-op', (t) => {
  const root = mkRepo(t);
  handoff.arm({ kind: 'build', spec: 'specs/x.md', dir: root });
  const lock = path.join(handoff.storeDir(), `${handoff.resolveRepo(root).key}.lock`);
  fs.writeFileSync(lock, '');
  const old = new Date(Date.now() - 60000);
  fs.utimesSync(lock, old, old);
  assert.match(handoff.consume(root), /left a spec ready/);
  assert.ok(!fs.existsSync(lock));
  fs.writeFileSync(lock, '');
  const t0 = Date.now();
  assert.equal(handoff.consume(root), '');
  assert.ok(Date.now() - t0 < 4000);
  assert.throws(() => handoff.clear({ kind: 'all', dir: root }), /locked/);
  fs.unlinkSync(lock);
  handoff.clear({ kind: 'all', dir: root });
});

test('legacy waybill requires untracked + excluded', (t) => {
  const root = mkRepo(t);
  const legacy = path.join(root, 'waybill.md');
  fs.writeFileSync(legacy, '# Waybill — mine\n');
  assert.deepEqual(handoff.clean({ dir: root }), []);
  fs.appendFileSync(path.join(root, '.git', 'info', 'exclude'), '/waybill.md\n');
  assert.deepEqual(handoff.clean({ dir: root }), [`legacy ${legacy}`]);
  sh('git', ['add', '-f', 'waybill.md'], root);
  assert.deepEqual(handoff.clean({ dir: root }), []);
});

test('build slot stays usable when its waybill vanished', (t) => {
  const root = mkRepo(t);
  const file = mkWaybill(root);
  handoff.arm({ kind: 'build', spec: 'specs/x.md', waybill: file, dir: root });
  fs.unlinkSync(file);
  const { build } = handoff.peek(root);
  assert.ok(build);
  assert.equal(build.artifacts.length, 1);
  assert.match(handoff.consume(root), /left a spec ready to build/);
  handoff.clear({ kind: 'all', dir: root });
});

function writeRecord(root, rec) {
  fs.writeFileSync(path.join(handoff.storeDir(), `${handoff.resolveRepo(root).key}.json`), JSON.stringify(rec));
}

test('waybill is swept when the session it was injected into ends, not by a parallel session', (t) => {
  const root = mkRepo(t);
  const file = mkWaybill(root);
  handoff.arm({ kind: 'waybill', waybill: file, dir: root });
  handoff.end(root, 'S1');
  assert.ok(fs.existsSync(file), 'ending the arming session does not sweep');
  assert.match(handoff.consume(root, 'clear', 'S2'), /left a waybill document/);
  assert.equal(record(root).slots.waybill.injectedSession, 'S2');
  assert.equal(handoff.consume(root, 'startup', 'S3'), '');
  handoff.end(root, 'S3');
  assert.ok(fs.existsSync(file), 'a parallel session neither re-injects nor sweeps');
  handoff.end(root, 'S2');
  assert.ok(!fs.existsSync(file));
  assert.ok(!fs.existsSync(path.join(handoff.storeDir(), `${handoff.resolveRepo(root).key}.json`)), 'empty record removed');
});

test('stale fallback: a later session sweeps when SessionEnd never fired within a day', (t) => {
  const root = mkRepo(t);
  const file = mkWaybill(root);
  handoff.arm({ kind: 'waybill', waybill: file, dir: root });
  handoff.consume(root, 'clear', 'S2');
  const rec = record(root);
  rec.slots.waybill.injectedAt -= 25 * 3600 * 1000;
  writeRecord(root, rec);
  handoff.consume(root, 'startup', 'S3');
  assert.ok(!fs.existsSync(file));
});

test('build slot: its owned waybill goes with the injected session, the reminder stays', (t) => {
  const root = mkRepo(t);
  const file = mkWaybill(root);
  handoff.arm({ kind: 'build', spec: 'specs/x.md', waybill: file, dir: root });
  assert.match(handoff.consume(root, 'clear', 'S2'), /Plan and clarifications/);
  handoff.consume(root, 'startup', 'S3');
  assert.ok(fs.existsSync(file));
  handoff.end(root, 'S2');
  assert.ok(!fs.existsSync(file));
  assert.match(handoff.consume(root, 'clear', 'S4'), /Pending: \/build specs\/x\.md/);
  handoff.clear({ kind: 'all', dir: root });
});

test('legacy signal is ignored unless this user wrote it and nobody else can write it', { skip: typeof process.getuid !== 'function' }, (t) => {
  const root = mkRepo(t);
  const wb = mkWaybill(root, 'planted body\n');
  fs.mkdirSync('/tmp/claude-ferry', { recursive: true });
  const signal = `/tmp/claude-ferry/${handoff.cksum(root)}.signal`;
  t.after(() => fs.rmSync(signal, { force: true }));
  fs.writeFileSync(signal, `${wb}\n`);
  fs.chmodSync(signal, 0o666);
  assert.doesNotMatch(handoff.consume(root, 'clear', 'S1'), /planted body/);
  assert.ok(fs.existsSync(signal), 'an untrusted signal is left untouched');
});
