---
title: Orchestrator-Ready mad-skills — Worker-Side Contract for the AI Developer Orchestrator (real-talk)
version: 1.0
date_created: 2026-07-21
last_updated: 2026-07-21
tags: [architecture, process, integration, tool]
---

# Introduction

The AI Developer Orchestrator core specification (`specs/real-talk.md`, "real-talk")
defines a service that owns feature lifecycle state, human approval gates, and
delivery policy, and that treats coding agents such as Claude Code as replaceable,
bounded workers invoked through adapters. mad-skills already implements most of
the worker-side behavior real-talk needs — spec-first gating, worktree + branch +
spec-commit + draft-PR provisioning at approval (`specs/bundled-approval-handoff.md`),
content-hash spec freezing, idempotent PR creation, dual GitHub/Azure DevOps
support, and `--auto` runs that stop at an open PR.

This specification makes mad-skills formally consumable by a real-talk
orchestrator **like a shared library ("DLL")**: real-talk dispatches mad-skills
skills as bounded tasks through its Claude Code adapter, and the skills honor a
**task envelope** (path restrictions, required checks, constraints, feature
identity) when one is present. When no envelope is present, mad-skills behaves
exactly as it does today. Neither system depends on the other.

## 1. Purpose & Scope

**Purpose:** Define the contract that lets a real-talk orchestrator drive
mad-skills skills as bounded worker tasks, without changing mad-skills'
standalone behavior.

**In scope:**

- Task-envelope discovery, schema, and fail-closed validation
- Externalized decision points (report-instead-of-ask) under an envelope
- Post-hoc diff validation against envelope path restrictions, with quarantine
- PR projection hygiene (orchestrator description markers, lifecycle labels, draft state)
- Idempotent / reuse-first guarantees for all git-touching skill steps
- Structured task reports the adapter can parse
- Machine-readable capability declaration per skill
- A recorded list of required upstream changes to `specs/real-talk.md` (IMPORTANT)

**Out of scope:**

- Building any part of the orchestrator service itself (state machine, Slack
  connector, webhooks, provider projection, merge execution — all real-talk-side)
- Real-time write blocking (PreToolUse enforcement) — deliberately excluded
- Technical Spike support (`specs/tech-spike.md`) — deferred, logged as a follow-up
- Changes to interactive `/ship` merge behavior — explicitly retained as-is
- The `/launch` (OMC) pipeline — orthogonal artifact namespace, not part of this contract

**Audience:** mad-skills contributors; future real-talk implementers writing the
Claude Code adapter.

**Assumptions:**

- Real-talk provisions or consumes the same workspace shape mad-skills already
  produces (branch + worktree + spec first-commit + draft PR).
- Real-talk has its own Git-provider adapter for projection and merge (real-talk
  §32–§46); mad-skills never performs those operations when an envelope is present.
- Skill dispatch by the adapter happens inside an existing worktree (real-talk §26
  `workingDirectory`).

## 2. Definitions

| Term | Definition |
|---|---|
| **real-talk** | The AI Developer Orchestrator core specification (`specs/real-talk.md`) and any service implementing it. |
| **Orchestrated mode** | A skill run where a valid task envelope was discovered. Decision points are externalized and envelope restrictions apply. |
| **Standalone mode** | A skill run with no envelope. Behavior is identical to mad-skills today. |
| **Task envelope** | A JSON file supplied by the caller describing the bounded task: identity, allowed paths, required checks, constraints. |
| **Task report** | The structured JSON result a skill writes for the caller at the end of an orchestrated run. |
| **DLL model** | mad-skills' skills are the only public entry points; their bundled scripts are private internals. Real-talk calls skills, never scripts. |
| **Macro-task** | A whole skill run (`/build spec.md --auto`) dispatched as one bounded task, rather than fine-grained per-stage tasks. |
| **Projection** | Real-talk's writes to PR surfaces: `orchestrator:*` labels, the `orchestrator/lifecycle` check, draft flag, and the `<!-- orchestrator:start/end -->` description block. |
| **Quarantine** | Stashing out-of-envelope changes (`git stash push`) so they are preserved for audit but excluded from commit/push. |
| **Fail-closed** | A malformed or unsupported envelope aborts the run; it never silently degrades to standalone mode. |
| **Material spec edit** | Any change to a spec file's body below its frontmatter after `content_hash` was recorded. |

## 3. Requirements, Constraints & Guidelines

### Mode selection & envelope handling

- **REQ-001 — Standalone unchanged.** With no envelope present, every skill's
  behavior, output, prompts, and artifacts are byte-for-byte the behavior shipped
  today. No new prompts, flags required, or output changes in standalone mode.
- **REQ-002 — Envelope discovery.** At pre-flight, `/speccy`, `/build`, and
  `/ship` check for `.orchestrator/task.json` relative to the repository root of
  the current worktree. An explicit `--envelope <path>` flag overrides the
  well-known path. Discovery order: flag, then well-known path, then standalone.
- **REQ-003 — Fail-closed validation.** A discovered envelope is validated
  against the schema in §4 before any stage runs. On schema violation, unknown
  `envelope` version, or unreadable file: abort with a clear error and a
  `blocked` task report. Never proceed in standalone mode when a broken envelope
  exists — silent degradation would drop the caller's restrictions.
- **REQ-004 — Mode announcement.** Orchestrated mode is announced in the skill's
  Input box (feature ID, task type, envelope path) so transcripts are auditable.

### Public surface & internals

- **REQ-005 — Skills-only surface.** The public contract consists of the skills
  (`/speccy`, `/build`, `/ship`, `--auto` variants) plus the envelope/report
  schemas. Bundled scripts (`create-pr.sh`, `ci-watch.sh`, `merge.sh`, `sync.sh`,
  provisioning steps) remain private internals with no external stability
  guarantee. Documentation must state this explicitly.
- **REQ-006 — Capability manifest.** `npm run build:manifests` extends
  `skills/manifest.json` with an `orchestration` block per skill:
  `{ "envelope": 1, "taskTypes": [...], "nonInteractive": true|false }`.
  Skills without envelope support omit the block. This is how an adapter learns
  which task types are dispatchable non-interactively (real-talk §44 analog).

### Externalized decision points

- **REQ-007 — Report, don't ask.** In orchestrated mode a skill must not call
  `AskUserQuestion`. Any decision it would have asked interactively is either
  (a) resolved from the envelope (`constraints`, `decisions`), or (b) terminates
  the run with outcome `needs-input` and the question(s) serialized in the task
  report, for the caller to relay (e.g., to Slack) and redispatch with answers
  in `decisions`.
- **REQ-008 — Task report.** Every orchestrated run ends by writing the task
  report (schema §4) to `reporting.reportPath` (default
  `.orchestrator/report.json`) and echoing the same JSON as the final output
  block, so the adapter can parse either stream or file.
- **REQ-009 — Merge authority.** In orchestrated mode and in `--auto` mode,
  `/ship` stops at an open (draft) PR: no CI watching, no merge, no branch
  cleanup. Those are the caller's provider-adapter jobs. Interactive standalone
  `/ship` keeps its current auto-merge behavior — invoking it interactively *is*
  the human merge approval (decision recorded in §7).

### Path restriction & validation

- **REQ-010 — Post-hoc diff validator.** A deterministic script validates
  `git diff --name-only` (staged + unstaged + untracked) against the envelope's
  `allowedPaths` globs after each writing stage and always before any commit or
  push. Exit 0 = clean; exit 1 = violations listed on stdout as JSON.
- **REQ-011 — Violation handling.** On violation: block the commit/push,
  quarantine offending changes via `git stash push -- <paths>` (recording the
  stash ref), continue nothing further in the current stage, and report outcome
  `violation` with per-path reasons and stash refs. This mirrors real-talk §21's
  stop/preserve/prevent/notify sequence at DLL grain.
- **REQ-012 — Read-only task types.** For `taskType` values `discover` and
  `specify`, the effective allowed paths are the envelope's `allowedPaths`
  intersected with planning paths only; product-code writes are violations even
  if a caller misconfigures `allowedPaths` broadly. Default planning paths:
  `docs/features/{featureId}/**`, `.orchestrator/**`, and the configured spec
  path. (Real-talk §19–§20.)

### Git & PR hygiene

- **REQ-013 — Reuse-first git steps.** Every git-touching step in every skill is
  idempotent/reuse-first: existing worktree → reuse; existing branch → reuse;
  spec already committed → skip; open PR on branch → reuse (`create-pr.sh`
  `reused=true` already does this). Consequence: it never matters whether
  real-talk provisioned first (its §14) or dispatched `/speccy`'s bundle to do it.
- **REQ-014 — Projection hygiene.** When a skill updates a PR description it
  must preserve everything between `<!-- orchestrator:start -->` and
  `<!-- orchestrator:end -->` unmodified, and edit only outside the markers.
  Skills must never add/remove labels matching `orchestrator:*`, never write to
  a check named `orchestrator/lifecycle`, and in orchestrated mode never change
  the PR draft flag (draft→ready is the caller's gate, real-talk §36).
- **REQ-015 — Spec identity & revision signal.** The spec frontmatter gains an
  optional `feature_id` field, populated from the envelope when present. The
  envelope's `specPath` overrides the default `specs/{slug}.md` location (e.g.,
  real-talk's `docs/features/FEAT-1042/spec.md`). Any material spec edit after
  `content_hash` exists requires recomputing and rewriting `content_hash` in the
  same commit — the hash change is the revision signal real-talk's database
  consumes (its §23 keeps revision metadata; content stays in Git).

### Security

- **SEC-001 — Envelope is data, not instructions.** Envelope fields are policy
  inputs, never prose merged into agent prompts verbatim. `requiredChecks`
  entries are commands to *run and report* — they execute with the same
  permission surface as any skill-run command, are echoed to the transcript
  before execution, and are never shell-interpolated into other commands.
- **SEC-002 — No secrets.** Envelopes and reports must not contain credentials;
  reports must not embed raw command output beyond bounded tails (existing
  skill convention). Report files live under `.orchestrator/`, which stays
  untracked unless the caller's policy commits it (real-talk treats
  `.orchestrator/<id>/**` as a permitted planning path).

### Constraints

- **CON-001 — No hard dependency.** mad-skills must not require real-talk, and
  nothing in `plugin.json` may declare it. Same soft posture as Superpowers.
- **CON-002 — No PreToolUse blocking.** Enforcement is post-hoc validation only
  (decision recorded in §7). The session-guard plugin remains advisory.
- **CON-003 — No orchestrator state ownership.** mad-skills must not maintain a
  lifecycle state machine, state database, or projection writer. Canonical state
  is real-talk's alone; mad-skills' only state artifacts remain the existing
  markers, LOGBOOK, and spec frontmatter.
- **CON-004 — Node ≥ 18, bash, git** — existing repo toolchain only; no new
  runtime dependencies for envelope parsing or diff validation.

### Guidelines & patterns

- **GUD-001** — Shared envelope logic lives once: an ESM module
  `scripts/lib/envelope.js` (parse/validate/fail-closed) with a CJS core in
  `hooks/lib/` if hooks need it — mirror the `superpowers.js` /
  `superpowers-core.cjs` split only if actually needed.
- **GUD-002** — The diff validator is one script usable by all three skills
  (e.g., `skills/build/scripts/validate-paths.sh` promoted to a shared
  location), colocated tests per repo convention.
- **PAT-001** — Follow the Superpowers soft-dependency pattern end-to-end:
  detection, one-line announcement, graceful standalone fallback, and a shared
  contract document (`references/orchestrator-envelope.md`).

## 4. Interfaces & Data Contracts

### 4.1 Task envelope — `.orchestrator/task.json` (version 1)

```json
{
  "envelope": 1,
  "featureId": "FEAT-1042",
  "taskType": "specify",
  "objective": "Refine the CSV export brief into an implementation-ready spec.",
  "specPath": "docs/features/FEAT-1042/spec.md",
  "baseBranch": "main",
  "allowedPaths": [
    "docs/features/FEAT-1042/**",
    ".orchestrator/**"
  ],
  "requiredChecks": [
    "npm run lint",
    "npm test"
  ],
  "constraints": [
    "Do not introduce a new CSV dependency."
  ],
  "decisions": {
    "q-export-limit": "Cap exports at 50k rows"
  },
  "reporting": {
    "reportPath": ".orchestrator/report.json"
  },
  "correlationId": "task-991"
}
```

| Field | Required | Notes |
|---|---|---|
| `envelope` | yes | Schema version; unknown values are fail-closed (REQ-003). |
| `featureId` | yes | Caller-minted identifier; lands in spec frontmatter `feature_id`. |
| `taskType` | yes | `discover` \| `specify` \| `implement` \| `remediate` \| `ship-pr`. Mapping: `discover`/`specify` → `/speccy` (read-only, REQ-012); `implement`/`remediate` → `/build`; `ship-pr` → `/ship --auto` semantics (commit/push/PR, stop). |
| `objective` | yes | Bounded task statement; becomes the skill's GOAL/PLAN input. |
| `specPath` | no | Overrides `specs/{slug}.md`. |
| `baseBranch` | no | Defaults to detected default branch. |
| `allowedPaths` | yes | Glob list; the write boundary (REQ-010/011/012). |
| `requiredChecks` | no | Commands run during the skill's verify stage; results reported (SEC-001). |
| `constraints` | no | Injected into stage prompts as explicit constraints. |
| `decisions` | no | Answers to previously reported `needs-input` questions, keyed by question id. |
| `reporting.reportPath` | no | Default `.orchestrator/report.json`. |
| `correlationId` | no | Echoed verbatim in the report. |

### 4.2 Task report — written at end of every orchestrated run

```json
{
  "envelope": 1,
  "featureId": "FEAT-1042",
  "taskType": "specify",
  "correlationId": "task-991",
  "outcome": "completed",
  "summary": "Spec refined and committed; draft PR reused.",
  "branch": "feature/FEAT-1042-customer-export",
  "worktree": "/worktrees/FEAT-1042",
  "prUrl": "https://github.com/org/repo/pull/57",
  "prReused": true,
  "commits": ["3df82bd"],
  "specContentHash": "sha256:9f2c…",
  "checks": [
    { "command": "npm test", "status": "passed" }
  ],
  "violations": [],
  "questions": []
}
```

- `outcome`: `completed` | `blocked` | `violation` | `needs-input`.
- `questions[]` (only with `needs-input`): `{ "id", "question", "options": [ { "label", "description" } ] }`
  — deliberately shaped like `AskUserQuestion` input so callers can render it in
  chat directly; answers return via `decisions` keyed by `id`.
- `violations[]` (only with `violation`): `{ "path", "reason", "stashRef" }`.

### 4.3 Diff validator contract

```
validate-paths.sh --envelope <path> [--quarantine]
  exit 0  → clean; no output
  exit 1  → violations; stdout = JSON array of { "path", "reason" }
  exit 2  → usage/envelope error
--quarantine additionally stashes violating paths and appends "stashRef".
```

### 4.4 Capability manifest addition (`skills/manifest.json`)

```json
{
  "name": "build",
  "orchestration": { "envelope": 1, "taskTypes": ["implement", "remediate"], "nonInteractive": true }
}
```

## 5. Acceptance Criteria

- **AC-001**: Given no `.orchestrator/task.json` and no `--envelope` flag, when
  any skill runs, then behavior and outputs are unchanged from current mad-skills
  (verified by existing eval suite passing without modification).
- **AC-002**: Given a valid envelope in the worktree, when `/build` starts, then
  the Input box shows orchestrated mode with `featureId`, `taskType`, and
  envelope path.
- **AC-003**: Given an envelope with an unknown `envelope` version or a missing
  required field, when a skill starts, then it aborts before any stage, writes a
  `blocked` report, and does not fall back to standalone behavior.
- **AC-004**: Given an orchestrated `/build` whose subagent modifies a file
  outside `allowedPaths`, when the stage completes, then the change is stashed,
  no commit/push contains it, and the report has outcome `violation` with the
  path, reason, and stash ref.
- **AC-005**: Given `taskType: specify` with an over-broad `allowedPaths`
  including `src/**`, when the run writes to `src/`, then it is still treated as
  a violation (planning-path intersection wins).
- **AC-006**: Given an orchestrated run that reaches a decision the envelope's
  `decisions` does not answer, when the skill would have asked interactively,
  then it terminates with outcome `needs-input` and serialized questions, and a
  redispatch with matching `decisions` keys proceeds past that point.
- **AC-007**: Given an orchestrated or `--auto` `/ship`, when CI status is
  anything, then no merge, no CI polling, and no branch cleanup occur; the run
  ends at an open PR with a `completed` report.
- **AC-008**: Given a PR description containing an
  `<!-- orchestrator:start -->…<!-- orchestrator:end -->` block and
  `orchestrator:implementing` label, when a skill updates the PR body, then the
  block bytes and the label are unchanged.
- **AC-009**: Given real-talk provisioned branch+worktree+draft PR first, when
  `/speccy`'s handoff bundle runs in that worktree, then no duplicate branch,
  commit, or PR is created (`prReused: true` in the report).
- **AC-010**: Given a material edit to a spec with an existing `content_hash`,
  when the edit is committed, then the same commit contains the recomputed
  `content_hash`.
- **AC-011**: Given `npm run build:manifests`, when it completes, then
  `skills/manifest.json` contains `orchestration` blocks for speccy, build, and
  ship, and none for skills without envelope support.

## 6. Test Automation Strategy

- **Test levels:** unit (node `--test`) for `scripts/lib/envelope.js`
  (parse/validate/fail-closed matrix) and the diff validator (glob matching,
  quarantine, exit codes — colocated `*.test.js` per repo convention);
  integration via a scripted git fixture repo exercising AC-004/005/009/010;
  eval cases (`tests/evals.json` per skill) for orchestrated-mode skill behavior
  (mode announcement, report-don't-ask, stop-at-PR).
- **Frameworks:** existing repo toolchain only — `node --test`, bash, the eval
  runner (`scripts/run-evals.js`).
- **Test data:** fixture envelopes (valid, malformed, wrong version, over-broad
  specify) committed under the validator's test directory; temp git repos
  created/destroyed per test.
- **CI/CD:** all of the above fold into existing `npm test`
  (validate + lint + test:unit + eval) — no new CI jobs.
- **Coverage:** every REQ has at least one AC; every AC has at least one
  automated check, except AC-002/AC-006 which are eval-asserted.

## 7. Rationale & Context

- **DLL model / skills-only surface (REQ-005).** Exposing scripts as a second
  public contract would double the frozen surface area and duplicate mad-skills'
  internal orchestration logic inside real-talk. Real-talk already must own a
  Git-provider adapter for projection (its §32–§46), which naturally covers
  merge and CI-event consumption — so the script jobs it would have called
  (`ci-watch.sh`, `merge.sh`) are simply *not dispatched* under orchestration.
  Ownership conflicts dissolve because a library does not decide when it is called.
- **Interactive `/ship` keeps auto-merge (REQ-009).** Decision: the
  speccy→build flow already stops at an open PR; `/ship` run interactively is
  the deliberate "push it through" act, i.e. the human merge approval itself.
  This satisfies real-talk's intent (a human decides merge) without adding a
  prompt. Orchestrated and `--auto` runs never merge.
- **Post-hoc validation, not PreToolUse (CON-002).** Real-talk §21 requires its
  own enforcement regardless; the worker's duty is to detect, refuse, preserve,
  and report. A blocking hook would convert a deliberately advisory plugin into
  a session-wide enforcement surface, risking false-positive blocks on
  legitimate non-task work.
- **Fail-closed envelopes (REQ-003).** Silently ignoring a malformed envelope
  would drop the caller's path restrictions — the one failure mode this
  contract exists to prevent.
- **Reuse-first over "who provisions" (REQ-013).** Real-talk provisions at
  `BriefReady` (§13–14); mad-skills provisions at spec approval
  (`bundled-approval-handoff.md`). Rather than pick a winner, idempotency makes
  the order irrelevant — and the upstream change below makes the trigger policy
  explicit.

## 8. Dependencies & External Integrations

### ⚠️ IMPORTANT — Required upstream changes to `specs/real-talk.md`

These were identified during investigation. This spec is implementable without
them, but full conformance claims and a working adapter require real-talk to
adopt them. Track them as blocking items for the real-talk draft, not for this
implementation.

- **UPS-001 (IMPORTANT — provisioning trigger becomes policy).** Real-talk
  §13–14 hard-codes provisioning at `BriefReady` (before discovery/spec).
  mad-skills' shipped model provisions at spec approval. Real-talk should make
  the trigger repository configuration, e.g.
  `workflow.provision_at: brief | spec-approval`, with the draft PR carrying
  discovery history only in `brief` mode.
- **UPS-002 (IMPORTANT — adapters may use agent-native skills).** Real-talk
  §5.2 ("must not depend on Claude-specific slash commands") reads as banning
  skill invocation, contradicting §27's adapter duties. Clarify: the *core
  workflow* must stay provider-neutral; an adapter MAY drive agent-native
  commands/skills as its implementation detail. Additionally require adapters
  to declare which task types support non-interactive execution (this spec's
  capability manifest, REQ-006, is the mad-skills half of that handshake).
- **UPS-003 (IMPORTANT — feature-ID minting and slug identifiers).** Real-talk
  §50 assumes an orchestrator-minted `FEAT-*` id in `specification_path`.
  Define who mints the id when work originates agent-side, and permit
  slug-based/adapter-supplied identifiers.
- **UPS-004 (IMPORTANT — bless the macro-task delegation spectrum).** Real-talk
  implicitly assumes fine-grained task dispatch. It should explicitly permit
  dispatching a composite bounded task (e.g., one `implement` task that
  internally explores, implements, reviews, and verifies) when the adapter
  declares it, with the report contract (§4.2) as the observability substitute
  for per-stage state transitions.
- **UPS-005 (minor).** Real-talk §47's Slack root command `/ship …` collides in
  name (not function) with mad-skills' `/ship` skill. Recommend renaming the
  Slack command family or adding an explicit disambiguation note.

### External Systems

- **EXT-001**: real-talk orchestrator (future service) — sole caller of
  orchestrated mode; supplies envelopes, consumes reports, owns projection and
  merge. Optional: mad-skills never requires it (CON-001).

### Third-Party Services

- **SVC-001**: GitHub / Azure DevOps — unchanged usage via existing skill
  internals; orchestrated mode *reduces* provider calls (no merge, no CI poll).

### Infrastructure Dependencies

- **INF-001**: Git worktrees — orchestrated dispatch assumes an existing
  worktree (real-talk `workingDirectory`); `/build`'s existing worktree-refusal
  rule stands.

### Data Dependencies

- **DAT-001**: `.orchestrator/task.json` (in), `.orchestrator/report.json`
  (out) — schemas in §4, versioned by the `envelope` integer.

### Technology Platform Dependencies

- **PLT-001**: Node.js ≥ 18, bash, git — existing repo constraints; no additions.

## 9. Examples & Edge Cases

**Standalone run (no change):** `/build specs/foo.md` with no
`.orchestrator/task.json` → today's pipeline, interactive questions, ship stage
merges as configured. No report file written.

**Caller provisioned first:** real-talk created branch/worktree/draft PR at
`BriefReady`, then dispatches `taskType: specify`. `/speccy`'s bundle finds the
worktree, branch, and open PR and reuses all three; the report carries
`prReused: true` and the existing PR URL.

**Needs-input round-trip:** orchestrated `/speccy` hits an unresolved scope
question → report `outcome: needs-input`, `questions: [{ "id": "q-export-limit", … }]`.
Caller relays to Slack, gets an answer, redispatches with
`"decisions": { "q-export-limit": "Cap exports at 50k rows" }` → run proceeds.

**Violation:** orchestrated `/build` with `allowedPaths: ["src/export/**", "tests/export/**"]`
touches `src/auth/session.ts` → validator exit 1, change stashed
(`stashRef: "stash@{0}"`), report `outcome: violation`; nothing committed or pushed.

**Over-broad specify envelope (AC-005):** `taskType: specify` with
`allowedPaths: ["**"]` → effective write set is still planning paths only;
a write to `src/` is a violation despite the envelope.

**Malformed envelope:** `.orchestrator/task.json` exists but `envelope: 2` →
abort at pre-flight, `blocked` report, exit; user/adapter told exactly why.
Deleting the file restores standalone mode.

**Untracked-file edge:** the validator must include untracked files
(`git status --porcelain`), not just tracked diffs — new files outside
`allowedPaths` are violations too.

## 10. Validation Criteria

1. Existing test suite (`npm test`) passes unmodified in standalone mode (AC-001).
2. New unit + fixture tests cover envelope validation, validator exit codes,
   quarantine, planning-path intersection, and reuse-first provisioning
   (AC-003/004/005/009/010).
3. Eval cases assert orchestrated-mode announcement, report-don't-ask, and
   stop-at-PR (AC-002/006/007).
4. `npm run build:manifests` emits the orchestration capability blocks (AC-011).
5. A scripted end-to-end dry run against a fixture repo: envelope → `/speccy`
   (needs-input → redispatch) → `/build` (violation injected then fixed) →
   `/ship` (stops at PR) with valid reports at each step.
6. LOGBOOK contains the deferred follow-ups from §11.

## 11. Open Questions & Deferred Items

- **Deferred — Technical Spike support** (`specs/tech-spike.md`): spike task
  type, disposition workflow, findings docs. Logged to LOGBOOK; needs its own
  interview. The `envelope` version field leaves room to add
  `taskType: spike` in version 2 without breaking version 1 consumers.
- **Deferred — envelope-driven `/prime`/`/sync`:** not needed; both run inside
  the three contract skills.
- **Open — question-id stability:** `needs-input` ids must be deterministic
  enough for redispatch matching; convention (slug of the decision topic) to be
  fixed during implementation.
- **Assumption — adapter transport:** the adapter invokes skills via
  non-interactive Claude Code (`claude -p "/build … --envelope …"` or Agent
  SDK). If a future adapter cannot pass flags, the well-known-path discovery
  (REQ-002) alone is sufficient.

## 12. Related Specifications / Further Reading

- `specs/real-talk.md` — AI Developer Orchestrator core specification (v1.2 draft)
- `specs/tech-spike.md` — Technical Spike Extension (deferred here)
- `specs/bundled-approval-handoff.md` — provisioning bundle this contract builds on
- `specs/autonomous-execution-mode.md` — `--auto` foundations for non-interactive runs
- `specs/superpowers-complementary-layer.md` + `references/superpowers-deferral.md`
  — the soft-dependency pattern this contract mirrors (PAT-001)
