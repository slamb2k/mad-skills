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

function defaultWaybillPath(repo) {
  const name = repo.toplevel === repo.repoRoot ? 'waybill.md' : `${md5(repo.toplevel).slice(0, 8)}-waybill.md`;
  return path.join(storeDir(), repo.key, name);
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
    if (rec && typeof rec === 'object' && rec.slots) return rec;
  } catch { /* missing or corrupt */ }
  return { version: 1, repoRoot: repo.repoRoot, slots: {} };
}

function saveRecord(repo, rec) {
  if (!Object.keys(rec.slots).length) {
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

function pruneExclude(toplevel, { untagged = false } = {}) {
  try {
    if (fs.existsSync(path.join(toplevel, 'waybill.md'))) return;
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
  if (toplevel) pruneExclude(toplevel, opts);
  return 'deleted';
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

function newSlot(source, toplevel, resume, artifacts, createdAt) {
  return {
    source, toplevel, resume: resume || null, artifacts,
    createdAt: createdAt || Date.now(), injectedAt: null, sessionsSinceInjected: 0,
  };
}

function migrateLegacy(cwd, repo, rec) {
  const stateDir = path.join(os.homedir(), '.claude', 'session-guard');
  const dirs = [...new Set([cwd, repo.toplevel, repo.repoRoot].filter(Boolean))];
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

  const signalDir = path.join(os.tmpdir(), 'claude-ferry');
  for (const d of dirs) {
    const file = path.join(signalDir, `${cksum(d)}.signal`);
    let target;
    try { target = fs.readFileSync(file, 'utf-8').split('\n')[0].trim(); } catch { continue; }
    try { fs.unlinkSync(file); } catch { /* noop */ }
    if (rec.slots.waybill || !target || !fs.existsSync(target)) continue;
    rec.slots.waybill = newSlot('ferry', real(d), null, [
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

function slotUsable(slot, repo) {
  for (const a of slot.artifacts || []) {
    if (a.role === 'spec') {
      if (!findSpec(a.path, [repo.repoRoot, repo.toplevel])) return false;
    } else if (!fs.existsSync(a.path)) {
      return false;
    }
  }
  return true;
}

function dropSlot(rec, name, repo) {
  const slot = rec.slots[name];
  if (!slot) return [];
  const notices = [];
  for (const a of slot.artifacts || []) {
    if (guardedDelete(a, slot.toplevel || repo.toplevel) === 'kept-edited') {
      notices.push(`[HANDOFF] waybill ${a.path} was edited — kept`);
    }
  }
  delete rec.slots[name];
  return notices;
}

function peek(dir) {
  const repo = resolveRepo(dir);
  const rec = loadRecord(repo);
  const out = { repo, build: null, waybill: null };
  for (const name of SLOTS) {
    const slot = rec.slots[name];
    if (slot && slotUsable(slot, repo)) out[name] = slot;
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

function consume(cwd) {
  const repo = resolveRepo(cwd);
  const rec = loadRecord(repo);
  let dirty = migrateLegacy(real(cwd), repo, rec);
  const notices = [];
  const expiry = ((config.handoff || {}).expiryDays || 14) * DAY_MS;

  for (const name of SLOTS) {
    const slot = rec.slots[name];
    if (!slot) continue;
    if (Date.now() - slot.createdAt > expiry || !slotUsable(slot, repo)) {
      dropSlot(rec, name, repo);
      dirty = true;
    }
  }

  const blocks = { waybill: null, build: null };

  const way = rec.slots.waybill;
  if (way && way.toplevel === repo.toplevel) {
    if (!way.injectedAt) {
      blocks.waybill = renderWaybill(way);
      way.injectedAt = Date.now();
    } else {
      notices.push(...dropSlot(rec, 'waybill', repo));
    }
    dirty = true;
  }

  const build = rec.slots.build;
  if (build) {
    if (!build.injectedAt) {
      blocks.build = renderBuild(build, repo, true);
      build.injectedAt = Date.now();
    } else {
      build.sessionsSinceInjected = (build.sessionsSinceInjected || 0) + 1;
      build.artifacts = (build.artifacts || []).filter((a) => {
        if (a.role !== 'waybill' || !a.owned) return true;
        const r = guardedDelete(a, build.toplevel || repo.toplevel);
        if (r === 'kept-edited') notices.push(`[HANDOFF] waybill ${a.path} was edited — kept`);
        return false;
      });
      blocks.build = renderBuild(build, repo, false);
    }
    dirty = true;
  }

  if (dirty) saveRecord(repo, rec);
  return [blocks.waybill, blocks.build, ...notices].filter(Boolean).join('\n\n');
}

// ─── arm / clear / clean ───────────────────────────────────────────────

function arm(opts) {
  const kind = opts.kind;
  if (!SLOTS.includes(kind)) throw new Error('--kind must be build or waybill');
  const repo = resolveRepo(opts.dir);
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

  if (opts.waybill) {
    const file = path.resolve(bases[0], opts.waybill);
    if (owned && !fs.existsSync(file)) throw new Error(`waybill not found: ${file}`);
    waybillArt = { role: 'waybill', path: file, owned };
    if (owned) Object.assign(waybillArt, stampWaybill(file));
    artifacts.push(waybillArt);
  }

  const rec = loadRecord(repo);
  const old = rec.slots[kind];
  if (old) {
    for (const a of old.artifacts || []) {
      if (a.role === 'waybill' && a.owned && (!waybillArt || waybillArt.path !== a.path)) {
        guardedDelete(a, old.toplevel || repo.toplevel);
      }
    }
  }
  rec.slots[kind] = newSlot(source, repo.toplevel, resume, artifacts);
  saveRecord(repo, rec);
  return { repo, waybill: waybillArt };
}

function clear(opts) {
  const kind = opts.kind;
  if (![...SLOTS, 'all'].includes(kind)) throw new Error('--kind must be build, waybill or all');
  const repo = resolveRepo(opts.dir);
  const rec = loadRecord(repo);
  for (const name of kind === 'all' ? SLOTS : [kind]) dropSlot(rec, name, repo);
  saveRecord(repo, rec);
}

function isLegacyWaybill(file) {
  try {
    const first = fs.readFileSync(file, 'utf-8').split('\n')[0];
    return first.startsWith('# Waybill — ') && !STAMP_RE.test(first);
  } catch {
    return false;
  }
}

function clean(opts) {
  const repo = resolveRepo(opts.dir);
  const rec = loadRecord(repo);
  const lines = [];
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
    if (name === 'waybill' && !slot.artifacts.some((a) => a.role === 'waybill')) delete rec.slots.waybill;
  }
  if (opts.yes) saveRecord(repo, rec);

  const legacy = path.join(repo.toplevel, 'waybill.md');
  if (isLegacyWaybill(legacy)) {
    if (opts.yes && opts.legacy) {
      fs.unlinkSync(legacy);
      pruneExclude(repo.toplevel, { untagged: true });
      lines.push(`deleted ${legacy}`);
    } else {
      lines.push(`legacy ${legacy}`);
    }
  }
  return lines;
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
  peek, consume, arm, clear, clean, parseFlags, specArtifact, resolveSpecPath,
};
