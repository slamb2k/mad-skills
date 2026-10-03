---
title: Unified Session Handoff — One Signal Primitive for /ferry and /speccy → /build
version: 1.0
date_created: 2026-10-03
last_updated: 2026-10-03
tags: [tool, process, fix, architecture]
autonomy_ready: true
branch: feat/unified-session-handoff
worktree_path: .claude/worktrees/unified-session-handoff
---

# Introduction

MAD Skills has two separate "carry state into the next session" mechanisms:
`/ferry`'s waybill signal and `/speccy`'s pending-build marker. They were built
independently, use different stores, keys, lifetimes and surfacing paths, and
the `/speccy` one is effectively broken: after `/speccy` finishes and the user
`/clear`s, the fresh session usually shows nothing about the pending build.

This spec (a) records the root cause of that bug, (b) ships an immediate fix,
and (c) consolidates both mechanisms behind one handoff primitive so every
session-to-session handoff (`/ferry`, `/speccy` → `/build`, `/build --handoff`,
autonomous checkpoints) behaves the same way.

## 1. Purpose & Scope

**In scope:** `hooks/session-guard.cjs`, `hooks/lib/state.cjs`, a new
`hooks/lib/handoff.cjs`, `hooks/hooks.json`, `skills/ferry/scripts/ferry.sh`,
`skills/ferry/SKILL.md`, `skills/speccy/SKILL.md`,
`skills/speccy/references/autonomous-interview.md`, `skills/build/SKILL.md`
(marker clear + Stage 9 checkpoint), `hooks/lib/lifecycle.cjs` (suppression
read), tests and evals.

**Out of scope:** waybill document content/template, `/build`'s
find-or-create, the logbook ledger.

## 2. Definitions

- **Waybill signal** — `/tmp/claude-ferry/<cksum(cwd)>.signal`, one line holding
  an absolute waybill path. Written by `ferry.sh signal`, consumed by
  `ferry.sh load` at SessionStart.
- **Pending-build marker** — `~/.claude/session-guard/<md5(cwd)>-pending-build.json`
  (`{specPath, projectDir, timestamp}`), written by `state.savePendingBuild`,
  cleared only by `/build` pre-flight.
- **Handoff** — the unified record proposed here (§4).

## 3. Current State (as-is analysis)

### 3.1 Side-by-side

| Aspect | `/ferry` waybill | `/speccy` pending-build marker |
|---|---|---|
| Writer | `skills/ferry/scripts/ferry.sh signal` | `state.savePendingBuild` via inline `node -e` |
| Store | `/tmp/claude-ferry/` | `~/.claude/session-guard/` |
| Key | `cksum` of shell `$(pwd)` | `md5` of `process.cwd()` |
| Payload | Pointer to a full waybill document | Spec path only |
| Lifetime | One-shot — deleted on first read | Persistent until `/build` clears it |
| Reader | `ferry.sh load` (SessionStart, synchronous) | `checkPendingBuild` in detached `check-bg` worker |
| Surfaced | Immediately at SessionStart as `additionalContext` | Deferred to the first UserPromptSubmit via `remind()` — **and gated (bug, §3.2)** |
| Model instruction | "Treat as primary context, read referenced files" | Two bare lines: `📋 Pending spec ready…` / `→ Run: /build …` |
| Side effects | none | Suppresses all lifecycle offers (`lifecycle.cjs:567`) while present |

**Conclusion: they are not consolidated under the covers.** They share nothing
but the SessionStart event. Interactive `/speccy` never creates a waybill at
all; only `/speccy --auto` invokes `/ferry` (`skills/speccy/SKILL.md:244`), and
in that case *both* mechanisms fire, producing two independent handoff signals
for the same transition.

### 3.2 Root cause: pending-build reminder is silently dropped

`remind()` (`hooks/session-guard.cjs:216`) only emits the guard body when it
contains a warning glyph:

```js
const hasWarnings = pending.context.includes('⚠️') || pending.context.includes('ℹ️');
```

`checkPendingBuild` (`hooks/session-guard.cjs:338`) writes its lines with `📋`
and `→`, so they never set `hasWarnings`. The body is emitted only if some
*unrelated* check (drift, missing task list, etc.) happens to add a ⚠️/ℹ️ line in
the same session. On a healthy repo the reminder never reaches the model.

Reproduced on 2026-10-03 against a scratch repo (session-guard v2.0.130):

- With an unrelated `ℹ️ Minor drift` line present → `Pending spec ready` emitted.
- With no drift → state file contains `📋 Pending spec ready for build`, but
  `remind` output does not (`(pending-build line NOT emitted)`).

Contributing factors that make it feel like "nothing happens" even when it fires:

1. **Deferred surfacing.** Nothing appears after `/clear` until the user types a
   prompt; the hint is then buried among setup reminders framed as "act on these
   using AskUserQuestion", so the model may treat it as noise.
2. **No waybill.** Interactive `/speccy` tells the user "the next session will
   remind you", but nothing carries decisions, rationale or the resume action as
   context — only a spec path.
3. **Key fragility.** Both mechanisms key on raw cwd, computed by different
   processes (`$(pwd)` / `process.cwd()` in the model's Bash shell vs the hook's
   `cwd` input). If the Bash shell has `cd`'d (e.g. into a subdirectory or a
   worktree) the marker is written under a key the next SessionStart never reads.

### 3.3 Other inconsistencies found

- `/speccy --auto` invokes `/ferry`, whose final step is "tell the user to
  `/clear`" — meaningless in an unattended run, and it double-arms with the marker.
- `/build` Stage 9 (`skills/build/SKILL.md:398`) invokes `/ferry` unconditionally,
  in interactive mode too, which asks the user to `/clear` mid-pipeline before
  `/ship`.
- The pending-build marker has no expiry; a forgotten spec suppresses lifecycle
  offers indefinitely.

## 4. Requirements, Constraints & Guidelines

### Phase 1 — immediate fix (ship independently)

- **REQ-001**: The pending-build reminder SHALL reach the model whenever a valid
  marker exists, independent of other checks. Implement by surfacing it
  synchronously at SessionStart (see REQ-004) or, minimally, by making `remind()`
  treat the pending-build line as emittable (e.g. an explicit `output.hasAction`
  flag set by `checkPendingBuild`, not glyph sniffing).
- **REQ-002**: The surfaced text SHALL instruct the model to tell the user the spec
  is ready and offer `/build {specPath}` — not frame it as a setup question.
- **REQ-003**: Add a regression test in `tests/session-guard.test.cjs`: marker
  present + no other signals → `remind` (or SessionStart) output contains the
  spec path.

### Phase 2 — consolidation

- **REQ-004**: Introduce `hooks/lib/handoff.cjs` as the single handoff store with
  `arm(projectDir, record)`, `peek(projectDir)`, `consume(projectDir)`,
  `clear(projectDir, kind)`. All writers and readers go through it.
- **REQ-005**: Handoff record schema (§5). One record per project; arming
  overwrites (latest wins, matching current `/ferry` semantics).
- **REQ-006**: Key = md5 of the **repository root** — the realpath of the parent
  of `git rev-parse --path-format=absolute --git-common-dir` (shared by the main
  checkout and all linked worktrees); fallback: realpath of cwd outside git.
  Writers resolve the key from git, not the shell's cwd. Fixes §3.2 factor 3 and
  lets `/build` (in its worktree) clear a build handoff armed by `/speccy` in the
  main checkout. Each slot also stores the arming **toplevel**; the `waybill` slot
  is only injected into a session whose toplevel matches, so a `/ferry` in one
  worktree never surfaces in another. The `build` slot is repo-wide.
- **REQ-007**: A single synchronous SessionStart subcommand
  (`session-guard.cjs handoff`, matcher `startup|clear|compact|resume`) reads the
  record and emits `additionalContext` immediately. It replaces both
  `ferry.sh load` and `checkPendingBuild`.
- **REQ-008**: Two lifetimes, one store:
  - `waybill` content is injected **once** (`injected: true` set after first emit).
  - `resume` action (e.g. `/build specs/x.md`) is re-surfaced as a one-line
    reminder on each new session until **cleared by the consuming skill**
    (`/build` pre-flight) or expired.
- **REQ-009**: Records expire after 14 days (configurable in `config.cjs`);
  expired or pointing at a missing spec/waybill → silently removed.
- **REQ-010**: `ferry.sh signal|load` remain as thin wrappers over `handoff.cjs`
  for backward compatibility; `load` additionally drains any legacy
  `/tmp/claude-ferry/*.signal` once.
- **REQ-011**: `/speccy` (both modes) arms a handoff of kind `build` with
  `resume: "/build {specPath}"` and `specPath`. It does **not** invoke `/ferry`
  and does not write a separate waybill — the spec is already the self-contained
  artifact (spec template requires it). The SessionStart injection synthesises a
  short brief: spec path, title, `autonomy_ready`, and the resume action, and tells
  the model to read the spec before acting.
- **REQ-012**: `/ferry` arms a handoff of kind `waybill` with `waybillPath` and an
  optional `resume` taken from the waybill's first next-step.
- **REQ-013**: `/build --handoff` arms kind `build` with both `waybillPath`
  (captured plan + clarifications) and `resume`. `/build` pre-flight calls
  `handoff.clear(projectDir, 'build')` in place of `clearPendingBuild`.
- **REQ-014**: `lifecycle.cjs` suppression reads `handoff.peek()` (kind `build`)
  instead of `loadPendingBuild`.
- **REQ-015**: `state.savePendingBuild/loadPendingBuild/clearPendingBuild` become
  deprecated shims delegating to `handoff.cjs`; existing markers are migrated on
  first read.
### Phase 3 — cleanup (own artifacts only)

Today nothing ever deletes a waybill: the signal is consumed, but `waybill.md`
(and its `.git/info/exclude` line) stays in the repo root indefinitely, hidden
from `git status`. Observed 2026-10-03: `~/work/big-live-website/waybill.md`
left behind one minute after its signal was consumed.

- **REQ-016 (ownership)**: Every handoff records each artifact it references
  with an `owned` flag. Only artifacts that MAD Skills **created** are owned:
  `/ferry` and `/build --handoff` waybills → `owned: true`; `/speccy` specs →
  `owned: false` (the spec is the user's tracked deliverable and is never
  deleted by handoff code). Cleanup SHALL only ever touch `owned: true` artifacts.
- **REQ-017 (provenance)**: `ferry` writes a first-line provenance stamp into
  every waybill: `<!-- mad-skills:waybill id=<uuid> -->`, and records the
  `id` plus the SHA-256 of the written content in the handoff record.
- **REQ-018 (delete guard)**: An owned artifact is deleted only when **all** hold:
  (a) its path is in a handoff record for this project, (b) the file's first line
  carries the matching `id`, (c) its current SHA-256 equals the recorded hash
  (unedited since written). If (b) or (c) fails, the file is left alone and the
  record is dropped with a one-line notice ("waybill.md was edited — kept").
- **REQ-019 (when)**: A sweep runs inside the SessionStart `handoff` subcommand,
  for the **current project's record only**, and deletes an owned waybill when:
  - it has been injected **and** a later session has started (i.e. the session
    after the resuming one) — the resuming session can still re-read it; or
  - a newer handoff of the same kind replaces it (re-`/ferry`); or
  - the record expires (REQ-009).
- **REQ-020 (exclude line)**: `ferry` writes its `.git/info/exclude` entry as
  `waybill.md # mad-skills:ferry`. Cleanup removes only lines carrying that tag,
  and only when no owned waybill remains at that path.
- **REQ-021 (default location)**: `/ferry` default (`repo`) mode writes the
  waybill outside the working tree, to
  `~/.claude/session-guard/handoff/<key>/waybill.md`, so nothing litters the repo.
  The in-repo root location becomes the opt-in `/ferry here`; `/ferry tmp` is
  folded into the default. `/ferry commit` (`docs/ferry/…`) is intentionally
  durable: recorded `owned: false`, never swept.
- **REQ-022 (manual + legacy)**: `/ferry clean` lists and removes owned artifacts
  for the current project (dry-run by default, `--yes` to delete). Pre-provenance
  legacy files (root `waybill.md` whose first line matches `# Waybill — ` and which
  is listed in `.git/info/exclude`) are **reported, never auto-deleted**; `/ferry
  clean --legacy` deletes them after confirmation.
- **CON-003**: The sweep never scans other projects, never globs the filesystem,
  and never deletes a path that is not named in a handoff record (except the
  confirmed `--legacy` path above).

- **CON-001**: No change to what the user must do: `/clear` remains user-only.
- **CON-002**: Hooks remain dependency-free Node (no jq requirement).
- **GUD-001**: Skills arm handoffs via one documented command, e.g.
  `node "$PLUGIN_ROOT/hooks/session-guard.cjs" handoff-arm --kind build --spec specs/x.md`,
  replacing inline `node -e require(...)` snippets.

## 5. Interfaces & Data Contracts

Store: `~/.claude/session-guard/handoff/<md5(gitTopRealpath)>.json`, holding
one slot per kind so a `/ferry` never overwrites a pending build:

```json
{
  "version": 1,
  "projectDir": "/abs/git/toplevel",
  "slots": {
    "build": {
      "source": "speccy | build-handoff",
      "resume": "/build specs/x.md",
      "artifacts": [
        { "role": "spec", "path": "specs/x.md", "owned": false },
        { "role": "waybill", "path": "/abs/.../waybill.md", "owned": true,
          "id": "<uuid>", "sha256": "<hex>" }
      ],
      "createdAt": 1759450000000,
      "injectedAt": null
    },
    "waybill": { "source": "ferry | auto-checkpoint", "resume": "…", "artifacts": [ … ] }
  },
  "kept": [ { "path": "/abs/.../waybill.md", "id": "<uuid>", "keptAt": 1759450000000 } ]
}
```

`kept` lists edited owned waybills that a sweep/clear/replace refused to delete;
`handoff-clean` reports them and `--yes` removes those whose stamp id still matches.

SessionStart output (kind `build`, first session):

```
[HANDOFF] The previous session (/speccy) wrote specs/x.md — "<title>"
(autonomy_ready: true). Next action: /build specs/x.md.
Tell the user this is ready and offer to run it. Read the spec before acting.
```

Subsequent sessions (already injected, not yet built): one line —
`[HANDOFF] Pending: /build specs/x.md (spec ready since <date>)`.

## 6. Acceptance Criteria

- **AC-001**: Given `/speccy` completes interactively, when the user `/clear`s on a
  repo with no other session-guard warnings, then the very first model turn knows
  the spec path and offers `/build {spec}`.
- **AC-002**: Given `/ferry`, when the user `/clear`s, the waybill content is
  injected exactly once; a second `/clear` does not re-inject it.
- **AC-003**: Given the arming skill ran with the Bash shell `cd`'d into a
  subdirectory, the handoff is still found at the repo root's next SessionStart.
- **AC-004**: Given `/build specs/x.md` starts, the `build` handoff is cleared and
  lifecycle offers resume.
- **AC-005**: Given `/speccy --auto`, exactly one handoff record exists afterward
  and no "type /clear" instruction is emitted.
- **AC-006**: A legacy `/tmp/claude-ferry/*.signal` or `*-pending-build.json`
  present before upgrade is honoured once and migrated.
- **AC-007**: A record older than 14 days, or whose spec/waybill is missing, is
  removed without output.
- **AC-008**: Given `/ferry` then `/clear` (resume session) then another `/clear`,
  the owned waybill and its tagged exclude line are gone after the third session
  starts; they still exist during the resume session.
- **AC-009**: Given a waybill the user edited after writing, no sweep deletes it.
- **AC-010**: Given a `build` handoff from `/speccy`, no code path ever deletes the
  spec file — after `/build` or on expiry, only the record is removed.
- **AC-011**: Given a root `waybill.md` without a provenance stamp, the sweep does
  not touch it; `/ferry clean` reports it as legacy.
- **AC-012**: Given a pending build, running `/ferry` keeps the `build` slot intact.

## 7. Test Strategy

- Unit: `hooks/lib/handoff.test.cjs` — arm/peek/consume/clear, key resolution
  (subdir, symlink, non-git), expiry, migration of both legacy formats.
- Integration: extend `tests/session-guard.test.cjs` — SessionStart `handoff`
  subcommand output for each kind, the Phase 1 regression (REQ-003), one-shot
  injection across two simulated `clear` events.
- Evals: update `skills/speccy/tests/evals.json` (marker assertions → handoff arm,
  no `/ferry` in `--auto`), `skills/ferry/tests/evals.json`, and `/build`
  pre-flight assertions.

## 8. Rationale & Alternatives

- **Speccy writes a full waybill via `/ferry`** — rejected as default: duplicates
  the spec (drift risk), costs an LLM-authored document every run, and `/ferry`'s
  "now type /clear" ending conflicts with `--auto`. The synthesized brief gives the
  same first-turn outcome from data already on disk.
- **Just fix the glyph gate and keep two mechanisms** — that is Phase 1; on its
  own it leaves the deferred surfacing, cwd-key fragility, double-arming and the
  `--auto`/Stage 9 `/clear` prompts unresolved.
- **Store in `/tmp`** (ferry today) vs `~/.claude/session-guard` — choose the
  latter: survives reboot, colocated with other guard state, no world-readable dir.

## 9. Open Questions

All resolved 2026-10-03 (OQ-5 by the user; OQ-1–3 adopt the suggested defaults):

- [x] **OQ-1**: `/build` Stage 9 and `/speccy --auto` checkpoints arm a handoff
  silently (`source: auto-checkpoint`) and never instruct the user to `/clear`.
- [x] **OQ-2**: A pending `build` handoff appears in `/logbook`'s "on deck"
  section as the top item.
- [x] **OQ-3**: Expiry window is 14 days (configurable in `config.cjs`).
- [x] **OQ-4**: Per-kind slots (§5), so a `/ferry` never loses a pending build.
- [x] **OQ-5**: Out-of-tree default waybill location (REQ-021); `/ferry` prints the
  absolute path in its final message.
