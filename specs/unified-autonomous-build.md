---
title: Unified Autonomous Build & Speccy Zero-Interview Inference
version: 1.0
date_created: 2026-07-20
last_updated: 2026-07-20
tags: [process, tool, architecture, autonomy, speccy, build, worktrees]
autonomy_ready: false
---

# Introduction

`specs/autonomous-execution-mode.md` (merged, PR #114) added an opt-in
`--auto` flag to `/speccy`, `/build`, `/ship`, but deliberately deferred one
piece: "fully autonomous `/speccy`" — producing a spec with zero human
interview. Designing that deferred piece (LOGBOOK item) surfaced a deeper
issue: `/build`'s all-or-nothing `--auto` flag doesn't cleanly support the
mode a human actually wants most — a real interview when the work is still
being figured out, paired with a build phase that tries hard never to
interrupt again. And the judgment `/speccy --auto` needs to decide "is this
ticket safe to spec without asking" turns out to be structurally the same
judgment `/build` needs on every ambiguity it hits while implementing.

This spec unifies both: it completes `/speccy`'s zero-interview mode with a
deterministic eligibility gate and a lightweight spec template, and it
replaces `/build`'s opt-in `--auto` flag with a single model that always
tries to complete work autonomously, self-evaluating per-decision whether to
proceed, decide-and-report, or stop and ask.

## 1. Purpose & Scope

**Purpose.** Let a bare, well-formed ticket go from `/speccy` through
`/build` with zero human interruption when the work is genuinely
low-complexity and low-risk, gated by a real (not vibes-based) eligibility
check — while making `/build` itself always behave as "try hardest to finish
autonomously, ask only when the risk of guessing wrong is too high,"
regardless of how the spec it's building from was produced.

**Audience.** Contributors to mad-skills; downstream projects that install
it as a plugin.

**Relationship to `autonomous-execution-mode.md`.** This spec **amends**
that spec rather than replacing it. Unchanged: the worktree creation
mechanism itself (harness `EnterWorktree` / Superpowers fallback), the
`.mad-skills-auto` sentinel convention, GUD-002's review-depth threshold
table, the evidence-capture degradation chain, `/ship --auto`'s PR-gated
stop, and `/sync`'s worktree cleanup. Changed: `/speccy`'s worktree creation
is no longer `--auto`-exclusive; `/build`'s `--auto` flag is removed in
favor of always-autonomous-by-default; `autonomy_ready` changes from a hard
precondition gate to a weighted signal.

**In scope:**

- `/speccy` creating its worktree as the literal first action in **both**
  interactive and `--auto` modes (supersedes
  `autonomous-execution-mode.md`'s REQ-005).
- A deterministic, four-dimension eligibility gate `/speccy --auto` runs
  before attempting zero-interview inference: estimated scope, risk-keyword
  paths, architectural-surface markers, ticket clarity.
- Zero-interview inference producing a spec from a lightweight "small-task"
  template when eligible, with a new "Autonomous Inference Assessment"
  section recording why it qualified.
- Graceful fallback to today's real interview + full template when a ticket
  fails eligibility — never a hard block.
- Interactive (non-`--auto`) `/speccy` being able to achieve
  `autonomy_ready: true` when its interview answers satisfy the existing
  completeness gate — the gate is no longer `--auto`-exclusive.
- Removing `/build`'s `--auto` flag; the self-evaluating,
  autonomous-by-default model becomes the only mode.
- `/build`'s per-decision self-evaluation (assumption-authorization check →
  risk/architectural-surface check → decide-and-report), with
  `autonomy_ready` acting as a weighting signal on the boundary between the
  latter two.
- Checkpoint-only interview timing and channel-adaptive delivery (live
  `AskUserQuestion` vs. the existing headless PR-comment mechanism).
- `/build` opening a draft PR as early as practical, and never bootstrapping
  its own worktree under any circumstance.

**Out of scope (explicit, confirmed with the user):**

- **`/speccy` auto-chaining into `/build` via `/ferry` by default** (a
  `--no-build` opt-out model). Genuinely deferred — logged as its own
  follow-up. `/speccy` keeps today's behavior: it stops after writing the
  spec and displays the `/build` command; the worktree is already in place
  either way.
- **A separate `/quickie` skill.** Considered and explicitly rejected in
  favor of folding its purpose into `/speccy --auto`'s small-template path
  — see §7 Rationale.
- **`/ship`'s role shifting from PR-creator to PR-finalizer** now that
  `/build` opens the draft PR early. Real, narrow, separable follow-up —
  logged, not addressed here.
- **`/build` bootstrapping its own worktree for fully standalone
  invocation** (no prior `/speccy` run at all). Considered and explicitly
  rejected — see §7 Rationale. `/build` invoked without an inherited
  worktree refuses; it does not create one.
- **The broader "every trivial interactive edit always uses a worktree"
  policy.** This spec resolves the LOGBOOK item that raised it, but by
  answering both of its halves definitively (`/speccy` always creates one
  when it's going to feed `/build`; `/build` explicitly never creates its
  own) rather than by implementing a blanket policy — see §7 Rationale.

## 2. Definitions

- **Eligibility gate**: the deterministic four-check gate `/speccy --auto`
  runs before attempting zero-interview inference (§3, Speccy section).
- **Zero-interview inference**: producing a complete, `autonomy_ready`
  spec from a bare ticket with no interview rounds, via the small-task
  template.
- **Small-task template**: the lightweight spec template used for
  zero-interview-eligible tickets — Goal, Definition of Done, brief
  approach, risks, Assumption Authorization, Autonomous Inference
  Assessment — as opposed to the full 11-section template.
- **Autonomous Inference Assessment**: a new spec section recording the
  eligibility score/checks passed and why a spec was produced without a
  human interview.
- **Architectural-surface marker**: a file or pattern indicating a public/
  exported interface, a schema/migration file, or shared cross-cutting
  state — a dimension distinct from GUD-002's existing risk-keyword-path
  list, needed because a one-file change to a public API is small but
  high-impact.
- **Per-decision self-evaluation**: the three-step check `/build` runs
  whenever implementation surfaces a genuine ambiguity (§3, Build section).
- **Weighted signal**: `autonomy_ready`'s new role — nudging where
  self-evaluation draws the decide-vs-interview line, rather than gating
  whether `/build` runs at all.
- **Checkpoint**: a defined point in `/build`'s pipeline (post-handoff,
  code-review, verify) where a deferred interview question is actually
  surfaced — distinct from the moment the ambiguity was detected.
- **Session liveness**: whether a live, watched session exists to answer a
  question synchronously (determines `AskUserQuestion` vs. headless
  PR-comment delivery).

## 3. Requirements, Constraints & Guidelines

### Speccy — universal worktree & eligibility gate

- **REQ-001**: `/speccy` MUST create the worktree/branch as the literal
  first action in **both** `--auto` and interactive modes. Supersedes
  `autonomous-execution-mode.md`'s REQ-005, which prohibited worktree
  creation in interactive mode.
- **REQ-002**: `/speccy --auto` MUST run the eligibility gate before
  attempting zero-interview inference. A ticket is eligible only if **all**
  of the following hold:
  - **Estimated scope**: a keyword/glob exploration of the ticket text
    against the codebase finds ≤3 plausibly-touched files.
  - **Risk-keyword paths**: none of the matched files fall on the existing
    risk-keyword-path list (`references/autonomous-review-thresholds.md`)
    — reused, not duplicated.
  - **Architectural surface**: none of the matched files are a public/
    exported interface, a schema/migration file, or shared cross-cutting
    state module (new list, e.g.
    `references/autonomous-architecture-surface-markers.md`).
  - **Ticket clarity** (all three, mechanically checkable, no LLM
    judgment): contains an allowed action verb at/near the start (add,
    fix, remove, rename, update, deprecate, document, extend); contains no
    hedge/uncertainty language (maybe, perhaps, "explore options for",
    "not sure", TBD, "some kind of"); the same exploration step resolves
    ≥1 concrete file/symbol match.
- **REQ-003**: On a full eligibility pass, `/speccy --auto` MUST run
  zero-interview inference: a subagent generates the spec using the
  small-task template from the ticket text, the exploration matches, and
  codebase conventions — no interview rounds.
- **REQ-004**: Every substantive decision the inference subagent makes
  MUST become an Assumption Authorization entry, since none were
  human-confirmed.
- **REQ-005**: A zero-interview-generated spec MUST include an "Autonomous
  Inference Assessment" section stating which eligibility checks passed and
  why the ticket qualified.
- **REQ-006**: On eligibility failure (any single check fails),
  `/speccy --auto` MUST fall back to a real interactive interview
  (`autonomous-execution-mode.md`'s Stage 1–2, unchanged), producing a spec
  via the full template, then the existing completeness gate (Stage 3,
  unchanged). Failure is never a hard block — it degrades to today's
  already-shipped `--auto` behavior.
- **REQ-007**: Interactive (non-`--auto`) `/speccy` MAY achieve
  `autonomy_ready: true` when its interview answers satisfy the existing
  completeness gate. The gate is no longer `--auto`-exclusive — closes the
  gap where a careful human-run interview previously produced a spec
  `/build` could never run unattended.
- **CON-001**: No `--force-interview`-style escape hatch. A user who wants
  to guarantee an interview simply doesn't pass `--auto`.
- **CON-002**: The small-task template MUST NOT duplicate content already
  covered by the shared `references/` contracts from
  `autonomous-execution-mode.md` (e.g. the risk-keyword-path list) — it
  references them, consistent with that spec's own PAT-001 extraction
  pattern.

### Build — unified autonomous execution model

- **REQ-008**: `/build`'s `--auto` flag is REMOVED. The self-evaluating,
  autonomous-by-default model described below (REQ-009–015) is the only
  mode; there is no longer a structurally distinct "interactive build"
  mode. Live vs. headless only changes interview delivery (REQ-013), not
  whether `/build` behaves differently.
- **REQ-009**: `/build` MUST NOT create its own worktree under any
  circumstance. It MUST be invoked against a spec whose worktree already
  exists (created by `/speccy` per REQ-001). Invoked without an existing
  worktree, `/build` MUST refuse immediately with a message directing the
  user to run `/speccy` first — the same fail-fast, do-no-partial-work
  shape as `autonomous-execution-mode.md`'s AC-001 (there, the trigger was
  missing `autonomy_ready`; here, it's a missing worktree).
- **REQ-010**: Whenever implementation surfaces a genuine ambiguity,
  `/build` MUST run this three-step check, in order:
  1. **Covered by the spec's Assumption Authorization list?** → resolve
     per that authorization, silently; report the resolution in the PR.
  2. **Not covered — does it touch a risk-keyword path or an
     architectural-surface marker** (same two lists from REQ-002)?
     → interview (REQ-012–013).
  3. **Not covered, not risky** → decide, record a new Assumption
     Authorization entry, keep going.
- **REQ-011**: `autonomy_ready` acts as a weighting signal on step 1/2's
  boundary in REQ-010: `true` nudges borderline cases toward step 3
  (decide); `false`/absent nudges borderline cases toward step 2
  (interview). Supersedes `autonomous-execution-mode.md`'s REQ-011, which
  treated `autonomy_ready` as a hard precondition gate rather than a
  weighted input.
- **REQ-012**: Interviews triggered by REQ-010 MUST only be surfaced at
  defined checkpoints — immediately after handoff (before implementation
  begins), at code-review, at verify — never mid-implementation. Ambiguity
  may be *detected* at any point; the question itself is deferred to the
  next checkpoint.
- **REQ-013**: The interview delivery channel MUST adapt to session
  liveness: `AskUserQuestion` (with a recommendation) when a live session
  is present and watching; the existing headless PR-comment + notification
  mechanism (`autonomous-execution-mode.md` REQ-024–028) otherwise.
- **REQ-014**: `/build` MUST open a draft PR as early as practical — at or
  before the first substantive implementation work, since a first commit
  (the spec file, from `/speccy`'s existing first-commit behavior) already
  exists by the time `/build` starts. This draft PR becomes the running
  surface for all subsequent questions, decisions, and evidence — not an
  artifact that only appears at the end. Retroactively resolves a latent
  gap in the merged spec: REQ-026 already assumed mid-build questions post
  to "the (draft) PR already open for this work," but nothing in the
  previously-shipped pipeline created one before the final ship stage.
- **REQ-015**: All existing `--auto` pipeline mechanics from
  `autonomous-execution-mode.md` — Sonnet model tiering, GUD-002
  review-depth dispatch, the 2-attempt fix-loop cap, `/goal`+`/loop`
  guardrails, the evidence-capture degradation chain — carry over
  UNCHANGED. They are no longer gated behind a flag; they are simply how
  `/build` always works now.

### Cross-cutting

- **PAT-001**: New deterministic reference tables (architectural-surface
  markers, the small-task template) follow the existing `references/`
  placement convention from `autonomous-execution-mode.md` — top-level for
  content shared across skills, per-skill for skill-specific behavior.

## 4. Interfaces & Data Contracts

### Small-task spec template (new)

```md
---
title: [Concise title]
version: 1.0
date_created: [YYYY-MM-DD]
last_updated: [YYYY-MM-DD]
tags: [...]
autonomy_ready: true
---

# Goal

[The ticket, restated precisely.]

## Autonomous Inference Assessment

- **Eligibility checks passed**: scope ({N} files) / risk-keywords (none
  matched) / architectural-surface (none matched) / clarity (verb present,
  no hedge language, {N} symbol matches)
- **Why this qualified**: [1-2 sentences]

## Approach

[Brief inferred approach — what will change and how, informed by the
matched files' existing conventions.]

## Definition of Done

- [ ] {checkable, testable statement}

## Risks

[Known risks, even though the ticket passed the eligibility gate.]

## Assumption Authorization

- **Ambiguity**: {what wasn't specified in the ticket}
  **Authorized decision**: {what the inference subagent chose}
  **Must report**: {what the PR must say about this decision}
```

### Frontmatter — `autonomy_ready` semantics update

`autonomy_ready: true | false` — unchanged field, changed meaning for
`/build`: no longer a hard precondition (`autonomous-execution-mode.md`'s
old REQ-011), now a weighting input to REQ-010's per-decision check (§3).
`/build` still runs regardless of this field's value or absence; it only
changes how readily borderline ambiguities get decided vs. escalated.

### Architectural-surface markers table

Defined in a new reference file (exact path per PAT-001/CON-002), consumed
by both `/speccy --auto`'s eligibility gate (REQ-002) and `/build`'s
per-decision check (REQ-010). Single source, referenced by both, never
duplicated — mirrors how both consumers already share the risk-keyword-path
list.

## 5. Acceptance Criteria

- **AC-001**: Given a ticket that passes all four eligibility checks, When
  `/speccy --auto` runs, Then it produces a small-task-template spec with
  no interview rounds and a populated Autonomous Inference Assessment
  section.
- **AC-002**: Given a ticket that fails any eligibility check, When
  `/speccy --auto` runs, Then it falls back to a real interview and
  produces a full-template spec — the run does not block or error out.
- **AC-003**: Given interactive `/speccy` completes an interview whose
  answers satisfy the completeness gate, When the spec is generated, Then
  `autonomy_ready` is `true` even though `--auto` was never passed.
- **AC-004**: Given `/build` is invoked without an existing worktree, When
  it starts, Then it refuses immediately with a message directing the user
  to `/speccy` — it does not attempt to create one itself.
- **AC-005**: Given `/build` hits an ambiguity covered by the spec's
  Assumption Authorization list, When it resolves the decision, Then it
  proceeds without asking and records the resolution in the PR.
- **AC-006**: Given `/build` hits an ambiguity NOT covered by the
  assumption list and touching a risk-keyword path or architectural-surface
  marker, When the next checkpoint arrives, Then it interviews rather than
  deciding alone.
- **AC-007**: Given `/build` hits an ambiguity NOT covered and NOT risky,
  When it resolves the decision, Then it proceeds, records a new
  Assumption Authorization entry, and does not interview.
- **AC-008**: Given a live session is watching, When `/build` needs to
  interview, Then it uses `AskUserQuestion` with a recommendation; Given a
  headless run, When `/build` needs to interview, Then it posts to the
  draft PR and sends a notification.
- **AC-009**: Given `/build` begins implementation, When the first
  substantive work starts, Then a draft PR already exists — not only at
  the end of the run.
- **AC-010**: Given `autonomy_ready: true` on the spec, When a borderline
  ambiguity arises, Then `/build` is more likely to decide-and-report than
  to interview, compared to the identical ambiguity against a spec with
  `autonomy_ready: false` or absent.

## 6. Test Automation Strategy

- **Test Levels**: Skill-level evals (`tests/evals.json` pattern, mirroring
  `autonomous-execution-mode.md`'s own precedent) for the eligibility gate,
  the fallback path, and `/build`'s three-step check; scripted unit tests
  (`node --test`) for the deterministic helpers (eligibility scoring
  script, architectural-surface matching).
- **Frameworks**: `node --test`, the existing eval runner
  (`scripts/run-evals.js`).
- **New eval cases required**: `skills/speccy/tests/evals.json`
  (eligibility pass/fail across all four dimensions individually, small-vs-
  full template selection, interactive-mode `autonomy_ready: true`);
  `skills/build/tests/evals.json` (each of the three self-evaluation
  branches, checkpoint-only timing, channel selection by liveness, refusal
  when no worktree exists, `autonomy_ready` weighting behavior at the
  decide/interview boundary).
- **Coverage Requirements**: every REQ/AC in this spec maps to at least one
  eval case or unit test before this spec is considered implemented.
- **Manual/E2E validation**: a real end-to-end run — an eligible ticket
  through `/speccy` (zero-interview) → `/build` (autonomous, no
  interruption) → an open PR with full evidence — as a smoke test before
  documenting this as the default behavior.

## 7. Rationale & Context

**Why `/build` never bootstraps its own worktree.** Considered allowing it,
for resilience — a `/build` that flatly refuses without a specific
precondition feels brittle once autonomy is the default, not an opt-in.
Rejected: if `/build` can create its own worktree, it can also be invoked
from a bare prompt with no spec at all — no Definition of Done, no
Assumption Authorization, no completeness gate. That's not a missing
nicety, it undercuts the entire point of this system: that autonomous work
traces back to a reviewable artifact. The resilience concern is better
solved by making `/speccy --auto`'s zero-interview path cheap enough
(seconds, for a genuinely eligible ticket) that every caller — human or a
future automated trigger — naturally calls it first as an unconditional
first step. `/build`'s refusal becomes a forcing function that guarantees
every autonomous build has real spec content behind it, not an obstacle.
Confirmed explicitly with the user.

**Why eligibility scoring (and the risk/architectural-surface checks
inside `/build`'s self-evaluation) stay fully deterministic.** Directly
reuses `autonomous-execution-mode.md`'s own GUD-002 rationale: an LLM's
per-run sense of "is this risky" is inconsistent across runs; a
file-count-plus-keyword-path table is deterministic, testable, and tunable
in one place. The one part of the eligibility gate that seems inherently
judgment-based — "is this ticket clear enough" — was deliberately
decomposed into three mechanically checkable sub-signals (verb presence,
absence of hedge language, resolves to a real file/symbol) rather than left
as an LLM opinion.

**Why zero-interview inference itself is judgment-driven, unlike
eligibility scoring.** Once a ticket passes the deterministic gate, writing
the actual spec content (approach, risks, Definition of Done) inherently
requires judgment — that's what makes it inference rather than templating.
The deterministic gate's job is to bound *when* that judgment is trusted,
not to replace it. Every judgment call the inference subagent makes becomes
an Assumption Authorization entry precisely because eligibility having
passed doesn't mean the specific choices were confirmed by anyone.

**Why a separate `/quickie` skill was considered and rejected.**
`specs/autonomous-execution-mode.md`'s own §7 already weighed "separate
skills vs. a flag on existing skills" for `--auto` and explicitly rejected
separate skills, citing shared-plumbing duplication and skill-count
sprawl (14 skills already). A `/quickie` skill would have needed the exact
same eligibility-scoring logic as `/speccy --auto`'s zero-interview path —
maintaining it in two places invites drift. Folding it into `/speccy --auto`
as a template choice (small vs. full) rather than a separate command
reuses one mechanism and stays consistent with that precedent. Confirmed
explicitly with the user after two rounds of alternatives (a dedicated
`/quickie` skill, then a renamed flag) were weighed against it.

**Why checkpoint-only interview timing instead of interrupting the moment
ambiguity is detected.** Matches the existing headless mid-build question
mechanism's own principle (`autonomous-execution-mode.md` REQ-024:
"continue any other independent work rather than blocking the entire run
on one open question") — this spec formalizes *where* that principle
surfaces a question (defined checkpoints) rather than introducing a new
one.

**Why the draft PR opens early instead of only at the end.** Two reasons.
First, it retroactively fixes a real gap: the merged spec's REQ-026
already assumed a "(draft) PR already open" existed for mid-build questions
to attach to, but nothing before the final ship stage actually created
one. Second, it gives every checkpoint interview and every evidence
artifact one consistent, durable surface, rather than needing a fallback
channel (GitHub issue, chat) for the narrow window before a PR exists —
and that window turns out to be effectively already closed, since
`/speccy`'s existing first-commit behavior (committing the spec file)
means a commit to open a PR against already exists by the time `/build`
starts.

**Why `autonomy_ready` becomes a weighted signal instead of a hard gate.**
The entire value of `/build`'s new self-evaluation model is that it can
reason about risk *per decision*, not just once at the start. Keeping
`autonomy_ready` as a binary hard gate would have meant either (a) it
still blocks anything without a spec, in tension with the removal of
`--auto` as an opt-in concept, or (b) it becomes meaningless once `--auto`
is the only mode. Making it a weighting input lets a thoroughly-vetted spec
(human interview, full completeness-gate pass) earn `/build`'s trust for
borderline calls, while a thin or absent spec keeps `/build` appropriately
cautious — without ever making `/build` refuse to try.

**Why this resolves the "universal worktree policy" LOGBOOK item without
implementing what that item originally proposed.** That item proposed
"both `/speccy` and `/build` always work in a worktree." This spec answers
its two halves separately and definitively: `/speccy` — yes, always (REQ-
001). `/build` — no, never bootstraps its own, by deliberate rejection (see
above), not oversight. Both halves now have considered answers, so the item
is resolved, not merely narrowed.

## 8. Dependencies & External Integrations

### External Systems
- **EXT-001**: GitHub / Azure DevOps (via `/ship`'s existing platform
  detection) — no change; draft-PR creation reuses the same platform-
  specific tooling `/ship` already uses, moved earlier in the pipeline.

### Infrastructure Dependencies
- **INF-001**: Git worktrees — creation mechanism unchanged from
  `autonomous-execution-mode.md` (harness `EnterWorktree` / Superpowers
  `using-git-worktrees` fallback). This spec changes *when* `/speccy`
  creates one (always, not `--auto`-only), not *how*.

### Technology Platform Dependencies
- **PLT-001**: `AskUserQuestion`, `/goal`, `/loop`, native `/code-review`,
  `/security-review`, `/verify` — unchanged from `autonomous-execution-
  mode.md`; no new platform dependency introduced.

## 9. Examples & Edge Cases

**Worked example — zero-interview happy path:** `/speccy --auto "add a
--verbose flag to /sync that prints each cleanup decision"` — exploration
matches `skills/sync/scripts/sync.sh` and `skills/sync/SKILL.md` (2 files,
no risk-keyword/architectural-surface hits, ticket has a clear verb and no
hedge language). Eligibility passes; a subagent writes a small-task spec
with `autonomy_ready: true` and an Autonomous Inference Assessment section,
committed as the branch's first commit. `/build` starts against it, opens a
draft PR immediately, implements without interruption (no ambiguity rises
to the risk/architectural-surface bar), and the PR is ready for review —
zero human interaction from ticket to PR.

**Worked example — ineligible, graceful fallback:** `/speccy --auto
"rework the payment webhook handler to support partial refunds"` —
exploration matches a file on the risk-keyword-path list (payment/billing).
Eligibility fails on the risk-keyword check alone; `/speccy --auto` falls
back to a real interview, produces a full-template spec, and the
completeness gate runs as it does today. No error, no special "rejected"
state — just today's already-shipped `--auto` behavior.

**Worked example — interactive interview enabling autonomous build:** a
developer runs plain `/speccy` (no `--auto`) because they're still working
out the shape of a feature. The interview runs, a worktree is created
(REQ-001), and because the answers satisfy the completeness gate,
`autonomy_ready: true` (REQ-007) — even though `--auto` was never used.
Later, the developer runs `/build` against that spec; it proceeds
autonomously per REQ-008–015, since `/build` no longer treats "was `--auto`
used at spec time" as relevant at all.

**Edge case — ambiguity found mid-implementation, deferred to a
checkpoint:** `/build` is implementing a change and discovers a decision
that isn't covered by Assumption Authorization and touches an
architectural-surface marker. It doesn't stop immediately — it keeps
working on independent parts of the task, and surfaces the question at the
next checkpoint (e.g. before code-review), via `AskUserQuestion` if the
session is live, or a draft-PR comment + notification if not.

**Edge case — `/build` invoked with no prior `/speccy` run:** a user (or a
future automated trigger) invokes `/build` directly against a bare
directory with no worktree. `/build` refuses immediately: "run `/speccy`
first" — it does not attempt to bootstrap an environment itself.

## 10. Validation Criteria

This specification is satisfied when:
- Every REQ/CON/GUD/PAT above is implemented and has a corresponding eval
  or unit test (§6).
- AC-001 through AC-010 pass against a real (not simulated) run.
- A full zero-interview `/speccy` → `/build` run against a genuinely small
  internal change produces an open PR with full evidence, with zero
  interactive prompts along the way.
- A full ineligible-ticket run produces a real interview and a full-
  template spec, indistinguishable from today's already-shipped `--auto`
  interview behavior.
- Existing `autonomous-execution-mode.md` evals for unchanged behavior
  (evidence capture, review-depth dispatch, fix-loop cap, ship's PR-gated
  stop, `/sync` worktree cleanup) are verified unchanged — zero
  regressions.

## 11. Related Specifications / Further Reading

- `specs/autonomous-execution-mode.md` — the spec this one amends; §7 of
  that spec's own rationale ("why fully autonomous speccy is out of
  scope") is the direct predecessor this spec resolves.
- `specs/worktree-discipline-guardrails.md` — the underlying worktree
  creation/detection mechanism both specs build on, unchanged by this one.
- `LOGBOOK.md` — resolves the "fully autonomous /speccy" and "universal
  worktree policy" follow-up items captured during this spec's own
  brainstorming session; logs two new narrower follow-ups this spec
  intentionally does not address (`/speccy` auto-chain via `/ferry`,
  `/ship`'s PR-creator-to-finalizer role shift).
