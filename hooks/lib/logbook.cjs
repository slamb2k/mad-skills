'use strict';

/**
 * Follow-ups Ledger.
 *
 * Two committed files at the repo root are the single source of truth:
 * `LOGBOOK.md` (hot — bounded, read on every fast path) and
 * `LOGBOOK-ARCHIVE.md` (archive — uncapped, read only on demand). Internally
 * both are merged into one flat item array, each item tagged with
 * `location: 'hot' | 'archive'`. `read()` merges the two files (plus legacy
 * files); `write()` is the sole choke point that re-splits items by
 * `location`, enforces the archive-window overflow invariant, and writes
 * both files. Pure markdown parse/serialize/dedupe/relocate logic is IO-free
 * and drives every acceptance test; `read`/`write`/`capture`/`resolve`/…
 * are the thin IO wrappers. Every operation degrades to a no-op on any
 * parse/IO error (CON-002) — a malformed ledger must never block a session,
 * skill, or hook.
 *
 * Overflow is *relocation*, never eviction: an item that breaches the hot
 * file's open-item cap moves to the archive file with its `status` and
 * `relocatedDate` set — it is never marked `resolved`/`dismissed` just to
 * free up space (REQ-001/002).
 *
 * Sibling of hooks/lib/lifecycle.cjs: the engine computes what the project
 * needs next from objective state; the ledger remembers what you said you
 * wanted to do and reminds you at the right time.
 */

const { existsSync, writeFileSync, unlinkSync } = require('fs');
const { join } = require('path');
const { git, gitArgs, readText } = require('./utils.cjs');

// ─── constants ──────────────────────────────────────────────────────────

const FILENAME = 'LOGBOOK.md';
const ARCHIVE_FILENAME = 'LOGBOOK-ARCHIVE.md';
// Older names this ledger has used. The plugin runs user-level across many
// repos, so a rename must never orphan committed items: read() merges these in
// and write() consolidates them into LOGBOOK.md, migrating each project forward.
const LEGACY_FILENAMES = ['LOG.md', 'FOLLOWUPS.md'];
const CAP = 20;            // REQ-020/CON-003: soft cap on hot-file open items
const ARCHIVE_MAX = 30;    // Recent-history window kept in the hot file's own
                            // Archive section; excess relocates (never truncates).
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

const ARCHIVE_HEADER = `# Follow-ups Archive

<!-- Managed by MAD Skills /logbook. This file receives overflow relocated
     from LOGBOOK.md — nothing is ever deleted. Still-open items keep their
     \`- [ ]\` checkbox and a \`relocated:<date>\` marker (see \`/logbook
     archive\` and \`/logbook restore\`); resolved/dismissed history moves
     here once the hot file's recent-history window fills up. Hand-edits are
     preserved; keep the checkbox shape and category headings. -->
`;

// ─── small helpers ──────────────────────────────────────────────────────

function safe(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function ledgerPath(projectDir) {
  // The ledger is repo-scoped, not cwd-scoped — resolve to the git root so a
  // hook invoked from a subdirectory (or with CLAUDE_PROJECT_DIR unset)
  // never orphans a nested LOGBOOK.md instead of updating the real one.
  const gitRoot = git('rev-parse --show-toplevel', projectDir);
  return join(gitRoot || projectDir, FILENAME);
}

/** Sibling of ledgerPath() for the uncapped archive file. */
function archiveLedgerPath(projectDir) {
  const gitRoot = git('rev-parse --show-toplevel', projectDir);
  return join(gitRoot || projectDir, ARCHIVE_FILENAME);
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

/** Effective history date for sorting/windowing resolved+dismissed items. */
function historyOrDate(it) {
  return it.resolvedDate || it.dismissedDate || it.date;
}

// ─── parse (pure) ───────────────────────────────────────────────────────

/**
 * Parse ledger markdown text into a flat item array (file order preserved).
 * Malformed item lines are skipped, never thrown on (CON-002). Items under
 * the Archive heading are treated as resolved/dismissed (legacy fallback).
 * Used unchanged for both LOGBOOK.md and LOGBOOK-ARCHIVE.md — read() tags
 * the resulting items with `location` afterwards.
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
  let dismissedDate = null;
  let relocatedDate = null;

  // trailing HTML comment: <!-- link:<x> [resolved:<date>|dismissed:<date>|relocated:<date>] -->
  const comment = rest.match(/\s*<!--\s*(.+?)\s*-->\s*$/);
  if (comment) {
    let payload = comment[1];
    const res = payload.match(/resolved:(\d{4}-\d{2}-\d{2})/);
    if (res) {
      resolvedDate = res[1];
      payload = payload.replace(/resolved:\d{4}-\d{2}-\d{2}/, '').trim();
    }
    const dis = payload.match(/dismissed:(\d{4}-\d{2}-\d{2})/);
    if (dis) {
      dismissedDate = dis[1];
      payload = payload.replace(/dismissed:\d{4}-\d{2}-\d{2}/, '').trim();
    }
    const rel = payload.match(/relocated:(\d{4}-\d{2}-\d{2})/);
    if (rel) {
      relocatedDate = rel[1];
      payload = payload.replace(/relocated:\d{4}-\d{2}-\d{2}/, '').trim();
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
  // Status priority: an explicit dismissed/resolved marker always wins. Absent
  // both, fall back to the legacy pre-spec rule (checked or in the Archive
  // section ⇒ resolved) so old data — which only ever wrote a bare `resolved:`
  // marker regardless of true status — still round-trips without throwing
  // (AC-003). This fallback is intentional, not a bug: new writes always carry
  // an explicit marker, so it only ever fires on historical data.
  let status;
  if (dismissedDate) status = 'dismissed';
  else if (resolvedDate) status = 'resolved';
  else status = checked || inArchive ? 'resolved' : 'open';

  return {
    title, category: category || 'ideas', source, date, status, link, priority,
    resolvedDate, dismissedDate, relocatedDate,
  };
}

// ─── serialize (pure) ───────────────────────────────────────────────────

function serializeItem(item) {
  const mark = item.status === 'open' ? ' ' : 'x';
  let line = `- [${mark}] ${priorityMarker(item.priority)}${item.title} — ${item.source} (${item.date})`;
  const parts = [];
  if (item.link) parts.push(`link:${item.link}`);
  // Exactly one date-marker part, chosen by status priority (REQ-005): a
  // dismissed/resolved item never also carries a relocated: stamp, and a
  // plain still-open item carries no date marker at all.
  if (item.status === 'dismissed') {
    parts.push(`dismissed:${item.dismissedDate || item.date}`);
  } else if (item.status === 'resolved') {
    parts.push(`resolved:${item.resolvedDate || item.date}`);
  } else if (item.relocatedDate) {
    parts.push(`relocated:${item.relocatedDate}`);
  }
  if (parts.length) line += ` <!-- ${parts.join(' ')} -->`;
  return line;
}

/**
 * Render full ledger text from an item array. Used for both LOGBOOK.md
 * (default HEADER) and LOGBOOK-ARCHIVE.md (pass ARCHIVE_HEADER) — same
 * category-heading + Archive-section shape for both files. Renders every
 * non-open item passed to it; the ARCHIVE_MAX invariant is enforced by
 * relocation before this is called (write()), not by truncation here.
 */
function serialize(items, header = HEADER) {
  const out = [header];
  for (const cat of CATEGORIES) {
    out.push(`## ${HEADINGS[cat]}`);
    for (const it of items) {
      if (it.status === 'open' && it.category === cat) out.push(serializeItem(it));
    }
    out.push('');
  }

  const archived = items
    .filter((it) => it.status !== 'open')
    .sort((a, b) => historyOrDate(b).localeCompare(historyOrDate(a)));
  out.push('## Archive');
  for (const it of archived) out.push(serializeItem(it));
  out.push('');

  return out.join('\n');
}

// ─── open-item ordering & dedupe (pure) ─────────────────────────────────

/** Hot-file open items in canonical display order: by category, then file order. */
function orderOpen(items) {
  const open = [];
  for (const cat of CATEGORIES) {
    for (const it of items) {
      if (it.status === 'open' && it.category === cat && it.location === 'hot') open.push(it);
    }
  }
  return open;
}

/** Archive-resident still-open (relocated) items, most-recently-relocated first. */
function orderArchiveOpen(items) {
  return items
    .filter((it) => it.location === 'archive' && it.status === 'open')
    .slice()
    .sort((a, b) => (b.relocatedDate || b.date).localeCompare(a.relocatedDate || a.date));
}

/** Find an existing open item (any location) whose title closely matches (REQ-011/009). */
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

// ─── overflow selection (pure, never mutates unless named relocate*) ────

function priorityDateSort(a, b) {
  return priorityRank(a) - priorityRank(b) || a.date.localeCompare(b.date);
}

/**
 * Which HOT open items would relocate to bring the hot-file open count down
 * to `cap` (lowest priority first, then oldest date — GUD-001, same rule as
 * the legacy capEvict() victim selection). Pure — never mutates.
 */
function selectRelocationCandidates(items, cap) {
  const hotOpen = items.filter((it) => it.status === 'open' && it.location === 'hot');
  const excess = hotOpen.length - cap;
  if (excess <= 0) return [];
  return hotOpen.slice().sort(priorityDateSort).slice(0, excess);
}

/**
 * Relocate hot-file open overflow to the archive (REQ-002). Mutates items in
 * place: flips `location` to 'archive' and sets `relocatedDate`. `status` is
 * NEVER touched — this is what makes it relocation, not eviction (REQ-001).
 */
function relocateOverflow(items, cap, when) {
  const victims = selectRelocationCandidates(items, cap);
  for (const v of victims) { v.location = 'archive'; v.relocatedDate = when; }
  return victims;
}

/** Which hot-file resolved/dismissed items exceed archiveMax, oldest first. Pure. */
function selectArchiveOverflow(items, archiveMax) {
  const hotHistory = items.filter((it) => it.status !== 'open' && it.location === 'hot');
  if (hotHistory.length <= archiveMax) return [];
  const ordered = hotHistory.slice().sort((a, b) => historyOrDate(b).localeCompare(historyOrDate(a)));
  return ordered.slice(archiveMax);
}

/**
 * Relocate hot-file archive-window overflow to the archive file (REQ-003).
 * Mutates: flips `location` only — status/resolvedDate/dismissedDate are
 * untouched, since these items are already genuinely resolved/dismissed.
 */
function relocateArchiveOverflow(items, archiveMax) {
  const excess = selectArchiveOverflow(items, archiveMax);
  for (const it of excess) it.location = 'archive';
  return excess;
}

function toRelocationSummary(list) {
  return list.map((it) => ({ title: it.title, category: it.category, source: it.source, date: it.date }));
}

// ─── IO wrappers ────────────────────────────────────────────────────────

/** Conservative dedupe key for cross-file merge — exact normalized title. */
function normKey(title) {
  return String(title).toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Parse LOGBOOK.md + LOGBOOK-ARCHIVE.md into one merged, location-tagged item
 * array (REQ-009), also merging any legacy LOG.md / FOLLOWUPS.md so a rename
 * never orphans committed items (CON-002 safe). Legacy and archive items are
 * appended unless an item with the same normalized title is already present
 * — hot wins on title collision. Returns { items, path, archivePath, legacy }
 * where `legacy` lists the on-disk legacy files found.
 */
function read(projectDir) {
  const path = ledgerPath(projectDir);
  const archivePath = archiveLedgerPath(projectDir);
  return safe(() => {
    const items = parse(readText(path));
    for (const it of items) it.location = 'hot';
    const seen = new Set(items.map((i) => normKey(i.title)));

    const legacy = [];
    for (const name of LEGACY_FILENAMES) {
      const p = join(projectDir, name);
      if (!existsSync(p)) continue;
      legacy.push(p);
      for (const it of parse(readText(p))) {
        const k = normKey(it.title);
        if (!seen.has(k)) { it.location = 'hot'; items.push(it); seen.add(k); }
      }
    }

    for (const it of parse(readText(archivePath))) {
      const k = normKey(it.title);
      if (!seen.has(k)) { it.location = 'archive'; items.push(it); seen.add(k); }
    }

    return { items, path, archivePath, legacy };
  }, { items: [], path, archivePath, legacy: [] });
}

/**
 * Write both ledger files. The sole choke point that re-splits the merged
 * item array by `location` and enforces the ARCHIVE_MAX invariant (via
 * relocation, not truncation) before serializing. Every mutator (capture,
 * add, transition, restore) routes through this, so the invariant holds
 * regardless of which one triggered the write.
 */
function write(projectDir, items) {
  const path = ledgerPath(projectDir);
  const archivePath = archiveLedgerPath(projectDir);
  relocateArchiveOverflow(items, ARCHIVE_MAX);
  const hot = items.filter((it) => it.location !== 'archive');
  const archive = items.filter((it) => it.location === 'archive');
  writeFileSync(path, serialize(hot));
  if (archive.length || existsSync(archivePath)) {
    writeFileSync(archivePath, serialize(archive, ARCHIVE_HEADER));
  }
  // Consolidation: the merged items now live in LOGBOOK.md / LOGBOOK-ARCHIVE.md,
  // so retire any legacy FOLLOWUPS.md / LOG.md. A visible git deletion, never a
  // silent drop (GUD-002).
  for (const name of LEGACY_FILENAMES) {
    const p = join(projectDir, name);
    if (existsSync(p)) safe(() => unlinkSync(p));
  }
  return path;
}

function openItems(projectDir) {
  return safe(() => orderOpen(read(projectDir).items), []);
}

/** Cheap hot-file open-count for the cold-start hint (CON-003: single read + scan). */
function count(projectDir) {
  return safe(() => read(projectDir).items.filter((it) => it.status === 'open' && it.location === 'hot').length, 0);
}

/**
 * Dedupe-or-push incoming items against the merged item set (mutates
 * `items` in place). Shared by capture() and previewCapture() so the
 * breach-time preview always picks the same relocation victims the real
 * capture would (REQ-008).
 */
function applyIncoming(items, incoming, when) {
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
      dismissedDate: null,
      relocatedDate: null,
      location: 'hot',
    });
    added += 1;
  }
  return { added, deduped };
}

/**
 * Auto-capture debrief items (REQ-010/011/020 legacy; REQ-002/009 here).
 * Each incoming item: { title, category, source, date?, link?, priority? }.
 * Returns { added, deduped, relocationCandidates } for logging (GUD-002).
 */
function capture(projectDir, incoming, opts = {}) {
  return safe(() => {
    const when = opts.today || today();
    const { items } = read(projectDir);
    const { added, deduped } = applyIncoming(items, incoming, when);
    const relocated = relocateOverflow(items, opts.cap || CAP, when);
    write(projectDir, items);
    return { added, deduped, relocationCandidates: toRelocationSummary(relocated) };
  }, { added: 0, deduped: [], relocationCandidates: [] });
}

/**
 * Non-mutating preview of what capture() would do (REQ-006/008): same
 * added/deduped/relocation-candidate computation against a fresh read, but
 * write() is never called. Used by the breach-time triage prompt so the
 * user sees exactly what the real capture would relocate.
 */
function previewCapture(projectDir, incoming, opts = {}) {
  return safe(() => {
    const when = opts.today || today();
    const { items } = read(projectDir); // fresh local array — never written
    const { added, deduped } = applyIncoming(items, incoming, when);
    const candidates = selectRelocationCandidates(items, opts.cap || CAP);
    return { added, deduped, relocationCandidates: toRelocationSummary(candidates) };
  }, { added: 0, deduped: [], relocationCandidates: [] });
}

/** Resolve `selector` (1-based open index, `a`-prefixed archive index, or title substring). */
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
    const target = pickSelector(items, selector);
    if (!target) return null;
    target.status = status;
    const when = opts.today || today();
    if (status === 'resolved') target.resolvedDate = when;
    else if (status === 'dismissed') target.dismissedDate = when;
    target.relocatedDate = null; // genuinely resolved/dismissed — no longer "open-but-relocated"
    write(projectDir, items);
    return target;
  }, null);
}

/**
 * Resolve a selector against the full merged item array (REQ-012): a plain
 * number indexes orderOpen() (hot file); an `a`-prefixed number indexes
 * orderArchiveOpen() (relocated-open archive items); otherwise a title
 * substring match against the hot open list (legacy behavior, unchanged).
 */
function pickSelector(items, selector) {
  const s = String(selector).trim();
  const aMatch = s.match(/^a(\d+)$/i);
  if (aMatch) return orderArchiveOpen(items)[Number(aMatch[1]) - 1] || null;
  const open = orderOpen(items);
  if (/^\d+$/.test(s)) return open[Number(s) - 1] || null;
  const needle = s.toLowerCase();
  return open.find((it) => it.title.toLowerCase().includes(needle)) || null;
}

/** Manually add an item (REQ-013). Returns { item, relocationCandidates } (GUD-002). */
function add(projectDir, { title, category = 'ideas', source = 'manual', link = null, priority = 'normal' }, opts = {}) {
  return safe(() => {
    const t = String(title || '').trim();
    if (!t) return { item: null, relocationCandidates: [] };
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
      dismissedDate: null,
      relocatedDate: null,
      location: 'hot',
    };
    items.push(item);
    const relocated = relocateOverflow(items, opts.cap || CAP, opts.today || today());
    write(projectDir, items);
    return { item, relocationCandidates: toRelocationSummary(relocated) };
  }, { item: null, relocationCandidates: [] });
}

/**
 * Move an archive-resident, still-open item back to the hot file (REQ-013).
 * Keeps `status: 'open'`, clears `relocatedDate`. If this pushes the hot
 * file back over cap, relocation fires immediately on whatever is now the
 * lowest-priority/oldest hot item — self-balancing, no dedicated queue.
 */
function restore(projectDir, selector, opts = {}) {
  return safe(() => {
    const { items } = read(projectDir);
    const target = pickSelector(items, selector);
    if (!target || target.location !== 'archive' || target.status !== 'open') {
      return { restored: null, relocationCandidates: [] };
    }
    target.location = 'hot';
    target.relocatedDate = null;
    const relocated = relocateOverflow(items, opts.cap || CAP, opts.today || today());
    write(projectDir, items);
    return { restored: target, relocationCandidates: toRelocationSummary(relocated) };
  }, { restored: null, relocationCandidates: [] });
}

/** Archive-resident history: resolved/dismissed items, most recent first. */
function archiveHistory(items) {
  return items
    .filter((it) => it.location === 'archive' && it.status !== 'open')
    .slice()
    .sort((a, b) => historyOrDate(b).localeCompare(historyOrDate(a)));
}

/** `/logbook archive` view (REQ-014): relocated-open items + historical context. */
function archiveView(projectDir) {
  return safe(() => {
    const { items } = read(projectDir);
    return { relocated: orderArchiveOpen(items), history: archiveHistory(items) };
  }, { relocated: [], history: [] });
}

// ─── cleanup, track 1: deterministic linked auto-resolve (REQ-030/010) ──

/**
 * Silently resolve open *linked* items whose link is satisfied — across the
 * merged hot+archive item set (REQ-009/010), so a relocated item resolves
 * regardless of which file it currently lives in. Checks what a hook can see
 * from disk/git; `task#` needs the harness, so callers may inject
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
        it.relocatedDate = null; // no longer "open-but-relocated" once genuinely resolved
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
  if (spec) {
    const p = spec[1];
    if (existsSync(join(projectDir, p))) return false; // still on disk — not built/removed
    // Gone from disk: only resolve if it *once existed* (is in git history), so a
    // link to a path that never existed (a typo) doesn't auto-resolve on sight.
    // argv form (no shell) — `p` comes from a hand-editable ledger link.
    const tracked = gitArgs(['log', '-1', '--format=%H', '--', p], projectDir);
    return !!(tracked && tracked.trim());
  }

  const rec = link.match(/^rec:(.+)$/);
  if (rec) {
    return safe(() => {
      const lc = require('./lifecycle.cjs');
      if (!(lc.REGISTRY || []).some((r) => r.id === rec[1])) return false; // unknown id → keep open
      // A committed marker (skill-named recs like rec:rig / rec:keel) is a
      // definite yes. Otherwise the rec is done when the engine no longer lists
      // it as applicable — this covers drift recs like rec:rig-refresh whose id
      // isn't a marker filename (their satisfied() is always true).
      if (existsSync(join(projectDir, '.mad', 'state', `${rec[1]}.json`))) return true;
      // recApplicable ignores mute/dismiss (a muted rec must not read as "done")
      // but keeps real markers so drift recs like rig-refresh resolve correctly.
      return !lc.recApplicable(projectDir, rec[1]);
    }, false);
  }

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

// ─── cleanup, track 2: assisted review candidates (REQ-031/011, no mutation) ─

/**
 * Free-text open items that look done or stale — a cheap signal for the
 * assisted-review flow. NEVER mutates (REQ-032/AC-006): the /log skill
 * adds Claude's judgment and the user confirms before anything is resolved.
 * Runs over both the hot open list and the archive-resident relocated-open
 * list (REQ-011), in that order, using the same STALE_DAYS threshold for
 * both (§7 — deliberately uniform). Returns [{ item, selector, reason }],
 * where `selector` is a plain numeric string for hot candidates ("2") and
 * an `a`-prefixed string for archive candidates ("a1").
 */
function reviewCandidates(projectDir, opts = {}) {
  return safe(() => {
    const when = opts.today || today();
    const { items } = read(projectDir);
    const recent = recentSubjects(projectDir);
    const out = [];

    const scan = (list, selectorFor, suffix) => {
      list.forEach((it, i) => {
        if (it.link) return; // linked items are the deterministic track
        const selector = selectorFor(i);
        const match = recent.find((s) => similarity(s, it.title) >= DEDUPE_THRESHOLD);
        if (match) {
          out.push({ item: it, selector, reason: `likely done${suffix} — recent commit: "${match}"` });
          return;
        }
        if (daysBetween(it.date, when) >= (opts.staleDays || STALE_DAYS)) {
          out.push({ item: it, selector, reason: `stale${suffix} — open since ${it.date}` });
        }
      });
    };

    scan(orderOpen(items), (i) => String(i + 1), '');
    scan(orderArchiveOpen(items), (i) => `a${i + 1}`, ' (relocated)');

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
  read, write, openItems, count, capture, previewCapture, resolve, dismiss, add,
  restore, archiveView, autoResolveLinked, reviewCandidates,
  // pure core (round-trip test) + the heading map used by session-guard
  parse, serialize, HEADINGS,
};
