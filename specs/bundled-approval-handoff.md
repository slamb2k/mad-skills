---
title: Bundled Approval Handoff — Worktree, Branch, Spec Commit & Draft PR at Spec-Stable Time
version: 1.0
date_created: 2026-07-21
last_updated: 2026-07-21
tags: [process, tool, speccy, build, worktrees, handoff]
autonomy_ready: true
---

# Introduction

`specs/unified-autonomous-build.md` (merged 2026-07-20, PR #115) made
worktree/branch creation `/speccy`'s literal first action — before the
interview, before the spec has any content (its REQ-001). Working with that
design surfaced a cleaner model: no git activity at all until the spec is
approved, then one atomic-feeling bundle that performs the entire handoff —
sync base, create worktree+branch, materialize and commit the spec, push,
open the draft PR — immediately before the stop-and-marker handoff to
`/build`. The important property is not *when* each step happens
individually but that **they always happen together, every time**, at the
moment the spec becomes stable.

## 1. Purpose & Scope

**Purpose.** Replace the worktree-first model with a bundled
handoff-at-approval model: `/speccy` (both `--auto` and interactive) runs
its entire interview/inference flow in the plain working directory, and
only once the spec is approved executes the handoff bundle, then stops with
the pending-build marker exactly as today.

**Relationship to `unified-autonomous-build.md`.** This spec **amends** it:

- **Superseded:** its REQ-001 (worktree as literal first action, both
  modes). Worktree creation moves to the post-approval bundle.
- **Timing-amended:** its REQ-014 (early draft PR). The draft PR is now
  created by `/speccy` inside the bundle, even earlier than "at or before
  first substantive implementation work" — `/build`'s own Early-draft-PR
  dispatch remains as the idempotent backstop when the bundle's PR step
  degraded (§4, GR-001).
- **Unchanged:** the eligibility gate, zero-interview inference, small-task
  template, `/build`'s three-step self-evaluation, worktree-refusal
  (REQ-009 — `/build` still never creates its own worktree), `/ship`'s
  create-pr.sh mechanics, `/sync` worktree cleanup, and the stop-and-marker
  handoff (no same-turn auto-invoke of `/build`).

**Out of scope (explicit, confirmed with the user):**

- Feature-tracker and Slack-thread linking — dropped entirely; no external
  tracker or Slack integration exists or is being built.
- Persisting the PR URL anywhere — PR existence/URL is always re-derived
  live from the branch name (§4).
- Same-turn auto-chaining into `/build` — stop-and-marker stays.
- Detection/repair of the "spec committed but no PR" unlinked state beyond
  the retry command the failure report prints — logged as a LOGBOOK
  follow-up, not built here.

## 2. Definitions

- **Approval moment**: the point where the user confirms the Decision
  Summary (interactive) or zero-interview inference completes and passes
  its checks (`--auto`) — the spec content is final.
- **Handoff bundle**: the ordered eight-step sequence (§3 REQ-002) run once
  at the approval moment.
- **Freeze / content hash**: a SHA-256 hash of the finalized spec body
  computed at the approval moment and recorded in frontmatter as proof of
  exactly what was approved.
- **Unlinked state**: spec committed and pushed but no open PR exists on
  its branch (bundle step 7 degraded).

## 3. Requirements, Constraints & Guidelines

- **REQ-001**: `/speccy` MUST NOT create a worktree, branch, or any git
  state before the approval moment, in **both** `--auto` and interactive
  modes. The interview, eligibility gate, and zero-interview inference all
  run in the invoking working directory. Supersedes
  `unified-autonomous-build.md`'s REQ-001.
- **REQ-002**: At the approval moment, `/speccy` MUST run the handoff
  bundle in this order:
  1. **Freeze** — compute the content hash over the finalized spec text.
  2. **Sync base** — fetch and pull the remote default branch so the
     feature branches off the current base (active sync, not the old
     advisory-only warning).
  3. **Create worktree + branch together** — one operation, same mechanism
     as today (`references/autonomous-worktree-lifecycle.md`; harness
     `EnterWorktree` / Superpowers fallback), sentinel file included for
     `--auto` runs.
  4. **Materialize the spec** inside the worktree with the new frontmatter
     fields (§4).
  5. **Commit** the spec as the branch's first commit.
  6. **Push** the feature branch.
  7. **Create the draft PR** via `skills/ship/scripts/create-pr.sh --draft`
     (idempotent; reuses an existing open PR rather than erroring).
  8. **Marker + stop** — write the pending-build marker, display
     `/build {spec path}`, stop. Identical to today's handoff.
- **REQ-003**: Steps 1–6 are **blocking**: if any fails, `/speccy` MUST
  stop the bundle, report exactly which step failed, and leave all
  already-succeeded state in place for inspection. It MUST NOT write the
  pending-build marker on a step-1–6 failure.
- **REQ-004**: Step 7 (draft PR) is **best-effort**: on failure (missing
  `gh`/`az`, network, auth), `/speccy` MUST report the failure with the
  exact `create-pr.sh` retry command, then still proceed to step 8. A
  missing PR never blocks the handoff (AC-004).
- **REQ-005**: The spec's frontmatter MUST gain three fields, all knowable
  before the commit: `content_hash`, `branch`, `worktree_path`. No
  `pr_url` field — resolved on demand (§4).
- **REQ-006**: "Is there a PR for this spec" MUST always be answered by a
  live lookup on `branch` (`gh pr list --head` / `az repos pr list
  --source-branch`) — the same lookup `create-pr.sh` performs internally.
  Resolving an unlinked state is the same idempotent `create-pr.sh` call,
  run again.
- **CON-001**: No same-turn auto-invoke of `/build`. Stop-and-marker is
  retained verbatim.
- **CON-002**: `/build`'s worktree-refusal check (REQ-009 of the merged
  spec) is unchanged — with the bundle in place it simply always finds the
  worktree the bundle created.
- **GUD-001**: `/build`'s existing Early-draft-PR dispatch stays as the
  backstop: since `create-pr.sh` is idempotent, it reuses the bundle's PR
  in the normal case and creates one in the degraded case.

## 4. Interfaces & Data Contracts

### New spec frontmatter fields

```yaml
content_hash: sha256:<hex>   # hash of approved spec body at freeze time
branch: feat/<slug>          # feature branch the bundle created
worktree_path: <abs path>    # worktree the bundle created
```

### PR resolution contract

No PR URL is persisted. Consumers needing the PR resolve it live from
`branch`. The degraded/unlinked state is detected the same way (lookup
returns nothing) and repaired with the same `create-pr.sh --draft` call the
bundle uses.

## 5. Acceptance Criteria

- **AC-001**: Given any `/speccy` run (either mode), When the interview or
  inference is still in progress, Then no worktree, branch, commit, or PR
  exists yet.
- **AC-002**: Given the approval moment, When the bundle runs, Then
  freeze→sync→worktree+branch→materialize→commit→push→draft-PR→marker
  execute in that order, and the committed spec's frontmatter contains
  `content_hash`, `branch`, and `worktree_path`.
- **AC-003**: Given a step-1–6 failure, When the bundle aborts, Then the
  failure names the exact step, succeeded state is left intact, and no
  pending-build marker is written.
- **AC-004**: Given step 7 fails, When the bundle completes, Then the
  worktree/branch/commit/push all stand, the report includes the exact
  retry command, and the pending-build marker IS written.
- **AC-005**: Given the bundle's PR exists, When `/build` runs its
  Early-draft-PR dispatch, Then `create-pr.sh` returns `reused=true` and
  no duplicate PR is created.

## 6. Test Automation Strategy

- **Evals** (`skills/speccy/tests/evals.json`): rewrite the two
  worktree-first-action cases (`speccy-auto-worktree-first-action`,
  `speccy-interactive-worktree-first-action`) to assert the bundled-at-
  approval ordering; add cases for AC-001, AC-003 (blocking failure), and
  AC-004 (PR degradation). `skills/build/tests/evals.json`: update
  `build-early-draft-pr` to reflect the reuse-normal/create-degraded
  backstop framing.
- **Unit tests**: content-hash computation if implemented as a script;
  otherwise eval-level only, matching existing conventions.
- **Docs to update**: `references/autonomous-worktree-lifecycle.md`
  (Creation section — approval-time, not first-action),
  `skills/speccy/references/autonomous-interview.md` (Stage 0 moves into a
  new bundle stage after approval), `skills/speccy/SKILL.md`,
  `skills/build/references/autonomous-pipeline.md` (Early-draft-PR section
  gains the backstop framing), root `CLAUDE.md` if it names the ordering.

## 7. Rationale & Context

**Why bundle-at-approval beats worktree-first.** The worktree-first model
paid its cost (a worktree for every interview, including abandoned ones)
to guarantee `/build` always had a worktree. Bundling at approval keeps
that guarantee — the bundle always runs before the marker — while never
creating git state for specs that don't survive the interview, and it
brings push + draft PR forward so the PR exists before `/build` starts,
closing the gap where REQ-026's mid-build questions needed a PR that only
`/build` would create.

**Why the PR URL is never persisted.** The PR is uniquely derivable from
its source branch via the exact lookup `create-pr.sh` already performs.
Persisting it would require amending the just-pushed commit (force-push) or
a second commit; deriving it live costs one CLI call and makes "check the
spec-PR link and resolve it later" the same operation as creating it.

**Why steps 1–6 block but step 7 doesn't.** Steps 1–6 produce the local,
required substrate (`/build` refuses without the worktree). Step 7 needs
network + platform auth, and its absence is cheaply repairable later by
rerunning the same idempotent script — so it degrades instead of blocking.

## 8. Dependencies & External Integrations

- **EXT-001**: GitHub / Azure DevOps via existing `create-pr.sh` — no new
  platform surface.
- **INF-001**: Git worktrees — creation mechanism unchanged; only timing
  moves.
- **PLT-001**: `sha256sum` (or `shasum -a 256` fallback) for the content
  hash — standard on all target platforms.

## 9. Examples & Edge Cases

**Happy path (interactive):** interview concludes, Decision Summary
confirmed → hash computed → main synced → worktree+branch created →
spec written with the three new fields → committed → pushed → draft PR
opened → marker written, `/build specs/foo.md` displayed, stop.

**Degraded PR (AC-004):** same as above but `gh` is not installed. Bundle
reports: "Draft PR could not be created (gh not found). Retry later with:
`bash skills/ship/scripts/create-pr.sh github ...`" — marker still written,
`/build` still runnable; `/build`'s own Early-draft-PR backstop will create
the PR when it runs.

**Abandoned interview:** user walks away mid-interview or the spec never
stabilizes. Nothing to clean up — no worktree, branch, or commit was ever
created.

**Base moved during a long interview:** step 2's active sync pulls the new
base before branching, so the feature always branches off current main —
replacing the old advisory-only warning.

## 10. Validation Criteria

- AC-001 through AC-005 pass against a real run.
- The two superseded worktree-first evals are rewritten (not deleted) and
  pass under the new ordering.
- A full `/speccy` → `/build` chain produces exactly one PR (bundle
  creates, `/build` reuses).
- Existing `unified-autonomous-build.md` evals not named in §6 pass
  unchanged.

## 11. Related Specifications / Further Reading

- `specs/unified-autonomous-build.md` — amended by this spec (REQ-001
  superseded, REQ-014 timing-amended).
- `references/autonomous-worktree-lifecycle.md` — creation-timing section
  to be updated by this spec's implementation.
- `LOGBOOK.md` — new follow-up logged by this spec: detection/resolution
  mechanism for the unlinked (spec-committed-but-no-PR) state.

## Definition of Done

- [ ] Neither `/speccy` mode creates any git state before the approval
      moment (AC-001).
- [ ] The eight-step bundle runs in order at approval, producing worktree,
      branch, first-commit spec with the three new frontmatter fields,
      push, and draft PR (AC-002).
- [ ] Step-1–6 failures block with a named step and no marker (AC-003);
      step-7 failure degrades with a retry command and still writes the
      marker (AC-004).
- [ ] `/build` reuses the bundle's PR (`reused=true`, AC-005).
- [ ] Evals in §6 rewritten/added and passing; unrelated evals unchanged.
- [ ] LOGBOOK follow-up for unlinked-state detection captured.

## Assumption Authorization

- **Ambiguity**: exact hash input (full file vs body-below-frontmatter).
  **Authorized decision**: hash the spec body below the frontmatter block,
  since frontmatter itself contains the hash field.
  **Must report**: the PR notes the hash scope.
- **Ambiguity**: branch naming when the slug collides with an existing
  branch.
  **Authorized decision**: suffix `-2`, `-3`, … as needed; report the
  final name.
  **Must report**: chosen branch name appears in the report and
  frontmatter.
- **Ambiguity**: whether step 2's sync also handles a dirty working tree.
  **Authorized decision**: reuse `/sync`'s existing stash-restore behavior
  rather than inventing new handling.
  **Must report**: any stash activity is surfaced in the bundle report.
