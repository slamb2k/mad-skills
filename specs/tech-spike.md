# AI Developer Orchestrator — Technical Spike Extension

**Status:** Draft
**Version:** 1.1
**Document role:** Optional extension
**Depends on:** AI Developer Orchestrator — Core Specification v1.2
**Scope:** Bounded experimental code changes before specification approval

---

# 1. Purpose

This extension adds an optional `TechnicalSpike` workflow to the core feature lifecycle.

The core specification states that `Discovery` and `Specifying` are read-only for product code.

A technical spike provides a controlled exception when a specification cannot be completed confidently through:

* Conversation
* Repository inspection
* Existing builds
* Existing tests
* Existing static analysis
* Technical reasoning

This document extends the core specification.

It does not replace it.

---

# 2. Extension Principle

A technical spike is:

* Explicit
* Question-driven
* Bounded
* Temporary
* Scoped
* Auditable
* Non-production by default

The governing rule is:

> Spike code is evidence first. It becomes deliverable code only through deliberate review and promotion.

A spike must not be used merely to start implementation before the specification has been approved.

---

# 3. Extended Lifecycle

```text
Idea
  ├──────────────→ SpikeBriefReady
  │                       ↓
  │                  Provisioning
  │                       ↓
  │                TechnicalSpike
  │                       ↓
  │                  Specifying
  │
  ↓
BriefReady
  ↓
Provisioning
  ↓
Discovery
  ↓
Specifying
  ├──────────────→ TechnicalSpike
  │                       ↓
  └────────────────── Specifying
  ↓
SpecificationReady
  ↓
SpecificationApproved
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

A spike may therefore begin:

* From an already provisioned feature, or
* As the first repository-backed activity for an otherwise unprovisioned feature

In either case, a durable written spike brief is required before Git resources are provisioned or write permissions are granted.

---

# 4. When a Spike Is Appropriate

A spike is appropriate when read-only analysis cannot resolve a material technical uncertainty.

Examples include:

* Testing whether an external API supports an operation
* Measuring memory or performance characteristics
* Proving compatibility with a library or runtime
* Reproducing a concurrency or timing defect
* Prototyping an integration
* Comparing architectural approaches
* Testing a migration strategy
* Verifying platform or framework limitations

A spike is not appropriate merely because:

* The agent wants to begin coding early
* The specification feels tedious
* The implementation appears obvious
* The team wants to bypass approval
* The feature lacks clear requirements

---

# 5. Minimum Durable Spike Brief

A technical spike cannot begin from an empty conversation.

The spike brief must define:

1. Feature or spike identifier
2. Technical question
3. Why read-only analysis is insufficient
4. Permitted code or configuration scope
5. Expected evidence
6. Exit criteria
7. Time or cost budget
8. Default code disposition

Optional fields include:

* Permitted commands
* Network requirements
* Security constraints
* Required approver
* Suspected affected components
* Known risks

Example:

```markdown
---
feature: FEAT-1042
spike: SPIKE-17
status: proposed
default_disposition: discard
---

# Streaming Export Feasibility

## Question

Can the existing customer-query pipeline stream one million records
without loading the complete result into memory?

## Why analysis is insufficient

The buffering behaviour depends on runtime interaction between the query
pipeline and CSV writer.

## Permitted scope

- src/CustomerSearch/Experimental/**
- tests/CustomerSearch/Experimental/**
- docs/features/FEAT-1042/**

## Expected evidence

- Benchmark results
- Memory profile
- Identified bottleneck
- Recommended approach

## Exit criteria

The spike ends when the buffering behaviour and likely production approach
are understood.

## Default disposition

Discard experimental code after findings are recorded.
```

---

# 6. Spike Entry Paths

## 6.1 Existing feature workspace

When the feature already has a branch, worktree, and draft pull request:

1. Write the spike brief into the existing feature worktree.
2. Commit the spike brief.
3. Obtain required approval.
4. Transition to `TechnicalSpike`.
5. Grant scoped write permissions.
6. Project spike state onto the existing draft pull request.

No second branch or pull request is required by default.

## 6.2 Spike-first workspace

When the spike is the first repository-backed activity:

1. Develop the spike brief in Slack or orchestrator storage.
2. Transition to `SpikeBriefReady`.
3. Confirm repository and base branch.
4. Create the branch and worktree.
5. Materialise and commit the spike brief.
6. Push the branch.
7. Create the draft pull request.
8. Project `TechnicalSpike` state.
9. Begin bounded experimentation.

The spike brief is the initial durable commit.

There must still be something meaningful to commit before provisioning begins.

---

# 7. Spike Workspace

By default, the spike uses the feature’s existing or newly provisioned:

* Branch
* Worktree
* Draft pull request
* Slack conversation
* Feature record

The pull request must clearly display:

```text
Workflow state: TechnicalSpike
Delivery status: Experimental
Production readiness: Not assessed
Code retention: Not guaranteed
```

The same pull request remains the collaboration artifact for:

* Spike code
* Experimental tests
* Benchmark results
* Findings
* Human discussion
* Agent summaries
* Specification updates

---

# 8. State Projection

The spike adds the following projection:

| Orchestrator state | Draft | Lifecycle label                | Lifecycle result |
| ------------------ | ----: | ------------------------------ | ---------------- |
| `TechnicalSpike`   |   Yes | `orchestrator:technical-spike` | Pending          |
| `SpikeBlocked`     |   Yes | `orchestrator:spike-blocked`   | Failed           |
| `SpikeComplete`    |   Yes | `orchestrator:spike-complete`  | Successful       |

A spike pull request must remain draft.

Completing a spike does not make the feature ready for formal review.

The normal post-spike transition is back to `Specifying`.

---

# 9. Entering TechnicalSpike

The transition must be explicit.

The spike request must define:

* Spike identifier
* Technical question
* Reason read-only analysis is insufficient
* Permitted paths
* Permitted commands
* Network requirements
* Time or cost budget
* Expected evidence
* Exit criteria
* Default code disposition
* Required approval

Depending on policy, a human must approve:

* Entry into the spike
* Expanded write scope
* Network access
* Dependency changes
* Infrastructure changes
* Extended execution budgets

---

# 10. Spike Permissions

During `TechnicalSpike`, an agent may:

* Create experimental source code
* Create experimental tests
* Add temporary instrumentation
* Modify approved local configuration
* Run builds
* Run tests
* Run benchmarks
* Create prototypes
* Record findings

The agent may modify only approved paths.

Unless separately authorised, it must not:

* Modify production deployment pipelines
* Access production systems
* Change production data
* Publish packages
* Change secrets
* Expand beyond the spike question
* Merge the pull request
* Remove draft status
* Mark experimental work as production-ready

---

# 11. Enforcement

Spike permissions must be enforced technically through:

* Scoped filesystem access
* Path policies
* Command allowlists
* Network controls
* Runtime limits
* Git diff validation
* Post-run inspection

Any change outside the approved scope must:

1. Stop the task.
2. Be preserved for audit.
3. Be prevented from commit or push.
4. Be reverted or quarantined.
5. Require a revised spike approval before continuation.

---

# 12. Spike Commits

Spike changes may be committed and pushed to the draft pull request.

Commit messages should identify experimental intent.

Examples:

```text
spike: test streaming export feasibility
spike: benchmark customer query memory use
spike: compare CSV serializers
docs: record streaming export findings
```

Repository policy may require:

* One commit per experiment
* Squashed spike commits
* No pushed implementation code until spike completion
* Experimental code under designated paths

Spike commits must not imply production readiness.

---

# 13. Required Spike Outputs

A spike must produce findings, not merely code.

Required outputs include:

* Original question
* Hypothesis
* Experiment performed
* Relevant code or configuration
* Commands executed
* Results
* Measurements
* Limitations
* Risks discovered
* Recommendation
* Effect on the specification
* Disposition of experimental changes

Recommended location:

```text
docs/features/<feature-id>/spikes/<spike-id>.md
```

The specification must be updated with relevant findings.

---

# 14. Spike Exit Criteria

A spike ends when:

* The technical question has been answered
* The time or cost budget is exhausted
* The approach is shown to be infeasible
* A human or external decision is required
* Policy prevents further experimentation
* The experiment is no longer necessary

The orchestrator must prevent a spike from becoming undeclared open-ended implementation.

---

# 15. Experimental Change Disposition

Every spike change must receive an explicit disposition.

## 15.1 Discard

The code answered the question but is unsuitable for delivery.

The orchestrator:

1. Records the findings.
2. Updates the specification.
3. Reverts the experimental changes or resets to the pre-spike baseline.
4. Preserves audit evidence.
5. Returns the feature to `Specifying`.

## 15.2 Retain temporarily as reference

Experimental changes remain visible in the draft pull request but are marked non-deliverable.

They must be removed or replaced before `ReadyForReview`.

## 15.3 Promote selectively

Useful changes may be:

* Cherry-picked
* Squashed
* Rewritten
* Copied selectively
* Reimplemented cleanly

Promoted work becomes implementation code only after:

* Specification approval
* Transition to `Implementing`
* Normal validation and review

## 15.4 Continue directly

Spike code may continue into implementation only when:

* It is within the approved specification
* It meets production coding standards
* It has appropriate tests
* Temporary instrumentation is removed
* Dependencies are approved
* Security implications are assessed
* Commit history is acceptable or cleaned up
* An authorised transition to `Implementing` occurs

Working code is not automatically production code.

---

# 16. Returning to Specification

The normal transition is:

```text
TechnicalSpike
  ↓
SpikeComplete
  ↓
Specifying
```

On return:

1. Findings are committed.
2. The specification is updated.
3. Experimental code receives a disposition.
4. Scoped spike permissions are removed.
5. Read-only specification permissions are restored.
6. The lifecycle projection returns to `orchestrator:specifying`.

A feature may enter another spike later if a different bounded uncertainty remains.

---

# 17. Clean Implementation Variant

A new clean branch, worktree, and draft pull request may be created when:

* Spike history is excessively noisy
* Experimental changes are unsafe
* The base branch has materially changed
* The approved design differs substantially from the experiment
* Repository policy requires clean delivery history
* The spike modified too broad a scope

In this alternate flow:

1. The spike pull request is marked `Superseded`.
2. Findings are preserved.
3. A new branch and worktree are created from the selected base commit.
4. The approved specification is committed.
5. Only approved work is transferred.
6. The new draft pull request links back to the spike.

This is an exception rather than the default.

---

# 18. Slack Behaviour

Example spike proposal:

```text
A technical spike has been proposed for FEAT-1042.

Question:
Can the current export pipeline stream large result sets?

Permitted scope:
Customer export experimental paths only.

Default code disposition:
Discard.

[Approve spike] [Edit scope] [Reject]
```

Example spike-first provisioning:

```text
SPIKE-17 has been provisioned.

Branch: feature/FEAT-1042-streaming-spike
State: TechnicalSpike
Draft PR: Linked

The spike brief is the initial committed artifact.
```

Example completion:

```text
Technical spike SPIKE-17 completed.

Finding:
The query pipeline can stream results, but the CSV writer buffers
the complete export in memory.

Code disposition:
Discarded.

The feature has returned to Specifying.

[View findings] [View updated specification]
```

---

# 19. Agent Task Contract

Example spike task:

```json
{
  "taskType": "TechnicalSpike",
  "repositoryAccess": "scoped-write",
  "objective": "Determine whether streaming export is feasible.",
  "writablePaths": [
    "src/CustomerSearch/Experimental/**",
    "tests/CustomerSearch/Experimental/**",
    "docs/features/FEAT-1042/**"
  ],
  "permittedCommands": [
    "dotnet build",
    "dotnet test",
    "dotnet run --project benchmarks/CustomerExport"
  ],
  "defaultChangeDisposition": "discard",
  "timeBudgetMinutes": 90,
  "expectedOutputs": [
    "benchmark results",
    "memory profile",
    "recommendation"
  ]
}
```

The task mode controls:

* Writable paths
* Permitted commands
* Network policy
* Timeout
* Approval requirements
* Commit behaviour
* Expected result schema

---

# 20. Spike Data Model

## 20.1 TechnicalSpike

```text
TechnicalSpike
- Id
- FeatureId
- Question
- Reason
- State
- ApprovedPaths
- ApprovedCommands
- NetworkPolicy
- TimeBudget
- CostBudget
- DefaultDisposition
- ApprovedBy
- StartedAt
- CompletedAt
```

## 20.2 SpikeFinding

```text
SpikeFinding
- Id
- SpikeId
- Summary
- Evidence
- Measurements
- Limitations
- Risks
- Recommendation
- SpecificationImpact
- CreatedAt
```

## 20.3 SpikeChangeDisposition

```text
SpikeChangeDisposition
- Id
- SpikeId
- CommitOrPath
- Disposition
- Reason
- ApprovedBy
- CreatedAt
```

---

# 21. Repository Configuration

Example extension configuration:

```yaml
spikes:
  enabled: true
  approval_required: true
  default_disposition: discard
  maximum_duration_minutes: 120
  allowed_paths:
    - src/**/Experimental/**
    - tests/**/Experimental/**
    - docs/features/{featureId}/**
  require_findings_document: true
  return_state: Specifying
```

Repository policy may further restrict:

* Network access
* Dependency installation
* Infrastructure changes
* Benchmark tooling
* Maximum cost
* Commit behaviour

---

# 22. Security Requirements

A spike does not weaken core security requirements.

Additional controls include:

* Explicit scoped-write approval
* Short-lived spike permissions
* Denied production credentials
* Restricted external network access
* Dependency-change approval
* Temporary instrumentation review
* Mandatory cleanup before implementation
* Audit logging of permission changes

Spike status must never be interpreted as approval to deploy or merge.

---

# 23. Reliability and Recovery

The spike workflow must persist:

* Spike brief
* Approved scope
* Current state
* Execution budget
* Agent run
* Pre-spike commit
* Experimental commits
* Findings
* Change disposition

After restart, the recovery manager must determine:

* Whether an agent is still running
* Whether the write scope remains valid
* Whether the budget has expired
* Whether uncommitted changes exist
* Whether the PR state matches canonical spike state

A spike must not resume with broader permissions than originally approved.

---

# 24. Extension Acceptance Criteria

The extension is complete when:

1. A spike cannot begin without a durable spike brief.
2. A spike-first workflow commits the brief before opening the draft PR.
3. An existing feature can enter `TechnicalSpike` without creating duplicate Git resources.
4. Every spike defines a bounded technical question.
5. Every spike explains why read-only analysis is insufficient.
6. Every spike defines approved paths.
7. Every spike defines exit criteria.
8. Every spike defines a time or cost budget.
9. Every spike defines a default code disposition.
10. Entry into `TechnicalSpike` is explicit and authorised.
11. Scoped-write permissions are technically enforced.
12. Experimental code is clearly identified.
13. The pull request remains draft throughout the spike.
14. The lifecycle label is `orchestrator:technical-spike`.
15. Spike commits cannot imply delivery readiness.
16. Every spike produces documented findings.
17. Findings are incorporated into the specification.
18. Every experimental change receives an explicit disposition.
19. The normal exit returns the feature to `Specifying`.
20. Spike permissions are removed on exit.
21. Spike code cannot silently become implementation code.
22. Direct continuation requires specification approval and explicit promotion.
23. A clean replacement workflow is supported when required.
24. The workflow recovers safely after interruption or restart.
25. Slack and the pull request clearly display spike status.

---

# 25. Final Extension Rule

> A spike also begins with something durable to commit: the spike brief.
> The brief may bootstrap the branch, worktree, and draft pull request when no workspace exists.
> The experiment answers a bounded question.
> Its code remains experimental until deliberately discarded, selected, or promoted.
> Every spike concludes with findings and an explicit decision about its changes.
