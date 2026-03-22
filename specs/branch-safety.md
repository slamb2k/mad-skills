---
title: Branch Safety & Ship Reliability Updates
version: 1.0
date_created: 2026-03-22
last_updated: 2026-03-22
tags: [process, tool, architecture]
---

# Introduction

This specification defines changes to the mad-skills `/build`, `/ship`,
`/speccy`, and `/brace` skills to prevent divergent branches from sequential
feature work and ensure `/ship` never exits without a clear success or failure
signal. The primary defense is a pre-build branch check in `/build`; secondary
defenses include CI hardening in `/ship`, post-merge verification, branch
discipline rules in generated CLAUDE.md files, and an advisory check in
`/speccy`.

## 1. Purpose & Scope

**Purpose:** Prevent two classes of failures in the mad-skills development
lifecycle:

1. **Divergent branches** — When two features are built sequentially from the
   same base commit without syncing to main between them, the second branch
   diverges. When the first PR merges, the second requires a rebase that can
   silently auto-resolve conflicts, potentially dropping changes.

2. **Silent ship failures** — When `/ship` fails to merge (CI fails, merge is
   deferred) but exits without a clear failure signal, the user continues
   working on the unmerged feature branch, compounding the divergence problem.

**Scope — In:**

| Change | Skill | Description | Priority |
|--------|-------|-------------|----------|
| 0 | `/brace` | Branch discipline rules in CLAUDE.md template + existing file injection | High |
| 1 | `/build` | Pre-build branch check (**primary defense**) | Highest |
| 2 | `/ship` | CI hardening: failure banner, merge verification, startup grace period, AzDO policy fix | High |
| 3 | `/ship` | Post-merge sync verification | Medium |
| 4 | `/speccy` | Advisory branch check | Low |

**Scope — Out:**

- `/rig` monorepo-aware lefthook configuration (deferred to separate spec)
- `/sync` changes (already handles post-merge cleanup correctly)
- Changes to lefthook templates or git hooks
- Stacked PR workflow support (users can select "Continue on this branch" to
  bypass the warning — no dedicated flag needed)

**Audience:** Contributors to the mad-skills repository.

**Assumptions:**

- The user's primary workflow is: `/sync` → `/speccy` → `/build` → `/ship` → repeat
- GitHub and Azure DevOps are the two supported platforms
- `gh` CLI is available for GitHub repos; `az devops` CLI or REST API for AzDO
- The default branch is typically `main` or `master`, detected from git remote

## 2. Definitions

| Term | Definition |
|------|-----------|
| **Divergent branch** | A feature branch that has fallen behind `origin/main` such that merging requires rebase or conflict resolution |
| **Silent merge failure** | When `/ship` exits without successfully merging the PR but does not clearly communicate the failure |
| **Startup grace period** | A polling window in `ci-watch.sh` that waits for CI checks to appear before concluding "no checks configured" |
| **Default branch** | The repository's primary branch (typically `main` or `master`), detected from git remote configuration |
| **AzDO** | Azure DevOps |
| **PAT** | Personal Access Token (used for AzDO REST API authentication) |

## 3. Requirements, Constraints & Guidelines

### Change 0: CLAUDE.md Branch Discipline Rules

- **REQ-001**: The brace CLAUDE.md template (`skills/brace/references/claude-md-template.md`)
  MUST include a `## Branch Discipline` section in the Guardrails area.
- **REQ-002**: When `/brace` or `/rig` detects an existing CLAUDE.md file in the
  target project, it MUST inject the Branch Discipline section if not already
  present.
- **REQ-003**: Injection MUST be positioned immediately before the `## Guardrails`
  section. If no `## Guardrails` section exists, append at the end of the file.
- **REQ-004**: If a `## Branch Discipline` section already exists in the target
  CLAUDE.md, skip injection (idempotent).
- **CON-001**: Injection MUST NOT modify any existing content — only insert new
  lines.

**Branch Discipline content to inject:**

```markdown
## Branch Discipline

- **Always sync to main before starting new work** — run `/sync` or
  `git checkout main && git pull` before creating a feature branch
- **Never branch from a feature branch** — always branch from an up-to-date `main`
- **One feature per branch** — don't stack unrelated changes on the same branch
- **After shipping a PR, sync immediately** — checkout main and pull before
  starting the next task
- **If a PR is pending review**, switch to main before starting unrelated work —
  don't build on top of an unmerged branch

These rules prevent divergent branches that require complex rebases with risk
of silent conflict resolution.
```

**Files to modify:**

| File | Change |
|------|--------|
| `skills/brace/references/claude-md-template.md` | Add `## Branch Discipline` section before `## Guardrails` (line 54) |
| `skills/brace/SKILL.md` | In Phase 4 (CLAUDE.md generation), add logic to detect existing `## Branch Discipline` and inject if missing |
| `skills/rig/SKILL.md` | In Phase 4 (lefthook/config), add same injection logic when CLAUDE.md exists |

### Change 1: `/build` Pre-Build Branch Check (Primary Defense)

- **REQ-005**: After Plan Resolution and before Stage 1 (Explore), `/build`
  MUST check the current branch status.
- **REQ-006**: If on a feature branch (not `main`/`master`/default), `/build`
  MUST fetch `origin/main` and count commits behind.
- **REQ-007**: If `BEHIND > 0`, `/build` MUST warn the user via
  `AskUserQuestion` with these options:
  - "Switch to main first (Recommended)" — run `/sync`, then continue
  - "Continue on this branch" — proceed (user accepts divergence risk)
  - "Cancel" — stop
- **REQ-008**: If on `main`/`master`/default and local is behind remote,
  `/build` MUST run `/sync` automatically before proceeding.
- **GUD-001**: The branch check SHOULD complete in under 5 seconds (single
  `git fetch` + `rev-list`).

**Implementation:**

```bash
# Step 1: Detect current branch and default branch
CURRENT=$(git branch --show-current)
DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
DEFAULT_BRANCH="${DEFAULT_BRANCH:-main}"

# Step 2: Fetch latest
git fetch origin "$DEFAULT_BRANCH" --quiet 2>/dev/null

# Step 3: Check divergence
if [ "$CURRENT" = "$DEFAULT_BRANCH" ] || [ "$CURRENT" = "master" ] || [ "$CURRENT" = "main" ]; then
  # On default branch — check if up to date
  LOCAL=$(git rev-parse "$DEFAULT_BRANCH")
  REMOTE=$(git rev-parse "origin/$DEFAULT_BRANCH")
  if [ "$LOCAL" != "$REMOTE" ]; then
    # Auto-sync — no prompt needed
    # → invoke /sync
  fi
else
  # On feature branch — check how far behind
  BEHIND=$(git rev-list --count HEAD..origin/"$DEFAULT_BRANCH" 2>/dev/null || echo 0)
  if [ "$BEHIND" -gt 0 ]; then
    # → AskUserQuestion with options
  fi
fi
```

**File:** `skills/build/SKILL.md`
**Insertion point:** After `## Plan Resolution` (line 143), before
`## Stage 1: Explore` (line 146). Add as new section:

```markdown
## Pre-Build Branch Check

Before starting Stage 1, verify the working tree is suitable for building:
[implementation as above]
```

### Change 2: `/ship` CI Hardening

#### 2a. Startup Grace Period

- **REQ-009**: `ci-watch.sh` MUST NOT return `no_checks` on the first poll.
  It MUST poll at least 3 times over 30 seconds (10-second intervals) before
  concluding no checks are configured.
- **REQ-010**: If after the grace period no checks are found, `ci-watch.sh`
  MUST still return `no_checks` (exit 0), but the ship SKILL.md loop MUST
  handle this by prompting the user via `AskUserQuestion`:
  - "Merge without checks (Recommended)" — proceed to merge
  - "Wait longer" — re-enter the watch loop for another grace period
  - "Cancel" — stop /ship

**Files to modify:**

| File | Change |
|------|--------|
| `skills/ship/scripts/ci-watch.sh` | Add startup polling loop before `no_checks` early returns: GitHub (lines 46-48), AzDO CLI (line 98), AzDO REST (line 165) |
| `skills/ship/SKILL.md` | In loop summary (line 321), replace `no_checks → break` with `AskUserQuestion` prompt |

#### 2b. Explicit Failure Signal

- **REQ-011**: When /ship fails to merge for ANY reason (CI fails after 2 fix
  attempts, merge command fails, PR cannot be merged, post-merge verification
  fails), it MUST display a failure banner:
  ```
  ┌─ Ship · FAILED ──────────────────────────────────
  │
  │  ❌ PR #{number} was NOT merged
  │
  │  Reason: {specific failure reason}
  │  Branch: {branch name} (still active)
  │
  │  ⚠️  You are still on branch '{branch}'.
  │     Run /sync to return to main before starting new work.
  │
  └───────────────────────────────────────────────────
  ```
- **REQ-012**: On failure, /ship MUST NOT proceed to "What's Next?". MUST NOT
  suggest next tasks. MUST NOT invoke `/sync`. The session must end with the
  failure banner so the user clearly sees the PR did not merge.
- **REQ-013**: On failure, /ship MUST NOT report any form of success, partial
  success, or "will be auto-merged" language.

**File:** `skills/ship/SKILL.md`
**Changes:**
- Add failure handling after the CI loop (lines 327-329)
- Add failure handling after merge.sh execution (Stage 5a)
- Add failure handling after post-merge verification (new step)

#### 2c. Post-Merge Verification

- **REQ-014**: After `merge.sh` exits 0, /ship MUST verify the PR is actually
  in `merged`/`completed` state by querying the platform API:
  - **GitHub:** `gh pr view {PR_NUMBER} --json state --jq '.state'` — must
    equal `"MERGED"`
  - **AzDO CLI:** `az repos pr show --id {PR_NUMBER} --query status` — must
    equal `"completed"`
  - **AzDO REST:** GET PR endpoint, check `status == "completed"`
- **REQ-015**: If the PR is not in merged/completed state after merge.sh
  exits 0, /ship MUST treat this as a failure and display the failure banner
  (REQ-011).

**File:** `skills/ship/SKILL.md`
**Insertion point:** Stage 5a, between merge.sh execution and sync step (5b).

#### 2d. AzDO Policy Evaluation Fix

- **REQ-016**: `merge.sh` MUST check for `pending` and `running` policy
  evaluations in addition to `rejected`, on both CLI and REST paths.
- **REQ-017**: If any policies are in `pending` or `running` state, `merge.sh`
  MUST wait (poll every 15 seconds, up to 5 minutes) for them to resolve
  before attempting merge.
- **REQ-018**: If policies remain unresolved after 5 minutes, `merge.sh` MUST
  exit with status 1 and include "policies not evaluated" in the error report.

**File:** `skills/ship/scripts/merge.sh`
**Changes:**
- CLI path (lines 68-77): Expand `az repos pr policy list` query to include
  `pending`/`running` states, add polling loop
- REST path (lines 114-123): Expand jq filter to include `pending`/`running`
  evaluations, add polling loop

### Change 3: `/ship` Post-Merge Sync Verification

- **REQ-019**: After sync.sh completes in Stage 5b, /ship MUST verify the
  working tree is on the default branch:
  ```bash
  CURRENT=$(git branch --show-current)
  if [ "$CURRENT" != "{DEFAULT_BRANCH}" ]; then
    git checkout {DEFAULT_BRANCH}
    git pull {REMOTE} {DEFAULT_BRANCH}
  fi
  ```
- **REQ-020**: The final report's success banner MUST include the current
  branch to confirm the user is on the default branch.
- **CON-002**: This verification runs ONLY on the success path (after REQ-014
  confirms merge).

**File:** `skills/ship/SKILL.md`
**Insertion point:** After sync.sh invocation in Stage 5b (line 361).

### Change 4: `/speccy` Advisory Branch Check

- **REQ-021**: At the start of Stage 1 (Context Gathering), `/speccy` MUST
  check if the user is on a stale feature branch.
- **REQ-022**: If on a branch other than `main`/`master`/default AND more than
  5 commits behind `origin/main`, emit an advisory note (not blocking):
  ```
  ⚠️ Branch '{name}' is {N} commits behind main.
     Consider running /sync before building from this spec.
  ```
- **GUD-002**: This check is advisory only — specs don't modify code, so
  blocking is not warranted.
- **CON-003**: Threshold is 5 commits. Below 5, no advisory is shown.

**Implementation:**

```bash
CURRENT=$(git branch --show-current)
if [ "$CURRENT" != "main" ] && [ "$CURRENT" != "master" ]; then
  git fetch origin main --quiet 2>/dev/null
  BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
  if [ "$BEHIND" -gt 5 ]; then
    echo "⚠️ Branch '$CURRENT' is $BEHIND commits behind main."
    echo "   Consider running /sync before building from this spec."
  fi
fi
```

**File:** `skills/speccy/SKILL.md`
**Insertion point:** Start of Stage 1 (line 85), before loading project context.

## 4. Interfaces & Data Contracts

### ci-watch.sh Report (updated)

```
CHECKS_REPORT_BEGIN
status={all_passed|some_failed|no_checks|pending}
checks={name:state,...}
failing_checks={name,...|none}
grace_period_polls={number}       ← NEW: polls completed during startup grace
CHECKS_REPORT_END
```

Exit codes unchanged: 0=passed/no_checks, 1=failed, 2=pending/timeout, 3=error.

### merge.sh Report (unchanged)

```
LAND_REPORT_BEGIN
status={success|failed}
merge_commit={SHORT_HASH}
merge_type={squash|merge}
branch_deleted={true|false}
errors={ERRORS}
LAND_REPORT_END
```

### Ship Failure Banner (new)

```
┌─ Ship · FAILED ──────────────────────────────────
│
│  ❌ PR #{number} was NOT merged
│
│  Reason: {reason}
│  Branch: {branch} (still active)
│
│  ⚠️  You are still on branch '{branch}'.
│     Run /sync to return to main before starting new work.
│
└───────────────────────────────────────────────────
```

### Ship Success Banner (updated — add branch confirmation)

```
┌─ Ship · Report ────────────────────────────────
│
│  ✅ Ship complete
│
│  📋 PR #{number} merged (squash)
│  🌿 Now on: {default_branch} (up to date)    ← NEW
│  ...
└─────────────────────────────────────────────────
```

## 5. Acceptance Criteria

- **AC-001**: Given a user on a feature branch 3 commits behind main, When
  `/build` is invoked, Then an AskUserQuestion prompt appears with "Switch to
  main first (Recommended)", "Continue on this branch", and "Cancel" options.
- **AC-002**: Given a user on `main` that is behind `origin/main`, When
  `/build` is invoked, Then `/sync` runs automatically before Stage 1 begins.
- **AC-003**: Given a user on `main` that is up to date, When `/build` is
  invoked, Then no branch check prompt appears and Stage 1 begins normally.
- **AC-004**: Given a PR with CI checks that fail after 2 fix attempts, When
  `/ship` exhausts fix attempts, Then the failure banner is displayed and
  /ship stops without suggesting next tasks or running "What's Next?".
- **AC-005**: Given a PR where `merge.sh` exits 0 but the PR is not in merged
  state (e.g., queued for auto-merge), When post-merge verification runs,
  Then /ship displays the failure banner.
- **AC-006**: Given a newly created PR where CI checks haven't triggered yet,
  When `ci-watch.sh` runs, Then it polls at least 3 times over 30 seconds
  before returning `no_checks`.
- **AC-007**: Given `ci-watch.sh` returns `no_checks` after the grace period,
  When /ship processes the result, Then it prompts the user via
  AskUserQuestion instead of proceeding directly to merge.
- **AC-008**: Given a successful merge and sync, When /ship completes, Then
  the user is on the default branch with latest changes, confirmed in the
  success banner.
- **AC-009**: Given an AzDO PR with policies in `running` state, When
  `merge.sh` is invoked, Then it waits for policies to resolve (up to 5
  minutes) before attempting merge.
- **AC-010**: Given a project with an existing CLAUDE.md without a Branch
  Discipline section, When `/brace` runs, Then the Branch Discipline section
  is inserted before `## Guardrails`.
- **AC-011**: Given a project with an existing CLAUDE.md that already has a
  Branch Discipline section, When `/brace` runs, Then no duplicate section is
  added (idempotent).
- **AC-012**: Given a user on a feature branch 8 commits behind main, When
  `/speccy` is invoked, Then an advisory warning is displayed (non-blocking).
- **AC-013**: Given a user on a feature branch 3 commits behind main, When
  `/speccy` is invoked, Then no advisory is shown (below 5-commit threshold).

## 6. Test Automation Strategy

### Eval Tests

Each skill has eval assertions in `tests/evals.json`. Add or update:

**`/build` evals:**
- Assert: when context indicates feature branch behind main, output contains
  AskUserQuestion with branch warning mentioning "behind main"
- Assert: when context indicates up-to-date main, no branch check prompt
  appears

**`/ship` evals:**
- Assert: when CI fails after 2 attempts, output contains "❌" and
  "NOT merged" and "still on branch"
- Assert: failure output does NOT contain "What's Next?" or task suggestions
- Assert: when no checks found after grace period, output contains
  AskUserQuestion about merging without checks

**`/speccy` evals:**
- Assert: when branch is >5 behind main, output contains advisory warning
  with "behind main"
- Assert: advisory is non-blocking (interview round follows)

**`/brace` evals:**
- Assert: generated CLAUDE.md contains `## Branch Discipline` section
- Assert: section appears before `## Guardrails`

### Validation Commands

```bash
npm run validate          # Structure checks for all skills
npm run lint              # SKILL.md format checks
npm run eval              # Eval assertions (requires API key)
```

## 7. Rationale & Context

### Why branch checks at multiple points?

Skills enforce checks at invocation time, but CLAUDE.md rules provide a
persistent backstop that applies to ALL interactions — including manual work,
ad-hoc commits, and skills without branch checks. The defense layers are:

1. **CLAUDE.md rules** (Change 0) — first line of defense, always active
2. **`/build` branch check** (Change 1) — primary active defense, catches
   stale branches before work begins
3. **`/ship` failure signal** (Change 2) — prevents silent failures that lead
   to divergence
4. **`/speccy` advisory** (Change 4) — early warning during spec writing

### Why is `/build` the primary defense?

Even if `/ship` improves its failure reporting, the user may miss or forget
the signal. The `/build` branch check catches the "still on unmerged feature
branch" scenario before new work begins, regardless of how the previous
`/ship` invocation ended.

### Why a startup grace period in ci-watch.sh?

CI systems (especially GitHub Actions) can take several seconds to register
checks after a push. If `ci-watch.sh` polls immediately after PR creation and
finds no checks, it incorrectly concludes "no CI configured" and proceeds.
A 30-second grace period (3 polls × 10 seconds) prevents this race condition.

### Why verify PR status after merge.sh?

`merge.sh` exiting successfully (exit 0) doesn't guarantee the merge happened.
The merge may be deferred to a merge queue, auto-merge may be enabled but
checks haven't passed, or the platform may accept the merge request without
completing it synchronously. Verifying via API ensures the merge actually
landed before reporting success.

### Why hard-stop on failure instead of auto-sync?

When `/ship` fails, automatically switching to main would be a destructive
action that could lose uncommitted work or confuse the user. The failure
banner preserves the current state and gives the user explicit instructions.
The user remains in control of recovery.

## 8. Dependencies & External Integrations

### External Systems

- **EXT-001**: GitHub API (via `gh` CLI) — PR status verification, CI check
  polling, merge operations
- **EXT-002**: Azure DevOps API (via `az devops` CLI or REST) — PR status,
  policy evaluation, CI polling, merge operations

### Technology Platform Dependencies

- **PLT-001**: `gh` CLI >= 2.0 — Required for GitHub PR operations
- **PLT-002**: `az` CLI with devops extension — Required for AzDO CLI mode
- **PLT-003**: `curl` + `jq` — Required for AzDO REST mode
- **PLT-004**: `git` >= 2.22 — Required for `git branch --show-current`

## 9. Examples & Edge Cases

### Edge Case 1: Feature branch, main hasn't moved

```
$ git branch --show-current → feat/user-auth
$ git rev-list --count HEAD..origin/main → 0
```

**Result:** No warning from `/build`. Branch is current with main.

### Edge Case 2: On main, behind origin/main

```
$ git rev-parse main → abc123
$ git rev-parse origin/main → def456
```

**Result:** `/build` auto-syncs (no prompt). `/sync` brings main up to date.

### Edge Case 3: CI checks appear after 20 seconds

```
ci-watch.sh poll 1 (t=0s):   no checks found
ci-watch.sh poll 2 (t=10s):  no checks found
ci-watch.sh poll 3 (t=20s):  2 checks found → enter normal watch loop
```

**Result:** Grace period catches the delayed CI registration. Normal flow.

### Edge Case 4: AzDO policies still running at merge time

```json
[{"status": "approved"}, {"status": "running"}]
```

**Result:** `merge.sh` waits (polls every 15s, up to 5 min). Does NOT
attempt merge while any policy is in a non-terminal state.

### Edge Case 5: merge.sh exits 0 but PR is still open (merge queue)

```
$ gh pr view 42 --json state --jq '.state' → "OPEN"
```

**Result:** Post-merge verification detects mismatch → failure banner
displayed. User is informed PR was not actually merged.

### Edge Case 6: /brace on project with existing Branch Discipline

```
$ grep "## Branch Discipline" CLAUDE.md → match found
```

**Result:** Skip injection. Section already exists (idempotent).

### Edge Case 7: /ship CI fails, user continues on branch

```
1. /ship fails (CI broken after 2 fix attempts)
2. Failure banner: "❌ PR #42 was NOT merged — still on feat/auth"
3. User runs /build for next feature
4. /build detects: "You're on 'feat/auth', 3 commits behind main"
5. User selects "Switch to main first" → /sync runs → safe to proceed
```

**Result:** Defense in depth catches the scenario at /build time even if the
user missed the /ship failure banner.

## 10. Validation Criteria

1. All existing `npm run validate` and `npm run lint` checks pass
2. All new eval assertions pass (`npm run eval`)
3. `/build` branch check does not add >5 seconds to startup time
4. `/ship` failure banner is displayed on ALL failure paths (CI failure, merge
   failure, verification failure)
5. `ci-watch.sh` grace period does not add >30 seconds when checks exist
   (grace period exits early when checks are detected)
6. CLAUDE.md injection is idempotent (running /brace twice does not duplicate)
7. AzDO policy wait does not exceed 5-minute cap

## 11. Related Specifications / Further Reading

- `/rig` monorepo-aware lefthook configuration — future spec (dropped from
  this scope, to be addressed separately)
- `skills/ship/references/stage-prompts.md` — Stage prompt templates for
  fix subagent
- `skills/sync/scripts/sync.sh` — Sync script (handles post-merge cleanup,
  already works correctly)
- `skills/ship/scripts/ci-watch.sh` — CI watch script (primary target for
  Change 2a)
- `skills/ship/scripts/merge.sh` — Merge script (target for Change 2d)
- `skills/brace/references/claude-md-template.md` — CLAUDE.md template
  (target for Change 0)
