---
name: rig
description: 'Idempotently bootstrap any repository with standard development tools, hooks, and workflows. Use when starting work on a new repo, onboarding to an existing project, or ensuring a repo has proper CI/CD setup. Configures: git hooks (lefthook), commit message templates, PR templates, and GitHub Actions for lint/format/type-check/build. Prompts for user confirmation before changes. Triggers: "bootstrap repo", "setup hooks", "configure CI", "rig", "standardize repo".'
argument-hint: --skip-system-check (optional)
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion
---

# Rig - Repository Bootstrap

When this skill is invoked, IMMEDIATELY output the banner below before doing anything else.
Pick ONE tagline at random — vary your choice each time.
CRITICAL: Reproduce the banner EXACTLY character-for-character. The first line of the art has 4 leading spaces — you MUST preserve them.

```
{tagline}

⠀   ██╗██████╗ ██╗ ██████╗
   ██╔╝██╔══██╗██║██╔════╝
  ██╔╝ ██████╔╝██║██║  ███╗
 ██╔╝  ██╔══██╗██║██║   ██║
██╔╝   ██║  ██║██║╚██████╔╝
╚═╝    ╚═╝  ╚═╝╚═╝ ╚═════╝
```

Taglines:
- 🏗️ Rigging up the production line...
- 🔩 Bolting down the framework!
- 🪜 Assembling the scaffolding!
- 🏗️ Hoisting the infrastructure!
- 🦺 Locking in the safety harness!
- ⚡ Wiring up the control panel!
- 🛠️ Setting up the drill floor!
- 📐 From blueprint to build-ready!

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

Idempotently bootstrap repositories with standard development infrastructure.
Prompts and report schemas are in `references/`. Configuration procedures are
in `references/configuration-steps.md`.

**Key principle:** Prompt user before making changes. Report findings first,
get approval, then act.

---

## Platform Detection

Detect the hosting platform **before** pre-flight so dependency checks are
platform-specific:

```bash
REMOTE_URL=$(git remote get-url origin 2>/dev/null)
if echo "$REMOTE_URL" | grep -qiE 'dev\.azure\.com|visualstudio\.com'; then
  PLATFORM="azdo"
elif echo "$REMOTE_URL" | grep -qi 'github\.com'; then
  PLATFORM="github"
else
  PLATFORM="github"   # default fallback
fi
```

Pass `{PLATFORM}` into all phase prompts. Each phase uses the appropriate
CLI tool: `gh` for GitHub, `az repos`/`az pipelines` for Azure DevOps.

---

## Pre-flight

Before starting, check all dependencies in this table. The table contains
**all** dependencies — some are platform-conditional (see notes after table).

| Dependency | Type | Check | Required | Resolution | Detail |
|-----------|------|-------|----------|------------|--------|
| git | cli | `git --version` | yes | stop | Install from https://git-scm.com |
| sync | skill | `ls .claude/skills/sync/SKILL.md ~/.claude/skills/sync/SKILL.md ~/.claude/plugins/marketplaces/slamb2k/skills/sync/SKILL.md 2>/dev/null` | no | fallback | Repo sync; falls back to manual git pull |
| lefthook | npm | `npx lefthook --help` | yes | install | `npm install -g lefthook` |
| gh | cli | `gh --version` | yes | url | https://cli.github.com |
| az devops | cli | `az devops -h 2>/dev/null` | no | fallback | Falls back to REST API with PAT; see AzDO tooling below |

**Platform-conditional rules:**
- **`gh`**: Only required when `PLATFORM == github`. Skip for AzDO repos.
- **`az devops`**: Only checked when `PLATFORM == azdo`. Skip for GitHub repos.

For each applicable row, in order:
1. Skip rows that don't apply to the detected `{PLATFORM}`
2. Run the Check command (for cli/npm) or test file existence (for agent/skill)
3. If found: continue silently
4. If missing: apply Resolution strategy
   - **stop**: notify user with Detail, halt execution
   - **url**: notify user with Detail (install link), halt execution
   - **install**: notify user, run the command in Detail, continue if successful
   - **ask**: notify user, offer to run command in Detail, continue either way (or halt if required)
   - **fallback**: notify user with Detail, continue with degraded behavior
5. After all checks: summarize what's available and what's degraded

### AzDO Tooling Detection

When `PLATFORM == azdo`, determine which tooling is available. Set `AZDO_MODE`
for use in all subsequent phases:

```bash
if az devops -h &>/dev/null; then
  AZDO_MODE="cli"
else
  AZDO_MODE="rest"
fi
```

- **`cli`**: Use `az repos` / `az pipelines` commands (preferred)
- **`rest`**: Use Azure DevOps REST API via `curl`. Requires a PAT (personal
  access token) in `AZURE_DEVOPS_EXT_PAT` or `AZDO_PAT` env var. If no PAT
  is found, prompt the user to either install the CLI or set the env var.

Report in pre-flight:
- ✅ `az devops cli` — version found
- ⚠️ `az devops cli` — not found → using REST API fallback
- ❌ `az devops cli` — not found, no PAT configured → halt with setup instructions

### AzDO Configuration Validation

When `PLATFORM == azdo`, extract organization and project from the remote URL
and validate they are usable. These values are needed by every `az repos` /
`az pipelines` command and every REST API call.

```bash
# Extract org and project from remote URL patterns:
#   https://dev.azure.com/{ORG}/{PROJECT}/_git/{REPO}
#   https://{ORG}@dev.azure.com/{ORG}/{PROJECT}/_git/{REPO}
#   {ORG}@vs-ssh.visualstudio.com:v3/{ORG}/{PROJECT}/{REPO}

REMOTE_URL=$(git remote get-url origin 2>/dev/null)

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

# URL-decode for CLI/display; keep URL-safe versions for REST API paths
AZDO_PROJECT_URL_SAFE="$AZDO_PROJECT"
AZDO_ORG=$(printf '%b' "${AZDO_ORG//%/\\x}")
AZDO_PROJECT=$(printf '%b' "${AZDO_PROJECT//%/\\x}")

if [ -z "$AZDO_ORG" ] || [ -z "$AZDO_PROJECT" ]; then
  echo "❌ Could not extract organization/project from remote URL"
  echo "   Remote: $REMOTE_URL"
  echo ""
  echo "Ensure the remote URL follows one of these formats:"
  echo "  https://dev.azure.com/{ORG}/{PROJECT}/_git/{REPO}"
  echo "  https://{ORG}.visualstudio.com/{PROJECT}/_git/{REPO}"
  echo "  {ORG}@vs-ssh.visualstudio.com:v3/{ORG}/{PROJECT}/{REPO}"
  # HALT — cannot proceed without org/project context
fi
```

When `AZDO_MODE == cli`, also configure the defaults so commands work correctly:
```bash
az devops configure --defaults organization="$AZDO_ORG_URL" project="$AZDO_PROJECT"
```

When `AZDO_MODE == rest`, store these for API calls:
- Base URL: `$AZDO_ORG_URL/$AZDO_PROJECT_URL_SAFE/_apis`
- Auth header: `Authorization: Basic $(echo -n ":$PAT" | base64)`

Report in pre-flight:
- ✅ `azdo context` — org: `{AZDO_ORG}`, project: `{AZDO_PROJECT}`
- ❌ `azdo context` — could not parse from remote URL → halt with instructions

Pass `{AZDO_MODE}`, `{AZDO_ORG}`, `{AZDO_PROJECT}`, `{AZDO_ORG_URL}` into
all phase prompts alongside `{PLATFORM}`.

---

## Phase 0: Sync

Invoke `/sync` to ensure the working tree is up to date with origin/main before
bootstrapping. If /sync is unavailable, run `git pull` manually. This prevents
rigging against stale repo state.

---

## Phase 1: System Requirements Check

Launch **Bash subagent** (haiku — simple checks):

```
Task(
  subagent_type: "Bash",
  model: "haiku",
  description: "Check system requirements",
  prompt: <read from references/phase-prompts.md#phase-1>
)
```

Parse SYSTEM_REPORT. If any requirement fails, use **AskUserQuestion**:

Options for missing git config:
- "I'll configure it manually"
- "Configure for me with: [email] / [name]"

**Stop if user chooses manual. Configure if values provided.**

---

## Phase 2: Repository Analysis

Launch **Bash subagent** (haiku):

```
Task(
  subagent_type: "Bash",
  model: "haiku",
  description: "Analyze repository",
  prompt: <read from references/phase-prompts.md#phase-2>
)
```

Parse REPO_REPORT.

---

## Phase 3: Present Findings & Get Approval

Present analysis to user with **AskUserQuestion**:

```
Repository Analysis Complete

Current State:
  Git initialized: {status}
  Branch: {branch}
  Lefthook: {status}
  Commit template: {status}
  PR template: {status}
  CI workflow: {status}
  {if azdo and unregistered_pipelines:}
  Azure Pipelines: {N} YAML file(s) found, {M} not yet registered

Detected Stack:
  Type: {project_type}
  Components: {detected_components}
  Available scripts: {available_scripts}

Proposed Changes:
  {numbered list of what will be added/configured}
  {if azdo and unregistered_pipelines: "Register Azure Pipelines: {list of YAML paths}"}
```

Options:
- "Yes, configure everything"
- "Let me choose what to configure"
- "Cancel"

If "Let me choose", present individual options as multi-select.

---

## Phase 4: Execute Configuration

For each approved item, follow the procedures in
`references/configuration-steps.md`.

---

## Phase 5: Verification

Launch **Bash subagent** (haiku):

```
Task(
  subagent_type: "Bash",
  model: "haiku",
  description: "Verify configuration",
  prompt: <read from references/phase-prompts.md#phase-5>
)
```

Parse VERIFY_REPORT.

---

## Phase 6: Final Report

Present summary using the template in `references/report-template.md`.

---

## Idempotency Rules

- **Skip** items already correctly configured
- **Update** items that exist but are outdated (prompt user first)
- **Add** items that are missing
- **Never delete** user's existing configuration without explicit approval
- **Merge** rather than replace when possible (e.g., add missing hooks)

---

## Error Handling

If any step fails:
1. Report the specific failure
2. Offer to skip and continue, or abort
3. Include troubleshooting suggestions

Common issues:
- No package manager -> suggest installing npm/bun
- Permission denied -> check file permissions
- Lefthook install fails -> try global install
- Git not initialized -> offer to initialize
