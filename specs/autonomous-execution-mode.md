---
title: Autonomous Execution Mode (--auto) for speccy, build, and ship
version: 1.0
date_created: 2026-07-19
last_updated: 2026-07-19
tags: [process, tool, architecture, autonomy, worktrees, review, verification]
---

# Introduction

`/build` currently pauses for user input at several points — Stage 2
clarifying questions, Stage 5 review-findings decisions, Stage 10 debrief.
This works well for interactive sessions but blocks any future world where
these flows are triggered without a human present to answer in real time
(a kanban board, an orchestrating agent). This specification adds an opt-in
`--auto` flag to `/speccy`, `/build`, and `/ship` that front-loads ambiguity
resolution into a deeper speccy interview, then lets `/build` run end-to-end
— explore, architect, implement, review, verify, capture evidence, open a
PR — without interactive interruption, making documented, revisable
judgment calls on anything the interview didn't resolve rather than
blocking. The entire `--auto` flow, from the first speccy question through
the opened PR, runs inside a single dedicated git worktree, and always
stops at an open PR — merging remains a human action.

This is additive: `/speccy`, `/build`, and `/ship` without `--auto` behave
exactly as they do today.

## 1. Purpose & Scope

**Purpose.** Let `/speccy` → `/build` → `/ship` run unattended end-to-end
for appropriately-scoped work, with a real enforced contract (not just
convention) gating whether a given spec is safe to build autonomously, and
with the same worktree isolation, review rigor, and evidence capture a
careful human-driven build would apply.

**Audience.** Contributors to mad-skills; downstream projects that install
it as a plugin.

**Implementation note.** This spec is written as one unit because its core
value is the *contract* between speccy, build, and ship (the completeness
gate and its enforcement), which can't be meaningfully split without losing
that framing. `/build` implementing this spec MAY still sequence the actual
work as separate commits or even separate PRs per skill (speccy changes,
then build, then ship) if that produces a cleaner review — that's an
implementation-sequencing choice, not a spec-scope change.

**In scope:**

- `--auto` flag on `/speccy`, `/build`, `/ship`, implemented as thin
  SKILL.md dispatch to new `references/autonomous-*.md` prompt/contract
  docs and `scripts/*.sh` helpers — no inline branching logic in SKILL.md.
- A completeness gate in `/speccy --auto` that must pass before a spec is
  marked `autonomy_ready: true` in frontmatter.
- Worktree creation as the first action of `/speccy --auto` (not deferred
  to `/build`), persisting through build and ship, cleaned up on PR
  merge/close.
- `/build --auto`'s enforcement of the `autonomy_ready` precondition, its
  Sonnet-for-implementation model tiering, its dispatch of the native
  `/code-review`, `/security-review`, and `/verify` commands in subagents
  with size scaled to diff risk, its bounded fix-loop, and its `/loop`/
  `/goal`-driven long-run guardrails (iteration cap, budget cap,
  definition-of-done as completion signal, stuck-detection escalation).
- Evidence capture (video → GIF → screenshots → text) via Claude in
  Chrome/Playwright, with dynamic port allocation for concurrency safety.
- `/ship --auto`'s PR-gated stopping point and PR-description-as-report
  format.
- The headless mid-build question mechanism (PR comment + pluggable
  notification channel) for the rare case a `--auto` build still needs
  input.

**Out of scope (explicit, confirmed with the user):**

- **Fully autonomous speccy** — inferring a complete spec from a one-line
  ticket title/description with zero interview. `--auto` speccy still runs
  a real interview every time; only *how* that interview is conducted
  (human today, potentially a different mechanism later) is left open.
  This is a deliberate, named gap, not an oversight — see §7 Rationale.
- The kanban-board/visual-orchestration trigger UI itself. This spec
  designs the contract that trigger will eventually call into
  (§4 Interfaces), not the trigger.
- Auto-merge of any kind. `--auto` always stops at an open PR.
- Fine-grained per-action risk tiering inside the pipeline (e.g. pausing
  before infra-touching commits specifically). Considered and explicitly
  rejected in favor of a single PR-is-the-gate rule — see §7 Rationale.

## 2. Definitions

- **`--auto`**: the shared flag enabling autonomous mode on `/speccy`,
  `/build`, `/ship`. Absent by default; interactive behavior is unchanged.
- **Completeness gate**: the checklist `/speccy --auto` self-reviews before
  writing a spec — outcome, architecture/approach, non-goals,
  definition-of-done, roadmap context, risks, and at least one resolution
  (decided-now or explicitly-delegated) per identified ambiguity.
- **`autonomy_ready`**: a boolean frontmatter field on a spec file, `true`
  only if the completeness gate passed. `/build --auto` refuses to run
  against a spec where this is `false` or absent.
- **Definition of done**: a literal, checkable list (not prose) in the
  spec, produced by speccy, that `/build --auto` treats as its unambiguous
  completion signal.
- **Assumption-authorization**: for each ambiguity the interview surfaces
  that isn't resolved outright, speccy records what `/build` is authorized
  to decide alone and how that decision must be reported in the eventual
  PR.
- **Native commands**: `/code-review`, `/security-review`, `/verify`,
  `/loop`, `/goal` — built into Claude Code itself, not mad-skills
  artifacts. mad-skills orchestrates *when* and *how* they're invoked; it
  does not reimplement them.
- **Evidence degradation chain**: the fallback order for proving the
  implementation works — video → animated GIF → annotated screenshot
  sequence → text-only explanation — with the achieved tier always stated
  explicitly in the PR, never silently downgraded.
- **Stuck**: two consecutive failed fix→re-review cycles on the same
  finding (matching `/ship`'s existing CI-fix retry cap), triggering
  escalation instead of a third attempt.

## 3. Requirements, Constraints & Guidelines

### Flag & dispatch

- **REQ-001**: `/speccy`, `/build`, `/ship` MUST accept an `--auto` flag.
  Absent, behavior is byte-for-byte identical to current interactive mode.
- **REQ-002**: All `--auto`-specific stage behavior MUST live in
  `references/autonomous-*.md` (prompts/contracts) and `scripts/*.sh`
  (deterministic helpers), not inline in SKILL.md. SKILL.md's only
  `--auto`-awareness is a per-stage dispatch: *"if `--auto`, read
  {reference} for this stage instead."*
- **PAT-001**: Mirror the existing `references/stage-prompts.md` /
  `references/superpowers-deferral.md` extraction pattern already used by
  `/build` and `/ship` — this is a continuation of an established
  convention, not a new one.

### Worktree lifecycle

- **REQ-003**: `/speccy --auto` MUST create its worktree and branch as its
  first action, before Stage 1 context gathering begins. Use the same
  worktree-creation mechanisms already established for mad-skills (harness
  `EnterWorktree`, or Superpowers' `using-git-worktrees` fallback) — mad-
  skills does not invent its own worktree creation/teardown, consistent
  with `specs/worktree-discipline-guardrails.md`.
- **REQ-004**: The same worktree MUST persist through `/build --auto` and
  `/ship --auto` for that unit of work — no new worktree is created at
  build or ship time when continuing an `--auto` flow.
- **REQ-005**: Interactive (non-`--auto`) `/speccy` MUST NOT create a
  worktree. This split is deliberate and confirmed with the user — the
  existing interactive flow is unchanged.
- **REQ-006**: The spec file MUST be the first commit on the `--auto`
  branch, committed inside the worktree once the completeness gate passes.
- **REQ-007**: The worktree MUST persist until the opened PR merges or
  closes, then clean up automatically — mirroring
  `superpowers:finishing-a-development-branch`'s provenance-based cleanup,
  triggered by PR state rather than an explicit user choice.
- **CON-001**: mad-skills MUST NOT take on worktree lifecycle ownership
  beyond what `specs/worktree-discipline-guardrails.md` already
  establishes — it orchestrates *when* worktree creation happens for
  `--auto`, not *how* worktrees are created.

### Speccy completeness gate

- **REQ-008**: `/speccy --auto` MUST produce, in addition to the standard
  spec template sections: a literal definition-of-done checklist, an
  explicit roadmap/what's-next section, and an assumption-authorization
  list mapping each unresolved ambiguity to what `/build` may decide alone.
- **REQ-009**: `/speccy --auto` MUST self-review against the completeness
  gate (§2 Definitions) before writing the spec. Only a full pass sets
  `autonomy_ready: true`.
- **REQ-010**: If the gate cannot be passed (interview stalls, answers stay
  too vague), the spec MUST still be written, marked `autonomy_ready:
  false`, usable by ordinary interactive `/build` but rejected by
  `/build --auto`.

### Build pipeline

- **REQ-011**: `/build --auto` MUST verify the target spec's
  `autonomy_ready: true` before proceeding. On failure: stop with a clear
  message naming the missing gate items; do not silently fall back to
  interactive mode without saying so.
- **REQ-012**: Stage 2 (clarifying questions) is SKIPPED by default in
  `--auto` mode. If explore surfaces a decision the spec's
  assumption-authorization list doesn't cover, that is the headless
  mid-build question case (REQ-024+), not a silent block.
- **REQ-013**: Implementation subagents MUST use a cheaper model (Sonnet)
  in `--auto` mode. Explore, architect, and review/verify stages use
  whatever model tier best fits that stage's judgment requirements — NOT
  forced to Sonnet.
- **REQ-014**: Architect stage MUST explicitly reference the spec's
  roadmap section when choosing an approach, and record its reasoning for
  inclusion in the eventual PR report.
- **REQ-015**: After implementation, `/build --auto` MUST dispatch
  `/code-review` and `/security-review` (native commands) in subagents.
  Depth is chosen by this rule (GUD-002) rather than per-run judgment.
- **REQ-016**: Findings from review MUST be dispatched to a fix subagent,
  then re-reviewed. Maximum 2 attempts per finding-set (matching `/ship`'s
  existing CI-fix cap) before treating it as stuck and escalating.
- **REQ-017**: `/verify` (native command) MUST be dispatched in a subagent
  to check the implementation against the spec's definition-of-done
  checklist item by item — not a general "looks done" judgment.
- **GUD-001**: Long-running `--auto` work SHOULD use `/loop`/`/goal` to
  push through extended unattended execution, bounded by REQ-018–021.
- **REQ-018**: `/build --auto` MUST enforce a hard iteration cap (default
  20 `/loop` cycles, where one cycle is one full pass through
  implement→review→verify for the current outstanding definition-of-done
  items) and wall-clock cap (default 4 hours) per run, both configurable
  via flag/env var. Hitting either forces stop-and-report, not silent
  continuation.
- **REQ-019**: `/build --auto` MUST enforce a token/cost budget ceiling,
  configurable via `--budget <tokens>`, defaulting to 5,000,000 tokens when
  unset — matching the `budget.total`/`budget.remaining()` pattern already
  used by the Workflow tool. Exhausting it halts new subagent dispatch and
  reports what was/wasn't completed. The 5M default is a starting point for
  implementation to tune against real run data, not a value with prior
  empirical validation.
- **REQ-020**: The spec's definition-of-done checklist is the completion
  signal — `/build --auto` is finished when every item is checked, not
  when it merely stops finding more work to do.
- **REQ-021**: Two consecutive failed fix→re-review cycles on the same
  issue (§2 "Stuck") MUST escalate via the headless question mechanism
  rather than retrying a third time.

### Review depth scaling

- **GUD-002**: Review depth is determined by this rule, evaluated after
  implementation, before dispatching `/code-review`/`/security-review`:
  - **Standard** review: diff touches ≤10 files AND none of the
    risk-keyword paths below.
  - **Deep review**: diff touches >10 files, OR touches any path matching:
    auth/session/credential code, `.env*`, secrets/key material, CI/CD or
    deploy config (`.github/workflows/**`, Dockerfiles, IaC files),
    payment/billing logic, data-deletion/migration code.
- **CON-002**: This threshold table MUST be defined in
  `references/autonomous-review-thresholds.md` so it can be tuned without
  touching SKILL.md.

### Evidence capture

- **REQ-022**: After `/verify` passes, `/build --auto` MUST run a
  dedicated evidence-capture stage: start the app's dev server inside the
  run's own worktree on a dynamically allocated port (never a fixed
  default — concurrency safety), then drive the spec's acceptance-criteria
  flows via Claude in Chrome or Playwright, checking both functional
  correctness and visual/aesthetic consistency with the existing app.
- **REQ-023**: Evidence capture MUST follow the degradation chain (§2):
  video → GIF → screenshots → text explanation. Whichever tier is actually
  achieved MUST be stated explicitly in the PR — never silently downgraded
  without saying so.
- **GUD-003**: Because evidence capture is the most resource-hungry stage,
  it SHOULD queue rather than fail outright under resource contention —
  designed now for the future concurrent-runs scenario even though
  single-run is the only case exercised at implementation time.

### Headless mid-build question mechanism

- **REQ-024**: When `/build --auto` hits a decision outside its
  assumption-authorization, it MUST first continue any other independent
  work rather than blocking the entire run on one open question.
- **REQ-025**: The question MUST be composed as a rich artifact: multiple
  well-communicated options, pros/cons for each, an explicit
  recommendation, and supporting visuals generated via the same
  evidence-capture tooling (REQ-022) where relevant — never an open-ended
  "what do you think?"
- **REQ-026**: The question MUST be posted as a comment on the (draft) PR
  already open for this work.
- **REQ-027**: A notification containing a link to that PR comment MUST be
  sent — a native push notification for a live interactive session, or via
  a pluggable channel for a headless trigger. The notification payload
  MUST be channel-agnostic (§4) even though only PR-comment delivery ships
  in this round.
- **REQ-028**: After posting, the run pauses (or continues remaining
  independent work) until the PR-comment reply is picked up by a follow-up
  `--auto` pass or the original session if still live.

### Ship & PR output

- **REQ-029**: `/ship --auto` MUST stop at an open PR. It MUST NOT merge,
  regardless of CI/review outcome. No finer-grained per-action risk tiers
  gate individual commits inside the pipeline — this single rule is the
  entire risk boundary (see §7 Rationale for why finer tiering was
  rejected).
- **REQ-030**: The PR description body IS the report — Summary, Risks, How
  It Was Validated, Further Testing Needed, Assumptions Made (from
  speccy's assumption-authorization list plus whatever `/build` actually
  decided) — with evidence embedded/linked inline. No separate report file.
- **REQ-031**: CI-watch/fix-loop behavior in `--auto` mode is unchanged
  from today's `/ship` (already bounded at 2 attempts).

### Context management (cross-cutting, `--auto`-specific)

- **REQ-032**: In `--auto` mode, every stage that does not require live
  user interaction — context gathering, architecture design, spec-template
  generation/writing, implementation, review, fix, verify, evidence
  capture — MUST run in a subagent. The orchestrating thread only
  accumulates structured stage reports, never raw file/tool output.
- **REQ-033**: `/speccy --auto`'s Stage 3 (spec generation/writing) MUST
  run in a subagent. This differs from interactive `/speccy`, where Stage 3
  currently runs inline — inline is fine when a human is present to absorb
  the context cost directly; `--auto` has no such human, so this stage
  moves to a subagent specifically for `--auto`.
- **GUD-004**: At major `--auto` stage boundaries (speccy → build, build →
  ship, and between build's own major phases on long runs), the
  orchestrator SHOULD automatically invoke `/ferry` to write a waybill and
  checkpoint context, rather than only offering it conditionally the way
  interactive mode does. With no human present to judge "is context large
  enough to warrant this," automatic is the safer default for unattended
  runs.
- **GUD-005**: Aggressive context isolation MUST NOT come at the cost of
  the PR report's content required by REQ-030. Every subagent stage report
  in `--auto` mode MUST continue to capture rationale ("why"), not just
  outcome ("what") — mirroring the existing `EXPLORE_REPORT`/`ARCH_REPORT`
  convention of carrying reasoning fields, not just raw results.
- **CON-003**: REQ-032 through GUD-005 are scoped to `--auto` mode only.
  Interactive `/speccy`, `/build`, `/ship` keep their existing, unchanged,
  conditionally-offered context management (e.g. `/build`'s existing
  hand-off-to-`/ferry` execution-mode question). This spec does not alter
  interactive-mode behavior.

## 4. Interfaces & Data Contracts

### Spec frontmatter extension

```yaml
---
title: [existing field]
version: [existing field]
date_created: [existing field]
last_updated: [existing field]
tags: [existing field]
autonomy_ready: true | false   # NEW — set only by /speccy --auto's gate
---
```

### Definition-of-done checklist (in spec body)

```md
## Definition of Done
- [ ] {checkable, testable statement}
- [ ] {checkable, testable statement}
```

### Assumption-authorization list (in spec body)

```md
## Assumption Authorization
- **Ambiguity**: {what's unresolved}
  **Authorized decision**: {what /build may decide alone}
  **Must report**: {what the PR must say about this decision}
```

### Notification payload (channel-agnostic)

```json
{
  "pr_url": "string",
  "comment_url": "string",
  "summary": "string (one line)",
  "channel": "push | pr-comment-only | pluggable"
}
```
Only `push` (interactive) and `pr-comment-only` (headless, no external
channel configured) are implemented in this round. The schema anticipates
additional `channel` values (Slack, email) without requiring a schema
change to add them later.

### Review-depth threshold table

Defined in `references/autonomous-review-thresholds.md` (GUD-002); consumed
by `/build --auto`'s review-dispatch stage, not hardcoded in SKILL.md.

## 5. Acceptance Criteria

- **AC-001**: Given a spec with `autonomy_ready: false`, When `/build --auto
  {spec}` is run, Then it stops immediately with a message naming which
  completeness-gate items are missing, and does not implement anything.
- **AC-002**: Given a spec with `autonomy_ready: true`, When `/build --auto`
  completes successfully, Then an open PR exists whose description contains
  Summary, Risks, Validation, Further Testing Needed, and Assumptions Made
  sections, with evidence embedded or linked.
- **AC-003**: Given `/build --auto` hits its iteration cap before the
  definition-of-done checklist is fully satisfied, When the cap is reached,
  Then the run stops and reports exactly which checklist items are done vs.
  outstanding — it does not silently continue past the cap.
- **AC-004**: Given a review finding that still fails after 2 fix→re-review
  attempts, When the 2nd re-review still fails, Then the run escalates via
  the headless question mechanism (REQ-024–028) rather than attempting a
  3rd fix.
- **AC-005**: Given the app's dev server fails to start during evidence
  capture, When video/GIF capture is therefore impossible, Then the PR
  states explicitly that evidence capture fell back to text-only and why —
  it does not silently omit the evidence section.
- **AC-006**: Given two `/build --auto` runs on the same repo concurrently,
  When both reach evidence capture at the same time, Then neither fails due
  to a port collision (dynamic allocation) or worktree collision (separate
  worktrees per REQ-003–004).
- **AC-007**: Given `/speccy` is run WITHOUT `--auto`, When the interview
  completes, Then no worktree is created and behavior is unchanged from
  today.
- **AC-008**: Given `/build --auto` completes and CI/review pass cleanly,
  When `/ship --auto` finishes, Then the PR remains open (not merged) and
  the worktree remains until the PR is merged or closed.
- **AC-009**: Given a `--auto` run crosses a major stage boundary (speccy →
  build, build → ship), When that boundary is crossed, Then `/ferry` is
  invoked automatically to checkpoint a waybill before continuing — the
  orchestrator does not simply keep accumulating raw context across stages.
- **AC-010**: Given a `--auto` run's implementation subagent completes,
  When its stage report is inspected, Then the report contains rationale
  for its decisions (not just an outcome summary) — sufficient to populate
  the PR's Assumptions Made / How It Was Validated sections without
  needing to re-derive reasoning after the fact.

## 6. Test Automation Strategy

- **Test Levels**: Skill-level evals (existing `tests/evals.json` pattern)
  for flag parsing and dispatch; scripted unit tests for the deterministic
  helpers (`scripts/spec-completeness-check.sh`, `scripts/worktree-setup.sh`
  equivalents) following the existing `hooks/lib/*.test.cjs` /
  `scripts/lib/*.test.js` pattern; no new test framework introduced.
- **Frameworks**: `node --test` (matching existing `npm run test:unit`),
  the existing eval runner (`scripts/run-evals.js`).
- **New eval cases required** (mirroring `worktree-discipline-guardrails.md`'s
  precedent of adding cases across every touched skill):
  `skills/speccy/tests/evals.json` (completeness gate pass/fail,
  `autonomy_ready` marker correctness), `skills/build/tests/evals.json`
  (gate enforcement, model tiering, review-depth threshold selection,
  fix-loop cap), `skills/ship/tests/evals.json` (PR-gated stop, report
  format).
- **Coverage Requirements**: Every REQ/AC in this spec maps to at least one
  eval case or unit test before this spec is considered implemented.
- **Manual/E2E validation**: A real `--auto` run against a small,
  low-risk internal change (chosen at implementation time) as an end-to-
  end smoke test before this mode is documented as available for general use.

## 7. Rationale & Context

**Why speccy creates the worktree, not build.** The pending-build marker is
keyed by `process.cwd()`; if speccy ran on the primary checkout and build
later created a separate worktree, the marker wouldn't transfer without new
handoff plumbing. Starting the worktree at speccy time also makes the spec
the literal first commit on the branch (self-documenting PR history) and
establishes a single "every `--auto` stage gets a worktree, no exceptions"
rule — important once a human isn't present to remember why one stage was
special-cased. Confirmed explicitly with the user.

**Why `--auto` is a flag, not new skills.** Considered three options: (A)
separate skills (`/speccy-auto` etc.) — clean isolation but duplicates
shared plumbing (platform detection, worktree setup, sync, PR creation)
and adds to an already-14-skill surface; (B) a flag with inline branching
in SKILL.md — matches mad-skills' existing flag convention
(`--no-superpowers`, `--pr-only`, `--skip-review`) but risks unreadable
branchy SKILL.md files; (C) a flag with mode-specific logic extracted into
`references/`/`scripts/` — same isolation benefit as (A) without the
duplication or skill-count sprawl, and it's a continuation of the
`stage-prompts.md`/`superpowers-deferral.md` pattern already established.
Chosen: (C).

**Why fully autonomous speccy is explicitly out of scope.** A spec deep
enough to safely authorize unattended building may itself require a
substantial interview — which is in tension with "eventually triggered
from a kanban board with no human present." Rather than resolve that
tension by weakening the completeness gate, this spec keeps the gate
strict and defers "how does the interview itself happen without a human"
to a later spec. Confirmed explicitly with the user as acceptable scope.

**Why PR-gated stop instead of finer-grained risk tiers.** Considered
pausing before specific high-stakes actions (merging, touching CI/CD or
infra config, auth-sensitive code) mid-pipeline. Rejected in favor of a
single rule — always stop at an open PR, never merge — because it's
simpler to reason about and verify, and the review/verify gates plus PR
review itself already cover the risk the finer tiers were meant to catch.
Confirmed explicitly with the user.

**Why review depth uses a fixed threshold table instead of per-run
judgment.** An LLM's per-run sense of "is this risky" is inconsistent
across runs; a file-count-plus-keyword-path table (GUD-002) is
deterministic, testable, and tunable in one place
(`references/autonomous-review-thresholds.md`) without touching SKILL.md.

**Why aggressive context isolation and automatic `/ferry` are `--auto`-only
(CON-003), not a universal change.** In `--auto` mode nobody is watching
live, so context economy matters more than narrative continuity, and
nobody is present to judge "is this stage boundary a good moment to
checkpoint" — making automatic the safer default. In interactive mode a
human is present, may want visibility into intermediate reasoning as it
happens, and can already judge for themselves whether a checkpoint is
worth the context-reconstruction cost — `/build`'s existing hand-off
question already offers this conditionally, and that's deliberately left
alone. Applying automatic isolation/ferrying to interactive mode too was
considered and rejected: it would add friction to sessions where a human
is actively following along and would strip exactly the kind of visibility
that makes an interactive session useful in the first place. The one
constraint carried into `--auto` regardless (GUD-005) is that isolation
must not silently drop the rationale a good PR report depends on — the
goal is smaller context, not shallower reasoning.

## 8. Dependencies & External Integrations

### External Systems
- **EXT-001**: GitHub / Azure DevOps (via existing `/ship` platform
  detection) — PR creation, comments, CI status. No new integration; reuses
  `/ship`'s existing dual-platform support.

### Third-Party Services
- None new. All review/verify/loop capability comes from native Claude
  Code commands (§2 Definitions), not third-party services.

### Infrastructure Dependencies
- **INF-001**: Git worktrees — created via harness `EnterWorktree` or
  Superpowers' `using-git-worktrees` fallback, per
  `specs/worktree-discipline-guardrails.md`. mad-skills does not create
  its own worktree mechanism.
- **INF-002**: A locally runnable dev server for the target project, on a
  dynamically allocated port, for the evidence-capture stage. Projects
  without a runnable dev server degrade straight to the
  screenshot/text tiers of the evidence chain (no video/GIF possible).

### Data Dependencies
- None — this spec adds process/orchestration logic, not data storage
  beyond the existing spec-file and PR-comment mechanisms.

### Technology Platform Dependencies
- **PLT-001**: Claude Code native commands `/code-review`,
  `/security-review`, `/verify`, `/loop`, `/goal` — confirmed present as
  native harness features (not mad-skills or third-party plugin artifacts)
  during this spec's interview.
- **PLT-002**: Claude in Chrome (MCP tools) or Playwright — at least one
  must be available for video/GIF/screenshot evidence capture; absence of
  both degrades straight to the text-only tier.
- **PLT-003**: A push-notification-capable tool (e.g. `PushNotification`)
  for the interactive-session branch of the headless question mechanism.

## 9. Examples & Edge Cases

**Worked example — happy path:**
1. `/speccy --auto "add dark mode toggle to settings page"` creates a
   worktree/branch, runs the interview, gate passes, writes
   `specs/dark-mode-toggle.md` with `autonomy_ready: true`, commits it as
   the branch's first commit.
2. `/build specs/dark-mode-toggle.md --auto` verifies the marker, explores,
   architects (referencing the spec's roadmap section), implements with
   Sonnet, runs `/code-review` + `/security-review` (standard depth — small
   diff, no risk-keyword paths), passes, runs `/verify` against the
   definition-of-done checklist, captures a GIF of the toggle working in
   both themes, all checklist items pass.
3. `/ship --auto` opens a PR with the full report embedded, worktree stays
   alive, run ends.

**Edge case — gate fails:** Interview stalls because the user is
unavailable mid-interview. Spec is written with `autonomy_ready: false`.
A later `/build --auto` against it stops immediately, naming the missing
items; a plain `/build` (interactive) against the same spec works
normally.

**Edge case — stuck fix loop:** Security review flags a credential-handling
issue twice in a row after fix attempts. Second re-review still fails →
escalates via PR comment + notification rather than a third attempt.

**Edge case — evidence capture degrades fully:** Target project has no dev
server script in this environment. Video/GIF/screenshot tiers are all
skipped; PR states plainly "evidence capture unavailable — no runnable dev
server found; manual verification recommended before merge."

**Edge case — concurrent runs:** Two `--auto` builds triggered against the
same repo. Each has its own worktree (REQ-003–004) and dynamically
allocated port (REQ-022); evidence capture for the second queues rather
than colliding with the first (GUD-003).

## 10. Validation Criteria

This specification is satisfied when:
- Every REQ/CON/GUD/PAT above is implemented and has a corresponding eval
  or unit test (§6).
- All AC-001 through AC-008 pass against a real (not simulated) `--auto`
  run.
- A full `--auto` dry run against a genuinely small internal change
  produces an open PR meeting REQ-030's report-content requirement,
  including at least a screenshot-tier evidence artifact.
- Interactive `/speccy`, `/build`, `/ship` (no `--auto`) are verified
  unchanged via existing evals — zero regressions.

## 11. Related Specifications / Further Reading

- `specs/worktree-discipline-guardrails.md` — the existing worktree-aware
  guardrail work this spec builds directly on top of (worktree creation
  mechanism, cwd-drift detection).
- `specs/superpowers-complementary-layer.md` — the existing soft-dependency
  deferral pattern this spec's native-command orchestration extends.
- `specs/followups-ledger.md` — `/logbook`'s LOGBOOK.md, the mechanism by
  which any deferred/out-of-scope items from this spec (e.g. fully
  autonomous speccy) should be tracked going forward.
