---
title: Reposition mad-skills as a Superpowers-Complementary Layer
version: 1.0
date_created: 2026-07-01
last_updated: 2026-07-01
tags: [process, architecture, tool, integration, skills]
---

# Introduction

mad-skills currently ships a self-contained, opinionated development lifecycle
(spec-first → protected-trunk → PR-per-feature → autonomous squash-merge) that
independently reimplements much of the Superpowers process-skill family. Analysis
of ~3 days of session transcripts shows the developer works Superpowers-driven and
plan-first (~37 Superpowers skill invocations vs 9 mad-skills invocations, all of
the latter confined to the `azrl` repo as author dogfooding). mad-skills contains
zero references to Superpowers, graphify, or worktrees. Where the two overlap they
duplicate work and, in one case (`ship` vs `finishing-a-development-branch`), directly
conflict.

This specification defines a repositioning of mad-skills from a *competing* methodology
into a *complementary* layer: it retains its unique deterministic ops/infra value
(scaffolding, tooling, CI, IaC, container pipelines, ambient governance, dual-platform
support) while deferring the overlapping methodology (plan → build → finish) to
Superpowers **when Superpowers is present**, and falling back to its own pipeline
**when it is absent**. Superpowers becomes a soft/recommended dependency, never a
hard one.

## 1. Purpose & Scope

**Purpose.** Eliminate the duplication and the one hard conflict between mad-skills
and Superpowers by making three methodology skills (`speccy`, `build`, `ship`)
Superpowers-aware, adding runtime detection and a soft dependency, and adding a
passive graphify hint to `prime` — without weakening mad-skills' standalone behavior.

**Audience.** Contributors to the mad-skills repository.

**In scope:**

- Runtime detection of the Superpowers plugin via a shared on-disk helper.
- Superpowers as a soft/recommended dependency (surfaced in `brace`, CLAUDE.md
  template, and pre-flight tables) — **not** a declared hard dependency.
- `speccy`: defer requirements-exploration to `superpowers:brainstorming` when
  present; still own the `specs/*.md` artifact and the pending-build marker.
- `build`: hybrid deferral — keep its own explore, 3× parallel code-review, and
  verify stages; route the plan/implement core to `superpowers:executing-plans` /
  `superpowers:subagent-driven-development` when present.
- `ship`: keep sync + branch + semantic-commit + CI-poll + auto-fix; replace only
  the final silent auto-squash-merge with `superpowers:finishing-a-development-branch`'s
  merge/PR/cleanup options prompt when present.
- `prime`: passive hint that `graphify-out/` exists (no query, no dependency).
- Validation: evals for present/absent behavior across the three skills + a unit
  test of the detection helper.

**Out of scope (explicitly unchanged):**

- `rig`, `sync`, `dock`, `keel`, `brace` scaffolding, `ship`'s CI pipeline mechanics,
  `session-guard`, and platform (GitHub / Azure DevOps) detection — mad-skills'
  unique value; they do not conflict with Superpowers and are left as-is.
- Worktree adoption and claude-mem behavior — left as-is (both are barely used in
  practice; not worth investment in this change).
- Any hard dependency declaration in `.claude-plugin/plugin.json`.
- TDD enforcement in `build` (Superpowers owns `test-driven-development`; mad-skills
  does not add a competing gate).

## 2. Definitions

- **Superpowers**: The Superpowers plugin/skill family providing process skills
  (`brainstorming`, `writing-plans`, `executing-plans`, `subagent-driven-development`,
  `test-driven-development`, `systematic-debugging`, `requesting-code-review`,
  `finishing-a-development-branch`, `verification-before-completion`, `using-git-worktrees`).
- **Complementary layer**: mad-skills positioned as the deterministic ops/infra spine
  that composes *underneath* Superpowers' methodology rather than replacing it.
- **Soft dependency**: A recommended, runtime-detected integration that is not required
  for the plugin to function (the model already used for `claude-mem`).
- **Deferral**: Routing a stage's work to a Superpowers skill instead of mad-skills'
  own implementation, when Superpowers is detected.
- **Detection helper**: A shared module in `scripts/lib/` that reports whether
  Superpowers is installed, using on-disk skill-file globs.
- **Standalone behavior**: The current mad-skills behavior, which must remain the exact
  fallback whenever Superpowers is not detected.
- **Pending-build marker**: The on-disk state (written via `hooks/lib/state.cjs`)
  that `speccy` leaves and `session-guard` surfaces to hand off to `/build`.

## 3. Requirements, Constraints & Guidelines

### Detection & Dependency

- **REQ-001**: A shared detection helper SHALL live in `scripts/lib/` (e.g.
  `scripts/lib/superpowers.js`), mirroring the existing `scripts/lib/frontmatter.js`
  pattern, and SHALL expose a function that returns whether Superpowers is installed.
- **REQ-002**: Detection SHALL use on-disk skill-file globs, checking known Superpowers
  skill locations, at minimum:
  `~/.claude/plugins/**/superpowers/skills/using-superpowers/SKILL.md`,
  `~/.claude/skills/superpowers/**`, and project-local `.claude/skills/**/superpowers*`.
  It SHALL return a boolean plus, where cheaply available, the resolved base path.
- **REQ-003**: The helper SHALL be invocable from a SKILL.md pre-flight step via a
  short bash/node wrapper (no interactive input, no network, no LLM).
- **REQ-004**: Superpowers SHALL be surfaced as a soft/recommended dependency in:
  (a) `brace`'s recommended-plugins prompt, (b) `brace`'s CLAUDE.md template
  (`skills/brace/references/claude-md-template.md`), and (c) the pre-flight dependency
  tables of `speccy`, `build`, and `ship` with resolution type `ask`/`fallback` —
  exactly as `claude-mem` is treated today (`skills/brace/SKILL.md:87`).
- **CON-001**: `.claude-plugin/plugin.json` and `marketplace.json` SHALL NOT declare
  Superpowers as a required dependency. mad-skills MUST remain fully functional with
  Superpowers absent.

### Deferral Behavior (shared)

- **REQ-005**: When Superpowers is detected, the affected skill SHALL auto-defer and
  print a single-line announcement of the form
  `⚡ Superpowers detected — deferring {stage} to superpowers:{skill}`.
- **REQ-006**: Each affected skill SHALL provide a flag to force its own standalone
  pipeline even when Superpowers is present (e.g. `--no-superpowers`).
- **REQ-007**: When Superpowers is NOT detected, each skill SHALL behave exactly as it
  does today (byte-for-byte equivalent user-facing flow); the deferral logic is additive.

### speccy

- **REQ-008**: When Superpowers is present, `speccy` SHALL use `superpowers:brainstorming`
  to explore requirements/gaps in place of (or ahead of) its own multi-round interview.
- **REQ-009**: `speccy` SHALL, in all cases, own and write the final `specs/{slug}.md`
  artifact and SHALL write the pending-build marker via `hooks/lib/state.cjs`. The
  `specs/` → `/build` → `session-guard` contract MUST be preserved.
- **CON-002**: `speccy` SHALL NOT delegate artifact ownership to
  `superpowers:writing-plans`; the spec file remains the single source of truth.

### build

- **REQ-010**: When Superpowers is present, `build` SHALL retain its own Stage 1
  (explore), Stage 5 (3× parallel `feature-dev:code-reviewer`), and Stage 7 (verify)
  stages, and SHALL route the plan-execution/implementation core to
  `superpowers:executing-plans` / `superpowers:subagent-driven-development`.
- **REQ-011**: When Superpowers is absent, `build` SHALL run its current full
  feature-dev pipeline unchanged.
- **CON-003**: `build`'s existing pre-flight gate (requires `/ship`) and its
  `speccy` pending-build-marker handling MUST remain intact.

### ship

- **REQ-012**: When Superpowers is present, `ship` SHALL retain sync, feature-branch
  creation, semantic/conventional commit authoring, PR creation, CI polling, and the
  capped auto-fix loop.
- **REQ-013**: When Superpowers is present, `ship` SHALL replace its final silent
  auto-squash-merge + branch-delete step with `superpowers:finishing-a-development-branch`,
  presenting the user the merge / PR / cleanup options rather than merging without asking.
- **REQ-014**: When Superpowers is absent, `ship` SHALL retain its current autonomous
  squash-merge-and-delete behavior unchanged.
- **CON-004**: The `feedback_no_manual_ci_triggers` rule MUST be respected — the CI-fix
  path must never manually queue/trigger CI builds.

### prime

- **REQ-015**: `prime` SHALL detect the presence of a `graphify-out/` directory and, if
  present, include a passive one-line hint in its context summary
  (e.g. `graphify-out/ detected — codebase questions can be answered via /graphify`).
- **CON-005**: `prime` SHALL NOT execute a graphify query and SHALL NOT add graphify as
  a runtime dependency.

### Guidelines & Patterns

- **GUD-001**: Reuse the existing pre-flight dependency-table convention (6-column
  format) for surfacing the Superpowers soft dependency.
- **GUD-002**: Keep all deferral announcements to a single line to preserve the skills'
  existing visual output contract.
- **PAT-001**: Model the soft-dependency treatment on the existing `claude-mem`
  integration points, not a new mechanism.
- **PAT-002**: Model the shared helper's shape and export style on
  `scripts/lib/frontmatter.js`.

## 4. Interfaces & Data Contracts

### Detection helper (indicative)

```js
// scripts/lib/superpowers.js
// Returns { installed: boolean, basePath: string|null }
function detectSuperpowers(env = process.env, homedir = os.homedir()) { /* glob known paths */ }
module.exports = { detectSuperpowers };
```

Bash/pre-flight wrapper (indicative):

```bash
# Emits "1" when Superpowers is detected, "0" otherwise
node -e "process.stdout.write(require('$LIB/superpowers.js').detectSuperpowers().installed ? '1':'0')"
```

### Skill → Superpowers deferral map

| mad-skills skill / stage | Defers to (when present) | Retained by mad-skills |
|---|---|---|
| `speccy` requirements interview | `superpowers:brainstorming` | writes `specs/*.md` + pending-build marker |
| `build` plan/implement core | `superpowers:executing-plans` / `subagent-driven-development` | explore, 3× code-review, verify, ship gate |
| `ship` final integration | `superpowers:finishing-a-development-branch` | sync, branch, commit, PR, CI-poll, auto-fix |
| `prime` graphify awareness | — (hint only) | context summary |

### Pre-flight table row (soft dependency, indicative)

| Dependency | Type | Check | Required | Resolution | Detail |
|-----------|------|-------|----------|------------|--------|
| superpowers | plugin | on-disk skill glob via `scripts/lib/superpowers.js` | no | fallback | Defers methodology when present; standalone pipeline when absent |

## 5. Acceptance Criteria

- **AC-001**: Given Superpowers is installed, When `speccy` runs, Then it announces the
  deferral, uses `brainstorming` for gap exploration, and still writes `specs/{slug}.md`
  plus a pending-build marker.
- **AC-002**: Given Superpowers is NOT installed, When `speccy` runs, Then it performs
  the current multi-round interview with no announcement and identical output.
- **AC-003**: Given Superpowers is installed, When `build` runs, Then explore + 3×
  review + verify stages still execute and the implementation core is routed through
  `executing-plans`/`subagent-driven-development`.
- **AC-004**: Given Superpowers is installed, When `ship` reaches the finish step, Then
  it presents merge/PR/cleanup options via `finishing-a-development-branch` and does NOT
  silently squash-merge; CI-poll + auto-fix still ran beforehand.
- **AC-005**: Given Superpowers is NOT installed, When `ship` finishes, Then it performs
  the current autonomous squash-merge + branch delete unchanged.
- **AC-006**: Given any affected skill is run with `--no-superpowers`, When Superpowers
  is installed, Then the skill runs its own standalone pipeline.
- **AC-007**: Given a repo containing `graphify-out/`, When `prime` runs, Then the context
  summary includes the passive graphify hint and no graphify query is executed.
- **AC-008**: The system shall keep `.claude-plugin/plugin.json` free of any required
  Superpowers dependency; `npm run validate && npm run lint` pass.
- **AC-009**: Given the detection helper is unit-tested, When run against a fixture with
  and without Superpowers skill files, Then it returns `installed: true` and `false`
  respectively.

## 6. Test Automation Strategy

- **Test Levels**: Unit (detection helper), skill-eval (behavioral), structural
  (validate/lint).
- **Frameworks**: existing Node.js test runner + `scripts/run-evals.js`;
  `scripts/validate-skills.js` and `scripts/lint-skills.js`.
- **Test Data Management**: Fixture directories that do and do not contain Superpowers
  skill files, passed to `detectSuperpowers` via injected `homedir`/paths (no reliance
  on the developer's real `~/.claude`).
- **CI/CD Integration**: Runs under the existing `ci.yml` (validate + lint, then evals
  behind the API-key guard).
- **Coverage Requirements**: Detection helper covered for both present and absent states;
  each of `speccy`/`build`/`ship` has at least one present and one absent eval case.
- **Performance Testing**: N/A (detection is a bounded on-disk glob).

## 7. Rationale & Context

- **Why complementary, not removal**: mad-skills' infra/ops skills (`dock`, `keel`,
  `rig`, `sync`, `brace` scaffold, `ship` CI pipeline, `session-guard`, dual-platform
  support) have no Superpowers equivalent and are the real moat. Removing "governance"
  wholesale would discard this; competing head-on duplicates Superpowers worse.
- **Why soft dependency**: mad-skills publishes on a public marketplace. A hard
  Superpowers dependency would force every consumer to install it. The `claude-mem`
  pattern (detect + recommend + degrade gracefully) is the proven model in this repo.
- **Why on-disk glob detection**: deterministic, cheap, LLM-free, and consistent with
  how pre-flight dependency checks already work; plugin-manifest parsing is fragile
  across plugin/marketplace/manual install shapes.
- **Why the ship change is the priority**: `ship`'s silent auto-merge and
  `finishing-a-development-branch`'s user-choice model are a *direct* contradiction —
  the only true conflict (vs. mere duplication) between the two systems. Keeping the
  CI-poll/auto-fix pipeline while swapping only the terminal merge step fixes the
  conflict without sacrificing mad-skills' unique CI value.
- **Why hybrid build**: `build`'s parallel review + verify are guardrails Superpowers
  does not replicate one-for-one; only the plan/implement core is genuinely duplicative.
- **Why graphify is hint-only**: transcript analysis shows graphify is indexed but never
  queried (0 graph reads) even by the primary user — insufficient signal to justify a
  runtime coupling.

## 8. Dependencies & External Integrations

### External Systems
- **EXT-001**: Superpowers plugin — soft, runtime-detected integration providing the
  methodology skills mad-skills defers to.

### Third-Party Services
- **SVC-001**: None introduced by this change.

### Infrastructure Dependencies
- **INF-001**: Existing `ci.yml` pipeline (validate/lint/eval) — extended with the new
  helper test and eval cases.

### Data Dependencies
- **DAT-001**: On-disk `~/.claude` plugin/skill layout — read-only globbing for detection.
- **DAT-002**: Optional `graphify-out/` directory — existence check only, in `prime`.

### Technology Platform Dependencies
- **PLT-001**: Node.js >= 18 (already required by the repo).

**Note**: claude-mem remains an independent optional integration and is not modified.

## 9. Examples & Edge Cases

- **Superpowers partially installed** (some skills present, `using-superpowers` missing):
  detection SHOULD key off a stable anchor file (`using-superpowers/SKILL.md`) and treat
  a missing anchor as "not installed" to avoid half-deferral.
- **`--no-superpowers` with Superpowers absent**: no-op; standalone pipeline runs.
- **speccy run, Superpowers present, brainstorming interrupted/aborted**: `speccy` MUST
  still be able to complete or cleanly abort without leaving a partial spec + marker
  mismatch.
- **ship, Superpowers present, CI red after auto-fix cap**: existing failure banner
  behavior is retained; the finish-options prompt is only reached on green CI.
- **Multiple Superpowers install locations** (plugin cache + user skills): detection
  returns installed on the first anchor hit; base path is best-effort.
- **prime with both `graphify-out/` and no CLAUDE.md**: existing missing-CLAUDE.md nudge
  still fires; graphify hint is additive.

## 10. Validation Criteria

- `npm run validate` and `npm run lint` pass with the modified skills.
- Detection-helper unit test passes for present and absent fixtures (AC-009).
- Eval suite includes present/absent cases for `speccy`, `build`, `ship` and passes
  (AC-001–AC-006).
- `prime` graphify-hint eval passes (AC-007).
- Manual confirmation that `.claude-plugin/plugin.json` declares no required Superpowers
  dependency (AC-008).
- No change to standalone (Superpowers-absent) user-facing output of any skill
  (regression check, REQ-007).

## 11. Related Specifications / Further Reading

- `CLAUDE.md` — repository skill-usage guide, lifecycle ordering, platform support.
- `skills/brace/references/claude-md-template.md` — soft-dependency + Branch Discipline
  template (model for the Superpowers recommendation).
- `scripts/lib/frontmatter.js` — pattern for the shared detection helper.
- `hooks/lib/state.cjs` — pending-build marker read/write (speccy handoff contract).
- Superpowers skills: `brainstorming`, `writing-plans`, `executing-plans`,
  `subagent-driven-development`, `finishing-a-development-branch`,
  `verification-before-completion`.
