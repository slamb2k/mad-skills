'use strict';

/**
 * Follow-ups Ledger.
 *
 * A committed `LOGBOOK.md` at the repo root is the single source of truth:
 * parse it on read, rewrite it on mutation, never keep a parallel store
 * (REQ-004). Pure markdown parse/serialize/dedupe/cap logic is IO-free and
 * drives every acceptance test; `read`/`write`/`capture`/`resolve`/… are the
 * thin IO wrappers. Every operation degrades to a no-op on any parse/IO error
 * (CON-002) — a malformed ledger must never block a session, skill, or hook.
 *
 * Sibling of hooks/lib/lifecycle.cjs: the engine computes what the project
 * needs next from objective state; the ledger remembers what you said you
 * wanted to do and reminds you at the right time.
 */

const { existsSync, writeFileSync, unlinkSync } = require('fs');
const { join } = require('path');
const { git, readText } = require('./utils.cjs');

// ─── constants ──────────────────────────────────────────────────────────

const FILENAME = 'LOGBOOK.md';
// Older names this ledger has used. The plugin runs user-level across many
// repos, so a rename must never orphan committed items: read() merges these in
// and write() consolidates them into LOGBOOK.md, migrating each project forward.
const LEGACY_FILENAMES = ['LOG.md', 'FOLLOWUPS.md'];
const CAP = 20;            // REQ-020: soft cap on open items
const ARCHIVE_MAX = 30;    // REQ-022: bounded archive
const DEDUPE_THRESHOLD = 0.6; // REQ-011: token-set Jaccard for "closely matches"
const STALE_DAYS = 60;     // REQ-031: free-text items older than this are review candidates

// Ledger categories, in fixed render order, with their markdown headings.
const CATEGORIES = ['ideas', 'fixes', 'questions', 'risks', 'debt'];
const HEADINGS = {
  ideas: 'Ideas',
  fixes: 'Deferred fixes',
  questions: 'Open questions',
  risks: 'Risks',
  debt: 'Tech debt',
};
const HEADING_TO_CAT = {};
for (const [cat, h] of Object.entries(HEADINGS)) HEADING_TO_CAT[h.toLowerCase()] = cat;

// Map the /build & /ship debrief categories onto ledger categories (REQ-010).
const DEBRIEF_MAP = {
  unresolved_risk: 'risks',
  deferred_fix: 'fixes',
  open_question: 'questions',
  assumption: 'questions',
  tech_debt: 'debt',
  idea: 'ideas',
  suggestion: 'ideas',
};

const PRIORITY_RANK = { low: 0, normal: 1, high: 2 };
// ponytail: priority markers are a leading `!` (high) or `~` (low); default
// normal. Round-trips by value, not by exact glyph count — `!!` parses high,
// re-serializes as `!`. Upgrade path: a full !/!!/!!! scale if anyone asks.

const STOPWORDS = new Set([
  'a', 'an', 'the', 'to', 'of', 'and', 'or', 'for', 'in', 'on', 'if', 'it',
  'is', 'be', 'this', 'that', 'with', 'across', 'ever', 'gets', 'get',
]);

const HEADER = `# Follow-ups

<!-- Managed by MAD Skills /logbook. Hand-edits are preserved; keep the
     \`- [ ]\` checkbox shape and category headings. -->
`;

// ─── small helpers ──────────────────────────────────────────────────────

function safe(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ledgerPath(projectDir) {
  return join(projectDir, FILENAME);
}

/** Title → token set: lowercase alphanumerics, stopwords dropped. */
function tokenize(title) {
  return new Set(
    String(title)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t && !STOPWORDS.has(t)),
  );
}

/** Jaccard similarity of two token sets (REQ-011 dedupe metric). */
function similarity(a, b) {
  const A = tokenize(a);
  const B = tokenize(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}

function priorityRank(item) {
  return PRIORITY_RANK[item.priority] ?? PRIORITY_RANK.normal;
}

/** Strip a leading priority marker, returning { title, priority }. */
function splitPriority(rawTitle) {
  const t = rawTitle.trim();
  if (t.startsWith('!')) return { title: t.replace(/^!+\s*/, ''), priority: 'high' };
  if (t.startsWith('~')) return { title: t.replace(/^~+\s*/, ''), priority: 'low' };
  return { title: t, priority: 'normal' };
}

function priorityMarker(priority) {
  if (priority === 'high') return '! ';
  if (priority === 'low') return '~ ';
  return '';
}

/** Normalize a category token (debrief or ledger) to a ledger category. */
function toCategory(cat) {
  if (!cat) return 'ideas';
  if (CATEGORIES.includes(cat)) return cat;
  return DEBRIEF_MAP[cat] || 'ideas';
}

// ─── parse (pure) ───────────────────────────────────────────────────────

/**
 * Parse LOGBOOK.md text into a flat item array (file order preserved).
 * Malformed item lines are skipped, never thrown on (CON-002). Items under
 * the Archive heading are treated as resolved/dismissed.
 */
function parse(text) {
  const items = [];
  if (!text) return items;
  let category = null;   // current open-section category, or null
  let inArchive = false;

  for (const line of text.split('\n')) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      const name = heading[1].toLowerCase();
      inArchive = name === 'archive';
      category = HEADING_TO_CAT[name] || null;
      continue;
    }

    const box = line.match(/^-\s+\[([ xX])\]\s+(.*)$/);
    if (!box) continue;
    if (!inArchive && !category) continue; // item outside any known section

    const item = safe(() => parseItemLine(box[1], box[2], category, inArchive), null);
    if (item) items.push(item);
  }
  return items;
}

/** Parse one checkbox line's body into an item (throws on malformed → skipped). */
function parseItemLine(checkChar, body, category, inArchive) {
  let rest = body;
  let link = null;
  let resolvedDate = null;

  // trailing HTML comment: <!-- link:<x> [resolved:<date>] --> or <!-- resolved:<date> -->
  const comment = rest.match(/\s*<!--\s*(.+?)\s*-->\s*$/);
  if (comment) {
    let payload = comment[1];
    const res = payload.match(/resolved:(\d{4}-\d{2}-\d{2})/);
    if (res) {
      resolvedDate = res[1];
      payload = payload.replace(/resolved:\d{4}-\d{2}-\d{2}/, '').trim();
    }
    payload = payload.replace(/^link:\s*/, '').trim();
    link = payload || null;
    rest = rest.slice(0, comment.index);
  }

  // trailing (YYYY-MM-DD)
  const dateM = rest.match(/\s*\((\d{4}-\d{2}-\d{2})\)\s*$/);
  if (!dateM) throw new Error('no date');
  const date = dateM[1];
  rest = rest.slice(0, dateM.index);

  // ` — source` (split on the last em-dash separator)
  const sep = rest.lastIndexOf(' — ');
  if (sep === -1) throw new Error('no source separator');
  const source = rest.slice(sep + 3).trim();
  const { title, priority } = splitPriority(rest.slice(0, sep));
  if (!title) throw new Error('empty title');

  const checked = checkChar.toLowerCase() === 'x';
  const status = inArchive || checked ? 'resolved' : 'open';
  return { title, category: category || 'ideas', source, date, status, link, priority, resolvedDate };
}

// ─── serialize (pure) ───────────────────────────────────────────────────

function serializeItem(item) {
  const mark = item.status === 'open' ? ' ' : 'x';
  let line = `- [${mark}] ${priorityMarker(item.priority)}${item.title} — ${item.source} (${item.date})`;
  const parts = [];
  if (item.link) parts.push(`link:${item.link}`);
  if (item.resolvedDate) parts.push(`resolved:${item.resolvedDate}`);
  if (parts.length) line += ` <!-- ${parts.join(' ')} -->`;
  return line;
}

/** Render the full LOGBOOK.md text from an item array. */
function serialize(items) {
  const out = [HEADER];
  for (const cat of CATEGORIES) {
    out.push(`## ${HEADINGS[cat]}`);
    for (const it of items) {
      if (it.status === 'open' && it.category === cat) out.push(serializeItem(it));
    }
    out.push('');
  }

  const archived = items
    .filter((it) => it.status !== 'open')
    .sort((a, b) => (b.resolvedDate || b.date).localeCompare(a.resolvedDate || a.date))
    .slice(0, ARCHIVE_MAX);
  out.push('## Archive');
  for (const it of archived) out.push(serializeItem(it));
  out.push('');

  return out.join('\n');
}

// ─── open-item ordering & dedupe (pure) ─────────────────────────────────

/** Open items in canonical display order: by category, then file order. */
function orderOpen(items) {
  const open = [];
  for (const cat of CATEGORIES) {
    for (const it of items) if (it.status === 'open' && it.category === cat) open.push(it);
  }
  return open;
}

/** Find an existing open item whose title closely matches (REQ-011). */
function findDuplicate(items, title) {
  let best = null;
  let bestScore = 0;
  for (const it of items) {
    if (it.status !== 'open') continue;
    const s = similarity(it.title, title);
    if (s > bestScore) { bestScore = s; best = it; }
  }
  return bestScore >= DEDUPE_THRESHOLD ? best : null;
}

/**
 * Evict oldest lowest-priority open items until open count ≤ cap (REQ-020).
 * Mutates items in place (evicted → dismissed). Returns evicted item list.
 */
function capEvict(items, cap, when) {
  const evicted = [];
  let open = items.filter((it) => it.status === 'open');
  while (open.length > cap) {
    // lowest priority first, then oldest date first
    const victim = open
      .slice()
      .sort((a, b) => priorityRank(a) - priorityRank(b) || a.date.localeCompare(b.date))[0];
    victim.status = 'dismissed';
    victim.resolvedDate = when;
    evicted.push(victim);
    open = items.filter((it) => it.status === 'open');
  }
  return evicted;
}

// ─── IO wrappers ────────────────────────────────────────────────────────

/** Conservative dedupe key for cross-file merge — exact normalized title. */
function normKey(title) {
  return String(title).toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Parse LOGBOOK.md, merging any legacy LOG.md / FOLLOWUPS.md so a rename never
 * orphans committed items (CON-002 safe). Legacy items are appended unless an
 * item with the same normalized title is already present. Returns
 * { items, path, legacy } where `legacy` lists the on-disk legacy files found.
 */
function read(projectDir) {
  const path = ledgerPath(projectDir);
  return safe(() => {
    const items = parse(readText(path));
    const seen = new Set(items.map((i) => normKey(i.title)));
    const legacy = [];
    for (const name of LEGACY_FILENAMES) {
      const p = join(projectDir, name);
      if (!existsSync(p)) continue;
      legacy.push(p);
      for (const it of parse(readText(p))) {
        const k = normKey(it.title);
        if (!seen.has(k)) { items.push(it); seen.add(k); }
      }
    }
    return { items, path, legacy };
  }, { items: [], path, legacy: [] });
}

function write(projectDir, items) {
  const path = ledgerPath(projectDir);
  writeFileSync(path, serialize(items));
  // Consolidation: the merged items now live in LOGBOOK.md, so retire any legacy
  // FOLLOWUPS.md / LOG.md. A visible git deletion, never a silent drop (GUD-002).
  for (const name of LEGACY_FILENAMES) {
    const p = join(projectDir, name);
    if (existsSync(p)) safe(() => unlinkSync(p));
  }
  return path;
}

function openItems(projectDir) {
  return safe(() => orderOpen(read(projectDir).items), []);
}

/** Cheap open-count for the cold-start hint (CON-003: single read + scan). */
function count(projectDir) {
  return safe(() => read(projectDir).items.filter((it) => it.status === 'open').length, 0);
}

/**
 * Auto-capture debrief items (REQ-010/011/020). Each incoming item:
 * { title, category, source, date?, link?, priority? }. Returns
 * { added, deduped, evicted } for logging (GUD-002).
 */
function capture(projectDir, incoming, opts = {}) {
  return safe(() => {
    const when = opts.today || today();
    const { items } = read(projectDir);
    let added = 0;
    const deduped = [];
    for (const raw of incoming) {
      const title = String(raw.title || '').trim();
      if (!title) continue;
      const dup = findDuplicate(items, title);
      if (dup) {
        dup.source = raw.source || dup.source;
        dup.date = raw.date || when;
        if (raw.link && !dup.link) dup.link = raw.link;
        deduped.push(dup.title);
        continue;
      }
      items.push({
        title,
        category: toCategory(raw.category),
        source: raw.source || 'debrief',
        date: raw.date || when,
        status: 'open',
        link: raw.link || null,
        priority: raw.priority || 'normal',
        resolvedDate: null,
      });
      added += 1;
    }
    const evicted = capEvict(items, opts.cap || CAP, when);
    write(projectDir, items);
    return { added, deduped, evicted: evicted.map((e) => e.title) };
  }, { added: 0, deduped: [], evicted: [] });
}

/** Resolve `selector` (1-based open index, or title substring). Returns item or null. */
function resolve(projectDir, selector, opts = {}) {
  return transition(projectDir, selector, 'resolved', opts);
}

/** Dismiss `selector` (not done, not wanted). Returns item or null. */
function dismiss(projectDir, selector, opts = {}) {
  return transition(projectDir, selector, 'dismissed', opts);
}

function transition(projectDir, selector, status, opts) {
  return safe(() => {
    const { items } = read(projectDir);
    const open = orderOpen(items);
    const target = pickSelector(open, selector);
    if (!target) return null;
    target.status = status;
    target.resolvedDate = opts.today || today();
    write(projectDir, items);
    return target;
  }, null);
}

function pickSelector(open, selector) {
  if (typeof selector === 'number' || /^\d+$/.test(selector)) {
    return open[Number(selector) - 1] || null;
  }
  const needle = String(selector).toLowerCase();
  return open.find((it) => it.title.toLowerCase().includes(needle)) || null;
}

/** Manually add an item (REQ-013). Returns { item, evicted } (GUD-002). */
function add(projectDir, { title, category = 'ideas', source = 'manual', link = null, priority = 'normal' }, opts = {}) {
  return safe(() => {
    const t = String(title || '').trim();
    if (!t) return { item: null, evicted: [] };
    const { items } = read(projectDir);
    const { title: clean, priority: parsedPri } = splitPriority(t);
    const item = {
      title: clean,
      category: toCategory(category),
      source,
      date: opts.today || today(),
      status: 'open',
      link,
      priority: priority !== 'normal' ? priority : parsedPri,
      resolvedDate: null,
    };
    items.push(item);
    const evicted = capEvict(items, opts.cap || CAP, opts.today || today());
    write(projectDir, items);
    return { item, evicted: evicted.map((e) => e.title) };
  }, { item: null, evicted: [] });
}

// ─── cleanup, track 1: deterministic linked auto-resolve (REQ-030) ──────

/**
 * Silently resolve open *linked* items whose link is satisfied. Checks what a
 * hook can see from disk/git; `task#` needs the harness, so callers may inject
 * `opts.taskDone(id) -> bool`. Returns the items that were resolved.
 */
function autoResolveLinked(projectDir, opts = {}) {
  return safe(() => {
    const when = opts.today || today();
    const { items } = read(projectDir);
    const resolved = [];
    for (const it of items) {
      if (it.status !== 'open' || !it.link) continue;
      if (linkSatisfied(projectDir, it.link, opts)) {
        it.status = 'resolved';
        it.resolvedDate = when;
        resolved.push(it);
      }
    }
    if (resolved.length) write(projectDir, items);
    return resolved;
  }, []);
}

function linkSatisfied(projectDir, link, opts) {
  const task = link.match(/^task#(\d+)$/);
  if (task) return opts.taskDone ? !!opts.taskDone(task[1]) : false;

  const spec = link.match(/^spec:(.+)$/);
  if (spec) return !existsSync(join(projectDir, spec[1])); // built/removed → gone

  const rec = link.match(/^rec:(.+)$/);
  // ponytail: resolves via the committed lifecycle marker `.mad/state/<id>.json`
  // — fires for rec ids that are skill names (rec:rig, rec:keel). A rec id with
  // no marker writer (e.g. rec:rig-refresh) simply stays open, which is the safe
  // failure (GUD-001: keep a possibly-done item rather than wrongly resolve it).
  if (rec) return existsSync(join(projectDir, '.mad', 'state', `${rec[1]}.json`));

  const pr = link.match(/^pr#(\d+)$/);
  if (pr) return prMerged(projectDir, pr[1]);

  const commit = link.match(/^commit:([0-9a-f]{7,40})$/);
  if (commit) return commitMerged(projectDir, commit[1]);

  return false;
}

function defaultBranch(projectDir) {
  const ref = git('symbolic-ref refs/remotes/origin/HEAD', projectDir);
  return (ref && ref.replace('refs/remotes/origin/', '')) || 'main';
}

function prMerged(projectDir, n) {
  const branch = defaultBranch(projectDir);
  // Anchor on the `(#N)` squash-merge convention so pr#8 doesn't match #80..#89.
  // Single-quote the grep: the parens are shell metacharacters otherwise.
  const log = git(`log origin/${branch} --fixed-strings --grep='(#${n})' -n1 --format=%H`, projectDir);
  return !!(log && log.trim());
}

function commitMerged(projectDir, sha) {
  const branch = defaultBranch(projectDir);
  return git(`merge-base --is-ancestor ${sha} origin/${branch}`, projectDir) !== null;
}

// ─── cleanup, track 2: assisted review candidates (REQ-031, no mutation) ─

/**
 * Free-text open items that look done or stale — a cheap signal for the
 * assisted-review flow. NEVER mutates (REQ-032/AC-006): the /log skill
 * adds Claude's judgment and the user confirms before anything is resolved.
 * Returns [{ item, reason }].
 */
function reviewCandidates(projectDir, opts = {}) {
  return safe(() => {
    const when = opts.today || today();
    const { items } = read(projectDir);
    const recent = recentSubjects(projectDir);
    const open = orderOpen(items);
    const out = [];
    open.forEach((it, i) => {
      if (it.link) return; // linked items are the deterministic track
      const n = i + 1; // 1-based, matches logbook-list / resolve <n>
      const match = recent.find((s) => similarity(s, it.title) >= DEDUPE_THRESHOLD);
      if (match) { out.push({ item: it, n, reason: `likely done — recent commit: "${match}"` }); return; }
      if (daysBetween(it.date, when) >= (opts.staleDays || STALE_DAYS)) {
        out.push({ item: it, n, reason: `stale — open since ${it.date}` });
      }
    });
    return out;
  }, []);
}

function recentSubjects(projectDir) {
  const log = git('log -n 50 --format=%s', projectDir);
  return log ? log.split('\n').filter(Boolean) : [];
}

function daysBetween(fromDate, toDate) {
  const a = Date.parse(`${fromDate}T00:00:00Z`);
  const b = Date.parse(`${toDate}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.floor((b - a) / 86400000);
}

// ─── exports ────────────────────────────────────────────────────────────

module.exports = {
  // IO surface
  read, write, openItems, count, capture, resolve, dismiss, add,
  autoResolveLinked, reviewCandidates,
  // pure core (round-trip test) + the heading map used by session-guard
  parse, serialize, HEADINGS,
};
