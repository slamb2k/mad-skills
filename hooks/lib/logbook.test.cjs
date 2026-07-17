'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const fl = require('./logbook.cjs');

// ─── fixtures / helpers ─────────────────────────────────────────────────

function mkRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-'));
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email t@t.co && git config user.name t', { cwd: dir });
  return dir;
}

function rm(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function commit(dir, subject) {
  fs.writeFileSync(path.join(dir, `f-${Math.abs(hash(subject))}.txt`), subject);
  execSync('git add -A', { cwd: dir });
  execSync(`git commit -q -m ${JSON.stringify(subject)}`, { cwd: dir });
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/** Build a full item with sensible defaults. */
function item(over = {}) {
  return {
    title: 'x', category: 'ideas', source: 'test', date: '2026-01-01',
    status: 'open', link: null, priority: 'normal', resolvedDate: null, ...over,
  };
}

// ─── AC-001: capture ────────────────────────────────────────────────────

test('AC-001 capture appends debrief items under mapped categories', () => {
  const dir = mkRepo();
  try {
    const res = fl.capture(dir, [
      { title: 'Add retry to the CI poller', category: 'deferred_fix', source: '/ship #87' },
      { title: 'Should /logbook mute recs?', category: 'open_question', source: '/logbook design' },
      { title: 'computeSignature could get slow', category: 'tech_debt', source: '/build debrief' },
    ], { today: '2026-07-16' });

    assert.equal(res.added, 3);
    const items = fl.read(dir).items;
    assert.equal(items.length, 3);
    assert.equal(items.find((i) => i.title.startsWith('Add retry')).category, 'fixes');
    assert.equal(items.find((i) => i.title.startsWith('Should')).category, 'questions');
    assert.equal(items.find((i) => i.title.startsWith('compute')).category, 'debt');
    // source + date recorded, and file present on disk (staged/committable)
    assert.equal(items[0].date, '2026-07-16');
    assert.ok(fs.existsSync(path.join(dir, 'LOGBOOK.md')));
  } finally { rm(dir); }
});

// ─── AC-002: dedupe on entry ────────────────────────────────────────────

test('AC-002 dedupe refreshes existing item instead of duplicating', () => {
  const dir = mkRepo();
  try {
    fl.capture(dir, [{ title: 'Add retry to CI poller', source: 'first', category: 'ideas' }], { today: '2026-07-10' });
    const res = fl.capture(dir, [{ title: 'add retry/backoff to the CI poller', source: 'second', category: 'ideas' }], { today: '2026-07-16' });

    assert.equal(res.added, 0);
    assert.deepEqual(res.deduped, ['Add retry to CI poller']);
    const open = fl.openItems(dir);
    assert.equal(open.length, 1);
    assert.equal(open[0].date, '2026-07-16'); // refreshed
    assert.equal(open[0].source, 'second');
  } finally { rm(dir); }
});

// ─── AC-003: cap + eviction (priority beats age) ────────────────────────

test('AC-003 21st capture evicts oldest lowest-priority open item', () => {
  const dir = mkRepo();
  try {
    const seed = [];
    for (let i = 0; i < 19; i++) {
      seed.push(item({ title: `Xuniqueitem${i}`, date: `2026-02-${String(i + 1).padStart(2, '0')}` }));
    }
    // a LOW item that is NOT the oldest — priority must dominate age
    seed.push(item({ title: 'Xlowpriorityvictim', priority: 'low', date: '2026-02-28' }));
    fl.write(dir, seed);
    assert.equal(fl.count(dir), 20);

    const res = fl.capture(dir, [{ title: 'Xbrandnewitem', category: 'ideas', source: 'new' }], { today: '2026-03-01' });

    assert.deepEqual(res.evicted, ['Xlowpriorityvictim']);
    assert.equal(fl.count(dir), 20);
    const archived = fl.read(dir).items.find((i) => i.title === 'Xlowpriorityvictim');
    assert.notEqual(archived.status, 'open'); // evicted → archived (dismissed/resolved both render `- [x]`)
  } finally { rm(dir); }
});

// ─── AC-004: linked auto-resolve ────────────────────────────────────────

test('AC-004 linked task# auto-resolves silently to archive', () => {
  const dir = mkRepo();
  try {
    fl.write(dir, [item({ title: 'rig-refresh predicate is shallow', category: 'fixes', link: 'task#15' })]);
    const resolved = fl.autoResolveLinked(dir, { taskDone: (id) => id === '15', today: '2026-07-16' });

    assert.equal(resolved.length, 1);
    assert.equal(fl.count(dir), 0);
    const text = fs.readFileSync(path.join(dir, 'LOGBOOK.md'), 'utf-8');
    assert.match(text, /- \[x\] rig-refresh predicate is shallow.*resolved:2026-07-16/);
  } finally { rm(dir); }
});

test('pr# auto-resolves the merged PR only, not a numeric-prefix collision', () => {
  const up = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-up-'));
  const dn = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-dn-'));
  try {
    execSync('git init -q -b main', { cwd: up });
    execSync('git config user.email t@t.co && git config user.name t', { cwd: up });
    execSync('git commit -q --allow-empty -m "feat(next): overview (#86)"', { cwd: up });
    execSync(`git clone -q ${JSON.stringify(up)} .`, { cwd: dn });

    fl.write(dn, [
      item({ title: 'linked to pr 86', link: 'pr#86' }),
      item({ title: 'linked to pr 8', link: 'pr#8' }), // must NOT match (#86)
    ]);
    const resolved = fl.autoResolveLinked(dn);
    assert.deepEqual(resolved.map((i) => i.link), ['pr#86']);
    assert.equal(fl.count(dn), 1);
  } finally { rm(up); rm(dn); }
});

// ─── AC-005: assisted review flags likely-done, does not resolve ────────

test('AC-005 review flags a free-text item addressed by a merged commit', () => {
  const dir = mkRepo();
  try {
    commit(dir, 'Add caching layer to the fetch responses path');
    fl.write(dir, [item({ title: 'Add caching layer to fetch responses' })]);

    const cands = fl.reviewCandidates(dir, { today: '2026-07-16' });
    assert.equal(cands.length, 1);
    assert.match(cands[0].reason, /likely done/);
    // consent: still open, nothing mutated
    assert.equal(fl.openItems(dir).length, 1);
  } finally { rm(dir); }
});

test('reviewCandidates numbers by open-list position (matches resolve <n>)', () => {
  const dir = mkRepo();
  try {
    commit(dir, 'Rework the caching layer for fetch responses');
    fl.write(dir, [
      item({ title: 'linked one', category: 'ideas', link: 'task#9' }),        // n=1, skipped
      item({ title: 'Rework caching layer for fetch responses' }),            // n=2, candidate
    ]);
    const cands = fl.reviewCandidates(dir, { today: '2026-07-16' });
    assert.equal(cands.length, 1);
    assert.equal(cands[0].n, 2); // resolving via `resolve 2` hits this exact item
    assert.equal(fl.openItems(dir)[cands[0].n - 1].title, cands[0].item.title);
  } finally { rm(dir); }
});

// ─── AC-006: no silent free-text delete ─────────────────────────────────

test('AC-006 reviewCandidates never mutates a free-text item', () => {
  const dir = mkRepo();
  try {
    commit(dir, 'Add caching layer to the fetch responses path');
    fl.write(dir, [item({ title: 'Add caching layer to fetch responses' })]);
    const before = fs.readFileSync(path.join(dir, 'LOGBOOK.md'), 'utf-8');

    fl.reviewCandidates(dir);
    fl.autoResolveLinked(dir); // free-text (no link) untouched by deterministic track too

    assert.equal(fs.readFileSync(path.join(dir, 'LOGBOOK.md'), 'utf-8'), before);
    assert.equal(fl.count(dir), 1);
  } finally { rm(dir); }
});

// ─── AC-007 / AC-008: cold-start hint via subcommand ────────────────────

const GUARD = path.join(__dirname, '..', 'session-guard.cjs');

function hint(dir) {
  return execSync(`node ${JSON.stringify(GUARD)} logbook-hint`, { cwd: dir, encoding: 'utf-8', env: { ...process.env, CLAUDE_PROJECT_DIR: dir } }).trim();
}

test('AC-007 logbook-hint emits a passive line when the ledger is non-empty', () => {
  const dir = mkRepo();
  try {
    fl.capture(dir, [
      { title: 'one thing', category: 'ideas', source: 't' },
      { title: 'another thing', category: 'ideas', source: 't' },
    ]);
    assert.match(hint(dir), /2 open follow-ups/);
  } finally { rm(dir); }
});

test('AC-008 empty ledger produces no hint', () => {
  const dir = mkRepo();
  try {
    assert.equal(fl.count(dir), 0);
    assert.equal(hint(dir), '');
  } finally { rm(dir); }
});

// ─── AC-009: /logbook cross-ref count source ───────────────────────────────

test('AC-009 count() drives the /logbook cross-reference', () => {
  const dir = mkRepo();
  try {
    const five = [];
    for (let i = 0; i < 5; i++) five.push(item({ title: `Xnextitem${i}` }));
    fl.write(dir, five);
    assert.equal(fl.count(dir), 5); // /logbook renders "+ 5 follow-ups → /logbook"
  } finally { rm(dir); }
});

// ─── AC-010: pull + resolve ─────────────────────────────────────────────

test('AC-010 resolve N archives the item and drops it from open counts', () => {
  const dir = mkRepo();
  try {
    fl.write(dir, [
      item({ title: 'Xfirst', category: 'ideas' }),
      item({ title: 'Xsecond', category: 'ideas' }),
    ]);
    const done = fl.resolve(dir, 2, { today: '2026-07-16' });
    assert.equal(done.title, 'Xsecond');
    assert.equal(fl.count(dir), 1);
    const text = fs.readFileSync(path.join(dir, 'LOGBOOK.md'), 'utf-8');
    assert.match(text, /## Archive[\s\S]*- \[x\] Xsecond/);
  } finally { rm(dir); }
});

// ─── AC-011: degrade to no-op on malformed file ─────────────────────────

test('AC-011 malformed LOGBOOK.md degrades to no-op', () => {
  const dir = mkRepo();
  try {
    fs.writeFileSync(path.join(dir, 'LOGBOOK.md'), '## Ideas\n- [ ] busted line with no date or source\ngarbage');
    assert.doesNotThrow(() => fl.count(dir));
    assert.equal(fl.count(dir), 0);
    assert.doesNotThrow(() => fl.autoResolveLinked(dir));
    assert.doesNotThrow(() => fl.reviewCandidates(dir));
  } finally { rm(dir); }
});

// ─── AC-012: manual add ─────────────────────────────────────────────────

test('AC-012 add creates an ideas/manual item dated today', () => {
  const dir = mkRepo();
  try {
    const { item: it } = fl.add(dir, { title: 'try the new bundler' }, { today: '2026-07-16' });
    assert.equal(it.category, 'ideas');
    assert.equal(it.source, 'manual');
    assert.equal(it.date, '2026-07-16');
    assert.equal(fl.count(dir), 1);
  } finally { rm(dir); }
});

// ─── linked auto-resolve: guards against false positives (ledger follow-ups) ──

test('spec: link does NOT auto-resolve a path that never existed (typo guard)', () => {
  const dir = mkRepo();
  try {
    fl.write(dir, [item({ title: 'x', category: 'fixes', link: 'spec:specs/never-existed.md' })]);
    assert.equal(fl.autoResolveLinked(dir).length, 0);
    assert.equal(fl.count(dir), 1);
  } finally { rm(dir); }
});

test('spec: link auto-resolves a path that once existed and is now gone', () => {
  const dir = mkRepo();
  try {
    fs.mkdirSync(path.join(dir, 'specs'));
    fs.writeFileSync(path.join(dir, 'specs', 'done.md'), '# spec');
    execSync('git add -A && git commit -q -m "add spec"', { cwd: dir });
    execSync('git rm -q specs/done.md && git commit -q -m "built + removed spec"', { cwd: dir });
    fl.write(dir, [item({ title: 'x', category: 'fixes', link: 'spec:specs/done.md' })]);
    assert.equal(fl.autoResolveLinked(dir).length, 1);
  } finally { rm(dir); }
});

test('task# is not auto-resolved by the module (deferred to the /logbook review TaskGet path)', () => {
  const dir = mkRepo();
  try {
    fl.write(dir, [item({ title: 'x', category: 'fixes', link: 'task#42' })]);
    assert.equal(fl.autoResolveLinked(dir).length, 0); // no taskDone resolver → stays open
    assert.equal(fl.count(dir), 1);
  } finally { rm(dir); }
});

test('rec: link auto-resolves when the engine no longer lists the rec as applicable', () => {
  const dir = mkRepo();
  try {
    fs.mkdirSync(path.join(dir, 'graphify-out')); // makes the graphify rec satisfied → not applicable
    fl.write(dir, [item({ title: 'x', category: 'ideas', link: 'rec:graphify' })]);
    assert.equal(fl.autoResolveLinked(dir).length, 1);
  } finally { rm(dir); }
});

test('rec: is NOT resolved by a user mute — a muted rec must not read as "done"', () => {
  const dir = mkRepo();
  const lc = require('./lifecycle.cjs');
  try {
    fs.writeFileSync(path.join(dir, 'app.js'), 'x\n'); // brace applicable (size>0, no scaffold)
    lc.saveLifecyclePrefs(dir, { mutedAll: true, recs: { brace: { status: 'muted' } } });
    fl.write(dir, [item({ title: 'x', category: 'ideas', link: 'rec:brace' })]);
    assert.equal(fl.autoResolveLinked(dir).length, 0); // muted, but genuinely applicable → stays open
    assert.equal(fl.count(dir), 1);
  } finally { lc.saveLifecyclePrefs(dir, {}); rm(dir); }
});

test('spec: link with a space in the path resolves correctly (argv form, not shell)', () => {
  const dir = mkRepo();
  try {
    fs.mkdirSync(path.join(dir, 'specs'));
    fs.writeFileSync(path.join(dir, 'specs', 'my plan.md'), '# spec');
    execSync('git add -A && git commit -q -m "add"', { cwd: dir });
    execSync('git rm -q "specs/my plan.md" && git commit -q -m "remove"', { cwd: dir });
    fl.write(dir, [item({ title: 'x', category: 'fixes', link: 'spec:specs/my plan.md' })]);
    assert.equal(fl.autoResolveLinked(dir).length, 1); // space handled → once-existed detected
  } finally { rm(dir); }
});

test('rec: link stays open while the rec is still applicable, and for unknown rec ids', () => {
  const dir = mkRepo();
  try {
    fs.writeFileSync(path.join(dir, 'app.js'), 'console.log(1)\n'); // size>0, no scaffold → brace applicable
    fl.write(dir, [
      item({ title: 'a', category: 'ideas', link: 'rec:brace' }),
      item({ title: 'b', category: 'ideas', link: 'rec:not-a-real-rec' }),
    ]);
    assert.equal(fl.autoResolveLinked(dir).length, 0);
    assert.equal(fl.count(dir), 2);
  } finally { rm(dir); }
});

// ─── legacy migration: a rename must never orphan committed items ───────

test('read merges legacy FOLLOWUPS.md and LOG.md so nothing is orphaned', () => {
  const dir = mkRepo();
  try {
    fs.writeFileSync(path.join(dir, 'FOLLOWUPS.md'), fl.serialize([item({ title: 'from followups' })]));
    fs.writeFileSync(path.join(dir, 'LOG.md'), fl.serialize([item({ title: 'from log' })]));
    // no LOGBOOK.md yet — legacy items must still surface
    assert.equal(fl.count(dir), 2);
    assert.deepEqual(fl.openItems(dir).map((i) => i.title).sort(), ['from followups', 'from log']);
  } finally { rm(dir); }
});

test('a write consolidates legacy files into LOGBOOK.md and retires them', () => {
  const dir = mkRepo();
  try {
    fs.writeFileSync(path.join(dir, 'FOLLOWUPS.md'), fl.serialize([item({ title: 'legacy A' })]));
    fs.writeFileSync(path.join(dir, 'LOG.md'), fl.serialize([item({ title: 'legacy B' })]));
    fl.add(dir, { title: 'brand new' }, { today: '2026-07-17' });
    assert.ok(fs.existsSync(path.join(dir, 'LOGBOOK.md')));
    assert.ok(!fs.existsSync(path.join(dir, 'FOLLOWUPS.md')));
    assert.ok(!fs.existsSync(path.join(dir, 'LOG.md')));
    assert.deepEqual(fl.openItems(dir).map((i) => i.title).sort(), ['brand new', 'legacy A', 'legacy B']);
  } finally { rm(dir); }
});

test('merge dedupes an item present in both a legacy file and LOGBOOK.md', () => {
  const dir = mkRepo();
  try {
    fs.writeFileSync(path.join(dir, 'LOGBOOK.md'), fl.serialize([item({ title: 'shared item' })]));
    fs.writeFileSync(path.join(dir, 'LOG.md'), fl.serialize([item({ title: 'Shared Item' })])); // case-diff dup
    assert.equal(fl.count(dir), 1);
  } finally { rm(dir); }
});

// ─── round-trip: parse ∘ serialize is lossless (Validation §10) ─────────

test('parse/serialize round-trips items, links, archive, empty categories', () => {
  const items = [
    item({ title: 'Add retry', category: 'ideas', source: '/ship #87', date: '2026-07-16' }),
    item({ title: 'shallow predicate', category: 'fixes', link: 'task#15', date: '2026-07-14' }),
    item({ title: 'done thing', category: 'ideas', status: 'resolved', link: 'task#16', date: '2026-07-14', resolvedDate: '2026-07-16' }),
  ];
  const reparsed = fl.parse(fl.serialize(items));
  assert.equal(reparsed.filter((i) => i.status === 'open').length, 2);
  const linked = reparsed.find((i) => i.link === 'task#15');
  assert.equal(linked.category, 'fixes');
  const archived = reparsed.find((i) => i.status !== 'open');
  assert.equal(archived.resolvedDate, '2026-07-16');
});
