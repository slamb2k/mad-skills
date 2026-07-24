---
title: Find-or-Create Enforcement — Making Worktree Creation Non-Degradable
version: 1.0
date_created: 2026-07-24
last_updated: 2026-07-24
tags: [process, tool, build, worktrees, reliability]
autonomy_ready: true
content_hash: sha256:02663363f47c6876cdaa23fe04518a13546f71e3798c5835537f757d7e48e409
branch: fix/build-find-or-create-enforcement
worktree_path: /home/slamb2k/work/mad-skills/.claude/worktrees/build-find-or-create-enforcement
---

# Introduction

`specs/pr-first-autonomous-build.md` (merged tonight as PR #124, released as
v2.0.105) made `/build` own its own worktree lifecycle via a "find-or-create"
pre-flight step: resume an existing worktree, stop on a lock/PR conflict, or
create a fresh branch + worktree + draft PR. Within hours of release, this
failed on its first real invocation: in the `real-talk` project, `/build`
checked out a new branch and committed the spec directly in the **primary
checkout**, rendered `⚠️ worktree — skipped — monorepo needs a full bun
install per tree and nothing else is running; branch in primary checkout`,
and proceeded to implement the entire feature there — no worktree was ever
created.

This is not a logic bug in the find-or-create flow itself (the Resume/
Conflict-stop/Create branches are all correctly specified). It is a framing
bug: the mandatory Create path's instructions live directly under
`skills/build/SKILL.md`'s `## Pre-flight` heading, immediately below a
dependency table that explicitly teaches ✅/⚠️/❌ degrade-gracefully
semantics for genuinely optional dependencies (`ship`, `prime`,
`feature-dev`, `superpowers`, `ferry`). Nothing in the surrounding text
told the executing model that find-or-create's Create path is categorically
different — a correctness requirement, not a soft dependency check — so it
pattern-matched onto the wrong convention and rationalized a real (but
irrelevant) cost concern into a skip.

This specification fixes the framing, adds a cheap structural check that
catches the failure mode even if the framing drifts again in the future,
and confirms (via audit) that the sibling skills don't share the same risk.

# 1. Purpose & Scope

**Purpose.** Make `/build`'s find-or-create Create path unambiguously
non-degradable — both in how it reads to a model and in what happens if it
is skipped anyway — and close the resulting repo-state gap it can leave
behind.

**Audience.** Contributors to mad-skills; downstream projects (e.g.
`real-talk`) that hit this bug in production.

**In scope:**
- Restructuring `skills/build/SKILL.md` so find-or-create's Create path and
  the spec-file refusal are visually and semantically separate from the
  soft `## Pre-flight` dependency table.
- An explicit, CON-002-style statement that worktree creation MUST NOT be
  skipped or degraded for any reason, including perceived cost.
- A post-Create enforcement check: before Stage 1 begins, `/build` verifies
  it is actually running inside a worktree, hard-stopping with a clear,
  actionable error otherwise.
- A repo-wide audit (already conducted during this spec's design) of
  `speccy`/`ship` for the same structural risk.
- A session-guard Lifecycle Recommendation Engine signal that notices a
  primary checkout sitting on a non-default branch with an associated spec
  (the state this bug leaves behind) and suggests moving it into a
  worktree.

**Out of scope:**
- Automated repair of a detected inconsistent state (REQ-004) — the guard
  hard-stops and reports; it does not attempt repo surgery.
- Mitigation guidance for genuinely expensive worktree setups (e.g.
  package-manager cache sharing across worktrees) — the fix states the
  constraint plainly; per-tree install cost is a real but separate concern
  individual projects already have levers for outside mad-skills.
- Fixing `real-talk`'s current repo state directly — the Lifecycle
  Recommendation Engine signal (REQ-006) will surface it as a nudge next
  time `/logbook` or an ambient check runs there; manual cleanup is not
  this spec's job.

# 2. Definitions

- **Find-or-create**: `/build`'s pre-flight operation (from
  `pr-first-autonomous-build.md`) that resumes, stops-on-conflict, or
  creates the worktree/branch/draft-PR for a spec.
- **Soft dependency**: a `## Pre-flight` table entry whose absence degrades
  gracefully (`ship`, `prime`, `feature-dev`, `superpowers`, `ferry`) —
  contrasted with a **hard requirement**, which must never be skipped.
- **Enforcement guard**: the new post-Create check verifying `/build` is
  actually inside a worktree before Stage 1 begins.
- **Primary checkout**: the repository's main working directory, as
  opposed to a linked worktree under `.claude/worktrees/`.

# 3. Requirements, Constraints & Guidelines

- **REQ-001**: `skills/build/SKILL.md` MUST present find-or-create's Create
  path and the spec-file refusal (REQ-001 of `pr-first-autonomous-build.md`)
  in a section separate from `## Pre-flight`, positioned before it, so a
  model reading the file cannot pattern-match it onto the ✅/⚠️/❌
  degrade-gracefully convention taught by the dependency table.
- **REQ-002**: The restructured section MUST state explicitly, mirroring
  `pr-first-autonomous-build.md` CON-002's phrasing for the lock/PR-conflict
  case, that worktree creation MUST NOT be skipped or degraded for any
  reason, including perceived cost (e.g. per-tree dependency install time)
  — it is a correctness requirement (traceability, evidence isolation,
  avoiding polluting the primary checkout with in-progress feature
  branches), not a performance optimization.
- **REQ-003**: Immediately after find-or-create's Create path completes,
  and before Stage 1 (Explore) begins, `/build` MUST verify its own working
  directory is inside a linked worktree, not the primary checkout — reusing
  the git-native detection primitive from the superseded worktree-refusal
  check (`unified-autonomous-build.md` REQ-009: `git rev-parse
  --git-common-dir` differs from `git rev-parse --git-dir` inside a linked
  worktree, and is identical in the primary checkout), now repurposed as a
  post-creation verification rather than a pre-flight refusal (GUD-001).
- **REQ-004**: On enforcement-guard failure, `/build` MUST hard-stop
  immediately, before Stage 1, with an error naming: the branch and commit
  that already exist in the primary checkout, and the two recovery options
  (manually create a worktree checking out the existing branch, then re-run
  `/build`; or investigate why creation failed). It MUST NOT attempt
  automated repair of the inconsistent state.
- **REQ-005 (audit finding)**: `skills/speccy/SKILL.md` and
  `skills/ship/SKILL.md` contain no MUST-level requirements inside their
  `## Pre-flight` sections (confirmed by direct inspection during this
  spec's design — see §7 Rationale). No structural changes are required in
  either file; this requirement records the finding so a future skill
  author knows why `build`'s structure differs from its siblings.
- **REQ-006**: The session-guard Lifecycle Recommendation Engine
  (`hooks/lib/lifecycle.cjs`) gains a new check: a primary checkout on a
  non-default branch that resolves to a `specs/*.md` file with matching
  `branch` frontmatter (reusing the provenance-detection logic
  `pr-first-autonomous-build.md` REQ-016 already built for `stale-build-pr`)
  is surfaced as a "this looks like it should be a worktree" recommendation,
  through the engine's existing `lifecycle-next` output and
  cooldown/dismissal conventions — not a new notification channel.
- **CON-001**: The enforcement guard's failure path (REQ-004) MUST NOT
  attempt any automated repository modification — it only reports and
  stops. Confirmed explicitly with the user during this spec's design.
- **CON-002**: REQ-002's cost-override statement MUST NOT include
  package-manager or install-cost mitigation guidance — scope is process
  consistency, not tooling advice. Confirmed explicitly with the user.
- **GUD-001**: REQ-003's guard reuses the existing git-native
  worktree-detection primitive rather than inventing a new mechanism —
  the same check `unified-autonomous-build.md` REQ-009 used for its
  worktree-refusal, now repurposed.

# 4. Interfaces & Data Contracts

**Enforcement guard check (REQ-003), as executed by `/build`:**
```bash
if [ "$(git rev-parse --git-common-dir)" = "$(git rev-parse --git-dir)" ]; then
  echo "❌ find-or-create did not result in a worktree — still in the primary checkout."
  # report branch/commit state and the two recovery options; hard-stop, no Stage 1.
fi
```

**Lifecycle Recommendation Engine — new signal shape (REQ-006):**
```
{
  id: "primary-checkout-should-be-worktree",
  branch: <branch>,
  spec: <specs/*.md path>,
  recommendation: "create worktree for existing branch"
}
```
Feeds the same `lifecycle-next` output block `/logbook` and session-guard
already render — an additional recommendation type on the existing
mechanism, alongside `stale-build-pr`.

# 5. Acceptance Criteria

- **AC-001**: Given find-or-create's Create path completes, When `/build`
  checks its own working directory, Then it confirms `git rev-parse
  --git-common-dir` differs from `git rev-parse --git-dir` (i.e. it is
  inside a worktree) before Stage 1 begins.
- **AC-002**: Given the enforcement guard finds the session still in the
  primary checkout after Create, When it fires, Then `/build` hard-stops
  with an error naming the existing branch/commit and the two recovery
  options, and does not proceed to Stage 1 or attempt repair.
- **AC-003**: Given a model reads only the restructured find-or-create
  section of `skills/build/SKILL.md`, When it encounters a real cost
  concern about worktree creation (e.g. per-tree install time), Then the
  text unambiguously states this MUST NOT be a reason to skip it.
- **AC-004**: Given a repo's primary checkout is on a non-default branch
  with an associated spec file, When the Lifecycle Recommendation Engine
  next evaluates, Then a "should be a worktree" recommendation surfaces
  through the existing `lifecycle-next` output, subject to the engine's
  existing suppression rules.
- **AC-005**: Given `skills/speccy/SKILL.md` and `skills/ship/SKILL.md`,
  When audited for MUST-level content inside their `## Pre-flight`
  sections, Then none is found — documented as a finding, not a
  behavioral change.

# 6. Test Automation Strategy

- **Eval cases** (`skills/build/tests/evals.json`, extended): assert the
  restructured SKILL.md describes find-or-create's Create path as
  non-degradable regardless of cost (AC-003); assert the enforcement
  guard's hard-stop behavior and error content (AC-001/002).
- **Unit tests** (`hooks/lib/lifecycle.test.cjs`, extended): the new
  `primary-checkout-should-be-worktree` signal (REQ-006), mirroring the
  `stale-build-pr` test pattern already established — synthesize a
  primary-checkout-on-feature-branch fixture, assert the recommendation
  appears, assert existing cooldown/dismissal suppression applies.
- **No new script/shell tests** — REQ-003's guard is `/build`-instruction
  content (prose executed by the orchestrating model), not a standalone
  script; it is exercised via the eval cases above, consistent with how
  other `/build`-instruction requirements in this repo are tested.
- **Coverage**: every REQ/AC above maps to at least one eval case or unit
  test before this spec is considered implemented.
- **Manual/E2E validation**: not exercised this pass — `/build`'s own
  instructions only take effect for a live run once this change releases
  past the currently-running plugin version (the same limitation noted in
  `pr-first-autonomous-build.md`'s own PR). The `real-talk` incident already
  serves as an unplanned, real E2E failure case demonstrating the bug this
  spec fixes; a clean recurrence check is the practical validation once
  released.

# 7. Rationale & Context

**Why this is a framing bug, not a logic bug.** The Resume/Conflict-stop/
Create branches of find-or-create are all correctly specified in
`pr-first-autonomous-build.md`. What failed was where and how the Create
path's mandatory nature was communicated: directly inside a section (`##
Pre-flight`) whose surrounding content explicitly teaches a
degrade-gracefully reading. The fix is primarily structural (REQ-001) and
only secondarily about wording (REQ-002) — moving the content out of the
soft-framing context does most of the work; the explicit non-degradable
statement closes the rest.

**Why the "enforcement guard" is still instruction-based, and why that's
still an improvement.** This system has no compiled runtime for `/build`
beyond the SKILL.md prose an LLM follows — REQ-003's guard is, mechanically,
more instructions, the same category of thing that just failed. The
meaningful difference is framing, not enforcement mechanism: REQ-001's
existing "refuse to run without a spec file" check is also pure prose, and
it worked correctly in the very `real-talk` session that got the worktree
step wrong — because a binary, cost-free "stop now" framing is much harder
to rationalize past than a step sitting among genuinely optional items. The
guard is designed to inherit that same psychology: a sharp yes/no check
with an unconditional hard-stop, not a judgment call.

**Why the audit (REQ-005) found nothing to fix in speccy/ship.** Direct
inspection of both files' `## Pre-flight` sections during this spec's
design (grep for `MUST`/`REQ-` bounded to each section) found only the
soft dependency table in each — no mandatory content lives inside either.
`build`'s structure diverged because find-or-create was added later
(`pr-first-autonomous-build.md`) and inserted into the nearest existing
heading rather than given its own.

**Why the Lifecycle Recommendation Engine, not a new mechanism (REQ-006).**
Directly follows this repo's own established pattern — REQ-016 of
`pr-first-autonomous-build.md` built exactly this kind of provenance
detection (a `specs/*.md` file's `branch` frontmatter linked to live repo
state) for `stale-build-pr` hours before this spec was written. Reusing it
for "primary checkout should be a worktree" is a small additive signal,
not new infrastructure — and it directly covers `real-talk`'s current
repo state without this spec needing to fix that repo by hand.

**Why no automated repair (CON-001).** Acting on a state the guard itself
just flagged as unexpected is exactly the kind of "route around it"
behavior `pr-first-autonomous-build.md` REQ-003 already rejected for the
lock/PR-conflict case, for the same reason: an inconsistent state deserves
a human look, not more automation compounding the uncertainty.

# 8. Dependencies & External Integrations

- **INF-001**: Git worktrees — detection mechanism unchanged from
  `unified-autonomous-build.md` REQ-009 (`git rev-parse --git-common-dir`
  vs `--git-dir`), repurposed as described in REQ-003.
- **INF-002**: `hooks/lib/lifecycle.cjs` (session-guard's Lifecycle
  Recommendation Engine) — REQ-006's new signal is additive to this
  existing component, alongside `stale-build-pr`.

# 9. Examples & Edge Cases

**The `real-talk` incident (motivating case):** `/build` ran find-or-create
on `specs/telegram-connector.md`, checked out `feat/telegram-connector` in
the primary checkout, committed the spec, pushed, and opened draft PR #18
— then rendered `⚠️ worktree — skipped — monorepo needs a full bun install
per tree and nothing else is running; branch in primary checkout` and
proceeded to implement there. With this spec's fix: the restructured
section removes the soft-framing cue and states the constraint plainly
(REQ-001/002); even if a model still tried to skip, the enforcement guard
(REQ-003) would catch it immediately after Create and hard-stop (REQ-004)
before any implementation work happened in the primary checkout — and
separately, the Lifecycle Recommendation Engine (REQ-006) will now flag
`real-talk`'s current post-incident state next time its session-guard or
`/logbook` runs.

**Guard false-positive check:** a `/build` run that RESUMES an existing,
valid worktree (find-or-create's Resume path, not Create) also passes the
guard trivially — resumption always operates from inside the worktree it
resumed, so `--git-common-dir`/`--git-dir` already differ.

# 10. Validation Criteria

This specification is satisfied when:
- Every REQ/CON/GUD/AC above has a corresponding eval case or unit test
  (§6), and `npm run validate && npm run lint && npm run test:unit` pass.
- `skills/build/SKILL.md`'s find-or-create section reads, to a fresh
  reader, as unambiguously mandatory and structurally distinct from the
  Pre-flight dependency table.
- A recurrence of the `real-talk` failure mode (worktree creation skipped
  for a cost rationale) is either prevented by the reframed prose, or
  caught by the enforcement guard before any implementation work occurs
  in the primary checkout.

# 11. Related Specifications / Further Reading

- **`specs/pr-first-autonomous-build.md`** — introduces find-or-create
  (REQ-002–006) and CON-002's lock/PR-conflict hard-stop phrasing, which
  this spec's REQ-002 mirrors for the cost-skip case.
- **`specs/unified-autonomous-build.md`** — REQ-009's git-native
  worktree-detection primitive, reused by this spec's REQ-003.
- **`specs/worktree-discipline-guardrails.md`** — the standing constraint
  (never invent a worktree primitive) that both the original find-or-create
  and this spec's enforcement guard operate within.
- **LOGBOOK.md** — this incident is the live realization of the
  `pr-first-autonomous-build.md` deferred-E2E-validation follow-up logged
  earlier tonight; resolve that item once this spec ships.

# Definition of Done

- [ ] `skills/build/SKILL.md`'s find-or-create Create path and spec-file
      refusal live in a section separate from `## Pre-flight`, positioned
      before it (REQ-001, AC-003).
- [ ] The restructured section explicitly states worktree creation MUST
      NOT be skipped for cost/convenience reasons (REQ-002, AC-003).
- [ ] A post-Create enforcement check verifies the session is inside a
      worktree before Stage 1, reusing the git-native detection primitive
      (REQ-003, AC-001).
- [ ] On guard failure, `/build` hard-stops with an error naming the
      existing branch/commit and the two recovery options, with no
      automated repair attempted (REQ-004, AC-002).
- [ ] `hooks/lib/lifecycle.cjs` surfaces a "primary checkout should be a
      worktree" recommendation, reusing existing cooldown/dismissal
      conventions (REQ-006, AC-004).
- [ ] Audit finding documented: speccy/ship have no MUST-level content
      inside their Pre-flight sections (REQ-005, AC-005).
- [ ] `npm run validate && npm run lint && npm run test:unit` all pass
      with updated and new tests covering the above.
