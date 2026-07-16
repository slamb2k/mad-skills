'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

const lifecycle = require('./lifecycle.cjs');
const { selectOffer, computeSignature, writeMarker, readMarker, evaluate } = lifecycle;

// full default signature; override just what a test cares about
function sig(overrides = {}) {
  return {
    size: 0, hasScaffold: false, components: [], hasCI: false, hasLefthook: false,
    ciCoveredLanguages: [], hasDockerfile: false, releaseTargets: [], hasIaC: false,
    iacTargets: [], envs: [], hasGraphifyOut: false, hasSuperpowers: false,
    hasServer: false, hasCompose: false, pkgBin: false, pkgLib: false, hasStatic: false,
    ...overrides,
  };
}

function comp(language, dir = '.') {
  return { dir, language, manifest: `${language}.manifest` };
}

function base(extra = {}) {
  return { signature: sig(), prefs: {}, markers: {}, session: 1, activeCycle: false, ...extra };
}

// ── AC-001: cascade — brace done, component exists, no CI -> offer rig ──
test('AC-001 cascade: rig offered after brace when components exist and no CI', () => {
  const s = sig({ hasScaffold: true, hasSuperpowers: true, size: 10, components: [comp('node')] });
  const { offer } = selectOffer(base({ signature: s }));
  assert.equal(offer.id, 'rig');
  assert.equal(offer.reArm, 'causal');
});

// ── AC-002: no-nag same rec (dismissed, slice unchanged, cooldown not elapsed) ──
test('AC-002 no-nag: dismissed rig at [node], slice unchanged, cooldown active', () => {
  const s = sig({ hasScaffold: true, size: 10, components: [comp('node')] });
  const prefs = { recs: { rig: { status: 'dismissed', dismissedSlice: ['node'], lastOfferedSession: 41 } } };
  const { offer, all } = selectOffer(base({ signature: s, prefs, session: 42 }));
  assert.equal(all.find(r => r.id === 'rig'), undefined);
  assert.notEqual(offer && offer.id, 'rig');
});

// ── AC-003: drift re-arm (slice changes node -> node,python) ──
test('AC-003 drift: adding python component re-arms dismissed rig', () => {
  const s = sig({ hasScaffold: true, hasSuperpowers: true, size: 10, components: [comp('node'), comp('python', 'backend')] });
  const prefs = { recs: { rig: { status: 'dismissed', dismissedSlice: ['node'], lastOfferedSession: 41 } } };
  const { offer } = selectOffer(base({ signature: s, prefs, session: 42 }));
  assert.equal(offer.id, 'rig');
  assert.equal(offer.reArm, 'drift');
});

// ── AC-004: satisfied + marker equal -> done, never offered ──
test('AC-004 done: rig satisfied and marker matches slice', () => {
  const s = sig({ hasScaffold: true, hasSuperpowers: true, size: 10, components: [comp('node')], hasCI: true, ciCoveredLanguages: ['node'] });
  const markers = { rig: { coveredSlice: ['node'], ranAt: 'x' } };
  const { offer, all } = selectOffer(base({ signature: s, markers }));
  assert.equal(all.find(r => r.id === 'rig'), undefined);
  assert.notEqual(offer && offer.id, 'rig');
});

// ── AC-005: pre-engine baseline — satisfied, no marker -> needsBaseline, no offer ──
test('AC-005 baseline: satisfied rig with no marker synthesises baseline, no offer', () => {
  const s = sig({ hasScaffold: true, hasSuperpowers: true, size: 10, components: [comp('node')], hasCI: true, ciCoveredLanguages: ['node'] });
  const { offer, all, needsBaseline } = selectOffer(base({ signature: s }));
  assert.equal(all.find(r => r.id === 'rig'), undefined);
  assert.notEqual(offer && offer.id, 'rig');
  assert.ok(needsBaseline.includes('rig'));
});

// ── AC-006: suppression during active cycle ──
test('AC-006 suppression: activeCycle returns null offer', () => {
  const s = sig({ hasScaffold: true, size: 10, components: [comp('node')] });
  const { offer, all } = selectOffer(base({ signature: s, activeCycle: true }));
  assert.equal(offer, null);
  assert.deepEqual(all, []);
});

// ── AC-007: checkpoint release — same as AC-001 once cycle ends (activeCycle false) ──
test('AC-007 checkpoint: highest-priority offer surfaces when cycle ends', () => {
  const s = sig({ hasScaffold: true, hasSuperpowers: true, size: 10, components: [comp('node')] });
  const suppressed = selectOffer(base({ signature: s, activeCycle: true }));
  assert.equal(suppressed.offer, null);
  const released = selectOffer(base({ signature: s, activeCycle: false }));
  assert.equal(released.offer.id, 'rig');
});

// ── AC-008: release selection dock vs hoist ──
test('AC-008 release: node bin -> /hoist; Dockerfile service -> /dock', () => {
  const rigged = { hasScaffold: true, hasSuperpowers: true, size: 10, hasCI: true, ciCoveredLanguages: ['node'] };
  const hoistSig = sig({ ...rigged, components: [comp('node')], pkgBin: true });
  const hoist = selectOffer(base({ signature: hoistSig })).all.find(r => r.id === 'release');
  assert.equal(hoist.offers, '/hoist');

  const dockSig = sig({ ...rigged, components: [comp('node')], hasDockerfile: true });
  const dock = selectOffer(base({ signature: dockSig })).all.find(r => r.id === 'release');
  assert.equal(dock.offers, '/dock');
});

// ── AC-009: mute -> never offered ──
test('AC-009 mute: muted graphify is never offered', () => {
  const s = sig({ size: 500 });
  const prefs = { recs: { graphify: { status: 'muted' } } };
  const { all } = selectOffer(base({ signature: s, prefs }));
  assert.equal(all.find(r => r.id === 'graphify'), undefined);
});

// ── AC-010: global mute ──
test('AC-010 global mute: mutedAll suppresses everything', () => {
  const s = sig({ hasScaffold: true, size: 10, components: [comp('node')] });
  const { offer, all } = selectOffer(base({ signature: s, prefs: { mutedAll: true } }));
  assert.equal(offer, null);
  assert.deepEqual(all, []);
});

// ── AC-011: ordering — rig (20) beats release (30) ──
test('AC-011 ordering: rig chosen over release when both eligible', () => {
  // scaffold + component but no CI => rig eligible; release requires rigged so not both...
  // craft: rig not satisfied (no CI) AND make release eligible via rigged path is impossible together,
  // so instead assert lowest-priority selection among two synthetic eligibles.
  const s = sig({ hasScaffold: true, hasSuperpowers: true, size: 10, components: [comp('node')] });
  const { offer, all } = selectOffer(base({ signature: s }));
  // rig eligible; ensure the returned offer is the lowest priority among all eligible
  const minPriority = Math.min(...all.map(r => r.priority));
  assert.equal(offer.priority, minPriority);
  assert.equal(offer.id, 'rig');
});

// ── AC-012: graphify tier ──
test('AC-012 tier: dismissed at medium — stays quiet in medium, re-arms in large', () => {
  const prefs = { recs: { graphify: { status: 'dismissed', dismissedTier: 'medium', dismissedMetric: 200, lastOfferedSession: 5 } } };
  // still medium (350), cooldown not elapsed
  const mid = selectOffer(base({ signature: sig({ size: 350 }), prefs, session: 6 }));
  assert.equal(mid.all.find(r => r.id === 'graphify'), undefined);
  // large (700), tier increased -> offered
  const large = selectOffer(base({ signature: sig({ size: 700 }), prefs, session: 6 }));
  const g = large.all.find(r => r.id === 'graphify');
  assert.ok(g);
  assert.equal(g.reArm, 'drift');
});

// ── extra: superpowers ask-once eligibility ──
test('superpowers offered when scaffold present and not installed', () => {
  const s = sig({ hasScaffold: true, hasSuperpowers: false });
  const { all } = selectOffer(base({ signature: s }));
  assert.ok(all.find(r => r.id === 'superpowers'));
});

// ── integration: computeSignature on a fixture repo ──
function mkRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-'));
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email t@t.co && git config user.name t', { cwd: dir });
  return dir;
}

function commitAll(dir) {
  execSync('git add -A && git commit -q -m x', { cwd: dir });
}

test('computeSignature: detects size, component, scaffold, CI', () => {
  const dir = mkRepo();
  try {
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# x\n');
    fs.mkdirSync(path.join(dir, 'specs'));
    fs.writeFileSync(path.join(dir, 'specs', 'a.md'), 'x\n');
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x"}\n');
    fs.writeFileSync(path.join(dir, 'index.js'), 'console.log(1)\n');
    fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.github', 'workflows', 'ci.yml'), 'jobs:\n  x:\n    steps:\n      - uses: actions/setup-node@v4\n');
    commitAll(dir);
    const s = computeSignature(dir);
    assert.ok(s.size >= 1);
    assert.equal(s.hasScaffold, true);
    assert.equal(s.components.length, 1);
    assert.equal(s.components[0].language, 'node');
    assert.equal(s.hasCI, true);
    assert.ok(s.ciCoveredLanguages.includes('node'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── FIX 1: untracked-but-not-ignored artifacts are seen by the signature ──
// Skills write CI/Dockerfile/manifests to disk and call lifecycle-complete
// BEFORE committing; ls-files must include --others so the skill doesn't self-nag.
test('computeSignature: sees an UNTRACKED (not git-added) ci.yml', () => {
  const dir = mkRepo();
  try {
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x"}\n');
    fs.writeFileSync(path.join(dir, 'index.js'), 'console.log(1)\n');
    commitAll(dir); // scaffold committed; ci.yml written after, left untracked
    fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.github', 'workflows', 'ci.yml'), 'jobs:\n  x:\n    steps:\n      - uses: actions/setup-node@v4\n');
    const s = computeSignature(dir);
    assert.equal(s.hasCI, true, 'untracked ci.yml must be seen');
    assert.ok(s.ciCoveredLanguages.includes('node'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('writeMarker/readMarker round-trip', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-'));
  try {
    writeMarker(dir, 'rig', ['node', 'python'], '2026-01-01T00:00:00Z');
    const m = readMarker(dir, 'rig');
    assert.deepEqual(m.coveredSlice, ['node', 'python']);
    assert.equal(m.ranAt, '2026-01-01T00:00:00Z');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('evaluate: synthesises baseline marker for satisfied pre-engine rig', () => {
  const dir = mkRepo();
  try {
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# x\n');
    fs.mkdirSync(path.join(dir, 'specs'));
    fs.writeFileSync(path.join(dir, 'specs', 'a.md'), 'x\n');
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x"}\n');
    fs.writeFileSync(path.join(dir, 'index.js'), 'x\n');
    fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.github', 'workflows', 'ci.yml'), 'steps:\n  - uses: actions/setup-node@v4\n');
    commitAll(dir);
    const { offer } = evaluate(dir, { surface: 'session-guard' });
    // rig satisfied + no marker -> baseline synth, no rig offer
    assert.notEqual(offer && offer.id, 'rig');
    const m = readMarker(dir, 'rig');
    assert.ok(m, 'baseline marker written');
    assert.deepEqual(m.coveredSlice, ['node']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('perf smoke: computeSignature returns an object on this repo', () => {
  const s = computeSignature(process.cwd());
  assert.equal(typeof s, 'object');
  assert.ok(Array.isArray(s.components));
});

// ── /next pull mode (plan step 7) ──────────────────────────────────────

// pull bypasses active-cycle suppression: a dirty feature branch hides ambient
// offers, but an explicit /next still lists them.
test('pull: lists eligible steps even during an active cycle', () => {
  const s = sig({ hasScaffold: true, hasSuperpowers: true, size: 10, components: [comp('node')] });
  const suppressed = selectOffer(base({ signature: s, activeCycle: true }));
  assert.deepEqual(suppressed.all, [], 'ambient suppressed during active cycle');
  const pulled = selectOffer(base({ signature: s, activeCycle: true, pull: true }));
  assert.ok(pulled.all.find(r => r.id === 'rig'), 'pull surfaces rig anyway');
});

// pull bypasses the dismissal/cooldown watermark (a dismissed step still lists).
test('pull: lists a dismissed step that ambient mode would suppress', () => {
  const s = sig({ hasScaffold: true, hasSuperpowers: true, size: 10, components: [comp('node')] });
  const prefs = { recs: { rig: { status: 'dismissed', dismissedSlice: ['node'], lastOfferedSession: 41 } } };
  const ambient = selectOffer(base({ signature: s, prefs, session: 42 }));
  assert.equal(ambient.all.find(r => r.id === 'rig'), undefined, 'ambient suppresses dismissed rig');
  const pulled = selectOffer(base({ signature: s, prefs, session: 42, pull: true }));
  assert.ok(pulled.all.find(r => r.id === 'rig'), 'pull lists dismissed rig');
});

// pull bypasses global mute too (explicit query overrides mutedAll)...
test('pull: mutedAll hides ambient but not /next; per-rec mute still hidden', () => {
  const s = sig({ hasScaffold: true, hasSuperpowers: true, size: 10, components: [comp('node')] });
  const mutedAll = selectOffer(base({ signature: s, prefs: { mutedAll: true } }));
  assert.deepEqual(mutedAll.all, [], 'mutedAll suppresses ambient');
  const pulled = selectOffer(base({ signature: s, prefs: { mutedAll: true }, pull: true }));
  assert.ok(pulled.all.find(r => r.id === 'rig'), 'pull overrides global mute');
  // ...but a hard per-rec mute is honoured even under pull
  const perRecMuted = selectOffer(base({ signature: s, prefs: { recs: { rig: { status: 'muted' } } }, pull: true }));
  assert.equal(perRecMuted.all.find(r => r.id === 'rig'), undefined, 'per-rec mute honoured under pull');
});

// next() annotates status and stays read-only (never writes a baseline marker).
test('next: annotates status and does not mutate markers', () => {
  const dir = mkRepo();
  try {
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# x\n');
    fs.mkdirSync(path.join(dir, 'specs'));
    fs.writeFileSync(path.join(dir, 'specs', 'a.md'), 'x\n');
    fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"x"}\n');
    fs.writeFileSync(path.join(dir, 'index.js'), 'x\n');
    commitAll(dir);
    const { all } = lifecycle.next(dir);
    const rig = all.find(r => r.id === 'rig');
    assert.ok(rig, 'rig applicable (scaffold + component, no CI)');
    assert.equal(rig.status, 'available');
    assert.equal(readMarker(dir, 'rig'), null, 'next() wrote no marker');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── release-selection heuristic (REQ-060 / AC-008 + tuning) ────────────

const { releaseSelect } = lifecycle;

test('release: node CLI (bin) -> /hoist', () => {
  assert.equal(releaseSelect(sig({ components: [comp('node')], pkgBin: true })), '/hoist');
});

test('release: node service with Dockerfile -> /dock', () => {
  assert.equal(releaseSelect(sig({ components: [comp('node')], hasDockerfile: true })), '/dock');
});

test('release: publishable node library (main, not private) -> /hoist', () => {
  assert.equal(releaseSelect(sig({ components: [comp('node')], pkgLib: true })), '/hoist');
});

// tuning: a service in a non-node language is now detected and routed to /dock
// instead of falling through to /hoist on its language alone.
test('release tuning: python service (hasServer, no Dockerfile) -> /dock', () => {
  assert.equal(releaseSelect(sig({ components: [comp('python')], hasServer: true })), '/dock');
});

test('release tuning: go service (hasServer) -> /dock, not /hoist', () => {
  assert.equal(releaseSelect(sig({ components: [comp('go')], hasServer: true })), '/dock');
});

// tuning: a lone package language with no server/Dockerfile is still /hoist.
test('release tuning: bare python package (no server) -> /hoist', () => {
  assert.equal(releaseSelect(sig({ components: [comp('python')] })), '/hoist');
});

test('release tuning: bare go module (no server) -> /hoist', () => {
  assert.equal(releaseSelect(sig({ components: [comp('go')] })), '/hoist');
});

// tuning: docker-compose is a container signal.
test('release tuning: docker-compose service -> /dock', () => {
  assert.equal(releaseSelect(sig({ components: [comp('node')], hasCompose: true })), '/dock');
});

// tuning: genuine both-signals stays ambiguous (CLI that also ships a container).
test('release tuning: node CLI + Dockerfile -> ambiguous sentinel', () => {
  assert.equal(releaseSelect(sig({ components: [comp('node')], pkgBin: true, hasDockerfile: true })), '/dock or /hoist');
});

// tuning: a private node app with a main is NOT a publishable lib -> not /hoist
// on that basis; with a server it is a service -> /dock.
test('release tuning: private node app with server -> /dock', () => {
  assert.equal(releaseSelect(sig({ components: [comp('node')], hasServer: true, pkgLib: false })), '/dock');
});

test('release tuning: static site build (no server) -> /hoist', () => {
  assert.equal(releaseSelect(sig({ components: [comp('node')], hasStatic: true })), '/hoist');
});

// integration: computeSignature detects a python server via requirements.txt
test('computeSignature: python flask app detected as server', () => {
  const dir = mkRepo();
  try {
    fs.writeFileSync(path.join(dir, 'pyproject.toml'), '[project]\nname="x"\n');
    fs.writeFileSync(path.join(dir, 'requirements.txt'), 'flask==3.0\n');
    fs.writeFileSync(path.join(dir, 'app.py'), 'x\n');
    commitAll(dir);
    const s = computeSignature(dir);
    assert.equal(s.hasServer, true, 'flask in requirements.txt -> hasServer');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
