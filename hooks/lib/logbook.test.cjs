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
    status: 'open', link: null, priority: 'normal', resolvedDate: null,
    dismissedDate: null, relocatedDate: null,
    // location defaults to 'hot': write() treats anything !== 'archive' as
    // hot (see write()'s `items.filter((it) => it.location !== 'archive')`),
    // so omitting it here would be safe too — set explicitly for clarity.
    location: 'hot', ...over,
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

test('capture invoked with a subdirectory as projectDir still writes LOGBOOK.md at the repo root', () => {
  const dir = mkRepo();
  try {
    const sub = path.join(dir, 'app');
    fs.mkdirSync(sub);

    fl.capture(sub, [
      { title: 'Fix the thing', category: 'deferred_fix', source: 'test' },
    ], { today: '2026-07-18' });

    assert.ok(fs.existsSync(path.join(dir, 'LOGBOOK.md')));
    assert.ok(!fs.existsSync(path.join(sub, 'LOGBOOK.md')));
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

test('21st capture relocates oldest lowest-priority open item to the archive file', () => {
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

    assert.deepEqual(res.relocationCandidates.map((c) => c.title), ['Xlowpriorityvictim']);
    assert.equal(fl.count(dir), 20); // hot-only count unchanged — relocation, not truncation

    const victim = fl.read(dir).items.find((i) => i.title === 'Xlowpriorityvictim');
    assert.equal(victim.status, 'open'); // UNCHANGED — the core fix this spec makes
    assert.equal(victim.location, 'archive');
    assert.equal(victim.relocatedDate, '2026-03-01');

    const archiveText = fs.readFileSync(path.join(dir, 'LOGBOOK-ARCHIVE.md'), 'utf-8');
    assert.match(archiveText, /Xlowpriorityvictim.*relocated:2026-03-01/);
  } finally { rm(dir); }
});

test('archive-triage AC-001 capture breach relocates candidates without ever setting dismissed or resolved status', () => {
  const dir = mkRepo();
  try {
    const seed = [];
    for (let i = 0; i < 20; i++) {
      seed.push(item({ title: `Xac1item${i}`, date: `2026-02-${String(i + 1).padStart(2, '0')}` }));
    }
    fl.write(dir, seed);

    const res = fl.capture(dir, [
      { title: 'Xac1new1', category: 'ideas', source: 'new' },
      { title: 'Xac1new2', category: 'ideas', source: 'new' },
    ], { today: '2026-03-01' });

    assert.equal(res.relocationCandidates.length, 2);
    const items = fl.read(dir).items;
    for (const cand of res.relocationCandidates) {
      const it = items.find((i) => i.title === cand.title);
      assert.equal(it.status, 'open'); // never dismissed or resolved
      assert.equal(it.location, 'archive');
      assert.equal(it.relocatedDate, '2026-03-01');
    }
  } finally { rm(dir); }
});

test('archive-triage AC-002 hot-file resolved/dismissed history exceeding ARCHIVE_MAX relocates the oldest excess with status intact', () => {
  const dir = mkRepo();
  try {
    const seed = [];
    for (let i = 0; i < 30; i++) {
      const d = `2026-01-${String(i + 1).padStart(2, '0')}`;
      seed.push(item({ title: `Xhist${i}`, status: 'resolved', resolvedDate: d, date: d }));
    }
    // the oldest of all — a dismissed item, so it's the one expected to relocate
    seed.push(item({ title: 'Xoldestdismissed', status: 'dismissed', dismissedDate: '2025-12-01', date: '2025-12-01' }));
    fl.write(dir, seed);

    const relocated = fl.read(dir).items.find((i) => i.title === 'Xoldestdismissed');
    assert.equal(relocated.location, 'archive');
    assert.equal(relocated.status, 'dismissed'); // original status intact
    assert.equal(relocated.dismissedDate, '2025-12-01'); // original date intact
    assert.equal(relocated.resolvedDate, null);

    const archiveText = fs.readFileSync(path.join(dir, 'LOGBOOK-ARCHIVE.md'), 'utf-8');
    assert.match(archiveText, /Xoldestdismissed.*dismissed:2025-12-01/);
  } finally { rm(dir); }
});

test('archive-triage AC-003 legacy bare-marker item (checked, no resolved/dismissed marker) parses as resolved without throwing', () => {
  const dir = mkRepo();
  try {
    fs.writeFileSync(path.join(dir, 'LOGBOOK.md'), [
      '# Follow-ups', '',
      '## Ideas', '',
      '## Deferred fixes', '',
      '## Open questions', '',
      '## Risks', '',
      '## Tech debt', '',
      '## Archive',
      '- [x] Old evicted item — test (2026-01-01)',
      '',
    ].join('\n'));

    assert.doesNotThrow(() => fl.read(dir));
    const it = fl.read(dir).items.find((i) => i.title === 'Old evicted item');
    assert.equal(it.status, 'resolved');
    assert.equal(it.resolvedDate, null); // no explicit marker — fallback only, not a real date
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

test('archive-triage AC-006 autoResolveLinked resolves an archive-location item when its link is satisfied', () => {
  const dir = mkRepo();
  try {
    fl.write(dir, [
      item({ title: 'archived linked item', category: 'fixes', link: 'task#7', location: 'archive', relocatedDate: '2026-07-01' }),
    ]);
    const resolved = fl.autoResolveLinked(dir, { taskDone: (id) => id === '7', today: '2026-07-16' });

    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].location, 'archive'); // stays put — only status changes
    assert.equal(resolved[0].status, 'resolved');
    assert.equal(resolved[0].resolvedDate, '2026-07-16');
    assert.equal(resolved[0].relocatedDate, null); // no longer "open-but-relocated"
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
    assert.equal(cands[0].selector, '2'); // resolving via `resolve 2` hits this exact item
    assert.equal(fl.openItems(dir)[Number(cands[0].selector) - 1].title, cands[0].item.title);
  } finally { rm(dir); }
});

test('archive-triage AC-007 reviewCandidates surfaces a stale relocated item with an a-prefixed selector', () => {
  const dir = mkRepo();
  try {
    fl.write(dir, [
      item({ title: 'Xstalerelocated', category: 'ideas', date: '2026-01-01', location: 'archive', relocatedDate: '2026-01-01' }),
    ]);
    const cands = fl.reviewCandidates(dir, { today: '2026-07-16' }); // well past STALE_DAYS=60
    assert.equal(cands.length, 1);
    assert.equal(cands[0].selector, 'a1');
    assert.match(cands[0].reason, /\(relocated\)/);
    // consent: reviewCandidates never mutates
    assert.equal(fl.read(dir).items.find((i) => i.title === 'Xstalerelocated').status, 'open');
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

// ─── archive-triage: relocation, restore, previewCapture, archive merge ─

test('archive-triage AC-008 restore moves an archive item back to hot, and immediately relocates overflow if it breaches cap', () => {
  const dir = mkRepo();
  try {
    const seed = [];
    for (let i = 0; i < 19; i++) {
      seed.push(item({ title: `Xhot${i}`, date: `2026-02-${String(i + 1).padStart(2, '0')}` }));
    }
    seed.push(item({ title: 'Xhotvictim', priority: 'low', date: '2026-01-01' })); // 20th hot item — becomes new victim
    seed.push(item({
      title: 'Xarchived', category: 'ideas', date: '2026-01-15',
      location: 'archive', relocatedDate: '2026-06-01',
    }));
    fl.write(dir, seed);
    assert.equal(fl.count(dir), 20);

    const res = fl.restore(dir, 'a1');

    assert.equal(res.restored.title, 'Xarchived');
    assert.equal(res.restored.location, 'hot');
    assert.equal(res.restored.relocatedDate, null);
    assert.deepEqual(res.relocationCandidates.map((c) => c.title), ['Xhotvictim']); // a DIFFERENT item

    assert.equal(fl.count(dir), 20); // self-balanced back to cap

    const after = fl.read(dir).items;
    assert.equal(after.find((i) => i.title === 'Xarchived').location, 'hot');
    const victim = after.find((i) => i.title === 'Xhotvictim');
    assert.equal(victim.location, 'archive');
    assert.equal(victim.status, 'open'); // relocation, not eviction
  } finally { rm(dir); }
});

test('archive-triage: resolve/dismiss via an a-prefixed selector settle the item in place, without restoring it to hot', () => {
  const dir = mkRepo();
  try {
    fl.write(dir, [
      item({ title: 'Xarchresolve', category: 'ideas', date: '2026-01-01', location: 'archive', relocatedDate: '2026-06-02' }),
      item({ title: 'Xarchdismiss', category: 'ideas', date: '2026-01-02', location: 'archive', relocatedDate: '2026-06-01' }),
    ]);

    const resolved = fl.resolve(dir, 'a1', { today: '2026-07-16' });
    assert.equal(resolved.title, 'Xarchresolve');
    assert.equal(resolved.status, 'resolved');
    assert.equal(resolved.location, 'archive'); // stays put — not restored to hot
    assert.equal(resolved.resolvedDate, '2026-07-16');
    assert.equal(resolved.relocatedDate, null);

    const dismissed = fl.dismiss(dir, 'a1', { today: '2026-07-17' }); // Xarchresolve no longer open → now the a1
    assert.equal(dismissed.title, 'Xarchdismiss');
    assert.equal(dismissed.status, 'dismissed');
    assert.equal(dismissed.location, 'archive');
    assert.equal(dismissed.dismissedDate, '2026-07-17');
    assert.equal(dismissed.relocatedDate, null);
  } finally { rm(dir); }
});

test('restore no-ops safely on a bad/non-archive/non-open selector', () => {
  const dir = mkRepo();
  try {
    fl.write(dir, [item({ title: 'hot item' })]);
    const badSelector = fl.restore(dir, 'a1'); // no archive items at all
    assert.equal(badSelector.restored, null);
    assert.deepEqual(badSelector.relocationCandidates, []);

    const hotSelector = fl.restore(dir, '1'); // targets a hot, not archive, item
    assert.equal(hotSelector.restored, null);
  } finally { rm(dir); }
});

test('previewCapture never writes to disk while still reporting relocation candidates', () => {
  const dir = mkRepo();
  try {
    const seed = [];
    for (let i = 0; i < 20; i++) {
      seed.push(item({ title: `Xseed${i}`, date: `2026-02-${String(i + 1).padStart(2, '0')}` }));
    }
    fl.write(dir, seed);
    const before = fs.readFileSync(path.join(dir, 'LOGBOOK.md'), 'utf-8');
    const archivePath = path.join(dir, 'LOGBOOK-ARCHIVE.md');
    const archiveExistedBefore = fs.existsSync(archivePath);

    const res = fl.previewCapture(dir, [{ title: 'Xnewcandidate', category: 'ideas', source: 'preview' }], { today: '2026-03-01' });

    assert.equal(res.added, 1);
    assert.equal(res.relocationCandidates.length, 1);
    assert.equal(fs.readFileSync(path.join(dir, 'LOGBOOK.md'), 'utf-8'), before); // byte-identical — no write occurred
    assert.equal(fs.existsSync(archivePath), archiveExistedBefore); // still absent
    assert.equal(fl.count(dir), 20); // a fresh read confirms nothing was persisted
  } finally { rm(dir); }
});

test('read merges LOGBOOK-ARCHIVE.md items, tagged location: archive', () => {
  const dir = mkRepo();
  try {
    fs.writeFileSync(path.join(dir, 'LOGBOOK.md'), fl.serialize([item({ title: 'hot item' })]));
    fs.writeFileSync(path.join(dir, 'LOGBOOK-ARCHIVE.md'), fl.serialize([item({ title: 'archived open item' })]));

    const { items } = fl.read(dir);
    assert.equal(items.length, 2);
    assert.equal(items.find((i) => i.title === 'archived open item').location, 'archive');
    assert.equal(items.find((i) => i.title === 'hot item').location, 'hot');
  } finally { rm(dir); }
});

test('openItems and count never include archive-location items, even when LOGBOOK-ARCHIVE.md has open relocated items', () => {
  const dir = mkRepo();
  try {
    fs.writeFileSync(path.join(dir, 'LOGBOOK.md'), fl.serialize([item({ title: 'hot item' })]));
    fs.writeFileSync(path.join(dir, 'LOGBOOK-ARCHIVE.md'), fl.serialize([item({ title: 'archived open item' })]));

    assert.equal(fl.count(dir), 1);
    assert.deepEqual(fl.openItems(dir).map((i) => i.title), ['hot item']);
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
    item({ title: 'nope not doing it', category: 'ideas', status: 'dismissed', date: '2026-07-10', dismissedDate: '2026-07-15' }),
    item({ title: 'relocated but still open', category: 'risks', status: 'open', date: '2026-07-01', location: 'archive', relocatedDate: '2026-07-12' }),
  ];
  const reparsed = fl.parse(fl.serialize(items));
  assert.equal(reparsed.filter((i) => i.status === 'open').length, 3);
  const linked = reparsed.find((i) => i.link === 'task#15');
  assert.equal(linked.category, 'fixes');

  const resolved = reparsed.find((i) => i.title === 'done thing');
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.resolvedDate, '2026-07-16');
  assert.equal(resolved.dismissedDate, null);

  const dismissed = reparsed.find((i) => i.title === 'nope not doing it');
  assert.equal(dismissed.status, 'dismissed');
  assert.equal(dismissed.dismissedDate, '2026-07-15');
  assert.equal(dismissed.resolvedDate, null);

  const relocated = reparsed.find((i) => i.title === 'relocated but still open');
  assert.equal(relocated.status, 'open'); // still unchecked — relocation never flips status
  assert.equal(relocated.relocatedDate, '2026-07-12');
  assert.equal(relocated.resolvedDate, null);
  assert.equal(relocated.dismissedDate, null);
});
