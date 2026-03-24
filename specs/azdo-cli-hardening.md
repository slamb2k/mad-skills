---
title: Azure DevOps CLI Hardening
version: 1.0
date_created: 2026-03-24
last_updated: 2026-03-24
tags: [infrastructure, tool, process]
---

# Introduction

This specification defines fixes for 8 Azure DevOps CLI and REST API issues
found across the mad-skills skill suite. The issues were documented in the
Azure DevOps CLI reference (`../Power-Feedback/azure-devops-cli-reference.md`)
and confirmed by a codebase audit. Fixes apply to `/ship`, `/rig`, `/brace`,
`/dock`, and `/keel` — every skill that constructs AzDO commands.

## 1. Purpose & Scope

**Purpose:** Harden all Azure DevOps CLI and REST API usage in mad-skills
to prevent silent failures on legacy organizations, projects with spaces in
names, and CI configurations that use PR-triggered builds.

**Scope — In:**

| Fix | Issue | Priority | Files affected |
|-----|-------|----------|----------------|
| 1 | `--project` flag on unsupported commands | Critical | merge.sh, ci-watch.sh, ship/SKILL.md, brace/SKILL.md, stage-prompts.md |
| 2 | base64 line-wrap in PAT auth headers | High | ci-watch.sh, merge.sh, ship/SKILL.md, brace/SKILL.md, rig/SKILL.md, stage-prompts.md, azdo-platform.md |
| 3 | Broken `printf '%b'` URL decoding | High | ship/SKILL.md, rig/SKILL.md, brace/SKILL.md, azdo-platform.md (×2) |
| 4 | visualstudio.com URLs normalized to dev.azure.com | High | ship/SKILL.md, rig/SKILL.md, brace/SKILL.md, azdo-platform.md (×2) |
| 5 | CI branch name mismatch (`refs/pull/N/merge`) | High | ci-watch.sh |
| 6 | JSON safety — no validation before jq | Medium | ci-watch.sh, merge.sh, brace/SKILL.md |
| 7 | Add shared AzDO CLI reference to repo | Medium | New file: references/azdo-cli-reference.md |
| 8 | Consolidate duplicated azdo-platform.md | Medium | dock/references/, keel/references/ → references/ |

**Scope — Out:**

- `az rest` usage — not found in codebase (no fix needed)
- GitHub-specific code paths — unaffected
- New AzDO features or commands — this is a hardening pass, not new functionality

**Audience:** Contributors to the mad-skills repository.

**Assumptions:**

- Python 3 is available on all target systems (for URL decoding)
- AzDO organizations may use either dev.azure.com or legacy visualstudio.com domains
- PR-triggered builds set `sourceBranch` to `refs/pull/N/merge`, not the feature branch

## 2. Definitions

| Term | Definition |
|------|-----------|
| **AzDO** | Azure DevOps |
| **PAT** | Personal Access Token — used for REST API Basic authentication |
| **CLI mode** | Using `az devops` / `az repos` / `az pipelines` commands |
| **REST mode** | Using `curl` with PAT Basic auth against Azure DevOps REST APIs |
| **Legacy org** | An Azure DevOps organization on the `*.visualstudio.com` domain |
| **Modern org** | An Azure DevOps organization on the `dev.azure.com` domain |
| **PR merge ref** | The special branch `refs/pull/N/merge` that AzDO creates for PR builds |

## 3. Requirements, Constraints & Guidelines

### Fix 1: `--project` Flag Removal

- **REQ-001**: Commands that do NOT accept `--project` MUST NOT include it.
  Per Azure DevOps CLI documentation:
  - `az repos pr update` — NO `--project`
  - `az repos pr show` — NO `--project`
  - `az repos pr policy list` — YES (accepts `--project`)
  - `az repos pr create` — YES (accepts `--project`)
  - `az repos pr list` — YES (accepts `--project`)
  - `az pipelines runs list` — YES (accepts `--project`)
  - `az pipelines run` — YES (accepts `--project`)
- **REQ-002**: All skills MUST call `az devops configure --defaults` at session
  start to set org and project. Commands that don't accept `--project` will
  inherit from defaults.
- **REQ-003**: SKILL.md prose and stage-prompts.md examples MUST show correct
  flag usage so LLM subagents generate valid commands.

**Files to fix:**

| File | Current (broken) | Fix |
|------|-----------------|-----|
| `skills/ship/scripts/merge.sh` | `az repos pr update ... --project "$AZDO_PROJECT"` | Remove `--project` from `pr update` |
| `skills/ship/scripts/merge.sh` | `az repos pr policy list ... --project "$AZDO_PROJECT"` | Keep `--project` (it's valid here) |
| `skills/ship/scripts/ci-watch.sh` | `az repos pr policy list ... --project "$AZDO_PROJECT"` | Keep (valid) |
| `skills/ship/SKILL.md` | `az repos pr create ... --project` in examples | Keep (valid for create) |
| `skills/ship/references/stage-prompts.md` | `az repos pr list ... --project` | Keep (valid for list) |
| `skills/brace/SKILL.md` | Various `az repos` commands | Audit each; remove where invalid |

### Fix 2: base64 Line-Wrap Bug

- **REQ-004**: All PAT base64 encoding MUST use `base64 | tr -d '\n'` for
  cross-platform compatibility (works on both Linux and macOS).
- **CON-001**: Do NOT use `base64 -w0` alone — macOS `base64` does not support
  the `-w` flag. The `tr -d '\n'` approach works everywhere.

**Pattern — Before (broken):**
```bash
AUTH="Authorization: Basic $(echo -n ":$PAT" | base64)"
```

**Pattern — After (fixed):**
```bash
AUTH="Authorization: Basic $(printf ":%s" "$PAT" | base64 | tr -d '\n')"
```

Note: Also replaces `echo -n` with `printf` for POSIX compliance.

**Files to fix (8 locations):**

| File | Lines |
|------|-------|
| `skills/ship/scripts/ci-watch.sh` | ~91 |
| `skills/ship/scripts/merge.sh` | ~128 |
| `skills/ship/SKILL.md` | ~213 |
| `skills/ship/references/stage-prompts.md` | ~133, ~234 |
| `skills/brace/SKILL.md` | ~369 |
| `skills/rig/SKILL.md` | ~196 |
| `references/azdo-platform.md` | ~81 (after consolidation) |

### Fix 3: URL Decoding with Python

- **REQ-005**: URL-decoding of project names MUST use Python's
  `urllib.parse.unquote()` instead of the broken `printf '%b'` pattern.
- **REQ-006**: Add `python3` to pre-flight dependency checks in all
  AzDO-aware skills.

**Pattern — Before (broken):**
```bash
AZDO_PROJECT_URL_SAFE="$AZDO_PROJECT"
AZDO_ORG=$(printf '%b' "${AZDO_ORG//%/\\x}")
AZDO_PROJECT=$(printf '%b' "${AZDO_PROJECT//%/\\x}")
```

**Pattern — After (fixed):**
```bash
AZDO_PROJECT_URL_SAFE="$AZDO_PROJECT"
AZDO_ORG=$(python3 -c "import urllib.parse; print(urllib.parse.unquote('$AZDO_ORG'))")
AZDO_PROJECT=$(python3 -c "import urllib.parse; print(urllib.parse.unquote('$AZDO_PROJECT_URL_SAFE'))")
```

**Files to fix (5 locations):**

| File | Lines |
|------|-------|
| `skills/ship/SKILL.md` | ~191-192 |
| `skills/rig/SKILL.md` | ~174-175 |
| `skills/brace/SKILL.md` | ~349-350 |
| `references/azdo-platform.md` | ~59-60 (after consolidation) |

### Fix 4: Preserve Legacy visualstudio.com URLs

- **REQ-007**: When the git remote uses a `visualstudio.com` domain, the
  `AZDO_ORG_URL` MUST preserve that domain. Do NOT normalize to
  `dev.azure.com`.
- **GUD-001**: Some legacy Azure DevOps organizations only respond to their
  original `visualstudio.com` domain. Normalizing breaks all REST API calls.

**Pattern — Before (broken):**
```bash
elif echo "$REMOTE_URL" | grep -q 'visualstudio\.com'; then
  AZDO_ORG=$(echo "$REMOTE_URL" | sed -n 's|.*//\([^.]*\)\.visualstudio\.com.*|\1|p')
  AZDO_ORG_URL="https://dev.azure.com/$AZDO_ORG"   # ← WRONG: normalizes
fi
```

**Pattern — After (fixed):**
```bash
elif echo "$REMOTE_URL" | grep -q 'visualstudio\.com'; then
  AZDO_ORG=$(echo "$REMOTE_URL" | sed -n 's|.*//\([^.]*\)\.visualstudio\.com.*|\1|p')
  AZDO_ORG_URL="https://${AZDO_ORG}.visualstudio.com"  # ← CORRECT: preserves
fi
```

**Files to fix (5 locations):**

| File | Lines |
|------|-------|
| `skills/ship/SKILL.md` | ~186 |
| `skills/rig/SKILL.md` | ~170 |
| `skills/brace/SKILL.md` | ~346 |
| `references/azdo-platform.md` | ~55 (after consolidation) |

### Fix 5: CI Branch Name for PR Builds

- **REQ-008**: `ci-watch.sh` AzDO paths MUST use `refs/pull/$PR_NUMBER/merge`
  as the branch filter when listing pipeline runs, not the feature branch name.
- **REQ-009**: The feature branch name (`$BRANCH`) SHOULD be used as a
  fallback if no runs are found with the PR merge ref.

**Pattern — Before (broken):**
```bash
az pipelines runs list --branch "$BRANCH" --top 5 ...
```

**Pattern — After (fixed):**
```bash
# Try PR merge ref first (AzDO PR builds use this)
RUN_COUNT=$(az pipelines runs list --branch "refs/pull/$PR_NUMBER/merge" --top 5 \
  --org "$AZDO_ORG_URL" --project "$AZDO_PROJECT" \
  --query "length(@)" -o tsv 2>/dev/null)
# Fall back to feature branch name (for branch-triggered builds)
if [ -z "$RUN_COUNT" ] || [ "$RUN_COUNT" = "0" ]; then
  RUN_COUNT=$(az pipelines runs list --branch "$BRANCH" --top 5 \
    --org "$AZDO_ORG_URL" --project "$AZDO_PROJECT" \
    --query "length(@)" -o tsv 2>/dev/null)
fi
```

Same pattern for the REST mode path using curl.

**File:** `skills/ship/scripts/ci-watch.sh`

### Fix 6: JSON Safety — Capture-Then-Validate

- **REQ-010**: All `curl` responses MUST be captured to a variable and
  validated as JSON before piping to `jq`.
- **REQ-011**: All `az` CLI output piped to `jq` MUST be validated first.

**Pattern:**
```bash
# Capture response
RESPONSE=$(curl -s -H "$AUTH" "$URL" 2>&1)

# Validate JSON
if ! echo "$RESPONSE" | jq empty 2>/dev/null; then
  ERRORS="Non-JSON response from API: ${RESPONSE:0:200}"
  emit_report; exit 3
fi

# Safe to parse
RESULT=$(echo "$RESPONSE" | jq -r '.value')
```

**Files to fix:**

| File | Locations |
|------|-----------|
| `skills/ship/scripts/merge.sh` | REST policy check, REST merge |
| `skills/ship/scripts/ci-watch.sh` | REST run list, REST status polling |

### Fix 7: Add Shared AzDO CLI Reference

- **REQ-012**: Copy the Azure DevOps CLI reference document to
  `references/azdo-cli-reference.md` in the repository root.
- **REQ-013**: Skills that interact with AzDO SHOULD reference this file
  in their SKILL.md for LLM context.

**New file:** `references/azdo-cli-reference.md`
**Source:** `../Power-Feedback/azure-devops-cli-reference.md`

### Fix 8: Consolidate azdo-platform.md

- **REQ-014**: Merge `skills/dock/references/azdo-platform.md` and
  `skills/keel/references/azdo-platform.md` into `references/azdo-platform.md`.
- **REQ-015**: Update dock and keel SKILL.md files to reference the new
  shared location.
- **REQ-016**: Delete the duplicate files from individual skill directories.

## 4. Interfaces & Data Contracts

### AzDO CLI Command Reference

| Command | `--project` | `--org` | Notes |
|---------|------------|---------|-------|
| `az repos pr create` | YES | YES | Both accepted |
| `az repos pr list` | YES | YES | Both accepted |
| `az repos pr update` | **NO** | YES | Use defaults for project |
| `az repos pr show` | **NO** | YES | Use defaults for project |
| `az repos pr policy list` | YES | YES | Both accepted |
| `az pipelines runs list` | YES | YES | Both accepted |
| `az pipelines runs show` | YES | YES | Both accepted |
| `az pipelines run` | YES | YES | Both accepted |
| `az devops invoke` | **NO** | YES | Pass project via `--route-parameters` |

### PAT Auth Header (correct pattern)

```bash
TOKEN=$(printf ":%s" "$AZURE_DEVOPS_EXT_PAT" | base64 | tr -d '\n')
AUTH="Authorization: Basic $TOKEN"
```

### URL Decoding (correct pattern)

```bash
AZDO_PROJECT=$(python3 -c "import urllib.parse; print(urllib.parse.unquote('$AZDO_PROJECT_URL_SAFE'))")
```

### CI Branch Filter (correct pattern)

```bash
# AzDO PR builds
az pipelines runs list --branch "refs/pull/$PR_NUMBER/merge" ...
# Fallback for branch-triggered builds
az pipelines runs list --branch "$BRANCH" ...
```

## 5. Acceptance Criteria

- **AC-001**: Given an AzDO repo with a project name containing spaces
  (e.g., "Velrada AI Agents"), When any skill constructs CLI commands, Then
  the URL-safe version is used in REST paths and the decoded version in
  `--project` flags.
- **AC-002**: Given an AzDO repo on a legacy `visualstudio.com` domain, When
  REST API calls are made, Then the original domain is preserved in the URL
  (not normalized to `dev.azure.com`).
- **AC-003**: Given a PR build in AzDO, When `ci-watch.sh` polls for pipeline
  runs, Then it uses `refs/pull/N/merge` as the branch filter.
- **AC-004**: Given any PAT-based auth header construction, When base64
  encoding is performed, Then the output contains no newline characters
  (verified by `base64 | tr -d '\n'`).
- **AC-005**: Given `az repos pr update` or `az repos pr show` commands, When
  constructed in scripts or prose, Then they do NOT include the `--project`
  flag.
- **AC-006**: Given a curl response that returns HTML or error text instead
  of JSON, When the response is processed, Then it is caught by JSON
  validation before reaching `jq`.
- **AC-007**: Given the repository after all fixes, When `npm run validate`
  and `npm run lint` are run, Then both pass with 0 errors.
- **AC-008**: Given the shared `references/azdo-platform.md`, When dock or
  keel SKILL.md references it, Then the path resolves correctly.

## 6. Test Automation Strategy

### Validation Commands

```bash
npm run validate          # Structure checks for all skills
npm run lint              # SKILL.md format checks
bash -n skills/ship/scripts/ci-watch.sh   # Syntax validation
bash -n skills/ship/scripts/merge.sh      # Syntax validation
```

### Grep-Based Verification

After implementation, run these checks to verify no broken patterns remain:

```bash
# No base64 without tr -d '\n'
grep -rn 'base64)' skills/ references/ | grep -v "tr -d"

# No printf '%b' URL decoding
grep -rn "printf '%b'" skills/ references/

# No visualstudio.com → dev.azure.com normalization
grep -rn 'AZDO_ORG_URL="https://dev.azure.com' skills/ references/

# No --project on pr update/show
grep -rn 'pr update.*--project\|pr show.*--project' skills/ references/
```

## 7. Rationale & Context

### Why preserve visualstudio.com URLs?

Some legacy Azure DevOps organizations were created before the
`dev.azure.com` domain existed. While Microsoft supports both domains for
most orgs, some legacy orgs with specific configurations only respond to
their original `*.visualstudio.com` domain. Normalizing breaks all REST API
calls for those orgs with no visible error — curl returns HTML login pages
instead of JSON.

### Why use Python for URL decoding?

The common bash pattern `printf '%b' "${VAR//%/\\x}"` fails when a `%20` is
followed by hex characters (A-F, 0-9). For example, `Velrada%20AI%20Agents`
becomes `Velrada\x20AI\x20Agents`, but `\x20A` is interpreted as a single
3-byte escape sequence instead of space + "A". Python's `urllib.parse.unquote`
handles all cases correctly.

### Why refs/pull/N/merge for CI branch?

Azure DevOps PR builds set `sourceBranch` to `refs/pull/N/merge`, not the
feature branch name. When ci-watch.sh filters by `--branch "$BRANCH"` (the
feature branch), it finds zero runs for PR-triggered builds. This causes the
grace period to expire and report "no checks" when checks are actually running.

### Why capture-then-validate for JSON?

Azure CLI can output warnings, error messages, or even HTML instead of JSON
(especially on auth failures). Piping this directly to `jq` causes silent
failures — `jq` exits non-zero but the error is often swallowed by `2>/dev/null`.
Capturing first and validating with `jq empty` catches all non-JSON responses.

## 8. Dependencies & External Integrations

### Technology Platform Dependencies

- **PLT-001**: Python 3 — Required for URL decoding via `urllib.parse.unquote`.
  Available on virtually all modern Linux/macOS systems.
- **PLT-002**: `az` CLI with devops extension — Required for CLI mode
- **PLT-003**: `curl` + `jq` — Required for REST mode
- **PLT-004**: `git` >= 2.22 — Required for remote URL detection

## 9. Examples & Edge Cases

### Edge Case 1: Project name with spaces and hex chars

```
Remote: https://dev.azure.com/MyOrg/Velrada%20AI%20Agents/_git/my-repo
```

**Before (broken):** `printf '%b'` produces `Velrada\x20AI\x20Agents` →
garbled output because `\x20A` is a 3-byte sequence.

**After (fixed):** Python produces `Velrada AI Agents` correctly.

### Edge Case 2: Legacy visualstudio.com org

```
Remote: https://myorg.visualstudio.com/MyProject/_git/my-repo
```

**Before (broken):** `AZDO_ORG_URL="https://dev.azure.com/myorg"` — REST
calls return HTML login page.

**After (fixed):** `AZDO_ORG_URL="https://myorg.visualstudio.com"` — REST
calls succeed.

### Edge Case 3: PR build branch name

```
PR #42 triggers a build. AzDO sets sourceBranch to refs/pull/42/merge.
ci-watch.sh searches for --branch "feat/my-feature" → finds 0 runs.
```

**After (fixed):** ci-watch.sh searches for `refs/pull/42/merge` first,
finds the PR build, then enters normal polling.

### Edge Case 4: base64 line wrapping on Linux

```bash
# Long PAT produces base64 > 76 chars
echo -n ":veryLongPATToken..." | base64
# Output: dkV...  (76 chars)
#         yTG...  (remaining chars on new line)
```

The newline in the middle breaks the HTTP Authorization header into two lines.

**After (fixed):** `base64 | tr -d '\n'` removes all newlines.

### Edge Case 5: az CLI returns HTML instead of JSON

```bash
# Auth expired or wrong org
OUTPUT=$(az repos pr show --id 42 --org "https://wrong.visualstudio.com" -o json 2>&1)
# OUTPUT: "<!DOCTYPE html><html>..."
echo "$OUTPUT" | jq '.status'  # jq silently fails
```

**After (fixed):** `jq empty` check catches the non-JSON response and
reports a meaningful error.

## 10. Validation Criteria

1. All `npm run validate` and `npm run lint` checks pass
2. `bash -n` validates syntax on ci-watch.sh and merge.sh
3. No `printf '%b'` URL decoding remains (grep check)
4. No `base64)` without `tr -d '\n'` remains (grep check)
5. No `AZDO_ORG_URL="https://dev.azure.com` in legacy URL branch (grep check)
6. No `--project` on `pr update` or `pr show` commands (grep check)
7. `references/azdo-cli-reference.md` exists and is referenced by AzDO skills
8. `references/azdo-platform.md` exists; old duplicates in dock/keel removed
9. ci-watch.sh uses `refs/pull/$PR_NUMBER/merge` for AzDO branch filter

## 11. Related Specifications / Further Reading

- `../Power-Feedback/azure-devops-cli-reference.md` — Source reference document
- `specs/branch-safety.md` — Previous spec that modified ship/ci-watch.sh
  and ship/merge.sh (changes here build on that work)
- `skills/ship/references/stage-prompts.md` — LLM prompts that include
  AzDO command examples (must be fixed for correct LLM-generated commands)
- Azure DevOps REST API docs: `https://learn.microsoft.com/en-us/rest/api/azure/devops/`
