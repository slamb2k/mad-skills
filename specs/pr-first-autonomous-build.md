---
title: PR-First Autonomous Build — /build Owns the Worktree Lifecycle
version: 1.0
date_created: 2026-07-23
last_updated: 2026-07-23
tags: [process, tool, architecture]
autonomy_ready: true
content_hash: sha256:e6bc4c3fef893f2caff3e7d10d464a92b1a8683d06c36f3a7a155f4e1d92d6f9
branch: docs/pr-first-autonomous-build
worktree_path: /home/slamb2k/work/mad-skills/.claude/worktrees/pr-first-autonomous-build
---

# Introduction

Today, `/speccy` creates the worktree, branch, commit, and draft PR at the
moment its spec is approved (an 8-step "handoff bundle"), and `/build`
refuses to run unless that worktree already exists. This was a deliberate
choice across three prior specs, defended specifically as a forcing
function: every autonomous build must trace back to a reviewable spec, not
a bare prompt.

This specification keeps that forcing function — `/build` still refuses to
run without a real spec file — but relocates *who acts on it*. `/build`
itself becomes responsible for finding or creating the worktree, branch,
and draft PR for a given spec. This one change is the hinge point of a
broader shift: `/build` becomes resumable (the same spec can be re-run
across interruptions or sequential phases), execution becomes front-loaded
and autonomous (all necessary questions asked once at the start, then a
bounded implement→review→verify loop runs unattended to completion), the PR
itself becomes the durable record of the work rather than the chat session,
and `/ship --auto` is redefined to mean genuine end-to-end autopilot
(including merge) rather than today's stop-at-PR behavior.

# 1. Purpose & Scope

**Purpose:** make `/build` own its own worktree lifecycle end-to-end —
creation, resumption, and (in cooperation with `/ship` and `/sync`)
teardown — while preserving the traceability guarantee that motivated the
current design, and while making autonomous execution the default shape of
a `/build` run rather than a guardrail buried in a reference document.

**Audience:** implementers of `skills/build/SKILL.md` and
`skills/build/references/autonomous-pipeline.md`, `skills/speccy/SKILL.md`,
`skills/ship/SKILL.md`, `skills/sync/scripts/sync.sh`, and
`hooks/lib/session-guard.cjs`'s lifecycle recommendation engine.

**In scope:**
- Moving worktree/branch/draft-PR creation from `/speccy`'s post-approval
  bundle into `/build`'s own pre-flight, as a find-or-create operation.
- A structural fix for the known orphaned-draft bug (LOGBOOK.md, 2026-07-22)
  by sequencing commit-before-worktree-creation.
- Lock- and PR-awareness in find-or-create, to prevent the known
  duplicate-PR-from-routing-around-a-lock failure mode (LOGBOOK.md,
  2026-07-23, reported from the `real-talk` project).
- Collapsing `/build`'s interaction model to exactly two checkpoints: a
  single front-loaded question round at the start, and a ship-readiness
  decision at the end — removing the mid-build PR-comment question
  mechanism entirely in favor of always deciding and recording.
- Promoting the existing `/goal`+`/loop` long-run guardrail from a
  reference-doc fallback to `/build`'s primary described execution
  mechanism.
- Redefining `/ship --auto` to mean full autopilot (CI-watch, fix-loop,
  merge, teardown) rather than today's stop-at-an-open-PR behavior.
- A new spec-level `completion_mode` frontmatter field that lets a
  ship-readiness decision be pre-set (skipping the live question) or left
  unset (asks, as today).
- Teardown: reusing `sync.sh`'s existing worktree-mode removal for the
  merged/auto-shipped path; adding closed-but-unmerged PR detection so an
  abandoned (not merged) PR's worktree is also recognized as finished; and
  an ambient staleness nudge for open, inactive `/build`-originated PRs via
  the existing session-guard Lifecycle Recommendation Engine.

**Out of scope:**
- Changing `/speccy`'s interview process itself (Stage 1/2 of
  `skills/speccy/SKILL.md` are unaffected — only its Output & Handoff
  section changes).
- Sequential/dependent branch stacking for phase-2-on-phase-1 specs before
  phase 1 merges (§9 documents this as a deliberate simplification: every
  spec's branch is created from current `origin/main` at find-or-create
  time, not from another still-open feature branch).
- Any change to `/build`'s Stage 1 (Explore), Stage 3 (Architect), Stage 5
  (Review), Stage 6 (Fix), Stage 7 (Verify), or Stage 8 (Docs) internals —
  this spec changes *when* and *how often* interaction happens around
  those stages, not what they individually do.
- A dedicated `/build --abandon` command — abandonment is expressed by
  closing the PR on GitHub/AzDO; `sync.sh` is taught to recognize that
  state (§3, REQ-014), not to originate it.

# 2. Definitions

| Term | Definition |
|---|---|
| **Find-or-create** | The operation `/build` runs as its first action against a spec: if the spec already has valid `branch`/`worktree_path` frontmatter pointing at a live worktree, resume it; otherwise create a new worktree/branch/draft-PR for it. |
| **Front-load checkpoint** | The single round of clarifying questions `/build` asks at the very start of a run, before the autonomous loop begins. Replaces today's Stage 2 "first checkpoint interview" — it is now the *only* interview checkpoint. |
| **Autonomous loop** | The bounded implement→review→verify cycle that runs after the front-load checkpoint, unattended, until every Definition-of-Done item is verified or a cap (iterations/budget/wall-clock) is hit. |
| **Ship-readiness** | The point after the autonomous loop completes (DoD met) where `/build` undrafts the PR, pushes final state, and either acts on a pre-set `completion_mode` or asks the user to choose one. |
| **`completion_mode`** | New optional spec frontmatter field (`pr` \| `auto-ship`). Set by `/speccy` (or hand-edited later) to pre-decide the ship-readiness outcome; absent means "ask at ship-readiness," today's behavior. |
| **PR-first** | The design principle that the PR (not the chat session) is the durable record of a build: evidence, logs, decisions, and any post-front-load clarification all attach to the PR, since a spec file is always the required input and the PR is always opened against it. |
| **Decide-and-record** | The per-decision self-evaluation's existing "not covered, not risky → decide, record a new Assumption Authorization entry, keep going" path (REQ-010/011 of `unified-autonomous-build.md`), now used unconditionally for every post-front-load ambiguity instead of escalating to an interview. |
| **Finished (branch)** | A branch `sync.sh` recognizes as safe to tear down: merged into the default branch, its upstream gone (squash-merge signature), OR (new, REQ-014) its PR is `CLOSED` without being merged. |

# 3. Requirements, Constraints & Guidelines

## Find-or-create (worktree/branch/PR ownership)

- **REQ-001**: `/build` MUST refuse to run without a real spec file
  argument resolvable to an existing `specs/*.md` (or equivalent) path.
  There is no bare-prompt/description-only invocation. This preserves the
  traceability forcing function of the design it replaces
  (`unified-autonomous-build.md` §7, `bundled-approval-handoff.md`
  "Unchanged" list) — only the *worktree precondition* is removed, not the
  spec precondition.
- **REQ-002**: Given a spec file, `/build`'s first action (before any other
  pre-flight check) is find-or-create: read the spec's frontmatter for
  `branch`/`worktree_path`. If both are present AND a live worktree exists
  at that path checked out on that branch, resume it (skip to REQ-006). If
  either is absent, or the referenced worktree no longer exists, proceed to
  creation (REQ-003–REQ-005).
- **REQ-003 — Lock- and PR-awareness (closes the `real-talk` duplicate-PR
  failure mode).** Before creating a new worktree for a spec that has no
  valid existing one, `/build` MUST check: (a) whether a branch matching
  this spec's derived slug already exists locally or on the remote, and if
  so whether its worktree is currently locked; (b) whether an open PR
  already exists for that branch (`gh pr list`/AzDO equivalent). If a
  locked worktree or an open PR is found, `/build` MUST NOT create a
  second, competing worktree/branch — it reports the conflict (lock holder,
  or existing PR URL) and stops, rather than routing around it.
- **REQ-004 — Commit before worktree (structural fix for the orphaned-draft
  bug, LOGBOOK.md 2026-07-22).** Creation order is: (1) fetch/sync the
  default branch, (2) create a new branch pointed at current
  `origin/main` (or resume-target ref) *in the current working directory* —
  git branches are repo-wide, not worktree-local, so this requires no
  worktree yet, (3) update the spec's frontmatter in place with `branch`
  and (once known) `worktree_path`, and content-hash it, (4) commit that
  updated spec as the new branch's first commit, (5) **only then** create
  the worktree, checking out the already-populated branch (native
  `EnterWorktree`, or Superpowers' `using-git-worktrees` fallback — per
  `worktree-discipline-guardrails.md`'s standing constraint that mad-skills
  never invents its own worktree creation/teardown primitive). Because the
  spec is never written to disk uncommitted before the worktree exists,
  there is no window in which a pre-worktree draft can be orphaned in the
  invoking checkout — the bug class LOGBOOK.md recorded cannot recur by
  construction, not by added cleanup.
- **REQ-005**: After worktree creation, `/build` pushes the branch and
  opens a draft PR (reusing `skills/ship/scripts/create-pr.sh --draft`,
  idempotent as today). This subsumes `/build`'s existing "Early draft PR"
  step (`autonomous-pipeline.md` REQ-014) — it is no longer a backstop for
  a bundle that might have failed upstream; it is the only creation path.
- **REQ-006**: Whether resumed or freshly created, `/build` proceeds from
  here identically — resumption and fresh creation converge on the same
  front-load checkpoint (REQ-007) and autonomous loop (REQ-010).

## Interaction model

- **REQ-007 — Single front-load checkpoint.** `/build` asks all clarifying
  questions it can reasonably anticipate in one checkpoint, immediately
  after find-or-create and before implementation begins. "One checkpoint"
  means one continuous Q&A phase — it may span multiple `AskUserQuestion`
  calls if there are more than the tool's 4-question-per-call limit, the
  same as today's Stage 2 already does — but no second checkpoint occurs
  later in the run. This replaces today's Stage 2 "first checkpoint
  interview"; it is not an additional step.
- **REQ-008 — No mid-build interview escalation.** The per-decision
  self-evaluation's three-step check (`unified-autonomous-build.md`
  REQ-010/011) is retained, but its step 2 ("not covered, touches a
  risk-keyword/architectural-surface marker → interview at next
  checkpoint") is removed. Every ambiguity encountered after the front-load
  checkpoint follows step 1 (covered by Assumption Authorization → resolve
  silently) or the former step 3, now unconditional: decide, record a new
  Assumption Authorization entry in the spec, keep going. The mid-build
  question mechanism and its channel-adaptive PR-comment delivery
  (`autonomous-pipeline.md` REQ-012/013/024–028) are removed in their
  entirety — superseded by this requirement.
- **REQ-009 — Ship-readiness decision.** After the autonomous loop reports
  every Definition-of-Done item verified, `/build` undrafts the PR and
  pushes final state, then: if the spec's `completion_mode` frontmatter
  field is set, act on it silently (REQ-011/012, no question asked); if
  absent, present exactly two options via `AskUserQuestion`: "Finish here"
  (stop, report the PR URL and summary) or "`/ship --auto`" (hand off to
  full autopilot, REQ-013).
- **REQ-010**: The `/goal`+`/loop` long-run guardrail
  (`autonomous-pipeline.md` "Long-run guardrails" section) is promoted from
  a reference-doc fallback to `/build`'s primary described execution
  mechanism for the implement→review→verify cycle between REQ-007 and
  REQ-009. The manual-bounded-loop fallback (when `/goal`/`/loop` are
  unavailable) is retained unchanged, per that section's existing GUD-001
  ("a SHOULD, not a degraded path"). Caps default unchanged: `--iterations`
  20, `--budget` 5,000,000 tokens, wall-clock 4h — configurable via the
  same flags/env vars as today.

## `completion_mode` and `/ship --auto`

- **REQ-011**: New optional spec frontmatter field `completion_mode: pr |
  auto-ship`. `/speccy` MAY set it (via an explicit flag or an interview
  answer); it MAY also be hand-edited on the spec file directly at any
  time before `/build` reaches ship-readiness. Absent means "ask" (today's
  behavior, REQ-009).
- **REQ-012**: `/speccy` no longer writes a `.mad-skills-auto` sentinel
  file or a worktree-local `mode: auto` field for this purpose — the
  `--auto`/interactive distinction on `/speccy` continues to govern
  *speccy's own* interview mode (zero-interview eligibility gate vs. full
  interview) but no longer propagates any git-side autonomy state, since
  `/build`'s execution is now uniform regardless of how the spec was
  produced (REQ-008).
- **REQ-013 — `/ship --auto` redefined.** `--auto` on `/ship` now means
  full autopilot: CI-watch and fix-loop run exactly as today (2-attempt
  cap unchanged), and on green checks `/ship --auto` proceeds to merge
  (Stage 5) and post-merge sync/teardown (Stage 5b) exactly as interactive
  `/ship` does today, rather than stopping at Stage 5 as
  `autonomous-execution-mode.md` REQ-029 specified. This supersedes
  REQ-029 in full. The PR description remains the durable report
  (`autonomous-report.md`/REQ-030's assembly mechanism is unchanged) —
  it is now a record of what *was* merged, not a paused checkpoint.

## Teardown

- **REQ-014 — Closed-PR recognized as finished.** `sync.sh`'s "finished
  branch" check gains a PR-state lookup (`gh pr view <branch> --json
  state`/AzDO equivalent): a `CLOSED` state where the PR was not merged
  counts as finished, following the same safe-removal path (REQ-015) as a
  merged or gone-upstream branch. This closes the gap where an abandoned
  (closed, not merged) PR's worktree was previously treated as
  perpetually "unfinished" and rebased forever.
- **REQ-015 — Merge/auto-ship teardown is pure reuse.** No new teardown
  mechanism is built for the merged path: `sync.sh`'s existing
  worktree-mode removal (`worktree-aware-sync.md`, safe non-force
  `git worktree remove`, sentinel-aware, `-D` fallback only for the
  confirmed gone-upstream/squash-merge case, primary-checkout main-sync) is
  unchanged. `/ship --auto`'s Stage 5b (REQ-013) now reaches this logic on
  every autopilot run, the same as interactive `/ship` does today.
- **REQ-016 — Ambient staleness nudge.** The existing session-guard
  Lifecycle Recommendation Engine (`hooks/lib/lifecycle.cjs`, the mechanism
  already surfacing `🧭 lifecycle-next` suggestions) gains a new signal:
  open PRs whose branch/worktree carry `/build` provenance (detectable via
  the branch's association with a `specs/*.md` file, per REQ-004's
  frontmatter linkage) with no commit activity for longer than a
  configurable threshold are surfaced as a lifecycle recommendation
  ("this build has been open N days with no activity — resume, ship, or
  close it?"), using the engine's existing suppression/cooldown/dismissal
  conventions rather than a new notification channel.

## Constraints

- **CON-001**: The standing constraint from `worktree-discipline-guardrails.md`
  is unchanged: mad-skills never invents its own worktree creation or
  teardown primitive — it always delegates to native `EnterWorktree`/
  `ExitWorktree` or Superpowers' `using-git-worktrees`/
  `finishing-a-development-branch`, falling back to plain `git worktree`
  commands only when neither is available.
- **CON-002**: `/build` still MUST NOT create its own worktree when one
  cannot be resolved for reasons other than "none exists yet" — REQ-003's
  lock/PR conflict case is a stop condition, not something to silently
  route around.
- **CON-003**: No change to `/build`'s Stage 1/3/5/6/7/8 internals (see §1
  Out of scope) — model tiering (REQ-013 of `autonomous-execution-mode.md`),
  review-depth dispatch, evidence capture, and the per-decision
  self-evaluation's step 1/former-step-3 logic are all unchanged in
  substance, only step 2's removal (REQ-008) changes the decision tree.
- **CON-004**: `completion_mode: auto-ship` does not bypass CI or review —
  it only pre-answers the *ship-readiness* question. The autonomous loop
  (REQ-010) still runs Stage 5/6/7 (review/fix/verify) to completion before
  ship-readiness is ever reached, regardless of `completion_mode`.

## Guidelines

- **GUD-001**: Reuse existing scripts wherever the operation already
  exists — `create-pr.sh --draft` (REQ-005), `sync.sh`'s worktree-mode
  logic (REQ-015), the Lifecycle Recommendation Engine (REQ-016) — rather
  than reimplementing equivalent logic inside `/build` itself.
- **GUD-002**: Every autonomous decision under REQ-008's decide-and-record
  path must be reported — same discipline as today's Assumption
  Authorization reporting (`autonomous-pipeline.md` GUD-005), extended to
  cover what used to be interview-escalated ambiguities too.

# 4. Interfaces & Data Contracts

**Spec frontmatter (additions/changes to the existing template):**
```yaml
branch: <branch-name>              # unchanged — set by find-or-create (REQ-004)
worktree_path: <absolute-path>     # unchanged — set by find-or-create (REQ-004)
completion_mode: pr | auto-ship    # NEW, optional (REQ-011) — absent = ask at ship-readiness
```

**`sync.sh` — new PR-state check (REQ-014):** inserted into the existing
"finished branch" determination, after the current merged/gone-upstream
checks:
```bash
# existing: MERGED (git branch --merged) or GONE (git branch -vv shows [gone])
# new:
PR_STATE=$(gh pr view "$BRANCH" --json state --jq '.state' 2>/dev/null)
if [ "$PR_STATE" = "CLOSED" ]; then FINISHED=true; fi
```
AzDO equivalent: `az repos pr list --source-branch <branch> --status
completed --query "[?closedBy!=null && !mergedBy]"` or the REST equivalent,
matching this repo's existing dual-platform pattern.

**Lifecycle Recommendation Engine — new signal shape (REQ-016):**
```
{
  id: "stale-build-pr",
  branch: <branch>,
  spec: <specs/*.md path>,
  pr_url: <url>,
  days_inactive: <n>,
  recommendation: "resume | ship | close"
}
```
Feeds the same `lifecycle-next` output block `/logbook` and session-guard
already render — no new surface, an additional recommendation type on the
existing one.

**`/build`'s find-or-create decision, as a flow (not new code, describing
the control flow REQ-002–REQ-006 implement):**
```
spec has valid branch+worktree_path AND worktree exists?
  yes → resume (skip creation)
  no  → branch/worktree exists but locked or has an open PR? (REQ-003)
          yes → stop, report conflict
          no  → create (REQ-004, REQ-005)
```

# 5. Acceptance Criteria

- **AC-001**: Given a spec file with no `branch`/`worktree_path`
  frontmatter, when `/build {spec}` runs, then a new branch is created and
  the spec is committed to it (with updated frontmatter) *before* any
  worktree is created for that branch.
- **AC-002**: Given the same spec re-run after AC-001's worktree was
  removed by an external process (e.g. accidental `rm -rf`) but the branch
  still exists remotely, when `/build {spec}` runs again, then it detects
  the worktree is gone, and does not silently create a second competing
  branch — it either recreates the worktree against the existing branch or
  reports the conflict, never both branches coexisting for the same spec.
- **AC-003**: Given a spec whose branch already has a live, locked worktree
  (another session actively working it), when a second `/build {spec}` (or
  a different spec resolving to the same branch slug) runs, then it stops
  and reports the lock/PR conflict rather than creating a duplicate branch
  or PR — directly preventing the `real-talk` duplicate-PR incident.
- **AC-004**: Given a spec with `completion_mode: auto-ship`, when `/build`
  reaches ship-readiness with all DoD items verified, then it invokes
  `/ship --auto` directly with no `AskUserQuestion` prompt.
- **AC-005**: Given a spec with `completion_mode: pr`, when `/build` reaches
  ship-readiness, then it undrafts the PR, reports the PR URL, and stops —
  no `AskUserQuestion` prompt.
- **AC-006**: Given a spec with no `completion_mode` set, when `/build`
  reaches ship-readiness, then it presents exactly the two documented
  options via `AskUserQuestion` ("Finish here" / "`/ship --auto`").
- **AC-007**: Given `/ship --auto` runs to green CI on a PR, when Stage 5
  is reached, then it proceeds to merge (not stop) and Stage 5b's teardown
  runs identically to interactive `/ship`'s.
- **AC-008**: Given a PR is closed without merging, when `/sync` next runs
  from that worktree (or the general cleanup sweep encounters that
  branch), then the branch/worktree is recognized as finished and offered
  for the same safe removal path as a merged branch.
- **AC-009**: Given a `/build`-originated PR with no commits for longer
  than the configured staleness threshold, when the Lifecycle
  Recommendation Engine next evaluates, then a `stale-build-pr`
  recommendation surfaces through the existing `lifecycle-next` output,
  subject to the engine's existing cooldown/dismissal rules (not a new,
  unsuppressible nag).
- **AC-010**: Given an ambiguity arises during the autonomous loop (after
  the front-load checkpoint) that would previously have triggered a
  mid-build interview, when `/build` encounters it, then it decides
  autonomously, records the decision as a new Assumption Authorization
  entry in the spec, and continues — no PR comment is posted asking a
  question, no pause occurs waiting for a reply.
- **AC-011**: Given `/build` is invoked without a spec file argument (or
  with a path that doesn't resolve to an existing spec), then it refuses
  immediately with a message directing the user to run `/speccy` first —
  identical in spirit to today's worktree-refusal message, just naming the
  spec instead of the worktree as the missing precondition.

# 6. Test Automation Strategy

- **Colocated unit tests** (`hooks/lib/lifecycle.test.cjs`, extended):
  the new `stale-build-pr` signal (REQ-016) — synthesize a branch/spec
  pairing with an old last-commit date, assert the recommendation appears;
  assert existing cooldown/dismissal suppression still applies to it.
- **`skills/sync/scripts/sync-cleanup.test.js`, extended**: REQ-014's
  closed-PR detection — a real temp-repo test with a mocked/stubbed `gh
  pr view` response (matching this file's existing pattern for other
  `gh`/`az` command stubs) asserting a closed-not-merged branch is now
  treated as finished.
- **Eval cases** (`skills/build/tests/evals.json`, `skills/speccy/tests/evals.json`,
  `skills/ship/tests/evals.json`, extended): assert `/build`'s SKILL.md
  instructions describe find-or-create before any other pre-flight step
  (AC-001–AC-003 are behavioral/instructional, eval-asserted per this
  repo's existing convention for interactive-flow assertions, matching how
  AC-004/AC-005-style interactive-gating assertions were handled in
  `specs/logbook-archive-and-triage.md`); assert `/ship`'s SKILL.md now
  describes `--auto` proceeding to merge (AC-007); assert `/speccy`'s
  Output & Handoff section no longer describes sentinel-file writing.
- **No new CI changes** — existing `npm test` covers all of the above.

# 7. Rationale & Context

- **Why relocate creation instead of removing the precondition entirely:**
  the forcing function's actual value — "every autonomous build traces to
  a reviewable spec" — never depended on *where* the git state was
  created, only on *whether a spec was required first*. REQ-001 preserves
  that exactly; only the worktree-before-`/build` half of the precondition
  moves.
- **Why commit-before-worktree structurally fixes the orphaned-draft bug**
  (REQ-004): the bug's actual mechanism was a two-phase authoring flow —
  write draft, then separately materialize inside a freshly-created
  worktree that never inherited the draft — leaving the first copy
  orphaned. Reordering so the branch and commit exist *before* the
  worktree is created means there is only ever one copy: worktrees share
  the repo's object database, so a worktree checking out an
  already-committed branch sees that commit immediately, with no
  write-then-abandon window possible.
- **Why lock/PR-awareness is a stop condition, not a merge/join** (REQ-003):
  the `real-talk` incident's actual failure was routing *around* a lock
  into a second branch, producing a duplicate PR against already-merged
  work. The fix isn't smarter merging of concurrent work — it's refusing
  to start a second, competing line of work at all, and telling the
  operator what's already in flight.
- **Why the mid-build question mechanism is removed rather than kept as a
  headless fallback** (REQ-008): the explicit design goal is that the PR
  becomes the durable record and interaction surface, and `/build`'s own
  execution becomes genuinely unattended after the front-load checkpoint.
  A dual-mode "ask live if watched, PR-comment if not" mechanism was
  considered and rejected during design discussion — it re-introduces the
  same live/headless behavioral branch this spec otherwise eliminates
  (`/build`'s execution is uniform per REQ-008's framing), for a benefit
  (occasionally catching something an autonomous decision would have
  gotten wrong) that decide-and-record's existing reporting discipline
  (GUD-002) already covers by making every decision visible and
  reversible via normal PR review.
- **Why `completion_mode` lives on the spec, not a sentinel file**
  (REQ-011): the spec is the one artifact guaranteed to survive
  interruption and resumption (REQ-002 keys resumption off exactly this
  file); a worktree-local sentinel would not, and would also not exist yet
  at the moment `/speccy` might want to pre-set the preference (before any
  worktree exists under the new ownership model).
- **Why `/ship --auto`'s redefinition is a breaking change accepted
  deliberately, not additive**: `autonomous-execution-mode.md` chose
  stop-at-PR specifically to avoid an unattended merge; that rationale is
  superseded here because the actual safety net moves earlier —
  `completion_mode: auto-ship` is an explicit, spec-level, human-authored
  opt-in (set by whoever wrote or edited the spec) rather than a blanket
  behavior of the flag, so the "someone unintentionally triggers an
  unattended merge" risk the original design was guarding against no
  longer applies the same way.
- **Why teardown reuses `sync.sh` almost entirely** (REQ-015): the
  worktree-aware-sync spec already solved the hard parts (safe non-force
  removal, the `-D` fallback's squash-merge justification, primary-checkout
  main-sync) correctly; the only actual gap this spec's PR-first shift
  exposes is the closed-not-merged case, which didn't matter as much when
  bundled-approval-handoff's design assumed most PRs would either merge or
  simply never open (interview abandoned before the bundle ran).

# 8. Dependencies & External Integrations

- **INF-001**: `git` — worktree operations, branch creation, unchanged
  from current usage.
- **PLT-001**: `gh` CLI (GitHub) / `az repos`/REST (AzDO) — REQ-003's PR
  lookup, REQ-005's draft-PR creation (existing), REQ-014's PR-state check
  — all via existing dual-platform script conventions
  (`skills/ship/scripts/create-pr.sh`, `sync.sh`).
- **PLT-002**: Claude Code's native `EnterWorktree`/`ExitWorktree` tools,
  falling back to Superpowers' `using-git-worktrees`/
  `finishing-a-development-branch` skills, per CON-001 — unchanged
  dependency, relocated caller (now `/build` in the creation path, not
  only `/speccy`).
- **PLT-003**: `/goal` and `/loop` (Claude Code tooling), with the existing
  manual-bounded-loop fallback when unavailable — REQ-010, promoted from
  optional to primary but not newly introduced as a dependency.
- **INF-002**: `hooks/lib/lifecycle.cjs` (session-guard's Lifecycle
  Recommendation Engine) — REQ-016's new signal is additive to this
  existing component.

# 9. Examples & Edge Cases

- **Happy path (fresh spec, PR-first finish):** `/speccy` writes
  `specs/foo.md` with no `completion_mode`, no sentinel. User runs
  `/build specs/foo.md`. Find-or-create sees no `branch`/`worktree_path` →
  creates branch `foo` from current `main`, commits the frontmatter-updated
  spec, creates the worktree, pushes, opens draft PR. Front-load checkpoint
  asks 2 clarifying questions. Autonomous loop runs implement→review→verify
  to DoD. Ship-readiness: no `completion_mode` → `AskUserQuestion` →
  user picks "Finish here" → PR undrafted, URL reported, session ends.
- **Auto-ship path:** same as above but the spec has
  `completion_mode: auto-ship` (set by `/speccy --auto-ship` or hand-edited
  later). Ship-readiness silently invokes `/ship --auto`, which now merges
  and tears down via `sync.sh`'s existing worktree-mode logic (REQ-015).
- **Resumed interrupted run:** `/build specs/foo.md` hit the iteration cap
  partway through the autonomous loop and stopped-and-reported per
  existing cap discipline. Days later, `/build specs/foo.md` is run again.
  Find-or-create finds valid `branch`/`worktree_path`, the worktree is
  live and unlocked → resumes directly into the autonomous loop (no
  front-load re-ask; REQ-007 already happened on the first run and its
  answers are recorded in the spec/Assumption Authorization).
- **Sequential phase specs:** `specs/feature-phase-1.md` ships and merges.
  Later, `specs/feature-phase-2.md` (referencing phase 1 in its own
  Rationale section) is run through `/build`. Find-or-create creates
  phase 2's branch from current `main` (which now includes phase 1's
  merged work) — not from phase 1's now-gone branch. This is the
  deliberate simplification named in §1 Out of scope: no dependent-branch
  stacking before phase 1 merges.
- **Lock conflict avoided:** a session is mid-`/build` on `specs/foo.md`,
  its worktree locked. A second, stale local process also tries
  `/build specs/foo.md` (e.g., a retried CI job). Find-or-create's REQ-003
  check finds the lock, reports "already in progress at `<path>`, PR
  `<url>`," and stops — no second branch, no duplicate PR.
- **Abandoned build:** a `/build` PR sits open with `completion_mode`
  unset; the user never answers ship-readiness and eventually just closes
  the PR on GitHub instead. Next `/sync` (from any worktree, or the
  general sweep) sees `PR_STATE=CLOSED`, treats the branch as finished
  (REQ-014), and offers the same safe worktree/branch removal as a merged
  one.

# 10. Validation Criteria

1. `npm run validate && npm run lint && npm run test:unit` green with the
   new/updated `hooks/lib/lifecycle.test.cjs` and
   `skills/sync/scripts/sync-cleanup.test.js` cases.
2. Manual end-to-end (fresh spec): `/speccy` a small change with no
   `completion_mode` → `/build {spec}` from a clean checkout with no
   pre-existing worktree → confirm branch/commit/worktree/draft-PR are
   created in that order (commit exists on the branch before the worktree
   directory does) → confirm ship-readiness prompts exactly the two
   documented options.
3. Manual end-to-end (auto-ship): same as above with
   `completion_mode: auto-ship` set → confirm no `AskUserQuestion` at
   ship-readiness, confirm `/ship --auto` merges and the worktree/branch
   are cleaned up afterward.
4. Manual end-to-end (lock conflict): start a `/build` run, hold its
   worktree open/locked, attempt a second `/build` against the same spec
   from a different session → confirm it reports the conflict and creates
   no second branch or PR.
5. Regression: an existing spec with legacy `branch`/`worktree_path`
   frontmatter from before this ships still resolves correctly via
   find-or-create (no migration required — the field shapes are
   unchanged, only the writer/timing changes).

# 11. Related Specifications / Further Reading

This specification supersedes and amends, in the incremental chain each
prior spec's own "Related Specifications" section already documents:

- **`specs/worktree-discipline-guardrails.md`** — CON-001 (never invent a
  worktree primitive) carried forward unchanged; this spec's REQ-004
  extends where that primitive is invoked from, not what it is.
- **`specs/autonomous-execution-mode.md`** — REQ-029 (`/ship --auto` stops
  at PR) is superseded in full by this spec's REQ-013.
- **`specs/unified-autonomous-build.md`** — REQ-008 (`/build`'s `--auto`
  flag removed, autonomous-by-default is the only mode) is retained and
  extended: this spec's REQ-007/008 make that autonomy uniform regardless
  of trigger, closing the gap `unified-autonomous-build.md` left open.
  REQ-009 (worktree refusal via git-native detection) is superseded by
  this spec's REQ-002 (find-or-create). The rejected "let `/build`
  bootstrap its own worktree" decision from this spec's §7 Rationale is
  explicitly revisited and reversed here — see this spec's own Rationale
  for why the reversal doesn't undo the original concern.
- **`specs/bundled-approval-handoff.md`** — REQ-001 (no git state before
  approval) and REQ-002 (the 8-step handoff bundle) are superseded by this
  spec's REQ-002–REQ-005: the bundle's git-state-creation steps
  (sync base, create worktree+branch, materialize spec, commit, push,
  draft PR) move into `/build`'s find-or-create; `/speccy`'s Output &
  Handoff section keeps only spec-writing and the pending-build marker.
- **`specs/worktree-aware-sync.md`** — retained essentially unchanged;
  this spec's REQ-014/015 are a targeted extension (closed-PR detection),
  not a rewrite, of that spec's worktree-mode teardown logic.
- **`specs/logbook-archive-and-triage.md`** — precedent for this repo's
  spec-frontmatter-as-durable-state pattern (`content_hash`, `branch`,
  `worktree_path` fields), extended here with `completion_mode`.
- **`hooks/lib/lifecycle.cjs`** — sibling engine this spec's REQ-016
  extends with a new signal type; unaffected otherwise.

# Definition of Done

- [ ] `/build` refuses to run without a real spec file argument; no
      bare-prompt invocation exists (REQ-001, AC-011).
- [ ] Find-or-create is `/build`'s first pre-flight action, replacing the
      old git-native worktree-refusal check (REQ-002).
- [ ] A fresh `/build` run on a spec with no worktree creates the branch
      and commits the frontmatter-updated spec *before* creating the
      worktree — verified structurally, not just by absence-of-bug testing
      (REQ-004, AC-001).
- [ ] Find-or-create detects and refuses to route around a locked worktree
      or an existing open PR for the same spec's branch, reporting the
      conflict instead (REQ-003, AC-003).
- [ ] `/build`'s interview surface is exactly one front-load round; the
      mid-build PR-comment question mechanism and its channel-adaptive
      delivery logic are removed from `autonomous-pipeline.md` (REQ-007/008,
      AC-010).
- [ ] `/goal`+`/loop` (with manual-loop fallback) is described as `/build`'s
      primary execution mechanism for implement→review→verify, not a
      reference-doc-only guardrail (REQ-010).
- [ ] `completion_mode` frontmatter field exists, is optional, and
      ship-readiness behavior branches correctly on set-vs-absent
      (REQ-009/011, AC-004/005/006).
- [ ] `/ship --auto` proceeds to merge and post-merge teardown on green CI,
      superseding the old stop-at-PR behavior (REQ-013, AC-007).
- [ ] `/speccy` no longer writes a `.mad-skills-auto` sentinel or
      worktree-local autonomy-mode state (REQ-012).
- [ ] `sync.sh` recognizes a closed-not-merged PR's branch as finished and
      offers the same safe removal path as a merged branch (REQ-014,
      AC-008).
- [ ] The Lifecycle Recommendation Engine surfaces a `stale-build-pr`
      signal for inactive `/build`-originated open PRs, subject to its
      existing suppression rules (REQ-016, AC-009).
- [ ] `npm run validate && npm run lint && npm run test:unit` all pass with
      updated and new tests covering the above.

# Assumption Authorization

- **Ambiguity**: exact branch-name derivation and collision-suffix scheme
  when find-or-create needs to create a fresh branch (today's bundle used
  a kebab-case slug of the spec filename with `-2`/`-3` suffixes on
  collision).
  **Authorized decision**: `/build`'s implementer may reuse the existing
  slug+suffix scheme from the current handoff-bundle implementation
  verbatim, since REQ-004 only relocates *when* this happens, not the
  naming algorithm itself.
  **Must report**: nothing beyond normal PR description — this is a
  carried-over, not new, behavior.
- **Ambiguity**: exact `AskUserQuestion` wording for the ship-readiness
  prompt (REQ-009) and the find-or-create lock/PR-conflict report (REQ-003).
  **Authorized decision**: `/build`'s implementer may phrase both however
  best matches this repo's existing `AskUserQuestion` conventions
  (recommended-option-first labeling, concise option descriptions),
  provided the ship-readiness prompt's two options are exactly "finish
  here" and "hand off to `/ship --auto`" in substance.
  **Must report**: nothing beyond normal PR description.
- **Ambiguity**: the exact staleness threshold (in days) for REQ-016's
  ambient nudge, and whether it should be configurable.
  **Authorized decision**: `/build`'s implementer may pick a reasonable
  default (7–14 days is a reasonable range given this repo's existing
  cooldown-style thresholds elsewhere) and may choose whether to expose it
  as a config value, provided the choice and rationale are stated in the
  PR description.
  **Must report**: the chosen threshold and whether it's configurable.
- **Ambiguity**: whether `/speccy` should gain an explicit
  `--auto-ship`/`--completion-mode=<value>` flag to set `completion_mode`
  at spec-creation time, versus only supporting hand-editing the
  frontmatter after the fact.
  **Authorized decision**: `/build`'s implementer may add a `/speccy` flag
  for this if it fits naturally alongside `/speccy`'s existing `--auto`
  flag parsing, or may defer it and support hand-editing only for this
  spec's first cut — either satisfies REQ-011 as written ("set by
  `/speccy` … or hand-edited").
  **Must report**: which option was implemented.
