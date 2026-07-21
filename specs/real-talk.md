# AI Developer Orchestrator — Core Specification

**Status:** Draft
**Version:** 1.3
**Document role:** Core single source of truth
**Scope:** Standard specification-to-delivery workflow
**Primary conversation interface:** Slack
**Initial coding-agent adapter:** Claude Code
**Initial Git providers:** GitHub and Azure DevOps

**Changes in 1.3**

* Provisioning trigger is now repository policy (`workflow.provision_at`), default `spec-approval` (§9, §13–14, §25, §50).
* Task envelope v1 and task report schemas are the canonical provider-neutral agent contract (§26), shared verbatim with the mad-skills worker contract.
* Adapters may drive agent-native commands/skills as an implementation detail; non-interactive capability declaration is required (§5.2, §26.4, §27).
* Feature identifiers may be orchestrator-minted or adopted from agent-side artifacts; slug formats permitted (§11, §50).
* Composite (macro) task delegation defined (§26.4).
* Slack command root renamed `/ship` → `/feature` (§47).
* Non-binding reference implementation profile added (§56).

---

# 1. Purpose

The AI Developer Orchestrator coordinates software-delivery work across conversational interfaces, coding agents, Git repositories, pull requests, validation systems, and human approvals.

The system operates above any individual coding agent.

Claude Code, Codex, or another coding agent is treated as an execution worker. The agent does not own:

* The feature lifecycle
* Specification approval
* Repository policy
* Delivery state
* Review requirements
* Merge readiness
* Release approval
* Audit history

The orchestrator owns:

* Feature lifecycle state
* Specification revisions
* Human approval gates
* Workspace provisioning
* Agent task assignment
* Repository permissions
* Validation and review sequencing
* Pull-request state projection
* Retry and recovery behaviour
* Notifications
* Audit history

Slack provides a conversational interface.

Git and the pull request provide the persistent engineering record once the feature has a durable planning artifact.

---

# 2. Core Architectural Rule

The system separates four concerns.

## 2.1 Conversation

Humans discuss the work through Slack or another connector.

## 2.2 Coordination

The orchestrator owns workflow state, policy, approvals, tasks, and transitions.

## 2.3 Execution

Coding agents perform bounded tasks inside controlled execution environments.

## 2.4 Delivery

Git, pull requests, validation, reviews, merge, and release record and govern the resulting change.

The central rule is:

> Conversation initiates and guides the work.
> The orchestrator controls the work.
> Agents perform the work.
> Git records durable engineering work.
> Humans approve important boundaries.

---

# 3. Goals

The core system must support:

1. Starting a feature discussion in Slack.
2. Maintaining a lightweight feature record before Git resources exist.
3. Producing a minimum durable feature brief.
4. Creating a dedicated branch, worktree, initial commit, and draft pull request as one logical provisioning operation.
5. Linking Slack, the feature record, the worktree, and the pull request.
6. Analysing the repository without modifying product code.
7. Refining the brief into a structured specification.
8. Versioning and approving the specification.
9. Invoking coding agents through a provider-neutral interface.
10. Enabling product-code changes only after specification approval.
11. Running local and remote validation.
12. Performing code, security, architecture, and quality reviews.
13. Recording structured findings and resolutions.
14. Projecting orchestrator state into GitHub and Azure DevOps.
15. Requiring human approval before merge readiness.
16. Preserving an auditable workflow history.
17. Recovering from partial provisioning and execution failures.
18. Allowing connectors, agents, Git providers, and CI systems to be replaced independently.

---

# 4. Non-Goals

The core specification does not attempt to:

* Recreate an agent terminal inside Slack.
* Mirror every native command of Claude Code or another agent.
* Replace the Git provider’s pull-request interface.
* Permit unrestricted shell access through Slack.
* Automatically deploy to production without explicit policy.
* Support arbitrary multi-repository delivery in the initial release.
* Allow multiple write-capable agents to modify one worktree concurrently.
* Depend on undocumented agent internals.
* Bypass provider authentication, licensing, subscription, or usage restrictions.
* Define experimental code changes before specification approval.

Experimental technical work before specification approval is defined separately in the **Technical Spike Extension**.

---

# 5. Design Principles

## 5.1 The orchestrator owns the process

Workflow states and valid transitions belong to the orchestrator.

GitHub, Azure DevOps, Slack, and coding-agent concepts are projections or capabilities, not the canonical business model.

## 5.2 Agents are replaceable workers

Agent-specific behaviour must remain behind an adapter.

The core workflow must not depend on:

* Claude-specific slash commands
* Claude-specific terminal output
* Claude-specific session formats
* Claude-specific model identifiers
* Provider-specific permission prompts

This restriction binds the orchestrator core, not the adapter. An agent
adapter MAY invoke agent-native commands, skills, or extensions (for
example, the mad-skills skills for Claude Code) as its private
implementation detail, provided every task and result crosses the adapter
boundary in the provider-neutral contract defined in §26. Each adapter
must declare which task types it can execute non-interactively (§26.4).

## 5.3 Git records durable engineering work

Git resources are not required for an unformed conversation.

Once a minimum durable planning artifact exists, Git becomes the engineering system of record.

## 5.4 Slack is an interface, not the authoritative database

Slack is used for:

* Conversation
* Commands
* Approval prompts
* Notifications
* Summaries
* Escalations
* Deep links

Delivery-critical state must not exist only in Slack.

## 5.5 Specification work is read-only

During normal discovery and specification, agents may inspect and execute the existing system but may not change product source code.

## 5.6 Pull requests are persistent collaboration artifacts

The draft pull request carries engineering collaboration from repository-backed discovery through delivery.

## 5.7 Human control is explicit

Security-sensitive, destructive, production-facing, or high-impact actions require explicit policy and approval.

## 5.8 Work must be recoverable

The orchestrator must persist enough state to recover from:

* Service restarts
* Worker failures
* Agent failures
* Git-provider failures
* CI failures
* Slack delivery failures
* Partial provisioning operations

---

# 6. Primary Actors

## 6.1 Requester

Creates the initial feature request and clarifies the desired outcome.

## 6.2 Technical owner

Approves technical direction, specification revisions, material scope changes, risk acceptance, and delivery readiness.

## 6.3 Reviewer

Performs code, architecture, quality, test, documentation, or security review.

## 6.4 Orchestrator

Owns workflow state and coordinates all external systems.

## 6.5 Coding agent

Performs bounded analysis, implementation, remediation, validation, or review tasks.

## 6.6 Git provider

Hosts repositories, branches, pull requests, reviews, and merge state.

## 6.7 Validation provider

Runs authoritative build, test, security, packaging, or release checks.

---

# 7. High-Level Architecture

```text
Conversation Interfaces
    Slack
    Teams
    Web
    CLI
        │
        ▼
Connector Layer
        │
        ▼
Orchestrator Core
    Feature State Machine
    Command Router
    Approval Engine
    Policy Engine
    Task Scheduler
    Context Builder
    State Projection Service
    Audit Service
    Recovery Manager
        │
        ├───────────────────────┐
        ▼                       ▼
Agent Interface          Delivery Interface
        │                       │
        ▼                       ▼
Agent Adapters           Git and CI Adapters
Claude Code              GitHub
Codex                    Azure DevOps
Other agents             Other providers
        │
        ▼
Controlled Execution Environment
    Dedicated worktree
    Scoped credentials
    Filesystem restrictions
    Command policies
    Runtime limits
```

---

# 8. Architectural Boundaries

## 8.1 Connector layer

The connector translates platform-specific interactions into provider-neutral commands and events.

The Slack connector may handle:

* Slash commands
* Mentions
* Direct messages
* Thread messages
* Buttons
* Modals
* Approval actions
* Notifications
* Message updates

It must not contain lifecycle rules.

Example:

```json
{
  "connector": "slack",
  "workspaceId": "workspace-123",
  "channelId": "channel-456",
  "threadId": "thread-789",
  "userId": "user-321",
  "command": "feature.approve-specification",
  "arguments": {
    "featureId": "FEAT-1042",
    "revision": 5
  }
}
```

## 8.2 Orchestration layer

The orchestration layer owns:

* Canonical feature state
* Valid transitions
* Approval requirements
* Task dispatch
* Agent selection
* Retry policy
* Repository policy
* State projection
* Audit history
* Notifications

## 8.3 Agent layer

The agent layer converts provider-neutral tasks into agent-specific invocations.

## 8.4 Delivery layer

The delivery layer manages:

* Repository access
* Branches
* Worktrees
* Commits
* Pushes
* Pull requests
* Labels
* Checks and statuses
* Reviews
* Merge
* CI and release integrations

## 8.5 Persistence layer

The orchestrator database stores canonical workflow and execution metadata.

Git stores durable engineering artifacts.

Secrets are stored in an external secret-management system.

---

# 9. Core Lifecycle

```text
Idea
  ↓
BriefReady
  ↓
Discovery
  ↓
Specifying
  ↓
SpecificationReady
  ↓
SpecificationApproved
  ↓
Provisioning
  ↓
Implementing
  ↓
Validating
  ↓
Reviewing
  ↓
ReadyForReview
  ↓
ReadyToMerge
  ↓
Merged
  ↓
Released
```

The diagram shows the default policy (`workflow.provision_at:
spec-approval`, §50): Git resources are provisioned only after
specification approval, and Discovery/Specifying run in an ephemeral
read-only workspace of the base branch. In `brief` mode, `Provisioning`
instead runs immediately after `BriefReady`, and Discovery/Specifying
operate inside the provisioned workspace so the draft pull request carries
their history.

Interrupt and terminal states include:

```text
Paused
Blocked
Cancelled
Failed
Superseded
```

---

# 10. Lifecycle Definitions

## 10.1 Idea

The feature exists as a conversation and lightweight orchestrator record.

At this stage:

* The problem may still be unclear.
* No branch exists.
* No worktree exists.
* No commit exists.
* No pull request exists.
* Discussion may remain entirely in Slack.

## 10.2 BriefReady

A minimum durable planning artifact exists and is worth committing.

In `brief` mode the feature can now be provisioned into Git. In
`spec-approval` mode (default) the feature proceeds to Discovery, and the
brief is retained in the orchestrator store until provisioning.

## 10.3 Provisioning

The orchestrator creates the branch, worktree, initial commit, remote branch, and draft pull request.

Provisioning runs at the point selected by `workflow.provision_at` (§50):
after `SpecificationApproved` (default) or after `BriefReady`.

## 10.4 Discovery

Agents and humans inspect the existing repository and system to understand:

* Current behaviour
* Affected components
* Existing tests
* Dependencies
* Constraints
* Risks
* Open questions

Repository access is read-only apart from approved planning paths.

## 10.5 Specifying

Discovery findings are converted into an implementation-ready specification.

Repository access remains read-only apart from approved planning paths.

## 10.6 SpecificationReady

The specification is sufficiently complete for human approval.

## 10.7 SpecificationApproved

An authorised user has approved a specific specification revision and content hash.

## 10.8 Implementing

Product source code and tests may be modified according to the approved scope.

## 10.9 Validating

Required local and remote checks are executing.

## 10.10 Reviewing

Automated or human code, security, architecture, test, or quality review is underway.

## 10.11 ReadyForReview

The change is stable enough for formal human review.

The Git adapter normally removes draft status at this transition.

## 10.12 ReadyToMerge

Required validation, review, and approvals have passed.

## 10.13 Merged

The pull request has been merged.

## 10.14 Released

The resulting change has been released or deployed according to policy.

---

# 11. Conversation-Only Inception

A feature begins in Slack or another conversational interface.

The orchestrator may create a lightweight feature record containing:

* Feature identifier
* Working title
* Requester
* Slack thread
* Creation time
* Initial request
* Current owner
* Initial repository candidate, if known

The orchestrator mints the feature identifier when the record is created.
The format is repository policy (`feature_id_format`, §50): sequential
(`FEAT-1042`), slug-based (`customer-csv-export`), or adapter-supplied.
When work originates agent-side — a planning artifact already exists in
the repository — the orchestrator adopts that artifact's identifier or
slug rather than minting a competing one.

No Git resources are created while there is nothing durable to commit.

The conversation may include:

* Initial problem description
* Clarifying questions
* Rough scope
* Desired outcome
* Repository selection
* Stakeholder identification

The feature remains in `Idea` until a minimum durable feature brief exists.

---

# 12. Minimum Durable Feature Brief

Workspace provisioning requires a committable planning artifact: the
feature brief in `brief` mode, or the approved specification revision in
`spec-approval` mode. A minimum durable brief is required in both modes
before repository-backed discovery may begin.

The minimum feature brief must contain:

1. Feature identifier
2. Working title
3. Problem or request
4. Current understanding
5. Initial scope or intended outcome
6. Open questions

Optional initial fields include:

* Known constraints
* Suspected affected components
* Initial risks
* Stakeholders
* Related issue or incident
* Acceptance-criteria placeholders

Example:

```markdown
---
feature: FEAT-1042
status: discovery
---

# Customer CSV Export

## Problem

Users need to export the results of a customer search.

## Current understanding

- The export should contain all matching records.
- Existing authorisation rules must be preserved.
- Large result sets may require streaming.

## Initial scope

Investigate and specify a CSV export capability for customer search.

## Open questions

- What is the maximum expected export size?
- Should exports run synchronously?
- Which customer fields may be exported?
```

The brief need not be a finished specification.

It must simply be coherent and useful enough to justify a durable Git artifact.

---

# 13. Engineering Workspace Provisioning

When the provisioning trigger fires (`workflow.provision_at`, §50), the orchestrator creates:

* One feature branch
* One dedicated worktree
* One initial planning commit
* One remote branch
* One draft pull request
* One mapping between Slack, the feature record, and the pull request

These resources form one logical engineering workspace.

The invariant is:

> A repository-backed feature has one canonical feature record, branch, worktree, draft pull request, and primary Slack conversation.

---

# 14. Provisioning Sequence

Provisioning performs the following steps:

1. Confirm the repository.
2. Confirm the target base branch.
3. Fetch current remote state.
4. Resolve the exact base commit.
5. Create the feature branch and worktree.
6. Materialise the committable planning artifact in the worktree: the brief (`brief` mode) or the approved specification revision with its recorded content hash (`spec-approval` mode).
7. Commit the artifact.
8. Push the branch.
9. Create the draft pull request.
10. Apply the initial lifecycle projection.
11. Link the Slack thread and feature record.
12. Transition the feature to the next state for the active policy: `Discovery` or `Specifying` in `brief` mode, `Implementing` in `spec-approval` mode.

Recommended Git operation:

```text
git fetch origin

git worktree add \
  -b feature/FEAT-1042-customer-export \
  ../worktrees/FEAT-1042 \
  origin/main
```

The branch is created directly as part of worktree creation.

The orchestrator does not need to switch the main checkout.

---

# 15. What the Initial Commit Contains

The initial commit contains the durable feature brief or initial specification.

Recommended location:

```text
docs/features/FEAT-1042/spec.md
```

Recommended commit:

```text
docs(FEAT-1042): initialise feature discovery
```

The initial commit must not normally contain:

* Product implementation code
* New product tests
* Unrelated repository changes
* Slack transcripts
* Build output
* Runtime state
* Generated secrets
* Placeholder files with no durable purpose

A pull request does not receive commits directly.

The commit is pushed to the feature branch, and the pull request presents the difference between that branch and its base.

---

# 16. Provisioning Is Logically Atomic

Provisioning spans local Git and a remote provider and therefore cannot be one physical transaction.

It must be implemented as an idempotent workflow.

Possible checkpoints include:

```text
WorkspaceProvisioningStarted
BranchCreated
WorktreeCreated
BriefCommitted
BranchPushed
DraftPullRequestCreated
InitialStateProjected
WorkspaceProvisioningCompleted
```

If pull-request creation fails after the branch is pushed, a retry must reuse the existing resources.

Repeating the provisioning command must not create:

* A duplicate branch
* A duplicate worktree
* A duplicate initial commit
* A duplicate pull request

---

# 17. Pull Request as Persistent Collaboration Artifact

The same pull request normally continues from its creation through merge:
from discovery onward in `brief` mode, or from implementation onward in
`spec-approval` mode, where the approved specification still lands as the
branch's initial commit.

It carries:

* Feature brief
* Specification revisions
* Repository findings
* Implementation plans
* Technical decisions
* Product changes
* Tests
* Validation results
* Agent summaries
* Review findings
* Human discussion
* Approval state
* Merge history

Slack should link to relevant pull-request content rather than duplicate all engineering detail.

---

# 18. Specification Structure

The specification should grow to include:

1. Summary
2. Problem statement
3. Desired outcome
4. In scope
5. Out of scope
6. Functional requirements
7. Non-functional requirements
8. Constraints
9. Dependencies
10. Proposed design
11. Alternatives considered
12. Risks
13. Security considerations
14. Acceptance criteria
15. Validation plan
16. Rollout or migration considerations
17. Open questions

Associated files may include:

```text
docs/features/FEAT-1042/spec.md
docs/features/FEAT-1042/decisions.md
docs/features/FEAT-1042/findings.md
docs/features/FEAT-1042/implementation-plan.md
docs/features/FEAT-1042/review-summary.md
docs/features/FEAT-1042/security-review.md
```

---

# 19. Read-Only Specification Guidance

During `Discovery` and `Specifying`, agents may:

* Read and search source code
* Inspect tests and documentation
* Inspect Git history
* Inspect dependency manifests
* Inspect configuration
* Run approved existing builds
* Run approved existing tests
* Run approved static analysis
* Reproduce existing behaviour
* Record findings
* Update specification documents
* Update decision records
* Produce an implementation plan
* Discuss alternatives in the draft pull request

Agents must not:

* Modify product source code
* Modify product tests
* Add or remove dependencies
* Change infrastructure
* Change CI or deployment pipelines
* Create migrations
* Publish artifacts
* Deploy software
* Commit implementation changes

The governing rule is:

> Specification work may inspect and execute the existing system, but it may not change the system being specified.

---

# 20. Permitted Planning Writes

Specification-mode agents may write only to approved planning paths.

Typical paths include:

```text
docs/features/<feature-id>/**
.orchestrator/<feature-id>/**
```

Example policy:

```yaml
workflow:
  specification_mode:
    repository_access: read_only
    writable_paths:
      - docs/features/{featureId}/**
      - .orchestrator/{featureId}/**
```

These writes are documentation and workflow artifacts, not product implementation.

In `spec-approval` mode, Discovery and Specifying precede provisioning:
agents run in an ephemeral read-only workspace of the base branch,
planning output is captured as specification revisions in the orchestrator
store, and the approved revision is materialised into the repository at
provisioning. The read-only rules of §19 apply unchanged.

---

# 21. Read-Only Enforcement

Read-only behaviour must be technically enforced.

Possible mechanisms include:

* Read-only filesystem mounts
* Path-based write controls
* Container permissions
* Command allowlists
* Agent tool restrictions
* Git diff inspection
* Post-task validation

If an agent modifies a prohibited path, the orchestrator must:

1. Stop the task.
2. Record the violation.
3. Preserve the attempted diff for audit.
4. Prevent commit and push.
5. Revert or quarantine the changes.
6. Notify the user.
7. Return the feature to a safe state.

A specification agent must not silently become an implementation agent.

---

# 22. Running Builds and Tests During Specification

Existing builds and tests may be run when needed to understand the current system.

Examples include:

* Confirming the repository currently builds
* Identifying existing failing tests
* Measuring test duration
* Reproducing a defect
* Confirming an existing API behaviour
* Establishing a performance baseline

Commands that modify tracked product files, dependency state, infrastructure, or external systems must be denied.

Temporary output must be ignored, cleaned up, or quarantined according to repository policy.

---

# 23. Specification Revisions

Every meaningful specification revision must record:

* Revision number
* Content hash
* Author or initiating actor
* Timestamp
* Change summary
* Approval state

Specification revision metadata belongs in the orchestrator database.

The specification content belongs in Git.

---

# 24. Specification Approval

Approval must be explicit.

The approval event records:

* Feature identifier
* Approved revision
* Content hash
* Approving user
* Timestamp
* Optional comment
* Source interface

A material specification change invalidates the previous approval.

Examples of material change include:

* Scope change
* Security-model change
* New dependency
* New data migration
* New external integration
* Changed acceptance criteria
* Significant architecture change

Editorial corrections may be exempt according to policy.

---

# 25. Promotion to Implementation

In `brief` mode, promotion to `Implementing` does not create a new branch,
worktree, or pull request — those resources already exist. In
`spec-approval` mode, the approval event triggers the provisioning
sequence (§14) as part of this transition.

The transition:

1. Confirms the approved specification revision.
2. Commits any pending specification changes.
3. Records the approved content hash.
4. Establishes the implementation baseline.
5. Enables approved product-code write paths.
6. Updates the pull-request state projection.
7. Starts implementation planning or execution.

---

# 26. Agent Abstraction

All agent adapters implement a provider-neutral contract.

Conceptual operations:

```text
GetCapabilities(context)
Execute(task, executionContext)
GetStatus(runId)
Cancel(runId)
```

## 26.1 Task envelope (canonical contract, version 1)

Tasks are dispatched as a **task envelope** — a JSON document written to
`.orchestrator/task.json` in the agent's working directory (or passed by an
adapter-specific equivalent). The envelope schema is shared verbatim with
the mad-skills worker contract (`orchestrator-ready-mad-skills` §4) and
versioned by the integer `envelope` field. Agents must fail closed on
unknown versions or invalid envelopes — never silently proceed
unrestricted.

```json
{
  "envelope": 1,
  "featureId": "FEAT-1042",
  "taskType": "implement",
  "objective": "Implement CSV export for customer search results.",
  "specPath": "docs/features/FEAT-1042/spec.md",
  "baseBranch": "main",
  "allowedPaths": [
    "src/CustomerSearch/**",
    "tests/CustomerSearch/**",
    "docs/features/FEAT-1042/**"
  ],
  "requiredChecks": [
    "dotnet build",
    "dotnet test"
  ],
  "constraints": [
    "Do not introduce a new CSV dependency.",
    "Preserve the existing API contract."
  ],
  "decisions": {},
  "reporting": { "reportPath": ".orchestrator/report.json" },
  "correlationId": "task-991"
}
```

Task types: `discover`, `specify`, `implement`, `remediate`, `ship-pr`,
plus composite types declared by the adapter (§26.4). `discover` and
`specify` are read-only for product code regardless of `allowedPaths`
(§19). Working directory, input commit, timeouts, and runtime limits are
execution-context concerns the orchestrator supplies to the adapter
alongside the envelope.

## 26.2 Task report

Every task run ends with a **task report** written to
`reporting.reportPath` and returned through the adapter:

```json
{
  "envelope": 1,
  "featureId": "FEAT-1042",
  "taskType": "implement",
  "correlationId": "task-991",
  "outcome": "completed",
  "summary": "CSV export implemented; checks green; draft PR updated.",
  "branch": "feature/FEAT-1042-customer-export",
  "prUrl": "https://github.com/org/repo/pull/57",
  "prReused": true,
  "commits": ["3df82bd"],
  "specContentHash": "sha256:9f2c…",
  "checks": [{ "command": "dotnet test", "status": "passed" }],
  "violations": [],
  "questions": []
}
```

Outcomes: `completed`, `blocked`, `violation` (out-of-envelope changes
detected, quarantined, and excluded from commit/push), `needs-input`.

## 26.3 Needs-input round-trip

When a task reaches a decision the envelope's `decisions` map does not
answer, the agent terminates with outcome `needs-input` and serialised
`questions` (id, question, options). The orchestrator relays the questions
to the conversation interface, collects answers, and redispatches the task
with the answers keyed by question id in `decisions`.

## 26.4 Delegation depth and capabilities

`GetCapabilities` returns the task types the adapter supports and whether
each can run non-interactively:

```json
{
  "envelope": 1,
  "taskTypes": {
    "specify": { "nonInteractive": true },
    "implement": { "nonInteractive": true, "composite": true },
    "ship-pr": { "nonInteractive": true }
  }
}
```

A **composite** task type executes several internal stages (for example
explore → implement → review → verify) as one bounded dispatch. The
orchestrator MAY delegate at composite grain when the adapter declares it;
it then records coarse-grained state transitions and treats the task
report as the observability record for the internal stages. Composite
tasks obey all envelope restrictions, never merge, never remove draft
status, and end at the same report contract.

---

# 27. Claude Code Adapter

The initial Claude Code adapter is responsible for:

* Starting the supported CLI process
* Selecting the correct worktree
* Supplying bounded task instructions
* Configuring non-interactive execution where supported
* Capturing output
* Handling timeouts and cancellation
* Translating output into structured results
* Recording agent and model metadata
* Enforcing path and command restrictions
* Preventing access outside the execution environment

The orchestrator must prefer structured output where available.

The reference Claude Code adapter drives the mad-skills skills
(`/speccy`, `/build`, `/ship`) as its private implementation detail: it
writes the task envelope to `.orchestrator/task.json` in the worktree,
invokes the matching skill non-interactively, and consumes the task
report. Skill capability (task types, non-interactive support) is
discovered from the mad-skills capability manifest. This dependency is
internal to the adapter; the orchestrator core never references skill
names.

---

# 28. Implementation Workflow

Before modifying code, the agent should produce or validate an implementation plan containing:

* Components likely to change
* Files likely to change
* Tests to add or update
* Dependencies
* Migration requirements
* Validation commands
* Risks
* Task ordering

MVP permits only one write-capable agent task per worktree at a time.

After a meaningful implementation task, the orchestrator should:

1. Inspect worktree status.
2. Validate changed paths.
3. Run required checks.
4. Capture changed files.
5. Commit a checkpoint when configured.
6. Push the branch.
7. Update the pull request.
8. Record task completion.
9. Select the next task.

---

# 29. Validation

Validation may include:

* Repository cleanliness
* Dependency restore
* Compilation
* Formatting
* Linting
* Type checking
* Unit tests
* Integration tests
* Contract tests
* Infrastructure validation
* Secret scanning
* Dependency vulnerability scanning
* Packaging
* Deployment preview

Local validation provides fast feedback.

Remote CI is authoritative where required by repository policy.

A feature must not become `ReadyToMerge` solely because local checks passed.

---

# 30. Review

Supported review types include:

* Code review
* Architecture review
* Security review
* Test review
* Documentation review
* Accessibility review
* Performance review
* Infrastructure review

A structured finding includes:

* Identifier
* Category
* Severity
* Title
* Description
* File and line where applicable
* Recommendation
* Blocking status
* Resolution state

Blocking findings prevent readiness until resolved or formally accepted.

---

# 31. Human Approval Gates

Configurable gates may include:

* Specification approval
* Implementation-plan approval
* Material scope-change approval
* Risk acceptance
* Readiness approval
* Merge approval
* Release approval
* Production deployment approval

Each approval records:

* Actor
* Role
* Timestamp
* Artifact revision
* Decision
* Comment
* Source interface

---

# 32. Canonical Workflow State

The orchestrator database is the authoritative source of workflow state.

GitHub and Azure DevOps receive projections of that state for:

* Human visibility
* Review readiness
* Automation integration
* Merge gating
* Reporting

Provider-side labels, draft flags, checks, statuses, descriptions, and comments are not authoritative.

---

# 33. Pull-Request State Projection

Workflow state is projected through four mechanisms:

1. Draft flag
2. Lifecycle label or tag
3. Machine-readable check or status
4. Generated pull-request description block

Each mechanism serves a separate purpose.

## 33.1 Draft flag

Provides a broad readiness signal.

## 33.2 Lifecycle label

Provides human-readable workflow state.

## 33.3 Check or status

Provides a machine-readable merge-gating result.

## 33.4 Description block

Provides richer context, links, blockers, and next actions.

---

# 34. Standard State Projection

| Orchestrator state      |          Draft | Lifecycle label                 | Lifecycle result |
| ----------------------- | -------------: | ------------------------------- | ---------------- |
| `Discovery`             |            Yes | `orchestrator:discovery`        | Pending          |
| `Specifying`            |            Yes | `orchestrator:specifying`       | Pending          |
| `SpecificationReady`    |            Yes | `orchestrator:spec-ready`       | Pending approval |
| `SpecificationApproved` |            Yes | `orchestrator:spec-approved`    | Successful       |
| `Implementing`          |            Yes | `orchestrator:implementing`     | Pending          |
| `Validating`            |            Yes | `orchestrator:validating`       | Pending          |
| `Reviewing`             |            Yes | `orchestrator:reviewing`        | Pending          |
| `ReadyForReview`        |             No | `orchestrator:ready-for-review` | Successful       |
| `ReadyToMerge`          |             No | `orchestrator:ready-to-merge`   | Successful       |
| `Blocked`               |            Yes | `orchestrator:blocked`          | Failed           |
| `Paused`                |            Yes | `orchestrator:paused`           | Neutral          |
| `Failed`                |            Yes | `orchestrator:failed`           | Failed           |
| `Cancelled`             | Not applicable | `orchestrator:cancelled`        | Cancelled        |
| `Superseded`            | Not applicable | `orchestrator:superseded`       | Cancelled        |
| `Merged`                |             No | `orchestrator:merged`           | Successful       |
| `Released`              |             No | `orchestrator:released`         | Successful       |

Repository policy may customise the mapping without changing canonical state names.

Under `provision_at: spec-approval`, states earlier than `Provisioning`
have no pull request and are not projected; projection begins with the
draft pull request created at provisioning.

---

# 35. Lifecycle Labels

Only one orchestrator lifecycle label may exist on a pull request at a time.

Reserved namespace:

```text
orchestrator:<state>
```

Examples:

```text
orchestrator:discovery
orchestrator:specifying
orchestrator:implementing
orchestrator:blocked
orchestrator:ready-for-review
```

Other classification labels may coexist:

```text
area:frontend
risk:high
security-review
breaking-change
```

Classification labels must not be interpreted as lifecycle state.

---

# 36. Draft-State Behaviour

The pull request remains draft through:

```text
Discovery
Specifying
SpecificationReady
SpecificationApproved
Implementing
Validating
Reviewing
Blocked
Paused
Failed
```

Draft status is normally removed upon entry to `ReadyForReview`.

A manual provider-side ready-for-review action must not bypass orchestrator gates.

Before accepting that transition, the orchestrator verifies:

* Specification approval
* Implementation completion
* Required validation
* Required internal reviews
* Absence of unresolved blocking findings
* Absence of policy violations

If requirements are unmet, the orchestrator may restore draft status.

---

# 37. Machine-Readable Lifecycle Result

Stable logical context:

```text
orchestrator/lifecycle
```

The result includes:

* Feature identifier
* Canonical state
* State revision
* Head commit
* Result
* Summary
* Details link
* Timestamp
* Correlation identifier

Example:

```json
{
  "context": "orchestrator/lifecycle",
  "featureId": "FEAT-1042",
  "state": "Validating",
  "stateRevision": 18,
  "headCommit": "3df82bd",
  "result": "pending",
  "summary": "Remote validation is in progress.",
  "correlationId": "state-projection-99182"
}
```

The result may be configured as a required merge condition.

---

# 38. State Revisions

Every canonical state transition increments a monotonically increasing revision.

Example:

```text
State: Validating
State revision: 18
```

Revisions allow the orchestrator to:

* Detect stale events
* Reject out-of-order updates
* Reconcile delayed provider operations
* Prevent older projections overwriting newer ones
* Trace projection changes to audit events

Revision 17 must not overwrite revision 18.

---

# 39. Commit and Iteration Binding

## 39.1 GitHub

The lifecycle check or status is associated with the current pull-request head commit.

When the head changes:

1. The prior result becomes stale.
2. A new pending result is published.
3. Required validation is recalculated.
4. The current head is evaluated.

## 39.2 Azure DevOps

The lifecycle status should be associated with the current PR iteration where supported.

When a new iteration appears:

1. Previous iteration results do not automatically validate it.
2. A new pending status is published.
3. Policies evaluate the new iteration.
4. The orchestrator reconciles the iteration and expected head.

---

# 40. GitHub Projection

The GitHub adapter projects state using:

* Native draft state
* Pull-request labels
* A Check Run or commit status
* A generated description block
* Optional comments for significant transitions

Recommended check:

```text
orchestrator/lifecycle
```

The adapter is responsible for:

* Creating configured labels when permitted
* Removing obsolete lifecycle labels
* Applying the current lifecycle label
* Updating draft state
* Publishing the lifecycle result
* Updating the generated description block
* Handling webhook events
* Reprojecting after head changes

Branch protections or rulesets may require the lifecycle result.

---

# 41. Azure DevOps Projection

The Azure DevOps adapter projects state using:

* Native draft state
* Pull-request labels
* Pull-request statuses
* A generated description block
* Optional PR threads for significant transitions

Recommended status context:

```text
Genre: orchestrator
Name: lifecycle
```

The adapter is responsible for:

* Applying lifecycle labels
* Removing obsolete lifecycle labels
* Updating draft state
* Publishing iteration-aware status
* Updating the generated description block
* Handling service-hook events
* Reprojecting after source changes

Branch policies may require the lifecycle status.

---

# 42. Generated Pull-Request Description Block

The orchestrator maintains a generated block inside the PR description.

```text
<!-- orchestrator:start -->

## Orchestrator

| Field | Value |
|---|---|
| Feature | FEAT-1042 |
| State | Validating |
| State revision | 18 |
| Specification | Revision 5 — Approved |
| Current head | 3df82bd |
| Blocking findings | 0 |
| Validation | In progress |
| Next action | Wait for remote CI |
| Slack thread | Linked |

<!-- orchestrator:end -->
```

The adapter must preserve human-authored content outside the markers.

The description block is informational, not authoritative.

---

# 43. Provider Events and Drift

Relevant provider events include:

* Draft status changed
* Label added or removed
* Head commit changed
* Pull request closed
* Pull request reopened
* Pull request merged
* Review submitted
* Check or status changed
* Azure DevOps iteration created
* Branch deleted

Provider events are reconciliation inputs, not automatically valid workflow commands.

When provider state differs from canonical state, the orchestrator must:

1. Read current provider state.
2. Read canonical state and revision.
3. Determine whether the change was expected.
4. Determine whether an authorised human requested a valid transition.
5. Apply repository policy.
6. Reproject canonical state or execute a valid orchestrator command.
7. Record the result in the audit log.

Correlation identifiers must prevent reconciliation loops.

---

# 44. Provider Capability Differences

The provider adapter reports supported capabilities.

Example:

```json
{
  "supportsDraftPullRequests": true,
  "supportsLabels": true,
  "supportsCommitChecks": true,
  "supportsPullRequestStatuses": true,
  "supportsIterationStatuses": true,
  "supportsDescriptionMarkers": true,
  "supportsRequiredStatusPolicies": true
}
```

A provider lacking one mechanism must use the remaining mechanisms without changing the canonical lifecycle.

---

# 45. Delivery Adapter Contract

Conceptual operation:

```text
ProjectWorkflowState(
    pullRequest,
    canonicalState,
    stateRevision,
    headCommit,
    reason,
    projectionPolicy
)
```

The requested projection contains:

* Canonical state
* State revision
* Expected draft state
* Lifecycle label
* Lifecycle result
* Head commit
* Pull-request iteration where applicable
* Description-block content
* Transition-comment policy
* Correlation identifier

GitHub- and Azure-specific logic remains inside their adapters.

---

# 46. Projection Failure

Projection failure does not roll back canonical state.

Instead:

1. The canonical transition remains recorded.
2. Projection is marked incomplete.
3. The adapter retries.
4. Reconciliation is scheduled.
5. Slack may receive a warning.
6. Merge is prevented when projection safety cannot be confirmed.

---

# 47. Slack Responsibilities

Slack provides:

* Feature inception
* Conversational refinement
* Commands
* Status requests
* Approval prompts
* Notifications
* Escalations
* Deep links

Suggested commands:

```text
/feature new <description>
/feature status [feature-id]
/feature brief [feature-id]
/feature provision [feature-id]
/feature spec [feature-id]
/feature approve [feature-id]
/feature implement [feature-id]
/feature validate [feature-id]
/feature review [feature-id]
/feature security [feature-id]
/feature pause [feature-id]
/feature resume [feature-id]
/feature cancel [feature-id]
/feature help
```

The root command is `/feature` (renamed from `/ship` in 1.3) to avoid
confusion with agent-side skills of the same name, such as the mad-skills
`/ship` skill in Claude Code.

The orchestrator exposes its own capability registry rather than mirroring agent-native commands.

---

# 48. System of Record

## 48.1 Orchestrator database

Stores:

* Feature state
* State revision
* Workflow history
* Specification metadata
* Tasks
* Agent runs
* Approvals
* Locks
* Retry counters
* Connector mappings
* Projection state
* Notification state
* Audit events

## 48.2 Git repository

Stores:

* Feature brief
* Specification
* Source-code changes
* Tests
* Technical decisions
* Documentation
* Durable review summaries

## 48.3 Pull request

Stores:

* Diff
* Engineering discussion
* Validation state
* Review comments
* Approval state
* Merge state
* Projected orchestrator state

## 48.4 Slack

Stores:

* Human conversation
* Commands
* Notifications
* Lightweight approvals
* Links to canonical artifacts

---

# 49. Core Data Model

## 49.1 Feature

```text
Feature
- Id
- Title
- RepositoryId
- BaseBranch
- BaseCommit
- State
- StateRevision
- OwnerId
- RequesterId
- SlackConversationId
- BranchName
- WorktreePath
- PullRequestId
- SpecificationRevision
- ApprovedSpecificationRevision
- CreatedAt
- UpdatedAt
- CompletedAt
```

## 49.2 Specification

```text
Specification
- Id
- FeatureId
- Revision
- ContentHash
- Status
- CreatedBy
- CreatedAt
- ApprovedBy
- ApprovedAt
```

## 49.3 WorkflowTask

```text
WorkflowTask
- Id
- FeatureId
- Type
- Objective
- State
- Sequence
- DependsOn
- AssignedAgent
- AttemptCount
- MaximumAttempts
- StartedAt
- CompletedAt
```

## 49.4 AgentRun

```text
AgentRun
- Id
- TaskId
- Provider
- AgentVersion
- Model
- InputCommit
- OutputCommit
- State
- StartedAt
- CompletedAt
- ExitCode
- Result
```

## 49.5 Approval

```text
Approval
- Id
- FeatureId
- ApprovalType
- ArtifactRevision
- Decision
- ActorId
- Comment
- CreatedAt
```

## 49.6 ProjectionRecord

```text
ProjectionRecord
- Id
- FeatureId
- Provider
- PullRequestId
- StateRevision
- ExpectedDraftState
- LifecycleLabel
- LifecycleResult
- HeadCommit
- ProviderIteration
- CorrelationId
- Status
- CreatedAt
- CompletedAt
```

---

# 50. Repository Configuration

Example:

```yaml
version: 1

repository:
  default_branch: main
  feature_branch_pattern: feature/{featureId}-{slug}
  feature_id_format: slug        # or: sequential, adapter-supplied
  specification_path: docs/features/{featureId}/spec.md

workflow:
  provision_at: spec-approval    # or: brief
  specification_approval_required: true
  implementation_plan_approval_required: false
  readiness_approval_required: true
  auto_merge: false

specification:
  repository_access: read_only
  writable_paths:
    - docs/features/{featureId}/**
    - .orchestrator/{featureId}/**

agent:
  default_provider: claude-code
  envelope_version: 1
  allowed_providers:
    - claude-code
    - codex

validation:
  local:
    - dotnet format --verify-no-changes
    - dotnet build --configuration Release
    - dotnet test --configuration Release

review:
  required:
    - code
    - security

projection:
  lifecycle_label_prefix: orchestrator
  lifecycle_status_context: orchestrator/lifecycle
  remove_draft_at: ReadyForReview
```

---

# 51. Security Requirements

The system must provide:

* Verified user identity
* Role-based authorisation
* Least-privilege repository credentials
* Short-lived tokens where possible
* Controlled execution environments
* Filesystem isolation
* CPU and memory limits
* Runtime timeouts
* Network restrictions
* Command policies
* Secret redaction
* Secret scanning
* Prompt-injection protections
* Audit logging
* Retention policies

Agents must not receive unrestricted production access.

Provider-side draft changes, labels, statuses, or merges must not bypass orchestrator policy.

---

# 52. Reliability and Recovery

Every external command must have an idempotency key.

Locks should protect:

* Workspace provisioning
* Worktree mutation
* Branch pushes
* Pull-request creation
* State projection
* Merge
* Release

After restart, the recovery manager must reconcile:

* Running tasks
* Worktree locks
* Agent processes
* Pull-request state
* Validation state
* Projection state
* Pending notifications

The system must detect external drift such as:

* Manual commits
* Branch deletion
* Pull-request closure
* Manual merge
* Draft-state changes
* Label changes
* CI reruns
* Review-state changes

---

# 53. Observability

Recommended logs and metrics include:

* Correlation ID
* Feature ID
* Task ID
* Agent run ID
* Repository
* Connector
* Provider
* State transition
* State revision
* Projection outcome
* Duration
* Retry count
* Result

Recommended metrics include:

* Features created
* Features provisioned
* Time from `Idea` to `BriefReady`
* Time from `BriefReady` to draft PR
* Time in each lifecycle state
* Agent success rate
* Validation failure rate
* Review finding count
* Human intervention rate
* Projection failure rate
* Drift-reconciliation rate
* Time from specification approval to merge

---

# 54. MVP Acceptance Criteria

The MVP is complete when:

1. A feature can be created from Slack.
2. The feature receives a unique identifier.
3. An unformed feature can remain in `Idea` without Git resources.
4. Provisioning cannot begin without the artifact its policy requires: a durable brief (`brief` mode) or an approved specification revision (`spec-approval` mode).
5. Provisioning creates exactly one branch and worktree.
6. The initial feature brief is committed to the branch.
7. The branch is pushed before draft-PR creation.
8. Exactly one draft pull request is created.
9. Repeating provisioning creates no duplicates.
10. Slack links to the draft pull request.
11. Discovery and specification are read-only for product code.
12. Specification agents can write only approved planning paths.
13. Prohibited writes are detected before commit or push.
14. Specification revisions are versioned.
15. An authorised user can approve a specific revision.
16. Approval enables implementation without replacing Git resources.
17. Claude Code can be invoked through the common agent interface.
18. The agent executes inside the feature worktree.
19. Product write access is restricted to approved implementation paths.
20. Required local validation runs.
21. Remote validation state is incorporated.
22. Structured review findings can be created.
23. Blocking findings prevent readiness.
24. The orchestrator database remains the canonical source of state.
25. Every active pull request displays one lifecycle label.
26. Draft state is projected from canonical state.
27. Manual ready-for-review actions cannot bypass gates.
28. A stable `orchestrator/lifecycle` result is published.
29. GitHub lifecycle results bind to the current head commit.
30. Azure DevOps lifecycle results bind to the current iteration where supported.
31. New commits or iterations invalidate stale results.
32. The PR description contains a generated state block.
33. Human-authored PR content is preserved.
34. Provider events are reconciled with canonical state.
35. Out-of-order projections cannot overwrite newer revisions.
36. Drift is detected and audit logged.
37. Projection failures are retried without rolling back canonical state.
38. Merge policies can require the lifecycle result.
39. Human approval is required before `ReadyToMerge`.
40. Every lifecycle transition is auditable.
41. The workflow can recover after restart.
42. Connector, agent, Git, and CI adapters can be replaced without changing the core state machine.
43. Tasks are dispatched as envelope v1 documents and results consumed as task reports, including the `needs-input` round-trip.
44. Composite task delegation works when the adapter declares it, with the task report recorded as the stage-level audit record.
45. Both `provision_at` policies produce a correct workspace: no duplicate resources, correct initial commit content, and the correct post-provisioning state transition.

---

# 55. Final Core Rule

> An unformed idea remains in conversation.
> A durable planning artifact — the brief or the approved specification, per repository policy — triggers branch, worktree, initial commit, and draft pull request provisioning.
> Specification work is read-only.
> Approved implementation changes the product.
> The pull request carries engineering collaboration throughout the lifecycle.
> The orchestrator owns the canonical state and policy.

---

# 56. Reference Implementation Profile (Non-Binding)

This profile is a suggested starting point for the initial build. It is
informative, not normative; any stack satisfying the core requirements is
conformant.

* **Runtime:** Node.js (LTS) with TypeScript.
* **Slack connector:** Slack Bolt for JavaScript — Socket Mode for development, HTTP with request signing for production.
* **Canonical store:** PostgreSQL — feature records, state revisions, specification revisions, tasks, agent runs, approvals, projection records, audit events.
* **Workflow and jobs:** a durable job runner with retries and idempotency keys (pg-boss or BullMQ; Temporal if saga complexity grows) for provisioning sequences, projection retries, and recovery reconciliation.
* **Provider integration:** GitHub webhooks plus REST/GraphQL; Azure DevOps service hooks plus REST — one adapter per provider (§40–41).
* **Claude Code adapter:** non-interactive Claude Code invocation (CLI or Agent SDK) driving the mad-skills skills — envelope v1 in, task report out (§27).
* **Secrets:** external secret manager; short-lived Git credentials.
* **Observability:** structured logs with correlation identifiers (§53) and OpenTelemetry-compatible metrics.
