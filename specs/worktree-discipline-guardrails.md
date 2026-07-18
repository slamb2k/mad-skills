---
title: Worktree Discipline Guardrails for speccy, build, and ship
version: 1.0
date_created: 2026-07-18
last_updated: 2026-07-18
tags: [process, tool, guardrail, worktrees, skills]
---

# Introduction

A prior session's `/speccy` wrote a new spec file using a plain relative path
(`specs/{name}.md`, per its own instructions) while its Bash shell's cwd was
inside an unrelated, leftover worktree (`.claude/worktrees/process-phase5`,
from a different, still-in-progress feature). The spec landed in the primary
checkout instead of wherever the session's file-tool root actually was
pointing, because in this harness Read/Write/Edit resolve relative paths
against the session's own fixed working directory — not wherever Bash `cd` or
a worktree checkout left things. A second session then spent real effort
(`git reflog`, `git worktree list`, manual `pwd` checks) working out where its
own spec had gone.

mad-skills has zero existing worktree-aware logic anywhere in the repo.
Worktree creation and teardown are both owned outside mad-skills — either the
harness's native `EnterWorktree`/`ExitWorktree` tools (creates under
`.claude/worktrees/`, and explicitly updates the session's working directory
and cwd-dependent caches when used) or Superpowers' `using-git-worktrees` /
`finishing-a-development-branch` skills (fallback path: raw `git worktree add`
+ Bash `cd` under `.worktrees/`/`worktrees/`, with its own scoped teardown).
This specification adds a detection-and-warning guardrail to mad-skills'
three file-writing skills (`speccy`, `build`, `ship`) plus a documentation
guardrail in generated project `CLAUDE.md` files — without mad-skills
creating, naming, or tearing down any worktree itself.

## 1. Purpose & Scope

**Purpose.** Prevent a session's Bash cwd from silently diverging from its
own file-tool root — the exact condition that caused the incident — and
document worktree hygiene rules for downstream projects, without mad-skills
taking on any worktree lifecycle ownership it doesn't already have.

**Audience.** Contributors to the mad-skills repository.

**In scope:**

- A shared root-mismatch check (`references/location-check.md`) comparing
  Bash's `git rev-parse --show-toplevel` against the session's declared
  working directory, with a blocking `AskUserQuestion` on mismatch.
- Wiring that check into `/speccy` (before Stage 1), `/build` (pre-stage,
  alongside the existing Branch Check), and `/ship` (after Pre-flight, before
  Stage 1: Sync).
- An explicit "relative paths don't follow `cd`" rule added to `/build`'s
  Stage 4 implementer prompt template (`skills/build/references/stage-prompts.md`)
  and, as advisory-only context, to `references/superpowers-deferral.md`.
- A new, non-prescriptive `## Worktree Discipline` section in the CLAUDE.md
  template (`skills/brace/references/claude-md-template.md`) plus a retrofit
  injection step in `skills/brace/SKILL.md`, mirroring the existing Branch
  Discipline section/injection.
- New eval cases in `skills/build/tests/evals.json`,
  `skills/speccy/tests/evals.json`, `skills/ship/tests/evals.json`, and
  `skills/brace/tests/evals.json`.

**Out of scope (explicitly unchanged):**

- Any mechanism that creates, names, or removes a worktree. mad-skills does
  not call `git worktree add`/`remove`, `EnterWorktree`, or `ExitWorktree`
  anywhere in this change.
- Prescribing a specific worktree path convention (e.g. `.claude/worktrees/<slug>`)
  as a mad-skills rule — that convention belongs to whichever tool actually
  creates the worktree (harness or Superpowers), not to mad-skills.
- A "does this worktree relate to my current PLAN" relatedness heuristic —
  investigated and rejected; no reliable signal exists to key off (see
  Rationale).
- Modifying the `superpowers` plugin itself, or its `using-git-worktrees` /
  `finishing-a-development-branch` skills.
- `/prime`, `/rig`, `/dock`, `/keel`, `/hoist`, `/sync`, `/distil`, `/ferry`,
  `/logbook` — none write fresh planning/implementation artifacts in the way
  `speccy`/`build`/`ship` do; left unchanged.

## 2. Definitions

- **Declared working directory**: The working directory a session is told at
  startup (e.g. "Primary working directory: ..."); the root Read/Write/Edit
  resolve relative paths against for that session.
- **Toplevel mismatch**: The condition where `git rev-parse --show-toplevel`,
  run from Bash's current cwd, does not equal the session's declared working
  directory. This is the exact condition that caused the incident: Bash's cwd
  had drifted (e.g. into a leftover worktree) while the file-tool root had not
  followed.
- **Linked worktree**: A git worktree other than the primary checkout,
  detectable via `git rev-parse --git-dir` != `git rev-parse --git-common-dir`.
- **Native worktree tools**: The harness's `EnterWorktree`/`ExitWorktree`
  tools, which create worktrees under `.claude/worktrees/` and explicitly
  switch the session's own working directory when used (unlike a raw Bash `cd`).
- **Reorient (behavioral)**: The user's choice, on a mismatch warning, to
  proceed by using absolute paths rooted at the declared working directory for
  every subsequent Write/Edit/Read call — with no corrective Bash command
  (e.g. `cd`) attempted, since `cd` does not affect file-tool path resolution.

## 3. Requirements, Constraints & Guidelines

### Detection & Shared Logic

- **REQ-001**: A shared reference, `references/location-check.md`, SHALL
  contain the bash snippet and `AskUserQuestion` prompt template for the
  root-mismatch check, mirroring the existing `references/superpowers-deferral.md`
  shared-file convention (one file, referenced identically by every caller).
- **REQ-002**: The check SHALL compare `git rev-parse --show-toplevel` (run
  from Bash's current cwd) against the session's declared working directory.
  It SHALL NOT attempt a "does this worktree relate to my PLAN" relatedness
  heuristic (see CON-001).
- **REQ-003**: The check MAY additionally report linked-worktree status
  (`git rev-parse --git-dir` vs `--git-common-dir`) as context in the warning
  message, but this signal alone SHALL NOT trigger the warning — only a
  toplevel mismatch triggers it.
- **REQ-004**: On mismatch, the caller SHALL warn via a blocking
  `AskUserQuestion` with options structured as:
  - "Continue using absolute paths rooted at `{declared_root}` (Recommended)"
    — reorient behaviorally per REQ-005, no Bash correction.
  - "This is fine, proceed as-is" — user confirms the mismatch is intentional
    (e.g. deliberately dispatching a subagent with a pinned cwd).
  - "Cancel" — stop and let the user investigate manually.
- **REQ-005**: Choosing "reorient" SHALL be purely behavioral: the session
  commits to using absolute paths rooted at the declared working directory
  for every subsequent Write/Edit/Read call in the current task. No corrective
  Bash command (e.g. `cd`) SHALL be run or suggested as part of this choice.
- **REQ-006**: On no mismatch (`toplevel == declared root`), the check SHALL
  pass silently — no warning, no output.

### Wiring into speccy, build, ship

- **REQ-007**: `/speccy` SHALL run the check from `references/location-check.md`
  before Stage 1 (Context Gathering), alongside the existing Pre-Spec Branch
  Check (advisory-only; unaffected by this change).
- **REQ-008**: `/build` SHALL run the check as a new subsection ("Pre-Build
  Location Check") in `skills/build/references/pre-stage.md`, alongside the
  existing "Pre-Build Branch Check". The two checks SHALL remain independent
  bash blocks — this change SHALL NOT merge them into one combined block.
- **REQ-009**: `/ship` SHALL run the check ("Pre-Ship Location Check")
  immediately after the existing `## Pre-flight` section and before
  `## Stage 1: Sync`.
- **REQ-010**: All three callers SHALL reference the shared
  `references/location-check.md` file rather than duplicating the bash
  snippet or prompt text inline.

### Absolute-path rule for subagent dispatch

- **REQ-011**: `skills/build/references/stage-prompts.md`'s Stage 4
  implementer prompt template SHALL include an explicit rule (added to the
  existing "Rules" bullet list) stating that relative Read/Write/Edit paths do
  not follow a Bash `cd`, and that any subagent operating inside or entering a
  worktree must use absolute paths for every file-tool call for the rest of
  its task.
- **REQ-012**: `references/superpowers-deferral.md` SHALL gain a note stating
  the same rule as advisory-only context for whoever orchestrates the
  deferral to `superpowers:executing-plans`/`subagent-driven-development` —
  explicitly documented as non-enforced, since mad-skills does not own
  Superpowers' own implementer-prompt templates (CON-002).

### CLAUDE.md template & retrofit

- **REQ-013**: `skills/brace/references/claude-md-template.md` SHALL gain a
  new `## Worktree Discipline` section, positioned near the existing
  `## Branch Discipline` section, containing only non-prescriptive rules:
  relative paths don't follow `cd`; never reuse an existing worktree for an
  unrelated task; don't leave worktrees dangling once a branch is finished.
  It SHALL NOT assert a specific worktree path convention or claim mad-skills
  tracks/enforces teardown (CON-003).
- **REQ-014**: `skills/brace/SKILL.md` SHALL gain a "Worktree Discipline
  Injection" step mirroring the existing "Branch Discipline Injection" step
  exactly: idempotent (`grep -q "## Worktree Discipline" CLAUDE.md`), inserted
  immediately after `## Branch Discipline` (or before `## Guardrails` if
  Branch Discipline is absent), run in the same retrofit pass.

### Guidelines & Patterns

- **GUD-001**: Reuse the existing shared-reference-file convention
  (`references/superpowers-deferral.md`) as the structural model for
  `references/location-check.md` — one file, identical wording per caller,
  parameterized only by the invoking skill's name/stage label.
- **GUD-002**: Keep the mismatch warning to the same visual/tone convention as
  the existing Pre-Build Branch Check (`AskUserQuestion` with one
  `(Recommended)`-marked default option, quoted question text, bulleted
  options).
- **PAT-001**: Model the Worktree Discipline CLAUDE.md section and its
  injection step structurally on the existing Branch Discipline section and
  Branch Discipline Injection step — same heading depth, same idempotency
  pattern, positioned adjacently.

### Constraints

- **CON-001**: The check SHALL NOT implement a "worktree relatedness to PLAN"
  heuristic (branch name / commit content matching). Investigated and
  rejected: no reliable on-disk signal distinguishes a related worktree from
  an unrelated one, and a heuristic with a high false-negative rate would give
  false confidence. The toplevel-mismatch check (REQ-002) is the substitute —
  it detects the actual failure mechanism directly instead of guessing at
  relatedness.
- **CON-002**: This change SHALL NOT modify the `superpowers` plugin. The
  `references/superpowers-deferral.md` addition (REQ-012) is advisory
  documentation only, not an enforcement mechanism — this MUST be stated
  explicitly in the doc itself.
- **CON-003**: This change SHALL NOT introduce any new worktree-creation or
  worktree-teardown code in mad-skills. Teardown remains owned by whichever
  tool created the worktree (`ExitWorktree` for native/`​.claude/worktrees/`,
  `finishing-a-development-branch` Step 6 for Superpowers-created
  `.worktrees/`/`worktrees/`).
- **CON-004**: The existing Pre-Build Branch Check and Pre-Spec Branch Check
  behavior (staleness warnings) MUST remain byte-for-byte unchanged — this is
  purely additive.

## 4. Interfaces & Data Contracts

### `references/location-check.md` (indicative)

```bash
BASH_TOPLEVEL=$(git rev-parse --show-toplevel 2>/dev/null)
GIT_DIR=$(git rev-parse --git-dir 2>/dev/null)
GIT_COMMON=$(git rev-parse --git-common-dir 2>/dev/null)
# {DECLARED_ROOT} is the session's own declared working directory (known from
# environment context, not derived via bash)
```

- If `BASH_TOPLEVEL` == `{DECLARED_ROOT}`: pass silently (REQ-006).
- Else: warn via `AskUserQuestion` (REQ-004), reporting `BASH_TOPLEVEL`,
  `{DECLARED_ROOT}`, and — as context only — whether `GIT_DIR != GIT_COMMON`
  (linked worktree) to help the user understand why the mismatch occurred.

Indicative prompt text (parameterized by `{caller}` = "before starting the
interview" / "before Stage 1" / "before syncing"):

```
"Your shell's working directory doesn't match this session's file-tool root
({DECLARED_ROOT}) — Bash appears to be inside {BASH_TOPLEVEL} instead. Any
relative Write/Edit path {caller} will resolve against {DECLARED_ROOT}, not
what Bash shows."
```

Options: "Continue using absolute paths rooted at {DECLARED_ROOT} (Recommended)"
/ "This is fine, proceed as-is" / "Cancel".

### Caller wiring

| Caller | Insertion point | Existing neighbor |
|---|---|---|
| `/speccy` | Before Stage 1 (Context Gathering) | Pre-Spec Branch Check |
| `/build` | `references/pre-stage.md`, new subsection | Pre-Build Branch Check |
| `/ship` | After `## Pre-flight`, before `## Stage 1: Sync` | Pre-flight dependency table |

### Stage 4 Rules addition (indicative)

Appended to the existing bullet list in
`skills/build/references/stage-prompts.md` Stage 4 (lines ~156–165):

```
- Relative Read/Write/Edit paths do not follow a Bash `cd`. If you enter or
  are already inside a worktree, use absolute paths rooted at that worktree
  for every file-tool call for the rest of this task.
```

## 5. Acceptance Criteria

- **AC-001**: Given Bash's cwd toplevel matches the session's declared
  working directory, When `/speccy`, `/build`, or `/ship` runs its location
  check, Then it passes silently with no warning and no behavior change from
  today.
- **AC-002**: Given Bash's cwd toplevel does NOT match the session's declared
  working directory, When any of the three skills runs its location check,
  Then it blocks with an `AskUserQuestion` offering reorient / proceed-as-is /
  cancel, with reorient marked `(Recommended)`.
- **AC-003**: Given the user selects "reorient", When the skill continues,
  Then no Bash `cd` or other corrective shell command is run — the skill
  proceeds using absolute paths for subsequent file-tool calls.
- **AC-004**: Given `/build` reaches Stage 4, When the implementer subagent
  prompt is assembled, Then it includes the absolute-path rule from REQ-011.
- **AC-005**: Given a project CLAUDE.md generated or retrofitted by `/brace`,
  When it does not yet contain `## Worktree Discipline`, Then `/brace` inserts
  the section adjacent to `## Branch Discipline` (or before `## Guardrails`
  if absent); When it already contains the section, Then `/brace` skips
  insertion (idempotent).
- **AC-006**: Given the existing Pre-Build/Pre-Spec Branch Check behavior,
  When this change ships, Then that behavior is unchanged (CON-004) —
  verified by no diff to its existing eval assertions.
- **AC-007**: Given `references/superpowers-deferral.md`, When it is updated
  per REQ-012, Then it explicitly states the absolute-path note is advisory
  only, not enforced by mad-skills.

## 6. Test Automation Strategy

- **Test Levels**: Skill-eval (behavioral, via `scripts/run-evals.js`),
  structural (`scripts/validate-skills.js`, `scripts/lint-skills.js`).
- **Frameworks**: Existing `evals.json` per-skill convention
  (`contains`/`regex`/`semantic` assertions) — no new framework introduced.
- **Test Data Management**: Eval prompts simulate the mismatch condition
  narratively (no real worktree fixture needed — assertions are semantic,
  checking that the skill *would* warn given a described mismatch, matching
  how existing branch-check evals are written).
- **CI/CD Integration**: Runs under the existing `ci.yml` (validate + lint,
  then evals behind the API-key guard) — no pipeline changes.
- **Coverage Requirements**: At least one eval case per skill
  (`speccy`, `build`, `ship`) asserting the mismatch warning fires, and one
  case in `brace` asserting the CLAUDE.md injection.
- **Performance Testing**: N/A — the check is a bounded `git rev-parse` call.

## 7. Rationale & Context

- **Why toplevel-mismatch over relatedness heuristic**: The original
  incident write-up proposed warning only when a linked worktree "looks
  unrelated" to the current PLAN (branch name / commit content matching). No
  reliable signal exists for this — a worktree's branch name is often
  unrelated to a spec's filename even when correctly in use, and vice versa.
  The toplevel-vs-declared-root comparison instead detects the actual
  mechanism of the incident directly: Bash's cwd drifted from the file-tool
  root. This has a near-zero false-positive rate, which is what justifies
  making the warning a blocking `AskUserQuestion` (REQ-004) rather than a
  passive log line.
- **Why not prescribe `.claude/worktrees/<slug>` or teardown enforcement**:
  mad-skills creates no worktrees itself — that's the harness's
  `EnterWorktree`/`ExitWorktree` tools or Superpowers'
  `using-git-worktrees`/`finishing-a-development-branch`, each with its own
  path convention and cleanup already implemented (`ExitWorktree`'s
  session-exit prompt; `finishing-a-development-branch`'s Step 6, explicitly
  scoped to worktrees "Superpowers created — we own cleanup"). Asserting a
  convention or teardown responsibility mad-skills doesn't implement would be
  a false promise and risks contradicting whichever tool actually owns it —
  the same "phantom state" risk `finishing-a-development-branch` itself warns
  against for exactly this reason.
- **Why a shared `references/location-check.md`**: mad-skills already has
  this exact pattern for `references/superpowers-deferral.md` — one shared
  file, referenced identically from multiple skills, avoiding drift between
  copies. Reusing an established convention rather than inventing a new one.
- **Why `/ship` is in scope**: while `/ship` writes fewer fresh files than
  `/speccy`/`/build`, it does author commit messages and PR descriptions from
  the working tree state; a root mismatch there risks committing/describing
  the wrong tree. Included per explicit user decision during the interview.
- **Why the Stage 4 absolute-path rule is the primary fix, not the location
  check**: the location check only catches a mismatch at the *orchestrator's*
  pre-flight moment, before any subagents are spawned. A subagent dispatched
  mid-task can still have its own pinned cwd independent of the parent's
  root. The absolute-path rule in the Stage 4 prompt template (REQ-011)
  closes that gap regardless of whether the pre-flight check fired — it is
  the fix that holds even when detection misses, and the location check is
  defense-in-depth on top of it, not the other way around.

## 8. Dependencies & External Integrations

### External Systems
- **EXT-001**: Harness native `EnterWorktree`/`ExitWorktree` tools —
  unmodified; referenced only descriptively in the CLAUDE.md Worktree
  Discipline section and this spec's rationale.
- **EXT-002**: Superpowers' `using-git-worktrees` / `finishing-a-development-branch`
  skills — unmodified; `references/superpowers-deferral.md` gains an
  advisory-only note (REQ-012), not a functional change to Superpowers.

### Infrastructure Dependencies
- **INF-001**: Existing `ci.yml` pipeline (validate/lint/eval) — extended with
  new eval cases, no pipeline changes.

### Data Dependencies
- **DAT-001**: Git working-tree state (`git rev-parse --show-toplevel`,
  `--git-dir`, `--git-common-dir`) — read-only.

### Technology Platform Dependencies
- **PLT-001**: Node.js >= 18 (already required by the repo) — unaffected,
  this change is pure bash/markdown, no new Node code.

## 9. Examples & Edge Cases

- **Subagent with a deliberately pinned cwd** (e.g. a Stage 4 implementer
  agent whose working directory was intentionally set by the orchestrator):
  the mismatch check is only run by the primary/orchestrator session before
  spawning subagents (REQ-007/008/009), not inside subagents themselves — so
  this case doesn't trigger a false warning. Subagent path safety is handled
  separately by REQ-011.
- **User genuinely working inside a worktree on purpose** (e.g. resuming a
  hand-off session already inside `.claude/worktrees/my-feature` with a
  matching declared root): toplevel and declared root agree — check passes
  silently (REQ-006), no friction added to the normal worktree-based
  workflow.
- **Detached HEAD / submodule**: `git rev-parse --show-toplevel` still
  resolves correctly for both; no special-casing needed since the comparison
  is purely path-based, not branch-based.
- **Superpowers absent, native `EnterWorktree` also unavailable, user manually
  ran `git worktree add` + `cd`**: this is exactly the incident scenario —
  toplevel mismatch fires, warning surfaces, user reorients.
- **`git rev-parse` fails entirely (not a git repo)**: the check SHALL no-op
  (treat as "no mismatch data available", pass silently) rather than error —
  mirrors how the existing Branch Check already tolerates non-repo directories.

## 10. Validation Criteria

- `npm run validate` and `npm run lint` pass with the modified skills.
- Eval suite includes at least one mismatch-warning case each for `speccy`,
  `build`, `ship`, and one CLAUDE.md-injection case for `brace`; all pass.
- Manual confirmation that the existing Pre-Build/Pre-Spec Branch Check evals
  are unchanged (regression check, CON-004).
- Manual confirmation that `references/superpowers-deferral.md` explicitly
  labels the absolute-path note as advisory-only (CON-002).
- Manual confirmation that no new worktree-creation/removal code was
  introduced anywhere in the diff (CON-003).

## 11. Related Specifications / Further Reading

- `.tmp/worktree-discipline-prompt.md` — the original incident write-up and
  fix proposal this spec formalizes and revises.
- `specs/superpowers-complementary-layer.md` — establishes the
  shared-reference-file convention (`references/superpowers-deferral.md`)
  this spec reuses for `references/location-check.md`.
- `skills/build/references/pre-stage.md` — existing Pre-Build Branch Check,
  the structural neighbor for the new Pre-Build Location Check.
- `skills/brace/references/claude-md-template.md` — existing Branch
  Discipline section, the structural model for Worktree Discipline.
- `skills/brace/SKILL.md` (Branch Discipline Injection step) — the
  structural model for Worktree Discipline Injection.
- Superpowers skills: `using-git-worktrees`, `finishing-a-development-branch`.
