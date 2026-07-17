---
title: Follow-ups Ledger
version: 1.0
date_created: 2026-07-16
last_updated: 2026-07-16
tags: [process, tool, session-guard, skills, lifecycle]
---

> **Status note (2026-07-17) — how this shipped and evolved.** This spec is the
> point-in-time design record; the feature shipped and then evolved past some of
> the names and structure below. Current reality:
> - The command is **`/logbook`**, not `/followups`. `/followups` was first
>   renamed to `/log`, then merged with the lifecycle-overview command
>   (`/next` → `/waypoint`) into a single **`/logbook`** surface with two labeled
>   sections (🧭 lifecycle steps · 📌 follow-ups). REQ-041's one-line `/next`→
>   cross-reference is therefore superseded by that unified two-section view.
> - The committed file is **`LOGBOOK.md`**, not `FOLLOWUPS.md` (renamed
>   `FOLLOWUPS.md` → `LOG.md` → `LOGBOOK.md`). The module reads legacy filenames
>   and consolidates them forward, so no ledger is orphaned across the renames.
> - The shared module is `hooks/lib/logbook.cjs`; the Session Guard subcommands
>   are `logbook-*` and the markers `LOGBOOK_*`.
>
> Everything else — storage model, auto-capture, two-track cleanup, cap/eviction,
> cold-start gating, acceptance criteria — shipped as specified. The requirements
> below are preserved verbatim as the original design.

# Introduction

The Follow-ups Ledger gives the good ideas, deferred fixes, open questions, and
suggestions that Claude Code surfaces at the end of a `/build`/`/ship` cycle a
**durable home** that survives `/clear`. Today those items live only in the
conversation: the moment the context is reset — which happens constantly in this
project's speccy → build → ship flow — both the user and Claude Code forget them.
The ledger captures them into a committed, human-editable `FOLLOWUPS.md`, keeps
the list finite and current with two-track cleanup, and resurfaces it at the
moments the user actually has bandwidth to act: on demand (`/followups`),
alongside `/next`, and as a passive hint at a genuine Claude Code **cold start**.

The ledger is the subjective, idea-oriented sibling of the Lifecycle
Recommendation Engine (`specs/lifecycle-recommendation-engine.md`): the engine
computes *what the project needs next* from objective repo state; the ledger
remembers *what you said you wanted to do* and reminds you at the right time.

# 1. Purpose & Scope

**Purpose.** Never lose a surfaced follow-up idea to a context reset. Capture
debrief items durably, keep the list finite and honest (auto-cleanup), and
surface it through a pull command, a `/next` cross-reference, and a cold-start
ambient hint — without nagging.

**In scope.**
- A committed markdown store `FOLLOWUPS.md` at the repository root.
- A shared module `hooks/lib/followups.cjs` that parses, writes, dedupes, caps,
  and auto-resolves the ledger (single source of truth for all surfaces).
- Auto-capture of debrief items at the end of `/build` and `/ship`.
- Two-track cleanup: deterministic auto-resolve for *linked* items; assisted,
  consent-gated review for free-text items.
- Three surfaces: a `/followups` command (pull), a `/next` cross-reference, and a
  cold-start ambient hint via the Session Guard.
- `session-guard.cjs` subcommands for programmatic ledger operations.

**Out of scope.**
- Replacing `TaskCreate` (active, session-scoped work items). The ledger is the
  durable backlog; an item may be *promoted* to a task, but the two stores are
  distinct (see § 7).
- Replacing Claude Code auto-memory (curated facts) or the pending-build marker
  (a single next-action signal). The ledger is a bounded, categorized backlog.
- Automatically *acting* on any item. The ledger captures and reminds; the user
  decides what to do (mirrors the lifecycle engine's consent rule).
- Cross-repository or global ledgers. The ledger is per-repository.

**Audience.** MAD Skills maintainers.

**Assumptions.**
- Skills run inside Claude Code with the MAD Skills plugin active.
- `hooks/session-guard.cjs`, `hooks/lib/state.cjs`, and the `/build` Stage 10
  Debrief / `/ship` debrief already exist and are reused.
- The repository is a git repository (for linked-item resolution and commit).

# 2. Definitions

- **Follow-up item** — a single captured idea, suggestion, deferred fix, open
  question, risk, or tech-debt note, with a title, category, source, date,
  status, and optional machine-readable link.
- **Ledger** — the collection of follow-up items, stored in `FOLLOWUPS.md`.
- **Category** — one of: `ideas`, `fixes` (deferred fixes), `questions` (open
  questions), `risks` (unresolved risks), `debt` (tech debt). These mirror the
  existing debrief categories (`unresolved_risk`, `deferred_fix`,
  `open_question`, `assumption`, `tech_debt`).
- **Source** — a short attribution of where an item came from (e.g. `/ship #87`,
  `/build debrief`, `/next design`, `manual`).
- **Link** — an optional machine-checkable reference attached to an item that
  lets it auto-resolve: a task id, a spec path, a lifecycle recommendation id, or
  a PR/commit reference.
- **Linked item** — an item that carries a link (deterministic cleanup track).
- **Free-text item** — an item with no link (assisted-review cleanup track).
- **Debrief** — the `/build` Stage 10 and `/ship` end-of-run step that surfaces
  unresolved items; the primary capture point.
- **Cold start** — a `SessionStart` whose `source` is `startup` or `resume` — a
  genuine "Claude Code just launched / reconnected" moment, as opposed to `clear`
  or `compact`, which are mid-workflow context resets.
- **Open item** — an item whose status is `open` (unchecked). Only open items
  count toward the cap and the surfaced counts.

# 3. Requirements, Constraints & Guidelines

## Storage & Model
- **REQ-001**: The ledger SHALL be a single committed markdown file
  `FOLLOWUPS.md` at the repository root, human-readable and hand-editable.
- **REQ-002**: Items SHALL be grouped under category headings, each rendered as a
  GitHub-style task-list checkbox (`- [ ]` open, `- [x]` resolved) with a short
  title, a source attribution, and an ISO date (`YYYY-MM-DD`).
- **REQ-003**: An item MAY carry an optional machine-readable **link** encoded as
  a trailing HTML comment so it is invisible in rendered markdown but parseable
  (e.g. `<!-- link:task#15 -->`, `<!-- link:rec:rig-refresh -->`,
  `<!-- link:spec:specs/foo.md -->`, `<!-- link:pr#87 -->`).
- **REQ-004**: The module SHALL treat `FOLLOWUPS.md` as the source of truth —
  parse it on read and rewrite it on mutation. There SHALL be no parallel
  structured store for item data (per the user's single-file preference).

## Capture
- **REQ-010**: At the end of `/build` (Stage 10 Debrief) and `/ship`, every
  surfaced debrief item SHALL be auto-captured into the ledger, mapping its
  debrief category to a ledger category.
- **REQ-011**: Capture SHALL **dedupe on entry**: a new item whose normalized
  title closely matches an existing open item SHALL update that item's source/date
  rather than create a duplicate.
- **REQ-012**: When a debrief item is also turned into a `TaskCreate` task, the
  captured ledger item SHALL carry a `task#<id>` link so it auto-resolves when the
  task completes (REQ-030), rather than duplicating the task.
- **REQ-013**: The user SHALL be able to add an item manually via `/followups add`
  (source `manual`).

## Cap & Lifecycle
- **REQ-020**: The ledger SHALL enforce a soft cap of **20 open items** (default,
  configurable). When capture would exceed the cap, the oldest open item with the
  lowest priority SHALL be evicted, and the eviction SHALL be logged (never
  silent) (GUD-002).
- **REQ-021**: An item's status SHALL be one of `open`, `resolved`, or
  `dismissed`. `resolved` and `dismissed` items do not count toward the cap.
- **REQ-022**: Resolved/dismissed items SHALL be retained in a collapsed
  "Archive" section of `FOLLOWUPS.md` (bounded to the most recent N, default 30)
  so the git history and the file stay a legible record without growing unbounded.

## Cleanup (two-track)
- **REQ-030**: **Deterministic track** — a *linked* open item SHALL be
  auto-resolved (silently) when its link is satisfied: `task#<id>` completed,
  `spec:<path>` built or removed, `rec:<id>` satisfied per the lifecycle engine,
  or `pr#<n>`/commit merged into the default branch.
- **REQ-031**: **Assisted track** — for *free-text* open items, at review time
  (`/followups`, or when the cold-start hint or debrief runs) the system SHALL
  compare items against current repository state, flag those that appear
  completed or stale, and present them for **user-confirmed** bulk resolution.
- **REQ-032**: The assisted track SHALL NEVER delete or resolve a free-text item
  without explicit user confirmation (GUD-001: a false "still open" is cheaper
  than silently losing an idea the user still wanted).

## Surfaces
- **REQ-040**: A `/followups` command SHALL list open items (grouped by category,
  linked items annotated), and support `resolve <n>`, `dismiss <n>`, `add <text>`,
  and `review` (run the assisted cleanup) operations.
- **REQ-041**: `/next` SHALL append a single-line cross-reference when the ledger
  has open items (e.g. `+ 5 follow-ups → /followups`), and SHALL NOT list the
  items inline (separation of concerns: `/next` = lifecycle steps, `/followups` =
  the backlog).
- **REQ-042**: The Session Guard SHALL surface a passive one-line cold-start hint
  (`📌 N open follow-ups — /followups to review`) **only** on `SessionStart`
  sources `startup` and `resume`, and SHALL be silent on `clear` and `compact`.
- **REQ-043**: The cold-start hint SHALL be a passive line only (no
  `AskUserQuestion`), and SHALL be suppressed when the ledger has zero open items.
- **REQ-044**: At `/build` and `/ship` debrief, the existing open ledger SHALL be
  displayed alongside the newly captured items so the user reviews the backlog at
  the checkpoint where they are most likely to act.

## Constraints & Guidelines
- **CON-001**: `FOLLOWUPS.md` SHALL be committed (team-shared, survives clone),
  consistent with the "objective, durable" store pattern used by `.mad/`.
- **CON-002**: All ledger operations SHALL degrade to no-op on any parse or IO
  error — a malformed `FOLLOWUPS.md` MUST NOT block a session, a skill, or a hook
  (mirrors lifecycle CON-003).
- **CON-003**: Ledger reads on the hook path (cold-start count) SHALL be cheap
  (a single file read + line scan), keeping SessionStart fast.
- **GUD-001**: Prefer keeping a possibly-done item over silently removing it. The
  whole point is to not lose ideas.
- **GUD-002**: Never truncate silently — log every eviction and every
  auto-resolve so the record is honest.
- **PAT-001**: Model the ledger operations in one shared module
  (`hooks/lib/followups.cjs`) called by every surface — single source of truth,
  mirroring `hooks/lib/lifecycle.cjs`.
- **PAT-002**: Keep the committed objective store (`FOLLOWUPS.md`) separate from
  any per-user preference (e.g. a per-user "last cold-start hint shown" timestamp,
  if added later) via `state.cjs` — never conflate them.

# 4. Interfaces & Data Contracts

## 4.1 `FOLLOWUPS.md` format

```md
# Follow-ups

<!-- Managed by MAD Skills /followups. Hand-edits are preserved; keep the
     `- [ ]` checkbox shape and category headings. -->

## Ideas
- [ ] Add retry/backoff to the CI poller — /ship #87 (2026-07-16)
- [ ] Cache computeSignature across processes if it ever gets slow — /build debrief (2026-07-14)

## Deferred fixes
- [ ] rig-refresh predicate is shallow — /build debrief (2026-07-14) <!-- link:task#15 -->

## Open questions
- [ ] Should /next show muted recs with a tag? — /next design (2026-07-16)

## Risks
## Tech debt

## Archive
- [x] De-dup superpowers detection — /build debrief (2026-07-14) <!-- link:task#16 resolved:2026-07-16 -->
```

- Category headings are fixed: `Ideas`, `Deferred fixes`, `Open questions`,
  `Risks`, `Tech debt`, plus `Archive`. Empty categories render as an empty
  heading (kept for a stable, diff-friendly shape).
- Item line grammar:
  `- [ ] <title> — <source> (<YYYY-MM-DD>)` optionally followed by
  ` <!-- link:<link> -->`.

## 4.2 Item object (in-memory, parsed from markdown)

```jsonc
{
  "title": "Add retry/backoff to the CI poller",
  "category": "ideas",           // ideas | fixes | questions | risks | debt
  "source": "/ship #87",
  "date": "2026-07-16",
  "status": "open",              // open | resolved | dismissed
  "link": null,                  // e.g. "task#15" | "rec:rig-refresh" | "spec:specs/x.md" | "pr#87"
  "priority": "normal"           // normal | low | high (parsed from an optional !/!! prefix; default normal)
}
```

## 4.3 Module API — `hooks/lib/followups.cjs`

```
followups.read(projectDir) -> { items: Item[], path }          // parse FOLLOWUPS.md (CON-002 safe)
followups.openItems(projectDir) -> Item[]                      // status === 'open'
followups.count(projectDir) -> number                          // cheap open-count for the cold-start hint
followups.capture(projectDir, items[]) -> { added, deduped, evicted }  // REQ-010/011/020
followups.resolve(projectDir, selector) -> Item                // check off (move to Archive)
followups.dismiss(projectDir, selector) -> Item
followups.add(projectDir, { title, category, source, link }) -> Item
followups.autoResolveLinked(projectDir) -> Item[]              // REQ-030 deterministic track
followups.reviewCandidates(projectDir) -> Item[]               // REQ-031 free-text likely-done/stale (no mutation)
```

`autoResolveLinked` consults: `TaskGet`/task state (task#), `existsSync`/git for
spec paths, `lifecycle.evaluate`/marker state for `rec:` links, and
`git` merge state for `pr#`/commit links.

## 4.4 `session-guard.cjs` subcommands

Mirroring the `lifecycle-*` subcommands:

```
followups-hint          # emit the passive cold-start line (startup|resume matcher)
followups-list          # print the open ledger as a LEDGER_BEGIN…END block
followups-capture <json> # capture an array of items (used by /build & /ship debrief)
followups-resolve <n>
followups-dismiss <n>
followups-add <text> [--category <c>] [--link <l>]
```

## 4.5 `hooks.json` wiring

A **new dedicated** `SessionStart` entry, matched to `startup|resume` only,
invokes `followups-hint`. The existing `startup|clear|compact` session-guard
`check` entry is unchanged. This is what gates the hint to true cold starts
without reading the payload `source` in code (REQ-042).

```jsonc
{ "matcher": "startup|resume",
  "hooks": [ { "type": "command",
    "command": "… node \"$_R/hooks/session-guard.cjs\" followups-hint", "timeout": 10 } ] }
```

## 4.6 `/followups` command surface

```
/followups                 # list open items grouped by category (+ linked annotations)
/followups review          # run assisted cleanup (auto-resolve linked, confirm free-text)
/followups resolve 3       # check off item 3
/followups dismiss 3       # drop item 3 (not done, not wanted)
/followups add <text>      # manual capture
```

# 5. Acceptance Criteria

- **AC-001 (capture)**: Given `/ship` completes with 3 surfaced debrief items,
  When its debrief runs, Then all 3 are appended to `FOLLOWUPS.md` under their
  mapped categories with source and date, and the file is staged for commit.
- **AC-002 (dedupe)**: Given an open item "Add retry to CI poller", When a later
  debrief surfaces "add retry/backoff to the CI poller", Then no duplicate is
  created and the existing item's date/source is refreshed.
- **AC-003 (cap + eviction)**: Given 20 open items, When a 21st is captured, Then
  the oldest lowest-priority open item is moved to Archive (evicted) and the
  eviction is reported in the capture output; the open count stays ≤ 20.
- **AC-004 (linked auto-resolve)**: Given an open item linked `task#15`, When task
  15 is completed, Then on the next `autoResolveLinked` run the item is silently
  moved to Archive as `- [x] … resolved:<date>`.
- **AC-005 (assisted review, consent)**: Given a free-text item that looks
  addressed by a merged change, When `/followups review` runs, Then the item is
  presented as a "likely done" candidate and is only resolved after the user
  confirms; declining leaves it open.
- **AC-006 (no silent free-text delete)**: Given any free-text open item, When any
  automatic process runs, Then the item is never resolved or removed without user
  confirmation.
- **AC-007 (cold-start hint scope)**: Given a non-empty ledger, When a
  `SessionStart` fires with source `startup` or `resume`, Then a passive
  `📌 N open follow-ups — /followups` line is emitted; When the source is `clear`
  or `compact`, Then no follow-ups hint is emitted.
- **AC-008 (empty ledger silence)**: Given zero open items, When any surface runs
  (cold-start, `/next`, debrief), Then no follow-ups hint or cross-reference is
  shown.
- **AC-009 (/next cross-ref)**: Given 5 open items, When `/next` runs, Then its
  output includes a single line `+ 5 follow-ups → /followups` and does not list
  the items inline.
- **AC-010 (pull + resolve)**: Given open items, When `/followups resolve 2`
  runs, Then item 2 becomes `- [x]` in the Archive section and drops out of the
  open list and counts.
- **AC-011 (degrade to no-op)**: Given a malformed `FOLLOWUPS.md`, When any ledger
  operation runs, Then it fails safe (no throw, no hook/skill/session blocked) and
  reports zero open items.
- **AC-012 (manual add)**: Given `/followups add "try the new bundler"`, Then an
  `ideas` item with source `manual` and today's date is appended.

# 6. Test Automation Strategy

- **Test Levels**: Unit (parse/serialize round-trip, dedupe, cap/eviction,
  category mapping, link parsing) and Integration (temp-dir `FOLLOWUPS.md`
  capture/resolve/dismiss; `autoResolveLinked` against fixture task/marker state;
  `followups-hint` source gating).
- **Frameworks**: Node's built-in `node:test` + `assert`, matching
  `hooks/lib/lifecycle.test.cjs`. No new dependencies.
- **Test Data Management**: Fixture `FOLLOWUPS.md` strings parsed directly; temp
  dirs for IO-touching functions. Pure parse/dedupe/cap logic tested without the
  filesystem where possible (mirrors the lifecycle pure-core approach).
- **CI/CD Integration**: Add the new test file to the existing `test:unit` script
  in `package.json`; runs under the existing `ci.yml` job.
- **Coverage Requirements**: Every AC in § 5 has at least one corresponding test.
- **Performance Testing**: A smoke test asserting `count()` (cold-start path)
  reads and scans a ~20-item file well within the SessionStart budget.

# 7. Rationale & Context

- **Why a committed markdown file, not JSON or CLAUDE.md.** The user wants to open
  and edit the list by hand, see it in PRs, and share it with the team — markdown
  checkboxes are ideal. A JSON store would be robust but unpleasant to hand-edit.
  `CLAUDE.md` is durable *instructions*, always loaded into context; mixing a
  churning task queue into it would bloat every session and conflate two very
  different things. A dedicated `FOLLOWUPS.md` mirrors the `.mad/` "objective,
  committed" pattern while staying human-first.
- **Why auto-capture with smart cleanup, not consent-gated capture.** The failure
  mode being fixed is "I acknowledge a good idea and then forget it." Any capture
  step that can be skipped ("Note and continue") reproduces that failure. So
  capture is frictionless and automatic; the burden moves to *cleanup*, which is
  where intelligence is affordable: deterministic for linked items, assisted and
  consent-gated for the free-text majority.
- **Why the cold-start (`startup`/`resume`) gate.** In this project `/clear` is a
  constant, deliberate mid-workflow act (speccy → build handoff via the waybill).
  Surfacing a backlog then is noise at the worst time — and the waybill already
  owns the `/clear` moment. A genuine launch/reconnect is when the user "sits
  down" and has bandwidth to pick up an old idea. Gating via a dedicated
  `hooks.json` matcher (`startup|resume`) is cleaner than reading the payload
  source in code.
- **Why the ledger is distinct from tasks and memory.** `TaskCreate` items are
  active, session-scoped work; auto-memory is curated durable facts; the
  pending-build marker is a single next-action. None is a bounded, categorized,
  committed *backlog of ideas that survives clone and clear*. The ledger fills
  that gap and links to tasks (promote an item to active work) rather than
  duplicating them.
- **Why cap at ~20 with FIFO eviction.** A backlog you cannot scan is a backlog
  you ignore. A hard, visible ceiling with logged eviction keeps the list
  actionable and honest; combined with two-track cleanup it stays current.

# 8. Dependencies & External Integrations

### Infrastructure Dependencies
- **INF-001**: `hooks/session-guard.cjs` — hosts the cold-start hint and the
  `followups-*` subcommands.
- **INF-002**: `hooks/hooks.json` — new `startup|resume` `SessionStart` entry.
- **INF-003**: `hooks/lib/state.cjs` — reused if a per-user hint-cadence timestamp
  is later added (PAT-002); not required for v1.
- **INF-004**: `hooks/lib/lifecycle.cjs` — consulted by `autoResolveLinked` for
  `rec:` link resolution; `/next` gains the cross-reference line.

### Data Dependencies
- **DAT-001**: `FOLLOWUPS.md` — the committed ledger (produced and consumed by the
  module).
- **DAT-002**: `TaskGet`/task state, `.mad/state/*` markers, and git merge state —
  read by the deterministic cleanup track.

### Technology Platform Dependencies
- **PLT-001**: Node.js ≥ 18 (existing hook runtime). No new runtime dependencies.
- **PLT-002**: `git` CLI (commit of `FOLLOWUPS.md`; PR/commit link resolution).
- **PLT-003**: The `SessionStart` hook `source` values `startup`/`resume`/`clear`/
  `compact` (Claude Code hook contract) — the basis for REQ-042 gating.

# 9. Examples & Edge Cases

- **Happy path**: `/ship` merges a PR → debrief surfaces "add retry to CI poller"
  and "rig-refresh predicate is shallow (task #15 created)" → both auto-captured
  (the second linked `task#15`) → next morning the user launches Claude Code
  (`startup`) → passive hint `📌 2 open follow-ups — /followups` → `/followups`
  lists them → user resolves one, promotes the other.
- **Handoff, no noise**: user runs `/speccy`, then `/clear` to hand off to
  `/build`. `SessionStart` source is `clear` → no follow-ups hint (only the
  waybill resumes). The backlog waits for a real cold start.
- **Linked auto-resolve**: item linked `task#15`; the user completes task 15 in a
  later session → on the next `review`/cold-start the item silently moves to
  Archive with `resolved:<date>`.
- **Assisted review, kept**: a free-text item "show muted recs in /next" has no
  matching change; `/followups review` lists it as "no matching change found —
  keep" and leaves it open.
- **Cap eviction**: the ledger holds 20 open items; a 21st is captured → the
  oldest `low` item is archived and the capture reports
  `evicted: "<title>" (cap 20)`.
- **Dedup**: two cycles surface the same idea in slightly different words → one
  open item, date refreshed to the latest sighting.
- **Malformed file**: a hand-edit breaks a checkbox line → operations degrade to
  no-op, `count()` returns 0, nothing is blocked; the next successful write
  normalizes the file.

# 10. Validation Criteria

- All ACs in § 5 pass as automated `node:test` cases.
- `FOLLOWUPS.md` round-trips through parse → serialize without loss for a
  representative fixture (including links, archive, empty categories).
- The cold-start hint fires on `startup`/`resume` and is silent on
  `clear`/`compact`, verified via the subcommand and matcher.
- Running the full flow on this repository leaves a well-formed, committed
  `FOLLOWUPS.md` and never blocks a session or hook.
- `/next` shows the cross-reference only when the ledger is non-empty.

# 11. Related Specifications / Further Reading

- `specs/lifecycle-recommendation-engine.md` — the sibling engine; shares the
  shared-module pattern, the Session Guard ambient surface, `/next`, and the
  committed-objective vs per-user-subjective store split.
- `hooks/session-guard.cjs`, `hooks/hooks.json`, `hooks/lib/state.cjs` — host
  surfaces and wiring.
- `skills/build/SKILL.md` (Stage 10 Debrief), `skills/ship/SKILL.md` — the
  capture points.
- `skills/next/SKILL.md` — the pull-surface pattern the `/followups` command
  follows, and the cross-reference host.

## Implementation Plan (sequencing)

1. **Module core** (`hooks/lib/followups.cjs`): markdown parse/serialize,
   item model, dedupe, cap/eviction, category mapping. Pure-logic unit tests.
2. **State transitions**: `capture`, `resolve`, `dismiss`, `add`, Archive
   handling; temp-dir integration tests.
3. **Deterministic cleanup** (`autoResolveLinked`): task#/spec:/rec:/pr# link
   resolution against existing state.
4. **Session Guard surface**: `followups-hint` (+ `hooks.json` `startup|resume`
   entry), `followups-list`/`-capture`/`-resolve`/`-dismiss`/`-add` subcommands.
5. **`/followups` skill**: banner, pre-flight, list/review/resolve/dismiss/add;
   assisted-review flow (REQ-031/032). Register in manifest + CLAUDE.md.
6. **Capture wiring**: `/build` Stage 10 and `/ship` debrief auto-capture +
   display existing open ledger; `task#` linking on "Create task".
7. **`/next` cross-reference**: one-line pointer when the ledger is non-empty.
