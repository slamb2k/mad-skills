---
title: Logbook Overflow — Relocate Instead of Evict, With Breach-Time Triage
version: 1.0
date_created: 2026-07-22
last_updated: 2026-07-22
tags: [tool, process, data]
autonomy_ready: true
content_hash: sha256:0fe199383d88c9f9b13264d5a03c83a900eccc3fea5bbc46665c7102f037b765
branch: docs/logbook-archive-and-triage
worktree_path: /home/slamb2k/work/mad-skills/.claude/worktrees/logbook-archive-triage
---

# Introduction

The Follow-ups Ledger (`LOGBOOK.md`) auto-captures deferred fixes, ideas,
risks, and open questions at `/build` and `/ship` debrief so they survive
`/clear` — a real fix for the "note it and forget it" evaporation problem.
But that auto-capture created a new failure mode: once open items exceed a
soft cap, the ledger silently marks the lowest-priority/oldest items as
`dismissed` and renders them identically to genuinely resolved work
(`- [x] ... <!-- resolved:<date> -->`). One `/build` debrief capturing 11
items at once aged out 9 real, unresolved entries this way, and they were
indistinguishable from completed work in the rendered file. Separately, the
Archive section itself is capped at 30 entries and silently truncates
(deletes) anything older on the next write — a second, independent loss
mechanism affecting genuinely resolved items too.

This specification replaces both loss mechanisms with relocation: nothing is
ever deleted from the ledger's working set again. Overflow moves to a
second, uncapped file instead of vanishing, and — since a relocated item
nobody ever revisits is functionally equivalent to deletion — the point of
overflow itself becomes a triage opportunity, asked once, at the moment it's
nearly free to ask (the same interactive debrief that's already capturing
items), rather than a passive archive nobody remembers to check.

## 1. Purpose & Scope

**Purpose:** guarantee that no unresolved follow-up item is ever silently
lost, while keeping the primary ledger (`LOGBOOK.md`) small and fast, and
ensuring relocated items remain genuinely addressable rather than
permanently parked.

**Audience:** implementers of `hooks/lib/logbook.cjs`, `hooks/session-guard.cjs`'s
`logbook-*` subcommands, and the `skills/logbook`, `skills/build`,
`skills/ship` SKILL.md instructions that call them.

**In scope:**
- Honest status rendering: `resolved` (done), `dismissed` (user declined),
  and the new `relocated` (aged out, still unresolved) must never render
  identically.
- A second, uncapped, git-tracked file (`LOGBOOK-ARCHIVE.md`) that overflow
  moves to instead of being deleted or truncated.
- An interactive breach-time triage prompt in `/build` and `/ship` debriefs,
  offered only when a capture would push the hot file over its open-item
  cap, giving the user a near-free chance to resolve/dismiss items for real
  before they relocate.
- Extending the existing deterministic auto-resolve (`autoResolveLinked`)
  and assisted review (`reviewCandidates`) tracks to also cover relocated
  items in the archive file.
- A way to bring a relocated item back into the hot file (`restore`).

**Out of scope (see §9 Non-Goals):** an always-visible "needs attention"
section in `/logbook`'s primary output; a dedicated `promote`/self-balancing
queue command; migrating or reinterpreting historical `LOGBOOK.md` entries
that were mislabeled by the old `capEvict()` behavior before this ships;
pagination, summarization, or any cap on the archive file itself; changing
the open-item cap value (stays 20); any change to `--auto` mode's
non-interactive behavior beyond "relocate silently, same safety net as
today."

## 2. Definitions

| Term | Definition |
|---|---|
| **Hot file** | `LOGBOOK.md` — the bounded, fast-loading file read on every `/logbook` call, session-guard's ambient cold-start hint, and by `/build`/`/ship`. |
| **Archive file** | `LOGBOOK-ARCHIVE.md` — a new, uncapped, git-tracked sibling file. Read only on demand (`/logbook archive`, `/logbook review`), never on the hot path. |
| **Relocation** | Moving an item from the hot file to the archive file (or vice versa, via `restore`) without changing whether it has been resolved. An item that was `open` before relocation stays `open` after — it is not marked done or declined. |
| **Eviction (legacy term)** | The current behavior this spec replaces: `capEvict()` sets an unresolved item's status to `dismissed` to free up cap space. Removed entirely by this spec. |
| **Breach** | The moment a capture or manual `add` would push the hot file's open-item count above `CAP` (20, unchanged). |
| **Breach-time triage prompt** | An `AskUserQuestion` step, run only in interactive (`--auto`-free) `/build`/`/ship` debriefs, only when a breach's relocation candidates are non-empty, offering the user a chance to resolve/dismiss those candidates for real before the capture proceeds. |
| **Relocation candidate** | An open hot-file item selected by the same victim-selection rule as today's `capEvict()` (lowest priority first, then oldest `date` first) that would relocate if the pending capture is applied unmodified. |
| **CAP** | 20 — unchanged. The open-item soft cap on the hot file. |
| **ARCHIVE_MAX** | The existing constant (30) is repurposed: it still bounds how many *recently resolved/dismissed* entries stay visible in the hot file's own Archive section for at-a-glance history, but no longer bounds total retention — anything older relocates to the archive file instead of being deleted. |

## 3. Requirements, Constraints & Guidelines

- **REQ-001 — No silent status falsification.** `capEvict()` (or its
  replacement) must never set an unresolved item's `status` to `dismissed`
  or `resolved` merely to free up cap space. An item's `status` changes only
  via a real `resolve`, `dismiss`, or user-declined-in-triage action.
- **REQ-002 — Relocate, never delete, on hot-file overflow.** When capturing
  or adding an item would push the hot file's open count above `CAP`,
  relocation candidates (selected by the existing victim-selection rule:
  lowest priority, then oldest date) move to the archive file, keeping
  `status: 'open'` and a new `relocatedDate` field. They are removed from
  `LOGBOOK.md`'s in-memory/serialized item set and appended to
  `LOGBOOK-ARCHIVE.md`'s.
- **REQ-003 — Relocate, never truncate, on archive-window overflow.** When
  the hot file's own resolved/dismissed history exceeds `ARCHIVE_MAX`
  (still 30), the oldest excess entries relocate to the archive file
  (preserving their real `resolved`/`dismissed` status and date) instead of
  being dropped from the write, as `serialize()` currently does via
  `.slice(0, ARCHIVE_MAX)`.
- **REQ-004 — Archive file is never capped or truncated.** `LOGBOOK-ARCHIVE.md`
  grows without a size limit. It is git-tracked and committed like
  `LOGBOOK.md`. No pagination or rotation is implemented by this spec (§9).
- **REQ-005 — Honest three-way status rendering.** Serialization must render
  `resolved`, `dismissed`, and the new open-but-relocated state distinctly
  and unambiguously — never sharing a marker. A relocated-but-still-open
  item keeps its `- [ ]` unchecked box (it is not done) and gains a
  `<!-- relocated:<date> -->` marker (parallel to the existing
  `resolved:<date>` marker) instead of a `resolved:` stamp. `resolved` and
  `dismissed` items keep today's checked-box rendering but must carry a
  marker that lets a reader (and the parser) distinguish which of the two
  occurred — reusing `resolved:<date>` for genuine completions and adding a
  parallel `dismissed:<date>` marker for declined-but-considered items,
  replacing today's overloaded single `resolvedDate` field/marker that
  conflates both.
- **REQ-006 — Breach-time triage prompt (interactive only).** Before
  `/build`'s Stage 10 and `/ship`'s Follow-ups Ledger step call the
  real (mutating) capture, they call a new non-mutating preview operation
  with the same incoming items. If the preview reports one or more
  relocation candidates AND the current run is interactive (not `--auto`),
  the calling skill presents those candidates to the user via
  `AskUserQuestion` before proceeding — giving a real chance to `resolve`
  or `dismiss` any of them first. Whatever remains unaddressed after the
  prompt relocates via REQ-002 when the real capture runs.
- **REQ-007 — Silent relocation in `--auto` mode.** When the calling skill
  is running in `--auto` mode, the breach-time triage prompt is skipped
  entirely — the real capture runs directly and any relocation candidates
  relocate per REQ-002 with no prompt, matching today's non-interactive
  safety-net behavior (unchanged from the user's perspective in `--auto`
  runs).
- **REQ-008 — Preview must not mutate.** The new preview operation
  (§4) computes what capture/add *would* do (added/deduped counts,
  relocation candidates) against a read-only copy of the merged item set
  and never calls `write()`.
- **REQ-009 — Cross-file dedupe and read.** Reading the ledger for any
  operation (`capture`, `add`, `resolve`, `dismiss`, `review`, `list`,
  the new preview and `archive`/`restore` operations) merges items from both
  `LOGBOOK.md` and `LOGBOOK-ARCHIVE.md` into one in-memory set before acting,
  the same way legacy `LOG.md`/`FOLLOWUPS.md` merging already works today —
  so dedupe (REQ-011 pre-existing) and auto-resolve consider the full item
  set, not just the hot file.
- **REQ-010 — Auto-resolve covers the archive.** `autoResolveLinked()` runs
  over the merged item set (REQ-009), so a relocated item with a satisfied
  `task#`/`spec:`/`rec:`/`pr#`/`commit:` link resolves automatically
  regardless of which file it currently lives in.
- **REQ-011 — Assisted review covers the archive.** `reviewCandidates()`
  (staleness/likely-done detection) runs over the merged item set too, using
  the existing `STALE_DAYS` threshold uniformly for hot and relocated items
  (§7 — deliberately not shortened for relocated items; the breach-time
  prompt is the primary defense, this is the secondary safety net).
- **REQ-012 — Selector namespace for archive items.** Archive-resident items
  (relocated-open, or resolved/dismissed history that has moved to the
  archive file) are addressable via a distinct selector prefix (e.g. `a3`
  for the 3rd item in the archive's numbered listing) so `resolve`,
  `dismiss`, and the new `restore` action can target them without colliding
  with the hot file's plain-number selectors.
- **REQ-013 — `restore` action.** A new action moves an archive-resident,
  still-`open` item back into the hot file, keeping its `open` status and
  clearing `relocatedDate`. If this pushes the hot file back over `CAP`,
  normal relocation (REQ-002) fires immediately on whatever is now the
  lowest-priority/oldest hot item — the system self-balances without a
  dedicated always-on queue mechanism.
- **REQ-014 — `/logbook archive` view.** A new `/logbook` action lists the
  archive file's still-`open` (relocated) items with their `a`-prefixed
  selectors, separately from purely historical resolved/dismissed entries
  in the same file (which are shown for context but are not actionable
  the same way). Historical entries need no action affordance beyond
  display.
- **REQ-015 — No change to `/logbook show`'s primary output.** The default
  `/logbook` view (`lifecycle-next` + `logbook-list`) is unchanged by this
  spec — no always-visible "needs attention" section is added there (§9).
- **CON-001** — No new runtime dependencies; pure Node.js `fs`/`path`, same
  as today.
- **CON-002** — Every operation still degrades to a no-op on any parse/IO
  error for either file (existing CON-002 discipline, extended to the
  archive file).
- **CON-003** — `CAP` stays 20. This spec does not change the hot-file cap
  value (§9).
- **GUD-001** — Reuse the existing victim-selection sort
  (`priorityRank` then oldest `date`) for choosing relocation candidates —
  do not introduce a new prioritization scheme.
- **GUD-002** — Never silent: any relocation, restore, or triage-prompt
  outcome is reported back to the user by the calling skill (existing
  discipline, unchanged in spirit, extended to the new operations).

## 4. Interfaces & Data Contracts

**New/changed `hooks/lib/logbook.cjs` exports** (implementer decides exact
function names/module boundaries — see Assumption Authorization):
- A preview operation taking the same incoming-items shape as `capture()`,
  returning `{ added, deduped, relocationCandidates }` without writing.
  `relocationCandidates` is `[{ title, category, source, date }]` in the
  order they would be relocated.
- `capture()`/`add()` updated to relocate (REQ-002) instead of evict, and to
  read/write across both files (REQ-009).
- `restore(projectDir, selector)` — moves an `a`-prefixed archive selector's
  item back to the hot file.
- `autoResolveLinked()` and `reviewCandidates()` updated to operate on the
  merged item set (REQ-010/011).
- `serialize()`/`parse()` updated for the three-way status marker (REQ-005)
  and for relocating hot-archive overflow instead of slicing it away
  (REQ-003).

**New `hooks/session-guard.cjs` subcommands:**
- `logbook-capture-preview '<items-json>'` → prints
  `LOGBOOK_CAPTURE_PREVIEW_BEGIN` / `END` with `would_add`, `would_dedupe`,
  and a numbered `would_relocate` list (title, category, source, date).
- `logbook-archive` → prints the archive file's still-open items with `a`-
  prefixed selectors, plus a compact display of historical entries.
- `logbook-restore <a-selector>` → invokes `restore()`.
- `logbook-resolve`/`logbook-dismiss` extended to accept `a`-prefixed
  selectors (REQ-012), routing to the archive file's item set.

**`LOGBOOK-ARCHIVE.md` format:** same markdown item-line grammar as
`LOGBOOK.md` (checkbox, priority marker, title, source, date, trailing
HTML-comment marker), reusing `serializeItem`/`parseItemLine` unchanged
except for the new `relocated:<date>` marker (REQ-005). No category
headings are required in the archive file — a flat list is sufficient,
since archive ordering is by relocation recency, not category.

**Example `LOGBOOK-ARCHIVE.md` entry (relocated, still open):**
```text
- [ ] Consider a dedicated debugging skill mirroring /build's pipeline — unfurl project session (2026-07-18) <!-- relocated:2026-07-22 -->
```

**Example (genuinely resolved, moved here only because the hot file's
recent-history window filled up — REQ-003):**
```text
- [x] Fix X — /build debrief (2026-06-01) <!-- resolved:2026-07-10 -->
```

**Example (dismissed, distinct marker per REQ-005):**
```text
- [x] Some declined idea — manual (2026-05-01) <!-- dismissed:2026-06-01 -->
```

**Breach-time triage prompt contract (SKILL.md instruction, not code):**
`/build` Stage 10 and `/ship`'s Follow-ups Ledger step call
`logbook-capture-preview` first. If `would_relocate` is non-empty and the
run is interactive, present the candidates via `AskUserQuestion` (mirroring
the existing per-item choice pattern already used elsewhere in these
SKILL.md files) with outcomes per candidate: resolve now, dismiss, or leave
it — anything left un-acted-on relocates when the real `logbook-capture`
call follows. In `--auto` runs, skip straight to the real call (REQ-007).

## 5. Acceptance Criteria

- **AC-001**: Given the hot file at 20 open items, when a capture adds items
  that would push it over cap, then the lowest-priority/oldest candidates
  are relocated to `LOGBOOK-ARCHIVE.md` with `status` still `open` and a
  `relocated:<date>` marker — never `dismissed` or `resolved`.
- **AC-002**: Given the hot file's resolved/dismissed history exceeds
  `ARCHIVE_MAX` (30) after a write, then the oldest excess entries move to
  `LOGBOOK-ARCHIVE.md` with their original `resolved`/`dismissed` status and
  date intact — they do not disappear from either file.
- **AC-003**: Given a `LOGBOOK.md` with items previously marked `dismissed`
  by relocation (pre-this-spec data), the parser still round-trips them
  without error (no migration required by this spec — historical data is
  read as-is, per §9 Non-Goals).
- **AC-004**: Given an interactive `/build` debrief whose capture would
  produce 3 relocation candidates, when Stage 10 runs, then
  `logbook-capture-preview` is called first, the user is prompted via
  `AskUserQuestion` before the real capture proceeds, and any candidate the
  user resolves/dismisses in that prompt is not among the items relocated
  by the subsequent real capture.
- **AC-005**: Given the same scenario but the run is `--auto`, then no
  prompt occurs and the real capture proceeds directly, relocating
  candidates per AC-001.
- **AC-006**: Given a relocated item with a `link` field whose target is now
  satisfied, when `logbook-review` (or the next scheduled auto-resolve
  trigger) runs, then the item resolves automatically regardless of it
  living in the archive file.
- **AC-007**: Given a relocated item that is old enough per `STALE_DAYS`,
  when `logbook-review` runs, then it appears among the assisted-review
  candidates (with a reason referencing its relocated status), and resolving
  it requires the same user confirmation as any hot-file candidate.
- **AC-008**: Given a relocated item, when the user runs
  `logbook-restore a<N>`, then the item moves back into `LOGBOOK.md` with
  `status: 'open'` and no `relocatedDate`; if this pushes the hot file over
  `CAP`, another relocation fires immediately per AC-001.
- **AC-009**: Given `/logbook`'s default (no-argument) invocation, then its
  output is unchanged from today — no archive-derived section appears there
  (§9 confirms this is intentional, not an oversight).
- **AC-010**: Given a manual `/logbook add` that would breach the cap, then
  the same breach-time triage prompt behavior applies (REQ-006), since
  `/logbook add` is itself always interactive.

## 6. Test Automation Strategy

- **Colocated unit tests** (`hooks/lib/logbook.test.cjs`, extended — node
  `--test`, part of `npm run test:unit`): update existing `capEvict`-focused
  tests to assert relocation (not dismissal) semantics; add cases for
  AC-001–AC-003, AC-006–AC-008; assert the pure `serialize`/`parse`
  round-trip for all three status markers including the archive file's
  format; assert `read()` correctly merges both files (REQ-009) the same
  way legacy-file merging is already tested.
- **`hooks/session-guard.cjs` coverage**: existing test conventions for CLI
  subcommand wrappers (if any) extended to cover the new
  `logbook-capture-preview`, `logbook-archive`, `logbook-restore`
  subcommands and the `a`-prefixed selector handling in
  `logbook-resolve`/`logbook-dismiss`.
- **Eval cases** (`skills/build/tests/evals.json`, `skills/ship/tests/evals.json`,
  `skills/logbook/tests/evals.json` as applicable): assert the SKILL.md
  instructions call `logbook-capture-preview` before the real capture, gate
  the `AskUserQuestion` prompt on interactive-only, and skip it entirely
  under `--auto` (AC-004/AC-005 are behavioral — eval-asserted, not unit
  tested, matching this repo's existing convention for interactive-flow
  assertions).
- **No CI changes** — existing `npm test` covers all of it.

## 7. Rationale & Context

- Relocation replaces eviction because an evicted-and-mislabeled item is
  literally indistinguishable from a completed one — the exact bug that
  triggered this spec. Relocating without falsifying status is a strictly
  more honest operation for roughly the same implementation cost.
- The archive file is deliberately never capped (REQ-004): it's off the hot
  path (only read on `/logbook archive`/`review`), so there's no
  performance reason to ever delete from it, and deleting from it would
  reintroduce exactly the loss problem this spec exists to close.
- The breach-time triage prompt is the actual fix for "relocated items
  never get processed" — not a bigger warehouse. `logbook-capture` is only
  ever called from an already-interactive `/build`/`/ship` debrief, so
  asking "handle any of these now?" at that exact moment costs the user
  almost nothing extra, versus hoping they remember to run `/logbook
  review` or `/logbook archive` days later. An archive nobody revisits is
  functionally equivalent to deletion; asking once, when asking is nearly
  free, is what makes relocation meaningfully different from that.
- A uniform `STALE_DAYS` threshold for archive items (REQ-011) was chosen
  over a shorter "already deprioritized once" threshold because the
  breach-time prompt is now the primary defense against silent neglect —
  the review-track extension is a secondary safety net for whatever slips
  through (declined-at-prompt items, or anything relocated during `--auto`
  runs), not the main mechanism, so added tuning complexity there wasn't
  justified.
- The always-on "needs attention" section and a dedicated `promote`
  command were both considered and explicitly cut (§9) once the
  breach-time prompt existed — they solved the same problem the prompt
  already solves, at the cost of a permanent new UI surface and a
  self-balancing queue mechanism, for marginal additional benefit.
- Raising the hot-file cap (20 → 40) was considered and rejected as a
  substitute for this spec: it delays the same failure rather than fixing
  it — the exact scenario that triggered this report (11 items captured at
  once) recurs at any fixed ceiling. The cap is retained as a performance
  knob, decoupled from the loss guarantee, which relocation now provides
  independent of where the cap is set.

## 8. Dependencies & External Integrations

- **INF-001**: Node.js (existing runtime, no version change) — `fs`/`path`
  only, matching current `hooks/lib/logbook.cjs` dependencies.
- **PLT-001**: git — the archive file is committed the same way `LOGBOOK.md`
  is; no new git operations beyond existing add/commit conventions.
- No external services. `/build` and `/ship` consume the extended
  `logbook-*` subcommands; no other skill depends on ledger internals.

## 9. Examples & Edge Cases

- **Happy path**: `/build` debrief captures 5 items against 18 already-open
  hot items (cap 20) → preview reports 3 relocation candidates → user
  resolves 1, dismisses 1 in the triage prompt, leaves 1 → real capture
  relocates only the 1 left un-acted-on.
- **`--auto` run**: same scenario, no prompt, all 3 candidates relocate
  silently — unchanged from today's user-visible behavior in `--auto` mode.
- **Cross-file dedupe**: a new capture's title closely matches an item
  already living in the archive file (previously relocated) — REQ-009's
  merged read means this is detected as a duplicate and updates the
  archive-resident item's `source`/`date`, rather than creating a
  duplicate open item in the hot file.
- **Restore causing immediate re-relocation**: hot file at cap (20),
  restoring an archive item brings it to 21 → the normal relocation rule
  fires immediately on whatever is now lowest-priority/oldest — potentially
  relocating a *different* item than the one just restored, which is
  correct (self-balancing, REQ-013).
- **Legacy mislabeled data**: an existing `LOGBOOK.md` from before this
  spec ships may contain items marked `dismissed` that were actually silent
  evictions under the old `capEvict()`. This spec does not attempt to
  reinterpret or migrate them (§ Non-Goals) — they round-trip as ordinary
  dismissed items going forward; only newly-relocated items get the honest
  `relocated:` marker.
- **Both caps breached simultaneously**: a single capture could, in theory,
  simultaneously push the hot file over `CAP` (open items) and its own
  write could separately push the recent-history window over
  `ARCHIVE_MAX` — both relocate independently in the same write; there is
  no interaction between the two beyond both landing in the same archive
  file.

## Non-Goals (explicitly out of scope)

- No always-visible "needs attention" section in `/logbook`'s default
  output (AC-009) — the breach-time prompt and the extended review track
  are the surfacing mechanisms.
- No dedicated `promote`/self-balancing queue command beyond `restore`
  (REQ-013) plus the review track's existing per-item choice pattern.
- No migration or reinterpretation of historical `LOGBOOK.md` entries.
- No cap, pagination, or rotation on `LOGBOOK-ARCHIVE.md`.
- No change to the `CAP` value (stays 20) or to `STALE_DAYS` (stays uniform
  across hot and archived items).
- No shortened/escalating staleness threshold specifically for relocated
  items.

## 10. Validation Criteria

1. `npm run validate && npm run lint && npm run test:unit` green with the
   updated and new `hooks/lib/logbook.test.cjs` cases.
2. Manual end-to-end: trigger a `/build` debrief capture that breaches the
   cap in an interactive session, confirm the triage prompt appears, confirm
   post-prompt relocation lands in `LOGBOOK-ARCHIVE.md` with the
   `relocated:` marker, confirm `/logbook show` output is unchanged
   (AC-009), confirm `/logbook archive` lists it, confirm `/logbook restore`
   brings it back.
3. Regression: an existing project's `LOGBOOK.md` (with historical
   `dismissed` entries from before this ships) still parses and renders
   without error (AC-003).

## 11. Related Specifications / Further Reading

- `hooks/lib/logbook.cjs`, `hooks/lib/logbook.test.cjs` — implementation and
  existing tests this spec extends.
- `skills/logbook/SKILL.md`, `skills/build/SKILL.md` (Stage 10),
  `skills/ship/SKILL.md` (Follow-ups Ledger) — the three call sites this
  spec's interactive triage prompt and new subcommands wire into.
- `hooks/lib/lifecycle.cjs` — sibling engine `/logbook` also surfaces;
  unaffected by this spec.

## Definition of Done

- [ ] `capEvict()` (or its replacement) never sets an unresolved item's
      status to `dismissed`/`resolved` — relocation is the only overflow
      action (REQ-001/002).
- [ ] `LOGBOOK-ARCHIVE.md` exists, is git-tracked, and receives both
      relocated-open items and archive-window overflow instead of either
      being deleted (REQ-002/003/004).
- [ ] `resolved`, `dismissed`, and `relocated` render with distinct,
      unambiguous markers and round-trip correctly through parse/serialize
      (REQ-005).
- [ ] `logbook-capture-preview` exists, returns relocation candidates
      without mutating either file, and both `/build` Stage 10 and `/ship`'s
      Follow-ups Ledger step call it before the real capture (REQ-006/008).
- [ ] The breach-time `AskUserQuestion` prompt appears only when relocation
      candidates are non-empty AND the run is interactive, and is skipped
      entirely under `--auto` (REQ-006/007).
- [ ] `autoResolveLinked()` and `reviewCandidates()` operate over the merged
      hot+archive item set (REQ-009/010/011).
- [ ] `logbook-restore` moves an archive item back to the hot file, keeping
      `open` status, and immediately re-triggers relocation if this pushes
      the hot file back over `CAP` (REQ-013).
- [ ] `/logbook archive` lists archive-resident items with `a`-prefixed
      selectors; `resolve`/`dismiss` accept those selectors (REQ-012/014).
- [ ] `/logbook`'s default output is byte-for-byte unchanged by this spec
      (AC-009).
- [ ] `npm run validate && npm run lint && npm run test:unit` all pass with
      updated and new tests covering the above.

## Roadmap

Not part of this build, noted for future consideration once this ships and
real usage data exists:
- Whether historical mislabeled `dismissed` entries are worth a one-time,
  clearly-labeled best-effort reclassification pass (would require
  heuristics, since old data carries no signal distinguishing a real
  dismissal from a silent eviction).
- Whether `LOGBOOK-ARCHIVE.md` ever needs pagination/summarization if a
  long-lived project's archive grows very large — no evidence this is
  needed yet; deliberately deferred (§9).

## Assumption Authorization

- **Ambiguity**: exact internal module/function boundaries for two-file
  read/write (e.g., whether `read()` grows a third return field for
  archive-origin items, or archive state is merged transparently into the
  same item array with a `location` tag).
  **Authorized decision**: `/build`'s architect stage may choose the
  internal representation freely, provided the observable contract in §4
  (subcommand names, output formats, selector convention) is met.
  **Must report**: which representation was chosen, briefly, in the PR
  description.
- **Ambiguity**: exact `AskUserQuestion` wording/option set for the
  breach-time triage prompt.
  **Authorized decision**: `/build` may phrase the prompt however best
  matches the existing per-item choice pattern already used in `/build`
  Stage 10 and `/ship`'s ledger step, provided each candidate can be
  resolved, dismissed, or left to relocate.
  **Must report**: nothing beyond the normal PR description — this is a
  copy-level detail, not a behavioral one.
- **Ambiguity**: whether the `a`-prefixed selector convention (REQ-012) is
  implemented as a literal string prefix parsed by `pickSelector`, or a
  separate lookup function entirely.
  **Authorized decision**: `/build`'s architect stage may choose either,
  provided `resolve a3`/`dismiss a3`/`restore a3` all address the same
  archive item consistently.
  **Must report**: nothing beyond normal PR description.
