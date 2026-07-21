---
title: Orchestrator Core App — MVP Delivery Specification (real-talk v1.3)
version: 1.0
date_created: 2026-07-21
last_updated: 2026-07-21
tags: [app, architecture, infrastructure, process]
---

# Introduction

This is the build specification for the **AI Developer Orchestrator core
app**: the Slack-fronted service that owns feature lifecycle state, approval
gates, workspace provisioning, agent dispatch, and pull-request state
projection. It is intended to seed a **new repository** and be implemented
there.

The normative behavior is defined in **`real-talk.md` v1.3** (copied
alongside this file); this document does not restate it. Everything here is
delivery-level: milestone order, component and repository layout, runtime
and deployment decisions, data schema, and test strategy. Where the two
documents could ever disagree, `real-talk.md` wins and this document must be
corrected.

# 1. Purpose & Scope

**Purpose:** turn `real-talk.md` v1.3 into an ordered, buildable plan whose
end state passes all 45 MVP acceptance criteria (real-talk §54) against
**both** GitHub and Azure DevOps.

**In scope:** the orchestrator service (Slack connector, state machine,
approval engine, policy engine, scheduler, projection, audit, recovery),
GitHub and Azure DevOps delivery adapters, the Claude Code agent adapter,
containerized agent runners, PostgreSQL persistence, and single-service
deployment.

**Out of scope:** the Technical Spike Extension (`tech-spike.md` — post-MVP;
needs a v1.3 compatibility pass first), multi-repository features, Teams/Web
/CLI connectors (interfaces stubbed, not built), production deployment
automation beyond one environment, and any changes to mad-skills itself
(covered by `orchestrator-ready-mad-skills.md` in the mad-skills repo).

**Audience:** the implementer(s) of the new repository.

# 2. Definitions

Terms from real-talk §1–§8 (orchestrator, connector, adapter, projection,
provisioning, envelope, task report) apply unchanged. Additions:

| Term | Definition |
|---|---|
| **Runner** | A short-lived container executing exactly one agent task: mounted worktree, scoped git credentials, injected agent credentials, no orchestrator DB access. |
| **RunnerProvider** | The internal interface that launches/monitors/kills runners. MVP implementation: Docker Engine API on the service host. |
| **Saga** | A multi-step external operation (e.g. provisioning, real-talk §14/§16) executed as idempotent, checkpointed jobs with retries. |
| **Contracts package** | The shared JSON Schemas for envelope v1 and task report, kept byte-compatible with the mad-skills worker contract. |

# 3. Requirements, Constraints & Guidelines

- **REQ-001 — Conformance.** Implement real-talk v1.3 as written; the 45
  criteria of §54 are the MVP definition of done, evaluated per provider.
- **REQ-002 — Dual-provider MVP.** GitHub and Azure DevOps adapters both
  ship in MVP behind one `DeliveryAdapter` interface (real-talk §45).
  GitHub is sequenced first internally (M2), AzDO reaches parity in M6; the
  MVP is not done until the same test suite passes against both.
- **REQ-003 — Containerized runners from day one.** Every agent task runs
  in a fresh container (one write-capable task per worktree, real-talk §28).
  The worktree is bind-mounted; git credentials are short-lived and scoped
  to the feature branch; `ANTHROPIC_API_KEY` is injected per-run from the
  secret manager. Runners have no access to orchestrator secrets or DB.
- **REQ-004 — Transport.** Slack via Socket Mode. One public HTTPS endpoint
  receives GitHub webhooks and Azure DevOps service hooks with signature/
  secret verification. Single deployable container for the service.
- **REQ-005 — Envelope contract.** Agent dispatch uses envelope v1 and task
  reports exactly as real-talk §26; schemas live in the contracts package
  and are treated as frozen (version bump required to change).
- **REQ-006 — State machine first.** Canonical states, transitions, state
  revisions (§38), and audit events (§53) are implemented as a pure,
  fully unit-tested core with no I/O before any connector or adapter work.
- **REQ-007 — Enforcement is layered.** Runner-level (read-only mounts for
  `discover`/`specify`, path controls) plus orchestrator-level post-task
  git-diff validation (§21). A violation stops the task, quarantines the
  diff, blocks push, audits, and notifies Slack.
- **REQ-008 — Recovery.** All external operations are pg-boss jobs with
  idempotency keys; on restart the recovery manager reconciles running
  tasks, runner containers, locks, and projections (§52).
- **SEC-001** — Slack request/user identity verified; role-based
  authorization for approvals (§31); approvals recorded with actor, role,
  revision, source (§24).
- **SEC-002** — Webhook signatures verified; provider events are
  reconciliation inputs, never direct commands (§43).
- **SEC-003** — No secrets in envelopes, reports, logs, or PR bodies;
  secret scanning on runner output before push.
- **CON-001** — Single deployable service + PostgreSQL + Docker host. No
  Kubernetes in MVP; `RunnerProvider` is the seam for ACA Jobs/K8s later.
- **CON-002** — TypeScript on Node.js LTS per real-talk §56 (assumption,
  recorded; revisit only with a strong reason).
- **CON-003** — pg-boss for jobs/sagas; adopt Temporal only if provisioning
  saga complexity demonstrably outgrows it (recorded assumption).
- **GUD-001** — Adapters contain zero lifecycle logic; the core contains
  zero provider/agent specifics. Enforce with lint boundaries
  (dependency-cruiser or eslint import rules).
- **PAT-001** — Ports-and-adapters: `ConnectorPort`, `DeliveryAdapter`,
  `AgentAdapter`, `RunnerProvider` are the only seams crossing the core.

# 4. Interfaces & Data Contracts

## 4.1 Repository layout (monorepo, single deployable)

```text
orchestrator/
├── apps/
│   └── service/            # composition root: Bolt (Socket Mode), webhook
│                           # receiver, health/admin endpoints, job workers
├── packages/
│   ├── core/               # state machine, transitions, policy engine,
│   │                       # approval engine, scheduler, audit (pure)
│   ├── contracts/          # envelope v1 + task report JSON Schemas
│   ├── db/                 # migrations, repositories (Postgres)
│   ├── connectors/slack/   # Slack ⇄ provider-neutral commands/events
│   ├── delivery/github/    # projection + provisioning ops via REST/GraphQL
│   ├── delivery/azdo/      # projection + provisioning ops via REST
│   ├── agents/claude-code/ # envelope writer, skill dispatch, report reader
│   └── runner/             # RunnerProvider: docker implementation
├── specs/
│   ├── real-talk.md              # normative core (v1.3)
│   ├── orchestrator-core-app.md  # this document
│   └── tech-spike.md             # post-MVP extension (needs v1.3 pass)
└── .orchestrator.yml       # repository policy example (real-talk §50)
```

## 4.2 Internal ports (signatures indicative)

```ts
interface ConnectorPort {
  onCommand(cmd: NeutralCommand): Promise<void>;
  sendPrompt(target: ConversationRef, prompt: ApprovalPrompt): Promise<MessageRef>;
  notify(target: ConversationRef, note: Notification): Promise<void>;
}

interface DeliveryAdapter {                      // real-talk §45
  getCapabilities(): ProviderCapabilities;       // §44
  provision(step: ProvisioningStep): Promise<StepResult>;  // idempotent, §14/§16
  projectWorkflowState(req: ProjectionRequest): Promise<ProjectionResult>;
  mergePullRequest(ref: PrRef, policy: MergePolicy): Promise<MergeResult>;
}

interface AgentAdapter {                         // real-talk §26
  getCapabilities(): AgentCapabilities;          // §26.4
  execute(envelope: EnvelopeV1, ctx: ExecutionContext): Promise<RunHandle>;
  getStatus(runId: string): Promise<RunStatus>;
  cancel(runId: string): Promise<void>;
}

interface RunnerProvider {
  launch(spec: RunnerSpec): Promise<RunnerHandle>;   // image, mounts, env, limits
  wait(handle: RunnerHandle, timeoutMs: number): Promise<RunnerExit>;
  kill(handle: RunnerHandle): Promise<void>;
  listOrphans(): Promise<RunnerHandle[]>;            // recovery, §52
}
```

## 4.3 Database

Tables map 1:1 to real-talk §49 (`feature`, `specification`,
`workflow_task`, `agent_run`, `approval`, `projection_record`) plus:
`audit_event` (append-only, correlation id, state revision),
`connector_mapping` (Slack thread ⇄ feature), `lock` (worktree/branch/PR
scopes), and pg-boss's own schema. All state changes and audit appends for
one transition commit in one transaction; projection and provider I/O never
do (§46).

## 4.4 Agent contract

Envelope v1 and task report exactly as real-talk §26.1–26.3; JSON Schemas
in `packages/contracts` with fixture-based compatibility tests. The Claude
Code adapter drives mad-skills skills per real-talk §27 when the worker
contract is available (see DAT-001 risk in §8).

# 5. Acceptance Criteria

Milestone gates; "criteria N" references real-talk §54.

- **AC-M0**: Given the bare service, when `npm test` runs, then every legal
  and illegal state transition, state-revision rule (§38), and audit append
  is covered by pure unit tests; migrations apply from zero.
- **AC-M1**: Criteria 1–4 pass — feature creation from Slack (`/feature
  new`), identifiers minted per `feature_id_format`, `Idea` persists with
  no Git resources, provisioning refuses without its required artifact.
- **AC-M2**: Criteria 5–10, 24–28, 31–33, 35 pass against GitHub — one
  idempotent provisioning saga (kill the service mid-saga; rerun completes
  with zero duplicates), full projection (draft flag, single lifecycle
  label, `orchestrator/lifecycle` check bound to head, description block
  preserving human content).
- **AC-M3**: Criteria 11–13, 17–19, 43 pass — envelope-dispatched runs in
  containers, read-only spec tasks, prohibited-write quarantine before
  commit/push, needs-input round-trip Slack ⇄ redispatch.
- **AC-M4**: Criteria 14–16, 45 pass — revisioned specs with content hash,
  explicit approval of a revision, both `provision_at` policies correct.
- **AC-M5**: Criteria 20–23, 27, 29, 34, 36–39 pass — local validation in
  runners, remote CI incorporated via webhooks, structured findings,
  blocking findings gate readiness, human gate before `ReadyToMerge`,
  provider drift reconciled.
- **AC-M6**: The full M1–M5 acceptance suite passes against Azure DevOps
  (criteria 30, 41–42 included) with no core changes — adapter work only.
- **AC-M7**: Criteria 40–41 pass — restart mid-task, mid-saga, and
  mid-projection each recover to a consistent state; orphaned runner
  containers are detected and reaped; every transition is auditable
  end-to-end. Criterion 44 (composite delegation) passes when the adapter
  declares composite support.

# 6. Test Automation Strategy

- **Unit (fast, no I/O):** `packages/core` state machine, policy, approval
  rules; contracts schema validation fixtures (valid/malformed/wrong-version
  envelopes — shared with mad-skills' fixtures where possible).
- **Integration:** Postgres via testcontainers (repositories, transactional
  transition+audit, pg-boss jobs); RunnerProvider against local Docker;
  saga idempotency tests that kill and resume at every checkpoint (§16).
- **Contract tests per adapter:** recorded-fixture tests for REST payloads
  plus a live suite against a sandbox GitHub org and a sandbox AzDO project
  (CI-gated by credential availability, like mad-skills' eval gate).
- **End-to-end:** one scripted feature per provider — Slack command →
  brief → discovery (read-only run) → spec → approval → provisioning →
  implement (violation injected once, then clean) → validation → review →
  human gate → merge — asserting the §54 criteria for that path.
- **Frameworks:** vitest, testcontainers, zod (runtime schema validation
  mirroring the JSON Schemas). Coverage gate on `packages/core`: 90%+.

# 7. Rationale & Context

- **Dual-provider MVP (user decision):** parity is the product's point for
  this user's environments; sequencing GitHub first (M2) with AzDO as a
  dedicated parity milestone (M6) keeps the abstraction honest (AC-42)
  without doubling every intermediate milestone.
- **Containerized runners from day one (user decision):** satisfies
  real-talk §51 isolation immediately and makes read-only enforcement
  mostly a mount option instead of pure diff-policing. The cost is Docker
  plumbing in M3; contained behind `RunnerProvider`.
- **Recorded assumptions:** Docker-on-VM (not K8s) as MVP runner platform;
  `ANTHROPIC_API_KEY` per-run injection for headless runners; TypeScript;
  pg-boss over Temporal. Each is a seam, not a commitment — swapping any
  of them later touches one package.
- **State machine first (REQ-006):** every later component hangs off
  transitions + revisions + audit; building it pure and exhaustively
  tested is the cheapest de-risking available.
- **Interactive-merge note:** mad-skills' standalone `/ship` auto-merge is
  irrelevant here — under orchestration merge is executed only by the
  orchestrator's delivery adapter after the human gate (criteria 38–39).

# 8. Dependencies & External Integrations

### External Systems
- **EXT-001**: Slack workspace + app (Socket Mode enabled, slash command
  `/feature`, interactive buttons for approvals).
- **EXT-002**: GitHub org + sandbox repo (webhooks, checks API, rulesets);
  Azure DevOps org + sandbox project (service hooks, PR statuses, policies).
- **EXT-003**: Anthropic API access for runner containers.

### Data Dependencies
- **DAT-001 — mad-skills worker contract (RISK).** The Claude Code
  adapter's skill-driving mode depends on mad-skills implementing
  `orchestrator-ready-mad-skills.md` (envelope intake, task reports,
  needs-input). That build has **not happened yet** — it is a spec in the
  mad-skills repo. M3 therefore implements the adapter with a **generic
  bounded-prompt fallback** (non-interactive Claude Code run with the
  envelope contents rendered as instructions + report file required), and
  switches to skill dispatch when the worker contract lands. Track this
  explicitly; do not let the fallback quietly become permanent.

### Infrastructure Dependencies
- **INF-001**: One VM/container host with Docker Engine, public HTTPS for
  the webhook endpoint (reverse proxy + TLS), outbound to Slack/GitHub/
  AzDO/Anthropic. PostgreSQL (managed or co-hosted). Secret manager.

### Technology Platform Dependencies
- **PLT-001**: Node.js LTS, TypeScript, PostgreSQL ≥ 15, Docker Engine API.

# 9. Examples & Edge Cases

- **Provisioning retry:** service killed after `BranchPushed`, before
  `DraftPullRequestCreated` → on restart the saga resumes at PR creation,
  finds no PR, creates exactly one; a second replay finds the open PR and
  reuses it (criteria 9).
- **Manual ready-for-review on the provider:** webhook arrives, gates
  unmet → orchestrator restores draft, audits the drift, notifies the
  thread (criterion 27, §36).
- **Needs-input:** implement task hits an unanswered design decision →
  report `needs-input` with questions → Slack thread renders them as
  buttons/options → answers redispatch the same task with `decisions`
  populated; the runner container is fresh but the worktree persists.
- **Violation:** spec-mode runner writes `src/…` despite read-only mount
  gaps (e.g. new untracked file via permitted tmp path) → post-task diff
  validation catches it, quarantines, blocks push, feature → safe state.
- **Out-of-order projection:** state revision 18 projected while a stale
  revision-17 job retries → 17 is dropped (criterion 35, §38).
- **Envelope version bump:** a v2 envelope reaching a v1-only agent fails
  closed with outcome `blocked`, never an unrestricted run (§26.1).

# 10. Validation Criteria

1. Milestone gates AC-M0 … AC-M7 all pass; the M1–M5 suite is executed
   against both providers (M6) before MVP is declared.
2. All 45 real-talk §54 criteria are mapped to automated tests or scripted
   E2E steps in the repo (a traceability table checked into `specs/`).
3. Chaos pass: kill -9 the service during each saga step and during an
   agent run; recovery leaves no duplicate resources, no orphaned
   containers, no lost audit events.
4. Security pass: webhook signature rejection, unauthorized approval
   rejection, secret-scan on runner output, no `ANTHROPIC_API_KEY` in any
   log/report/PR body.
5. Boundary lint (GUD-001) passes: no provider/agent imports in core.

# 11. Open Questions & Deferred Items

- **Deferred:** Technical Spike Extension (after its v1.3 compatibility
  pass, tracked in the mad-skills LOGBOOK); Teams/Web/CLI connectors;
  Kubernetes/ACA runner provider; `Released` automation (§10.14 beyond
  recording the state).
- **Open — runner base image contents:** Claude Code version pinning and
  preinstalled toolchains per target repo (dotnet? node?) — decide in M3
  when the first target repository is chosen.
- **Open — sandbox tenancy:** which GitHub org / AzDO project serve as
  permanent CI sandboxes; needed by M2.
- **Assumptions (recorded, revisitable):** Docker-on-VM; API-key auth;
  TypeScript; pg-boss. See §7.

# 12. Related Specifications / Further Reading

- `real-talk.md` v1.3 — normative core specification (annex to this doc)
- `orchestrator-ready-mad-skills.md` (mad-skills repo) — worker-side
  contract; source of envelope v1 / task report schemas
- `tech-spike.md` — Technical Spike Extension (post-MVP)
- Slack Bolt (Socket Mode), GitHub Checks/Webhooks, Azure DevOps PR
  statuses & service hooks, pg-boss — vendor docs for the chosen profile
