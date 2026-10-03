'use strict';

/**
 * Unified session handoff — one store, two slots (build, waybill).
 *
 * A record per repo (keyed by the main checkout, so linked worktrees share it)
 * lives in ~/.claude/session-guard/handoff/<key>.json. Owned waybill files live
 * beside it and are only ever deleted when they still match the id + sha256
 * stamped at arm time. Specs are never deleted.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const config = require('./config.cjs');

const SLOTS = ['build', 'waybill'];
const STAMP_RE = /^<!-- mad-skills:waybill id=([0-9a-f-]+) -->\r?\n?/;
const EXCLUDE_TAG = '# mad-skills:ferry';
const DAY_MS = 86400000;

// ─── repo keying ───────────────────────────────────────────────────────

function gitOut(args, cwd) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], {
      encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000, windowsHide: true,
    }).trim();
  } catch {
    return null;
  }
}

function real(p) {
  try { return fs.realpathSync(p); } catch { return path.resolve(p); }
}

function md5(s) {
  return crypto.createHash('md5').update(s).digest('hex');
}

function resolveRepo(dir) {
  const base = real(dir || process.cwd());
  const top = gitOut(['rev-parse', '--show-toplevel'], base);
  const common = gitOut(['rev-parse', '--path-format=absolute', '--git-common-dir'], base);
  if (!top || !common) return { repoRoot: base, toplevel: base, key: md5(base) };
  const repoRoot = real(path.dirname(common));
  return { repoRoot, toplevel: real(top), key: md5(repoRoot) };
}

// ─── store ─────────────────────────────────────────────────────────────

function storeDir() {
  return path.join(os.homedir(), '.claude', 'session-guard', 'handoff');
}

function recordPath(key) {
  return path.join(storeDir(), `${key}.json`);
}

function defaultWaybillPath(repo, kind = 'waybill') {
  const top = md5(repo.toplevel).slice(0, 8);
  const name = kind === 'build' ? 'build-waybill.md'
    : kind === 'checkpoint' ? `${top}-checkpoint.md`
    : `${top}-waybill.md`;
  return path.join(storeDir(), repo.key, name);
}

// ─── lock ──────────────────────────────────────────────────────────────

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Serialises load→modify→save per repo key. Throws code ELOCKED on timeout.
function withLock(key, fn) {
  const file = path.join(storeDir(), `${key}.lock`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const deadline = Date.now() + 2000;
  for (;;) {
    try {
      fs.closeSync(fs.openSync(file, 'wx'));
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        if (Date.now() - fs.statSync(file).mtimeMs > 10000) { fs.unlinkSync(file); continue; }
      } catch { continue; }
      if (Date.now() >= deadline) {
        const err = new Error('handoff store is locked by another process');
        err.code = 'ELOCKED';
        throw err;
      }
      sleep(25);
    }
  }
  try {
    return fn();
  } finally {
    try { fs.unlinkSync(file); } catch { /* noop */ }
  }
}

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

function loadRecord(repo) {
  try {
    const rec = JSON.parse(fs.readFileSync(recordPath(repo.key), 'utf-8'));
    if (rec && typeof rec === 'object' && rec.slots) {
      if (!Array.isArray(rec.kept)) rec.kept = [];
      return rec;
    }
  } catch { /* missing or corrupt */ }
  return { version: 1, repoRoot: repo.repoRoot, slots: {}, kept: [] };
}

function saveRecord(repo, rec) {
  if (!Object.keys(rec.slots).length && !(rec.kept || []).length) {
    try { fs.unlinkSync(recordPath(repo.key)); } catch { /* noop */ }
    return;
  }
  writeAtomic(recordPath(repo.key), JSON.stringify(rec, null, 2));
}

// ─── waybill provenance + guarded delete ───────────────────────────────

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function stampWaybill(file) {
  let content = fs.readFileSync(file, 'utf-8');
  const m = STAMP_RE.exec(content);
  let id;
  if (m) {
    id = m[1];
  } else {
    id = crypto.randomUUID();
    content = `<!-- mad-skills:waybill id=${id} -->\n${content}`;
    fs.writeFileSync(file, content);
  }
  return { id, sha256: sha256(content) };
}

function stripStamp(content) {
  return content.replace(STAMP_RE, '');
}

function worktreeTops(toplevel) {
  const out = gitOut(['worktree', 'list', '--porcelain'], toplevel);
  const tops = (out || '').split('\n').filter((l) => l.startsWith('worktree ')).map((l) => real(l.slice(9)));
  return tops.length ? tops : [real(toplevel)];
}

function pruneExclude(toplevel, { untagged = false } = {}) {
  try {
    // info/exclude is shared by every worktree: keep the line while any still has a waybill.md.
    if (worktreeTops(toplevel).some((t) => fs.existsSync(path.join(t, 'waybill.md')))) return;
    const rel = gitOut(['rev-parse', '--git-path', 'info/exclude'], toplevel);
    if (!rel) return;
    const file = path.resolve(toplevel, rel);
    const lines = fs.readFileSync(file, 'utf-8').split('\n');
    const kept = lines.filter((l) => {
      const t = l.trim();
      return !(t.endsWith(EXCLUDE_TAG) || (untagged && t === 'waybill.md'));
    });
    if (kept.length !== lines.length) fs.writeFileSync(file, kept.join('\n'));
  } catch { /* exclude cleanup is best-effort */ }
}

// Returns 'deleted' | 'kept-edited' | 'missing' ('not-owned' for unowned artifacts).
function guardedDelete(artifact, toplevel, opts) {
  if (!artifact || !artifact.owned) return 'not-owned';
  let content;
  try { content = fs.readFileSync(artifact.path, 'utf-8'); } catch { return 'missing'; }
  const m = STAMP_RE.exec(content);
  if (!m || m[1] !== artifact.id || sha256(content) !== artifact.sha256) return 'kept-edited';
  try { fs.unlinkSync(artifact.path); } catch { return 'missing'; }
  maybePrune(artifact.path, toplevel, opts);
  return 'deleted';
}

// Only a `/ferry here` waybill (<worktree>/waybill.md) ever added an exclude line.
function maybePrune(file, toplevel, opts) {
  if (!toplevel) return;
  const target = path.resolve(file);
  if (worktreeTops(toplevel).some((t) => target === path.join(t, 'waybill.md'))) pruneExclude(toplevel, opts);
}

// guardedDelete + record any edited file so it is not orphaned.
function deleteOwned(rec, a, toplevel, notices) {
  const r = guardedDelete(a, toplevel);
  if (r === 'kept-edited') {
    if (!rec.kept.some((k) => k.path === a.path)) rec.kept.push({ path: a.path, id: a.id, keptAt: Date.now() });
    notices.push(`[HANDOFF] waybill ${a.path} was edited — kept`);
  }
  return r;
}

// ─── specs ─────────────────────────────────────────────────────────────

function isInside(root, abs) {
  const rel = path.relative(root, abs);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function findSpec(p, bases) {
  if (path.isAbsolute(p)) return fs.existsSync(p) ? p : null;
  for (const b of bases) {
    const abs = path.resolve(b, p);
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

function specFrontmatter(abs) {
  try {
    const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(fs.readFileSync(abs, 'utf-8'));
    if (!m) return {};
    const out = {};
    for (const line of m[1].split('\n')) {
      const kv = /^([A-Za-z0-9_]+):\s*(.+?)\s*$/.exec(line);
      if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
    }
    return out;
  } catch {
    return {};
  }
}

// ─── legacy migration ──────────────────────────────────────────────────

// POSIX cksum: CRC-32 (poly 0x04C11DB7, non-reflected), then the byte length
// LSB-first, then complemented.
function cksum(str) {
  const table = [];
  for (let i = 0; i < 256; i++) {
    let c = (i << 24) >>> 0;
    for (let b = 0; b < 8; b++) c = ((c & 0x80000000) ? ((c << 1) ^ 0x04C11DB7) : (c << 1)) >>> 0;
    table.push(c);
  }
  let crc = 0;
  const feed = (byte) => { crc = (((crc << 8) >>> 0) ^ table[((crc >>> 24) ^ byte) & 0xff]) >>> 0; };
  const buf = Buffer.from(str, 'utf-8');
  for (const byte of buf) feed(byte);
  for (let n = buf.length; n > 0; n = Math.floor(n / 256)) feed(n & 0xff);
  return (~crc) >>> 0;
}

// A legacy signal lives in shared /tmp; only trust one this user wrote, in a
// directory nobody else can write to — otherwise another local user could
// point the injection at any file we can read.
function trustedSignal(dir, file) {
  if (typeof process.getuid !== 'function') return true;
  const uid = process.getuid();
  try {
    for (const p of [dir, file]) {
      const st = fs.lstatSync(p);
      if (st.isSymbolicLink() || st.uid !== uid || (st.mode & 0o022)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

function newSlot(source, toplevel, resume, artifacts, createdAt) {
  return {
    source, toplevel, resume: resume || null, artifacts,
    createdAt: createdAt || Date.now(), injectedAt: null,
  };
}

function migrateLegacy(cwd, repo, rec) {
  const raw = path.resolve(cwd || process.cwd());
  const stateDir = path.join(os.homedir(), '.claude', 'session-guard');
  const dirs = [...new Set([raw, real(raw), repo.toplevel, repo.repoRoot])];
  let changed = false;

  for (const d of dirs) {
    const file = path.join(stateDir, `${md5(d)}-pending-build.json`);
    let legacy;
    try { legacy = JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { continue; }
    try { fs.unlinkSync(file); } catch { /* noop */ }
    if (rec.slots.build || !legacy || typeof legacy.specPath !== 'string') continue;
    const abs = findSpec(legacy.specPath, [legacy.projectDir || d, d, repo.repoRoot]);
    if (!abs) continue;
    rec.slots.build = newSlot('speccy', repo.toplevel, `/build ${legacy.specPath}`, [
      { role: 'spec', path: isInside(repo.repoRoot, abs) ? path.relative(repo.repoRoot, abs) : abs, owned: false },
    ], Number(legacy.timestamp) || Date.now());
    changed = true;
  }

  const signalDir = process.platform === 'win32' ? path.join(os.tmpdir(), 'claude-ferry') : '/tmp/claude-ferry';
  for (const d of dirs) {
    const file = path.join(signalDir, `${cksum(d)}.signal`);
    if (!fs.existsSync(file) || !trustedSignal(signalDir, file)) continue;
    let target;
    try { target = fs.readFileSync(file, 'utf-8').split('\n')[0].trim(); } catch { continue; }
    try { fs.unlinkSync(file); } catch { /* noop */ }
    if (rec.slots.waybill || !target || !fs.existsSync(target)) continue;
    rec.slots.waybill = newSlot('ferry', repo.toplevel, null, [
      { role: 'waybill', path: target, owned: false },
    ]);
    changed = true;
  }
  return changed;
}

// ─── slot helpers ──────────────────────────────────────────────────────

function specArtifact(slot) {
  return (slot.artifacts || []).find((a) => a.role === 'spec');
}

function resolveSpecPath(slot, repo) {
  const a = specArtifact(slot);
  return a ? findSpec(a.path, [repo.repoRoot, repo.toplevel]) : null;
}

// Build slots live and die by their spec; a vanished waybill is just dropped.
function slotUsable(slot, name, repo) {
  slot.artifacts = (slot.artifacts || []).filter((a) => a.role === 'spec' || fs.existsSync(a.path));
  if (name === 'build') return !!resolveSpecPath(slot, repo);
  return slot.artifacts.some((a) => a.role === 'waybill');
}

function dropSlot(rec, name, repo) {
  const slot = rec.slots[name];
  if (!slot) return [];
  const notices = [];
  for (const a of slot.artifacts || []) deleteOwned(rec, a, slot.toplevel || repo.toplevel, notices);
  delete rec.slots[name];
  return notices;
}

function peek(dir) {
  const repo = resolveRepo(dir);
  const rec = loadRecord(repo);
  const out = { repo, build: null, waybill: null };
  for (const name of SLOTS) {
    const slot = rec.slots[name];
    if (slot && slotUsable(slot, name, repo)) out[name] = slot;
  }
  return out;
}

// ─── consume (SessionStart) ────────────────────────────────────────────

function renderBuild(slot, repo, first) {
  const spec = specArtifact(slot);
  const abs = resolveSpecPath(slot, repo);
  let shown = spec ? spec.path : '';
  if (abs && isInside(repo.toplevel, abs)) shown = path.relative(repo.toplevel, abs);
  const resume = slot.resume || (shown ? `/build ${shown}` : '');
  if (!first) {
    return `[HANDOFF] Pending: ${resume} (spec ready since ${new Date(slot.createdAt).toISOString().slice(0, 10)})`;
  }
  const fm = abs ? specFrontmatter(abs) : {};
  let line = `[HANDOFF] The previous session (/${slot.source}) left a spec ready to build: ${shown}`;
  if (fm.title) line += ` — "${fm.title}"`;
  if (fm.autonomy_ready) line += ` (autonomy_ready: ${fm.autonomy_ready})`;
  let text = `${line}.\nNext action: ${resume}. Tell the user it is ready and offer to run it; read the spec before acting.`;
  const way = (slot.artifacts || []).find((a) => a.role === 'waybill');
  if (way) {
    text += `\nPlan and clarifications were captured in ${way.path}; treat it as primary context.`;
    try { text += `\n\n---\n\n${stripStamp(fs.readFileSync(way.path, 'utf-8'))}`; } catch { /* noop */ }
  }
  return text;
}

function renderWaybill(slot) {
  const way = (slot.artifacts || []).find((a) => a.role === 'waybill');
  let head = `The previous session left a waybill document at ${way.path} and signalled that this session should resume from it. Treat it as your primary context for continuing the work. Read any files it references before acting.`;
  if (slot.resume) head += ` Next action: ${slot.resume}.`;
  return `${head}\n\n---\n\n${stripStamp(fs.readFileSync(way.path, 'utf-8'))}`;
}

// A slot's owned waybill is swept when the session it was injected into ends
// (SessionEnd → end()). A later SessionStart only sweeps it as a fallback —
// no session id was recorded, or SessionEnd never fired within a day — so a
// parallel terminal opening in the same tree does not delete it mid-use.
function sweepable(slot) {
  return !slot.injectedSession || Date.now() - slot.injectedAt > DAY_MS;
}

// source is the SessionStart trigger. compact/resume continue an existing
// session, so they never inject, advance counters or sweep.
function consume(cwd, source, sessionId) {
  if (source === 'compact' || source === 'resume') return '';
  const repo = resolveRepo(cwd);
  try {
    return withLock(repo.key, () => consumeLocked(cwd, repo, sessionId));
  } catch (e) {
    if (e.code === 'ELOCKED') return '';
    throw e;
  }
}

function consumeLocked(cwd, repo, sessionId) {
  const rec = loadRecord(repo);
  let dirty = migrateLegacy(cwd, repo, rec);
  const notices = [];
  const expiry = ((config.handoff || {}).expiryDays || 14) * DAY_MS;

  for (const name of SLOTS) {
    const slot = rec.slots[name];
    if (!slot) continue;
    const before = (slot.artifacts || []).length;
    if (Date.now() - slot.createdAt > expiry || !slotUsable(slot, name, repo)) {
      notices.push(...dropSlot(rec, name, repo));
      dirty = true;
    } else if (slot.artifacts.length !== before) {
      dirty = true;
    }
  }

  const blocks = { waybill: null, build: null };

  const way = rec.slots.waybill;
  if (way && way.toplevel === repo.toplevel) {
    if (!way.injectedAt) {
      blocks.waybill = renderWaybill(way);
      way.injectedAt = Date.now();
      way.injectedSession = sessionId || null;
      dirty = true;
    } else if (sweepable(way)) {
      notices.push(...dropSlot(rec, 'waybill', repo));
      dirty = true;
    }
  }

  const build = rec.slots.build;
  if (build) {
    if (!build.injectedAt) {
      blocks.build = renderBuild(build, repo, true);
      build.injectedAt = Date.now();
      build.injectedSession = sessionId || null;
    } else {
      if (sweepable(build)) sweepBuildWaybill(rec, build, repo, notices);
      blocks.build = renderBuild(build, repo, false);
    }
    dirty = true;
  }

  if (dirty) saveRecord(repo, rec);
  return [blocks.waybill, blocks.build, ...notices].filter(Boolean).join('\n\n');
}

function sweepBuildWaybill(rec, build, repo, notices) {
  build.artifacts = (build.artifacts || []).filter((a) => {
    if (a.role !== 'waybill' || !a.owned) return true;
    deleteOwned(rec, a, build.toplevel || repo.toplevel, notices);
    return false;
  });
}

// ─── end (SessionEnd) ──────────────────────────────────────────────────

// The session a waybill was injected into has ended: its owned waybills are
// no longer needed. Build slots keep their resume reminder.
function end(cwd, sessionId) {
  if (!sessionId) return;
  const repo = resolveRepo(cwd);
  try {
    withLock(repo.key, () => {
      const rec = loadRecord(repo);
      const notices = [];
      let dirty = false;
      const way = rec.slots.waybill;
      if (way && way.injectedSession === sessionId) {
        notices.push(...dropSlot(rec, 'waybill', repo));
        dirty = true;
      }
      const build = rec.slots.build;
      if (build && build.injectedSession === sessionId) {
        sweepBuildWaybill(rec, build, repo, notices);
        dirty = true;
      }
      if (dirty) saveRecord(repo, rec);
    });
  } catch (e) {
    if (e.code !== 'ELOCKED') throw e;
  }
}

// ─── arm / clear / clean ───────────────────────────────────────────────

function arm(opts) {
  const repo = resolveRepo(opts.dir);
  return withLock(repo.key, () => armLocked(opts, repo));
}

function armLocked(opts, repo) {
  const kind = opts.kind;
  if (!SLOTS.includes(kind)) throw new Error('--kind must be build or waybill');
  const bases = [real(opts.dir || process.cwd()), repo.toplevel, repo.repoRoot];
  const artifacts = [];
  let resume = opts.resume || null;
  let source = opts.source;
  let owned = opts.owned === undefined ? true : opts.owned !== 'false' && opts.owned !== false;
  let waybillArt = null;

  if (kind === 'build') {
    if (!opts.spec) throw new Error('--spec is required for --kind build');
    const abs = findSpec(opts.spec, bases);
    if (!abs) throw new Error(`spec not found: ${opts.spec}`);
    artifacts.push({
      role: 'spec', path: isInside(repo.repoRoot, abs) ? path.relative(repo.repoRoot, abs) : abs, owned: false,
    });
    if (!resume) resume = `/build ${opts.spec}`;
    if (!source) source = opts.waybill ? 'build-handoff' : 'speccy';
    if (opts.waybill) owned = true;
  } else {
    if (!opts.waybill) throw new Error('--waybill is required for --kind waybill');
    if (!source) source = 'ferry';
  }

  // A silent checkpoint must not displace a waybill that is still waiting to be read.
  if (source === 'auto-checkpoint') {
    const existing = loadRecord(repo).slots[kind];
    if (existing && existing.source !== source && !existing.injectedAt) {
      return { repo, waybill: null, notices: [], skipped: existing.source };
    }
  }

  if (opts.waybill) {
    const file = path.resolve(bases[0], opts.waybill);
    if (owned && !fs.existsSync(file)) throw new Error(`waybill not found: ${file}`);
    waybillArt = { role: 'waybill', path: file, owned };
    if (owned) Object.assign(waybillArt, stampWaybill(file));
    artifacts.push(waybillArt);
  }

  const rec = loadRecord(repo);
  const old = rec.slots[kind];
  const notices = [];
  if (old) {
    for (const a of old.artifacts || []) {
      if (a.role === 'waybill' && a.owned && (!waybillArt || waybillArt.path !== a.path)) {
        deleteOwned(rec, a, old.toplevel || repo.toplevel, notices);
      }
    }
  }
  rec.slots[kind] = newSlot(source, repo.toplevel, resume, artifacts);
  saveRecord(repo, rec);
  return { repo, waybill: waybillArt, notices };
}

function clear(opts) {
  const kind = opts.kind;
  if (![...SLOTS, 'all'].includes(kind)) throw new Error('--kind must be build, waybill or all');
  const repo = resolveRepo(opts.dir);
  return withLock(repo.key, () => {
    const rec = loadRecord(repo);
    const notices = [];
    for (const name of kind === 'all' ? SLOTS : [kind]) {
      if (opts.source && (rec.slots[name] || {}).source !== opts.source) continue;
      notices.push(...dropSlot(rec, name, repo));
    }
    saveRecord(repo, rec);
    return notices;
  });
}

// Untracked and listed in this repo's info/exclude, so only a ferry-era file qualifies.
function isLegacyWaybill(file, toplevel) {
  try {
    const first = fs.readFileSync(file, 'utf-8').split('\n')[0];
    if (!first.startsWith('# Waybill — ') || STAMP_RE.test(first)) return false;
    if (gitOut(['ls-files', '--error-unmatch', 'waybill.md'], toplevel) !== null) return false;
    const rel = gitOut(['rev-parse', '--git-path', 'info/exclude'], toplevel);
    if (!rel) return false;
    return fs.readFileSync(path.resolve(toplevel, rel), 'utf-8').split('\n')
      .some((l) => /^\/?waybill\.md(\s+#.*)?$/.test(l.trim()));
  } catch {
    return false;
  }
}

function firstLineId(file) {
  try {
    const m = STAMP_RE.exec(fs.readFileSync(file, 'utf-8'));
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function clean(opts) {
  const repo = resolveRepo(opts.dir);
  return withLock(repo.key, () => {
    const rec = loadRecord(repo);
    const lines = [];
    let changed = false;
    for (const name of SLOTS) {
      const slot = rec.slots[name];
      if (!slot) continue;
      slot.artifacts = (slot.artifacts || []).filter((a) => {
        if (a.role !== 'waybill' || !a.owned) return true;
        if (!opts.yes) { lines.push(`owned ${a.path}`); return true; }
        const r = guardedDelete(a, slot.toplevel || repo.toplevel);
        if (r === 'kept-edited') { lines.push(`kept ${a.path} (edited)`); return true; }
        lines.push(`deleted ${a.path}`);
        return false;
      });
      if (opts.yes && name === 'waybill' && !slot.artifacts.some((a) => a.role === 'waybill')) delete rec.slots.waybill;
    }

    // Edited files set aside by earlier sweeps; --yes is explicit consent to remove them.
    const keptNow = [];
    for (const k of rec.kept) {
      if (!fs.existsSync(k.path)) { changed = true; continue; }
      if (opts.yes && k.id && firstLineId(k.path) === k.id) {
        try { fs.unlinkSync(k.path); } catch { keptNow.push(k); continue; }
        maybePrune(k.path, repo.toplevel);
        lines.push(`deleted ${k.path}`);
        changed = true;
        continue;
      }
      lines.push(`kept ${k.path} (edited)`);
      keptNow.push(k);
    }
    rec.kept = keptNow;
    if (opts.yes || changed) saveRecord(repo, rec);

    const legacy = path.join(repo.toplevel, 'waybill.md');
    if (isLegacyWaybill(legacy, repo.toplevel)) {
      if (opts.yes && opts.legacy) {
        fs.unlinkSync(legacy);
        pruneExclude(repo.toplevel, { untagged: true });
        lines.push(`deleted ${legacy}`);
      } else {
        lines.push(`legacy ${legacy}`);
      }
    }
    return lines;
  });
}

// ─── CLI helpers ───────────────────────────────────────────────────────

function parseFlags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq > 0) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}

module.exports = {
  resolveRepo, storeDir, defaultWaybillPath, stampWaybill, guardedDelete, cksum,
  peek, consume, end, arm, clear, clean, parseFlags, specArtifact, resolveSpecPath,
};
