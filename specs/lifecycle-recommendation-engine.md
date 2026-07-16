---
title: Lifecycle Recommendation Engine
version: 1.0
date_created: 2026-07-14
last_updated: 2026-07-14
tags: [architecture, process, tool, session-guard, skills]
---

# Introduction

The Lifecycle Recommendation Engine turns MAD Skills from a set of independently
invoked skills into a system that observes a project's current maturity and
**offers the next valuable skill at the right moment**. It watches how a project
grows — empty → idea → scaffold → dev tooling → release → infrastructure →
environments — and surfaces the appropriate skill (`/brace`, `/rig`,
`/dock`/`/hoist`, `/keel`, …) as each becomes worthwhile, without nagging.

The engine is a shared **evaluator** driven by a cheap **project signature** and
governed by **signature-diff hysteresis**: a recommendation only re-appears when
the relevant slice of the project state has materially changed since the user
last acted on or dismissed it.

# 1. Purpose & Scope

**Purpose.** Provide organic, stage-aware guidance through the MAD Skills
lifecycle so users discover and apply the right skill at the right time, while
guaranteeing the guidance never becomes noise.

**In scope.**
- A shared evaluator module (`hooks/lib/lifecycle.cjs`) that computes the project
  signature, evaluates a declarative recommendation registry, and returns the
  single best offer (or none) for a given trigger surface.
- Two trigger surfaces: **skill-completion** (immediate cascade) and
  **Session Guard** (ambient drift detection).
- Durable **completion markers** and per-user **dismissal/mute state**.
- The full lifecycle registry: `brace`, `rig` (re-entrant), `dock`/`hoist`,
  `keel`, `envs`, plus install-type recommendations (`graphify`, `superpowers`).
- Anti-nag machinery: per-recommendation cooldown, suppression during active work
  cycles, tiered presentation.

**Out of scope.**
- Automatically *running* any skill. The engine only *offers*; the user consents.
- `/speccy` is user-initiated (the idea originates with the user); the engine does
  not offer it, but reacts to its output.
- Rewriting the individual skills' internal logic beyond (a) a completion-marker
  write and (b) a single evaluator call at their final stage.

**Audience.** MAD Skills maintainers.

**Assumptions.**
- Skills run inside Claude Code with the MAD Skills plugin active.
- `hooks/lib/state.cjs` (per-project user prefs) and the pending-build marker
  pattern already exist and are reused.

# 2. Definitions

- **Project signature** — a cheap structured snapshot of the current project
  state (components, size, tooling, release targets, IaC, environments).
- **Slice** — the subset of the signature relevant to one recommendation. Re-arm
  is decided by diffing a recommendation's slice, not the whole signature.
- **Recommendation** — a declarative registry entry describing when a skill
  should be offered, when it is satisfied, and its slice.
- **Evaluator** — the shared module that computes the signature and selects the
  offer. Single source of truth called by all trigger surfaces.
- **Trigger surface** — where an evaluation happens: **skill-completion**
  (cascade) or **Session Guard** (drift).
- **Completion marker** — a durable file (`.mad/state/<skill>.json`) a skill
  writes on success, recording the slice it covered. Objective repo state.
- **Dismissal/mute state** — per-user, per-project preferences stored via
  `state.cjs` recording what the user declined or silenced. Subjective state.
- **Cascade** — several *different* recommendations becoming eligible in quick
  succession as a direct causal result of one another (e.g. `/brace` completing
  makes `/rig` eligible immediately).
- **Drift** — a recommendation becoming eligible again over time because the
  project grew (e.g. a new backend component makes `/rig` re-offerable).
- **Cooldown** — the minimum gap before the *same* recommendation may be
  re-offered when its slice has not changed.
- **Active cycle** — a state in which lifecycle offers are suppressed: a pending
  build marker exists, a `/build` is in progress, or the working tree is a dirty
  non-default branch.
- **Tier (install-type)** — a coarse bucket (e.g. size small/medium/large) used
  by install-type recommendations whose slice is a scalar metric.

# 3. Requirements, Constraints & Guidelines

## Evaluator & Signature
- **REQ-001**: A single evaluator module `hooks/lib/lifecycle.cjs` SHALL be the
  only place recommendation eligibility is decided. All trigger surfaces call it.
- **REQ-002**: The evaluator SHALL compute the project signature from cheap
  operations only (`git ls-files`, `existsSync`, reading at most a few small
  config files). Target cost < 50 ms on a typical repo.
- **REQ-003**: The signature SHALL be cacheable, keyed on `git HEAD` + a
  dirty-tree flag, so it is not recomputed when the repo is unchanged.
- **REQ-004**: `lifecycle.evaluate(projectDir, {surface, sourceSkill})` SHALL
  return `{ offer: Recommendation | null, all: Recommendation[] }`, where `offer`
  is the single highest-priority eligible recommendation for that surface and
  `all` lists every eligible recommendation (for a `/next` overview command).

## Eligibility & Ordering
- **REQ-010**: A recommendation is **eligible** when `requires(signature)` is
  true AND (`!satisfied(signature)` OR its slice changed since the recorded
  baseline) AND it is not muted AND its cooldown has elapsed.
- **REQ-011**: When multiple recommendations are eligible at one evaluation, the
  evaluator SHALL return only the lowest-stage (lowest `priority`) one. Preconditions
  in `requires` enforce lifecycle ordering (e.g. `keel` cannot precede `rig`).
- **REQ-012**: There SHALL be **no per-session numeric cap** on offers. Different
  recommendations MAY cascade freely across a session.

## Re-arm (markers + hysteresis)
- **REQ-020**: Done-detection SHALL be derived from **artifacts** in `satisfied()`
  (e.g. presence of CI workflows, lefthook config, Dockerfile, IaC dirs), so a
  project rigged before this engine existed is still recognised as satisfied.
- **REQ-021**: Re-arm SHALL be derived from **completion markers**: a skill
  records the slice it covered; the evaluator re-offers only when the current
  slice differs from the recorded slice.
- **REQ-022**: If a recommendation is `satisfied` but has no marker (pre-engine
  project), the evaluator SHALL synthesise a baseline marker from the current
  signature and NOT re-offer until the slice changes thereafter.
- **REQ-023**: Each skill listed in the registry SHALL write/update
  `.mad/state/<skill>.json` on successful completion, recording its covered slice.

## Cadence & Suppression
- **REQ-030**: A single recommendation SHALL NOT be re-offered until its slice
  changes OR a cooldown of `N` sessions (default `N = 3`) has elapsed since it was
  last dismissed.
- **REQ-031**: While in an **active cycle**, the evaluator SHALL return `offer:
  null` for all surfaces except explicit clean checkpoints. Deferred offers
  surface at the next clean checkpoint (session start on the default branch, or
  end of `/ship`).
- **REQ-032**: The engine SHALL support a global mute (stop all lifecycle offers)
  and per-recommendation mute (never offer this one again), both stored in prefs.

## Presentation & Consent
- **REQ-040**: Presentation SHALL be **tiered**: causal transitions (a skill just
  completed and directly enabled the next) use `AskUserQuestion` with options
  *Set it up now* / *Not now* / *Never*; drift re-arms surface as a **passive
  hint line** in the Session Guard banner.
- **REQ-041**: *Not now* SHALL record the current slice + session as the dismissal
  watermark. *Never* SHALL mute that recommendation. *Set it up now* SHALL invoke
  the offered skill (user-driven, per existing skill invocation).
- **REQ-042**: The engine SHALL NOT invoke any skill automatically; every state
  transition is user-consented.

## Cascade surface
- **REQ-050**: Each registered skill SHALL, at the end of its successful run,
  call the evaluator with `{surface: "skill-completion", sourceSkill}` and present
  the returned causal offer inline in its own report (subject to suppression).

## Release selection
- **REQ-060**: The release recommendation SHALL auto-detect the target skill:
  offer `/dock` when a component is containerizable (a `Dockerfile` exists, or a
  recognised server framework / listening port is detected); offer `/hoist` when a
  component is a publishable package or static site (npm `bin`/`main`, PyPI
  project, static build output, Homebrew-able). If ambiguous, present a `/dock`
  vs `/hoist` choice.

## Constraints & Guidelines
- **CON-001**: Completion markers under `.mad/` SHALL be **committed** to the
  repository (durable, team-shared lifecycle state) so a fresh clone does not
  re-offer completed stages.
- **CON-002**: Dismissal/mute prefs SHALL be **per-user** (via `state.cjs`), never
  committed.
- **CON-003**: The engine SHALL degrade to silence on any detection error; a
  failed signature computation MUST NOT block a session or a skill.
- **GUD-001**: Prefer conservative triggers — only offer when the value is clear.
  A false silence is cheaper than a false nag.
- **PAT-001**: Model the registry as data (a declarative array), not code
  branches, so new stages are added by appending an entry.
- **PAT-002**: Keep objective repo state (markers) and subjective user state
  (prefs) in separate stores; never conflate them.

# 4. Interfaces & Data Contracts

## 4.1 Project signature

```jsonc
{
  "size": 214,                       // tracked source-file count (git ls-files, code exts)
  "hasScaffold": true,               // CLAUDE.md + specs/ + context/
  "components": [                     // dirs containing a package manifest
    { "dir": ".",        "language": "node",   "manifest": "package.json" },
    { "dir": "backend",  "language": "python", "manifest": "pyproject.toml" }
  ],
  "hasCI": true,                     // .github/workflows/*.yml (or azure-pipelines.yml)
  "hasLefthook": true,               // lefthook.yml
  "ciCoveredLanguages": ["node"],    // languages referenced by existing CI
  "hasDockerfile": false,
  "releaseTargets": ["npm"],         // parsed from release workflows: npm|pages|vercel|ghcr|homebrew|pypi…
  "hasIaC": false,                   // terraform/ | bicep/ | pulumi/ | cdk/
  "iacTargets": [],
  "envs": ["prod"]                   // deploy environments detected in workflows
}
```

Detection is best-effort and cheap; unknown fields default to empty/false.

## 4.2 Completion marker — `.mad/state/<skill>.json` (committed)

```jsonc
{
  "skill": "rig",
  "version": 1,
  "ranAt": "2026-07-14T10:00:00Z",   // supplied by the skill; engine never calls Date in hooks
  "coveredSlice": {
    "components": ["node", "python"],
    "releaseTargets": [],
    "iacTargets": []
  }
}
```

## 4.3 Dismissal/mute prefs — via `state.cjs` (per-user, not committed)

```jsonc
{
  "lifecycle": {
    "mutedAll": false,
    "recs": {
      "rig":      { "status": "dismissed", "dismissedSlice": ["node"], "lastOfferedSession": 41 },
      "graphify": { "status": "dismissed", "dismissedTier": "medium",  "dismissedMetric": 200, "lastOfferedSession": 39 },
      "superpowers": { "status": "muted" }
    }
  }
}
```

`status` ∈ `active | dismissed | muted | done`. `done` is derived, not stored, when
`satisfied` and slice matches the marker.

## 4.4 Recommendation registry entry

```jsonc
{
  "id": "rig",
  "offers": "/rig",
  "priority": 20,                     // lower = earlier lifecycle stage
  "kind": "lifecycle",               // "lifecycle" | "install"
  "requires":  "s => s.hasScaffold && s.components.length > 0",
  "satisfied": "s => s.hasCI && s.hasLefthook && covers(s.ciCoveredLanguages, s.components)",
  "slice":     "s => s.components.map(c => c.language).sort()",
  "select":    "s => '/rig'",        // release rec overrides this to choose /dock or /hoist
  "presentation": "causal-then-drift", // AskUserQuestion first offer; passive hint on re-arm
  "prompt":    "s => `Code but no dev tooling for ${uncovered(s)} — set up /rig?`"
}
```

## 4.5 Evaluator API

```
lifecycle.evaluate(projectDir, { surface, sourceSkill }) -> { offer, all }
lifecycle.computeSignature(projectDir) -> Signature            // cached on HEAD+dirty
lifecycle.isActiveCycle(projectDir) -> boolean                 // suppression gate
```

New `session-guard.cjs` subcommands (mirroring `dismiss-brace`/`dismiss-rig`):
`lifecycle-dismiss <rec>`, `lifecycle-mute <rec>`, `lifecycle-mute-all`,
`lifecycle-unmute <rec|all>`.

## 4.6 Registry (initial full set)

| id | offers | priority | requires (summary) | satisfied (summary) | slice | re-arm |
|----|--------|----------|--------------------|---------------------|-------|--------|
| graphify | `/graphify` | 5 | size ≥ 150 & not installed/built | graphify-out/ exists | size tier | tier ↑ |
| superpowers | `claude plugin install superpowers` | 6 | specs/ exists or first /build, not installed | superpowers present | — | ask-once |
| brace | `/brace` | 10 | has content, no scaffold | hasScaffold | — | ask-once |
| rig | `/rig` | 20 | scaffold + ≥1 component | CI + lefthook cover components | component languages | new/uncovered component |
| release | `/dock` or `/hoist` | 30 | rigged + releasable component, no release path | release workflow covers component | releasable components + paths | new releasable component |
| keel | `/keel` | 40 | release target needs infra, no IaC | IaC covers target | infra-needing targets | new such target |
| rig-refresh | `/rig` | 45 | IaC/target set changed vs CI | CI reflects current release+IaC | releaseTargets+iacTargets | targets changed |
| envs | `/keel` or `/dock` | 50 | a deploy exists, env topology incomplete | desired envs present | envs set | env topology change |

# 5. Acceptance Criteria

- **AC-001 (cascade)**: Given a project where `/brace` has just completed and one
  or more components exist and CI is absent, When `/brace` calls the evaluator at
  the end of its run, Then the evaluator returns `offer = rig` and `/brace`
  presents an `AskUserQuestion` offering `/rig`.
- **AC-002 (no-nag same rec)**: Given `rig` was dismissed at slice `["node"]`,
  When a later session evaluates and the component set is still `["node"]` and the
  cooldown has not elapsed, Then `rig` is not offered.
- **AC-003 (drift re-arm)**: Given `rig` was dismissed at slice `["node"]`, When a
  `backend` Python component is added so the slice becomes `["node","python"]`,
  Then `rig` becomes eligible again and surfaces as a passive Session Guard hint.
- **AC-004 (satisfied + marker)**: Given CI and lefthook exist and the `rig`
  marker's `coveredSlice` equals the current slice, Then `rig` is `done` and never
  offered.
- **AC-005 (pre-engine baseline)**: Given CI and lefthook exist but no `rig`
  marker, When the evaluator runs, Then it writes a baseline marker from the
  current signature and does not offer `rig`.
- **AC-006 (suppression)**: Given a pending-build marker exists (or the tree is a
  dirty non-default branch), When any surface evaluates, Then `offer = null`.
- **AC-007 (checkpoint release)**: Given an offer was suppressed during an active
  cycle, When the cycle ends (session start on default branch, or `/ship`
  completes), Then the highest-priority eligible offer is presented.
- **AC-008 (release selection)**: Given a rigged Node package with `bin` and no
  release workflow, When the release recommendation is eligible, Then the engine
  offers `/hoist`; given a service with a `Dockerfile` and no release workflow, it
  offers `/dock`.
- **AC-009 (mute)**: Given the user answered *Never* to `graphify`, Then
  `graphify` is never offered again until `lifecycle-unmute graphify`.
- **AC-010 (global mute)**: Given `mutedAll = true`, Then no lifecycle offer is
  presented on any surface.
- **AC-011 (ordering)**: Given both `rig` and `release` are eligible at one
  evaluation, Then only `rig` (lower priority number) is offered.
- **AC-012 (graphify tier)**: Given `graphify` was dismissed at tier `medium`
  (size 200), When size grows to 350 (still `medium`), Then it is not re-offered;
  When size crosses into `large` (> 600), Then it is offered again once.

# 6. Test Automation Strategy

- **Test Levels**: Unit (evaluator + signature + hysteresis) and Integration
  (session-guard surface, skill-completion surface).
- **Frameworks**: Node's built-in `node:test` + `assert`, matching existing
  `hooks/` test style. No new dependencies.
- **Test Data Management**: Fixture signatures and prefs/marker JSON objects
  passed directly to `evaluate()` — no filesystem needed for the core logic;
  filesystem-touching functions (`computeSignature`, marker IO) get temp-dir
  integration tests.
- **CI/CD Integration**: Runs under the existing `npm run validate`/`test` job in
  `ci.yml`; add a `hooks` unit-test invocation.
- **Coverage Requirements**: Every AC in §5 has at least one corresponding test
  driving `evaluate()` with a crafted `(signature, prefs, markers)` triple.
- **Performance Testing**: A benchmark asserting `computeSignature` stays under
  the cost budget on a fixture repo of ~1k files.

# 7. Rationale & Context

- **Why a shared evaluator, not logic in the guard.** Early stages cascade within
  one session (empty → `/speccy` → `/brace` → `/rig`). Session Guard only fires at
  session/prompt boundaries, so cascade offers would lag a full session. Putting
  the decision in one evaluator lets the just-completed skill offer the next step
  immediately, while the guard reuses the same logic for cross-session drift.
- **Why signature-diff hysteresis.** A boolean "dismissed" is binary: nag forever
  or never. Recording the slice at dismissal and re-offering only when that slice
  materially changes gives "quiet until the situation genuinely changed", which is
  the core UX requirement.
- **Why markers are committed but prefs are not.** "This repo has been rigged" is
  objective, durable, and team-shared — a fresh clone should not re-offer it. "I
  declined graphify" is personal and machine-local.
- **Why suppress during active cycles.** The guard often fires immediately before
  a `/build`; injecting a lifecycle offer there is noise at the worst time.
- **Why no per-session cap.** A real cascade can legitimately cross several stages
  quickly; a numeric cap would truncate valid progress. Per-rec cooldown + slice
  hysteresis + suppression already bound the noise.

# 8. Dependencies & External Integrations

### Infrastructure Dependencies
- **INF-001**: `hooks/lib/state.cjs` — reused for per-user prefs and cooldown
  session counters.
- **INF-002**: `hooks/session-guard.cjs` — hosts the ambient surface and the new
  `lifecycle-*` subcommands.

### Technology Platform Dependencies
- **PLT-001**: Node.js ≥ 18 (existing hook runtime). No new runtime dependencies.
- **PLT-002**: `git` CLI for signature computation (`git ls-files`, HEAD/dirty).

### Data Dependencies
- **DAT-001**: `.mad/state/<skill>.json` completion markers (produced by skills,
  consumed by the evaluator).

# 9. Examples & Edge Cases

- **Organic happy path**: empty dir → user runs `/speccy` (writes `specs/idea.md`)
  → `/speccy` completion evaluator offers `/brace` → `/brace` completion offers
  `/rig` → after `/rig`, once a build artifact/bin exists, offers `/hoist` → after
  a release target needs infra, offers `/keel` → new env topology offers `envs`.
- **Monorepo**: two components (`web` node, `api` go). `rig` slice `["go","node"]`;
  if CI only covers node, `rig` re-arms citing the uncovered `go` component.
- **Fresh clone of a mature repo**: committed markers + existing artifacts →
  everything `done` → engine stays silent.
- **Pre-engine repo**: artifacts present, no markers → baseline markers synthesised
  on first evaluation → silent until real change.
- **Right before /build**: pending-build marker present → all offers suppressed →
  resurface at next clean checkpoint.
- **Install-type**: small project (120 files) never hears about graphify; at 200 it
  is offered once (passive/AskUserQuestion at first medium); dismissed; silent
  until it crosses `large`.

# 10. Validation Criteria

- All ACs in §5 pass as automated tests.
- `computeSignature` meets the cost budget (§6).
- Running the engine on this very repository (mad-skills) offers no spurious
  lifecycle steps (it is already fully rigged/released) — a real-world silence check.
- Session Guard continues to pass its existing checks with the new surface wired in.
- No lifecycle offer is ever presented while a pending-build marker exists.

# 11. Related Specifications / Further Reading

- `specs/superpowers-complementary-layer.md` — soft-dependency detection pattern
  the install-type recommendations follow.
- `skills/brace/SKILL.md`, `skills/rig/SKILL.md`, `skills/dock/SKILL.md`,
  `skills/hoist/SKILL.md`, `skills/keel/SKILL.md` — the skills the registry offers
  and which must write completion markers.
- `hooks/session-guard.cjs`, `hooks/lib/state.cjs` — host surface and state store.

## Implementation Plan (sequencing for the full engine)

1. **Signature + evaluator core** (`hooks/lib/lifecycle.cjs`) with unit tests for
   `requires/satisfied/slice`, cooldown, suppression, ordering. Pure-data tests.
2. **State + markers**: extend `state.cjs` prefs schema; define marker read/write;
   baseline synthesis (REQ-022).
3. **Session Guard surface**: wire `evaluate({surface:"session-guard"})` into
   `check`; add `lifecycle-*` subcommands; passive hint rendering.
4. **Skill-completion surface**: add the evaluator call + marker write to `brace`,
   `rig`, `dock`, `hoist`, `keel` final stages; causal `AskUserQuestion` rendering.
5. **Registry stages**: land `brace`, `rig` (+re-arm), release (`dock`/`hoist`
   selection), `keel`, `rig-refresh`, `envs`.
6. **Install-type recs**: `graphify` (size tiers) and `superpowers` (ask-once).
7. **`/next` overview** command surfacing `all` eligible recommendations on demand.
