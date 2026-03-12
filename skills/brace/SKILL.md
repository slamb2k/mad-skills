---
name: brace
description: 'Initialize any project directory with a standard scaffold for AI-assisted development. Creates specs/ and context/ directories, a project CLAUDE.md with development workflow and guardrails, .gitignore, and branch protection. Recommends claude-mem for persistent memory. Idempotent — safe to run on existing projects. Triggers: "init project", "setup brace", "brace", "initialize", "bootstrap", "scaffold".'
argument-hint: "[--force]"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion
---

# Brace - Project Scaffold

When this skill is invoked, IMMEDIATELY output the banner below before doing anything else.
Pick ONE tagline at random — vary your choice each time.
CRITICAL: Reproduce the banner EXACTLY character-for-character. The first line of the art has 4 leading spaces — you MUST preserve them.

```
{tagline}

⠀   ██╗██████╗ ██████╗  █████╗  ██████╗███████╗
   ██╔╝██╔══██╗██╔══██╗██╔══██╗██╔════╝██╔════╝
  ██╔╝ ██████╔╝██████╔╝███████║██║     █████╗
 ██╔╝  ██╔══██╗██╔══██╗██╔══██║██║     ██╔══╝
██╔╝   ██████╔╝██║  ██║██║  ██║╚██████╗███████╗
╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚══════╝
```

Taglines:
- 🏗️ Bracing the structure...
- 💪 Reinforcing before load!
- 🔒 Locking in the framework!
- 🏋️ Preparing for heavy lifting!
- 🧱 Cross-bracing the foundation!
- 🔧 Tightening the load path!
- ✅ Structural integrity confirmed!
- 💥 Brace for impact!

---

## Output Formatting

After the banner, display parsed input:
```
┌─ Input ────────────────────────────────────────
│  {Field}:  {value}
│  Flags:    {parsed flags or "none"}
└────────────────────────────────────────────────
```

Pre-flight results:
```
── Pre-flight ───────────────────────────────────
  ✅ {dep}           {version or "found"}
  ⚠️ {dep}           not found → {fallback detail}
  ❌ {dep}           missing → stopping
──────────────────────────────────────────────────
```

Stage/phase headers: `━━ {N} · {Name} ━━━━━━━━━━━━━━━━━━━━━━━━━`

Status icons: ✅ done · ❌ failed · ⚠️ degraded · ⏳ working · ⏭️ skipped

---

Initialize any project directory with a standard scaffold for AI-assisted
development. Idempotent — safe to re-run on existing projects. Content
templates and subagent prompts are in `references/`.

**Key principle:** Scan first, present plan, get approval, then act.

Phase prompts: `references/phase-prompts.md`
Scaffold manifest: `references/scaffold-manifest.md`
Report format: `references/report-template.md`

---

## Flags

Parse optional flags from the request:
- `--force` — Overwrite existing files without prompting

---

## Pre-flight

Before starting, check all dependencies in this table:

| Dependency | Type | Check | Required | Resolution | Detail |
|-----------|------|-------|----------|------------|--------|
| claude-mem | plugin | — | no | ask | `claude plugin install claude-mem` |

For each row, in order:
1. Run the Check command (for cli/npm) or test file existence (for agent/skill)
2. If found: continue silently
3. If missing: apply Resolution strategy
   - **stop**: notify user with Detail, halt execution
   - **url**: notify user with Detail (install link), halt execution
   - **install**: notify user, run the command in Detail, continue if successful
   - **ask**: notify user, offer to run command in Detail, continue either way (or halt if required)
   - **fallback**: notify user with Detail, continue with degraded behavior
4. After all checks: summarize what's available and what's degraded

1. Capture **FLAGS** from the user's request

---

## Phase 1: Directory Scan

Launch **Bash** subagent (**haiku**):

```
Task(
  subagent_type: "Bash",
  model: "haiku",
  description: "Scan directory for existing scaffold structure",
  prompt: <read from references/phase-prompts.md#phase-1>
)
```

Parse SCAN_REPORT. Extract:
- `directory_name` (used as default project name)
- `existing_dirs` / `missing_dirs`
- `existing_files` / `missing_files`
- `has_claude_md` / `has_gitignore`
- `has_atlas` (legacy ATLAS naming detected)
- `has_forge` (legacy FORGE naming detected)
- `has_legacy_gotcha` (legacy GOTCHA/goals structure detected)
- `has_legacy_memory` (old tools/memory system detected)

---

## Phase 1b: Legacy Upgrade Detection

**Skip if none of `has_atlas`, `has_forge`, `has_legacy_gotcha`, or `has_legacy_memory` is true.**

Build a description of what was found:
- If `has_atlas` or `has_forge`: "Legacy ATLAS/FORGE naming detected"
- If `has_legacy_gotcha`: "Legacy GOTCHA/BRACE framework detected (goals/ directory)"
- If `has_legacy_memory`: "Legacy memory system (tools/memory/, memory/) detected"

Ask the user via AskUserQuestion:

   Question: "Legacy components detected: {description}. Upgrade and clean up?"
   Options:
   - "Yes, upgrade all" — Replace legacy structure and remove old systems
   - "No, leave as-is" — Keep existing structure

Store result as `upgrade_legacy: true|false` in USER_CONFIG.

---

## Phase 2: Project Inquiry

**Runs on primary thread** (user interaction required).

1. Derive default project name from SCAN_REPORT `directory_name`
2. Present via AskUserQuestion:

   Question: "Set up project scaffold?"
   Options:
   - "Full scaffold (Recommended)" — CLAUDE.md, directories, guardrails
   - "Cancel"

3. If not cancelled, ask for project description (one sentence) via
   AskUserQuestion with free text.

4. Ask installation level via AskUserQuestion:

   Question: "Where should global preferences and universal principles go?"
   Options:
   - "Both — global + project (Recommended)" → portable AND global coverage
   - "Global (~/.claude/CLAUDE.md) only" → applies to all projects
   - "Project level only" → self-contained, portable

5. Store as USER_CONFIG:
   - project_name: from directory name or user override
   - description: from user input
   - install_level: "both" | "global" | "project"

**If cancelled, stop here.**

---

## Phase 3: Present Plan & Approve

Build the ACTION_PLAN from SCAN_REPORT + USER_CONFIG + FLAGS.

For each item in `references/scaffold-manifest.md`:
- If component not selected in USER_CONFIG → status: "not selected"
- If item already exists (from SCAN_REPORT) and no `--force` → status: "skip"
- If item exists and `--force` → status: "overwrite"
- If CLAUDE.md exists → status: "merge" (append scaffold sections)
- If .gitignore exists → status: "merge" (append missing entries)
- Otherwise → status: "create"

If `upgrade_legacy` is true in USER_CONFIG, set status "upgrade" for:
- CLAUDE.md (replaces "merge" or "skip" — upgrade takes priority)

If `upgrade_legacy` is true AND `has_legacy_gotcha` is true, additionally:
- `goals/` → status: "remove" (only if contains only manifest.md and build_app.md)

If `upgrade_legacy` is true AND `has_legacy_memory` is true, additionally:
- `tools/memory/` → status: "remove"
- `memory/` → status: "remove"
- `tools/manifest.md` → status: "cleanup" (remove memory tool rows)
- `.gitignore` → status: "cleanup" (remove memory/*.npy entry)

Present plan summary to user via AskUserQuestion:

```
Project Scaffold for: {project_name}

Will create:  {list of items with status "create"}
Will merge:   {list of items with status "merge"}
Will upgrade: {list of items with status "upgrade"}
Will remove:  {list of items with status "remove" — legacy cleanup}
Will clean:   {list of items with status "cleanup" — remove legacy references}
Will skip:    {count} existing items
Global config: {install_level description}

Proceed?
```

Options: "Yes, proceed" / "Cancel"

**If cancelled, stop here.**

---

## Phase 4: Scaffold Structure

Launch **general-purpose** subagent:

```
Task(
  subagent_type: "general-purpose",
  description: "Create project scaffold structure",
  prompt: <read from references/phase-prompts.md#phase-4>
)
```

Before sending the prompt, substitute these variables:
- `{ACTION_PLAN}` — the action plan from Phase 3
- `{PROJECT_NAME}` — from USER_CONFIG
- `{PROJECT_DESCRIPTION}` — from USER_CONFIG
- `{INSTALL_LEVEL}` — from USER_CONFIG ("both", "global", or "project")
- `{CLAUDE_MD_TEMPLATE}` — read from `references/claude-md-template.md`
  (the section between BEGIN TEMPLATE and END TEMPLATE)
- `{GITIGNORE_CONTENT}` — read from `assets/gitignore-template`
- `{GLOBAL_PREFERENCES_CONTENT}` — read from `assets/global-preferences-template.md`
  (the section between BEGIN TEMPLATE and END TEMPLATE)

Parse SCAFFOLD_REPORT. If status is "failed", report to user and stop.

---

## Phase 5: Verification & Report

Launch **Bash** subagent (**haiku**):

```
Task(
  subagent_type: "Bash",
  model: "haiku",
  description: "Verify project scaffold",
  prompt: <read from references/phase-prompts.md#phase-5>
)
```

Parse VERIFY_REPORT. Present the final summary using the format in
`references/report-template.md`.

---

## Phase 6: Branch Protection

**Only if the project is a git repo** (from SCAN_REPORT `git_initialized`).

Detect the default branch and hosting platform:

```bash
default_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")

REMOTE_URL=$(git remote get-url origin 2>/dev/null)
if echo "$REMOTE_URL" | grep -qiE 'dev\.azure\.com|visualstudio\.com'; then
  PLATFORM="azdo"
elif echo "$REMOTE_URL" | grep -qi 'github\.com'; then
  PLATFORM="github"
else
  PLATFORM="unknown"
fi
```

### GitHub

If `PLATFORM == github`:
1. Check for existing branch protection via `gh api repos/{owner}/{repo}/branches/{default_branch}/protection` (404 = unprotected)
2. If unprotected, ask via AskUserQuestion:

   Question: "Default branch `{default_branch}` has no branch protection. Add it?"
   Options:
   - "Yes, require PR reviews (Recommended)" — require 1 approval, block force push
   - "Skip" — leave unprotected

3. If user accepts, apply via:
   ```bash
   gh api repos/{owner}/{repo}/branches/{default_branch}/protection \
     -X PUT -f required_pull_request_reviews='{"required_approving_review_count":1}' \
     -f enforce_admins=false \
     -f restrictions=null \
     -f required_status_checks=null \
     -F allow_force_pushes=false \
     -F allow_deletions=false
   ```

### Azure DevOps

If `PLATFORM == azdo`:

Extract org and project from the remote URL (same pattern as `/ship`):
```bash
if echo "$REMOTE_URL" | grep -q 'dev\.azure\.com'; then
  AZDO_ORG=$(echo "$REMOTE_URL" | sed -n 's|.*dev\.azure\.com/\([^/]*\)/.*|\1|p')
  AZDO_PROJECT=$(echo "$REMOTE_URL" | sed -n 's|.*dev\.azure\.com/[^/]*/\([^/]*\)/.*|\1|p')
  AZDO_ORG_URL="https://dev.azure.com/$AZDO_ORG"
elif echo "$REMOTE_URL" | grep -q 'vs-ssh\.visualstudio\.com'; then
  AZDO_ORG=$(echo "$REMOTE_URL" | sed -n 's|.*vs-ssh\.visualstudio\.com:v3/\([^/]*\)/.*|\1|p')
  AZDO_PROJECT=$(echo "$REMOTE_URL" | sed -n 's|.*vs-ssh\.visualstudio\.com:v3/[^/]*/\([^/]*\)/.*|\1|p')
  AZDO_ORG_URL="https://dev.azure.com/$AZDO_ORG"
elif echo "$REMOTE_URL" | grep -q 'visualstudio\.com'; then
  AZDO_ORG=$(echo "$REMOTE_URL" | sed -n 's|.*//\([^.]*\)\.visualstudio\.com.*|\1|p')
  AZDO_PROJECT=$(echo "$REMOTE_URL" | sed -n 's|.*/\([^/]*\)/_git/.*|\1|p')
  AZDO_ORG_URL="https://dev.azure.com/$AZDO_ORG"
fi
REPO_NAME=$(basename -s .git "$REMOTE_URL")
```

If org/project extraction fails, report ⚠️ and skip branch policies.

1. Check for existing branch policies. Use `az repos` CLI if available,
   otherwise fall back to REST API:

   **CLI:**
   ```bash
   az repos policy list \
     --org "$AZDO_ORG_URL" --project "$AZDO_PROJECT" \
     --repository-id "$REPO_NAME" --branch "$default_branch" \
     --query "[].type.displayName" -o tsv
   ```

   **REST fallback:**
   ```bash
   AUTH="Authorization: Basic $(echo -n ":$PAT" | base64)"
   # Get repository ID first
   REPO_ID=$(curl -s -H "$AUTH" \
     "$AZDO_ORG_URL/$AZDO_PROJECT/_apis/git/repositories/$REPO_NAME?api-version=7.0" \
     | jq -r '.id')
   # List branch policies
   curl -s -H "$AUTH" \
     "$AZDO_ORG_URL/$AZDO_PROJECT/_apis/policy/configurations?api-version=7.0" \
     | jq "[.value[] | select(.settings.scope[]?.refName == \"refs/heads/$default_branch\" and .settings.scope[]?.repositoryId == \"$REPO_ID\")]"
   ```

2. If no "Minimum number of reviewers" policy exists, ask via AskUserQuestion:

   Question: "Default branch `{default_branch}` has no minimum reviewer policy. Add it?"
   Options:
   - "Yes, require PR reviews (Recommended)" — require 1 approval, block direct push
   - "Skip" — leave unprotected

3. If user accepts, create the policy:

   **CLI:**
   ```bash
   REPO_ID=$(az repos show --repository "$REPO_NAME" \
     --org "$AZDO_ORG_URL" --project "$AZDO_PROJECT" \
     --query 'id' -o tsv)

   az repos policy approver-count create \
     --org "$AZDO_ORG_URL" --project "$AZDO_PROJECT" \
     --repository-id "$REPO_ID" --branch "$default_branch" \
     --minimum-approver-count 1 \
     --creator-vote-counts false \
     --allow-downvotes false \
     --reset-on-source-push true \
     --blocking true --enabled true
   ```

   **REST fallback:**
   ```bash
   curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
     "$AZDO_ORG_URL/$AZDO_PROJECT/_apis/policy/configurations?api-version=7.0" \
     -d "{
       \"isEnabled\": true,
       \"isBlocking\": true,
       \"type\": {\"id\": \"fa4e907d-c16b-4a4c-9dfa-4906e5d171dd\"},
       \"settings\": {
         \"minimumApproverCount\": 1,
         \"creatorVoteCounts\": false,
         \"allowDownvotes\": false,
         \"resetOnSourcePush\": true,
         \"scope\": [{
           \"repositoryId\": \"$REPO_ID\",
           \"refName\": \"refs/heads/$default_branch\",
           \"matchKind\": \"exact\"
         }]
       }
     }"
   ```

### Unknown Platform

If `PLATFORM == unknown`, skip branch protection and report:
```
⏭️ Branch protection — skipped (unrecognized remote, not GitHub or Azure DevOps)
```

Include result in the final report under a "🔒 Branch protection" section.

---

## Idempotency Rules

- **Skip** directories and files that already exist (unless `--force`)
- **Merge** CLAUDE.md: append scaffold sections if file exists but lacks them
- **Merge** .gitignore: append missing entries only
- **Never delete** user content
- **Never overwrite** without `--force` or explicit user approval

---

## Error Handling

Standard escalation pattern:
1. If retryable (permission issue after mkdir): retry once
2. If persistent: report to user with specific error
3. Offer: skip and continue / abort
4. Never silently swallow errors

Common issues:
- Permission denied → report, suggest checking directory permissions
- CLAUDE.md merge conflict → show both versions, let user choose
- Directory is read-only → abort with clear message
