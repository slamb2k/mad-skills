---
name: ship
description: "Ship changes through the full PR lifecycle. Use after completing feature work to commit, push, create PR, wait for checks, and merge. Handles the entire workflow: syncs with main, creates feature branch if needed, groups commits logically with semantic messages, creates detailed PR, monitors CI, fixes issues, squash merges, and cleans up. Invoke when work is ready to ship."
argument-hint: --pr-only, --no-squash, --keep-branch (optional flags)
allowed-tools: Bash, Read, Glob, Grep, Agent, Skill
---

# Ship - Full PR Lifecycle

When this skill is invoked, IMMEDIATELY output the banner below before doing anything else.
Pick ONE tagline at random — vary your choice each time.
CRITICAL: Reproduce the banner EXACTLY character-for-character. The first line of the art has 4 leading spaces — you MUST preserve them.

```
{tagline}

⠀   ██╗███████╗██╗  ██╗██╗██████╗
   ██╔╝██╔════╝██║  ██║██║██╔══██╗
  ██╔╝ ███████╗███████║██║██████╔╝
 ██╔╝  ╚════██║██╔══██║██║██╔═══╝
██╔╝   ███████║██║  ██║██║██║
╚═╝    ╚══════╝╚═╝  ╚═╝╚═╝╚═╝
```

Taglines:
- 🚚 Special delivery!!!
- 📦 If it compiles, it ships!
- 🚢 Anchors aweigh!
- 🙏 git push and pray!
- ⚡ Shipping faster than Amazon Prime!
- 🏀 Yeet the code into production!
- 📬 Another one for the merge queue!
- 🟢 LGTM — Let's Get This Merged!

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

Ship changes through the complete PR lifecycle. Every stage runs in a subagent
to isolate context from the primary conversation. Prompts for each stage are
in `references/stage-prompts.md`.

## Flags

Parse optional flags from the request:
- `--pr-only`: Stop after creating the PR
- `--no-squash`: Use regular merge instead of squash
- `--keep-branch`: Don't delete the source branch after merge

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

Pass `{PLATFORM}` into all stage prompts. Each stage uses the appropriate
CLI tool: `gh` for GitHub, `az repos`/`az pipelines` for Azure DevOps.

**Display the detected platform to the user immediately after detection:**
```
⚙️ Platform: GitHub (github.com)
```
or:
```
⚙️ Platform: Azure DevOps ({AZDO_ORG}/{AZDO_PROJECT})
```

---

## Pre-flight

Before starting, check all dependencies in this table. The table contains
**all** dependencies — some are platform-conditional (see notes after table).

| Dependency | Type | Check | Required | Resolution | Detail |
|-----------|------|-------|----------|------------|--------|
| git | cli | `git --version` | yes | stop | Install from https://git-scm.com |
| gh | cli | `gh --version` | yes | url | https://cli.github.com |
| az devops | cli | `az devops -h 2>/dev/null` | no | fallback | Falls back to REST API with PAT; see AzDO tooling below |
| ship-analyzer | agent | `~/.claude/agents/ship-analyzer.md` or `~/.claude/plugins/marketplaces/slamb2k/agents/ship-analyzer.md` | no | fallback | Uses general-purpose agent |

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
for use in all subsequent stages:

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
  # HTTPS format: https://dev.azure.com/{ORG}/{PROJECT}/_git/{REPO}
  # Also handles: https://{ORG}@dev.azure.com/{ORG}/{PROJECT}/_git/{REPO}
  AZDO_ORG=$(echo "$REMOTE_URL" | sed -n 's|.*dev\.azure\.com/\([^/]*\)/.*|\1|p')
  AZDO_PROJECT=$(echo "$REMOTE_URL" | sed -n 's|.*dev\.azure\.com/[^/]*/\([^/]*\)/.*|\1|p')
  AZDO_ORG_URL="https://dev.azure.com/$AZDO_ORG"
elif echo "$REMOTE_URL" | grep -q 'vs-ssh\.visualstudio\.com'; then
  # SSH format: {ORG}@vs-ssh.visualstudio.com:v3/{ORG}/{PROJECT}/{REPO}
  AZDO_ORG=$(echo "$REMOTE_URL" | sed -n 's|.*vs-ssh\.visualstudio\.com:v3/\([^/]*\)/.*|\1|p')
  AZDO_PROJECT=$(echo "$REMOTE_URL" | sed -n 's|.*vs-ssh\.visualstudio\.com:v3/[^/]*/\([^/]*\)/.*|\1|p')
  AZDO_ORG_URL="https://dev.azure.com/$AZDO_ORG"
elif echo "$REMOTE_URL" | grep -q 'visualstudio\.com'; then
  # Legacy HTTPS format: https://{ORG}.visualstudio.com/{PROJECT}/_git/{REPO}
  AZDO_ORG=$(echo "$REMOTE_URL" | sed -n 's|.*//\([^.]*\)\.visualstudio\.com.*|\1|p')
  AZDO_PROJECT=$(echo "$REMOTE_URL" | sed -n 's|.*/\([^/]*\)/_git/.*|\1|p')
  AZDO_ORG_URL="https://dev.azure.com/$AZDO_ORG"
fi

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
- Base URL: `$AZDO_ORG_URL/$AZDO_PROJECT/_apis`
- Auth header: `Authorization: Basic $(echo -n ":$PAT" | base64)`

Report in pre-flight:
- ✅ `azdo context` — org: `{AZDO_ORG}`, project: `{AZDO_PROJECT}`
- ❌ `azdo context` — could not parse from remote URL → halt with instructions

Pass `{AZDO_MODE}`, `{AZDO_ORG}`, `{AZDO_PROJECT}`, `{AZDO_ORG_URL}` into
all stage prompts alongside `{PLATFORM}`.

Read `default_branch` and `remote` from Stage 1's SYNC_REPORT. These are
substituted into all stage prompts as `{REMOTE}` and `{DEFAULT_BRANCH}`.

---

## Stage 1: Sync

Launch **Bash subagent** (haiku — simple git commands):

```
Task(
  subagent_type: "Bash",
  model: "haiku",
  description: "Sync with default branch",
  prompt: "Follow ~/.claude/skills/sync/SKILL.md or ~/.claude/plugins/marketplaces/slamb2k/skills/sync/SKILL.md subagent prompt. Return SYNC_REPORT."
)
```

Parse SYNC_REPORT. Extract `remote` and `default_branch`. Abort if sync failed.

---

## Stage 2: Commit, Push & Create PR

This stage needs to **read and understand code** to write good commit messages
and PR descriptions. Use a code-aware subagent.

Launch **ship-analyzer subagent** (reads diffs + source files):

```
Task(
  subagent_type: "ship-analyzer",
  description: "Analyze, commit, push, and create PR",
  prompt: <read from references/stage-prompts.md#stage-2>
)
```

> **Fallback:** If `ship-analyzer` is not available, use `subagent_type: "general-purpose"`.

Substitute `{USER_INTENT}`, `{FILES_TO_INCLUDE}`, `{FILES_TO_EXCLUDE}`,
`{REMOTE}`, `{DEFAULT_BRANCH}`, `{PLATFORM}`, `{AZDO_MODE}`, `{AZDO_ORG}`,
`{AZDO_PROJECT}`, `{AZDO_ORG_URL}`, `{PAT}` into the prompt.

Parse SHIP_REPORT. Abort if failed.

**Rollback:** If push succeeds but PR creation fails, report the error and
suggest the manual PR creation command. Do NOT revert the push.
- GitHub: `gh pr create --head {branch}`
- Azure DevOps (cli): `az repos pr create --source-branch {branch} --target-branch {DEFAULT_BRANCH} --org {AZDO_ORG_URL} --project {AZDO_PROJECT}`
- Azure DevOps (rest): Create PR via `{AZDO_ORG_URL}/{AZDO_PROJECT}/_apis/git/repositories/{repo}/pullrequests?api-version=7.0`

**If `--pr-only` flag: Stop here and report PR URL to user.**

---

## Stage 3 + 4: CI Watch & Fix Loop

Run CI monitoring in the **foreground** so failures are caught and fixed
immediately. This stage loops: watch → detect failure → fix → push → watch again.

**Maximum 2 fix attempts.** If CI still fails after 2 rounds, report to user and stop.

### Watch

Launch **Bash subagent** (haiku — polling):

```
Task(
  subagent_type: "Bash",
  model: "haiku",
  description: "Monitor CI checks",
  prompt: <read from references/stage-prompts.md#stage-3>
)
```

Substitute `{PR_NUMBER}`, `{BRANCH}`, `{PLATFORM}`, `{AZDO_MODE}`,
`{AZDO_ORG}`, `{AZDO_ORG_URL}`, `{AZDO_PROJECT}`, `{PAT}` into the prompt.

Briefly inform the user: `⏳ Watching CI for PR #{pr_number}...`

Parse CHECKS_REPORT when the subagent returns.

### Fix (if needed)

If CHECKS_REPORT shows `some_failed`, **immediately** launch a fix subagent —
do not wait, do not ask the user:

```
Task(
  subagent_type: "general-purpose",
  description: "Fix CI failures",
  prompt: <read from references/stage-prompts.md#stage-4>
)
```

Substitute `{PR_NUMBER}`, `{BRANCH}`, `{FAILING_CHECKS}`, `{PLATFORM}`,
`{AZDO_MODE}`, `{AZDO_ORG}`, `{AZDO_ORG_URL}`, `{AZDO_PROJECT}`, `{PAT}` into the prompt.

The fix subagent MUST commit and push before returning. Once it returns,
**immediately loop back to Watch** to re-check CI.

### Loop summary

```
attempt = 0
while attempt < 2:
  CHECKS = run_watch()
  if CHECKS.status == "all_passed" or CHECKS.status == "no_checks":
    break  → proceed immediately to Stage 5 (do NOT ask user to confirm merge)
  attempt += 1
  run_fix(CHECKS.failing_checks)
  → loop back to watch

if attempt == 2 and still failing:
  report failures to user, stop
```

---

## Stage 5: Merge & Final Sync

Once checks pass, **immediately proceed to merge — do not ask the user for
confirmation.** The user invoked `/ship` expecting the full lifecycle; stopping
to ask defeats the purpose. Squash merge and delete the source branch are the
defaults (override via `--no-squash` and `--keep-branch` flags only).

Launch **Bash subagent** (haiku — simple git + platform CLI commands):

```
Task(
  subagent_type: "Bash",
  model: "haiku",
  description: "Merge PR and sync",
  prompt: <read from references/stage-prompts.md#stage-5>
)
```

Substitute `{PR_NUMBER}`, `{REMOTE}`, `{DEFAULT_BRANCH}`, `{PLATFORM}`,
`{AZDO_MODE}`, `{AZDO_ORG_URL}`, `{AZDO_PROJECT}`, `{PAT}`, merge/branch flags.

Parse LAND_REPORT.

---

## What's Next?

After a successful merge, determine what work comes next by checking these
sources (in priority order):

1. **Active tasks** — check `TaskList` for any in-progress or pending tasks
   in the current session
2. **Session context** — review the conversation so far for any stated plans,
   follow-up items, or deferred work the user mentioned
3. **Memory** — if the `claude-mem` plugin is available, search for recent
   checkpoints or plans related to this project

Summarize the result as 1–3 short bullet points for the `⚡ Next` section of
the report. If nothing is found, omit the section entirely — do not fabricate
next steps.

---

## Final Report to User

Compile all stage reports into a summary:

```
┌─ Ship · Report ────────────────────────────────
│
│  ✅ Ship complete
│
│  🌿 Branch:  {branch}
│  🔗 PR:      {pr_url}
│  🔀 Merged:  {merge_commit} ({merge_type})
│
│  📝 Commits
│     • {commit message 1}
│     • {commit message 2}
│
│  📊 {count} files changed ({diff_summary})
│
│  ⚡ Next
│     • {next item 1}
│     • {next item 2}
│
└─────────────────────────────────────────────────
```

If nothing was found for "What's Next?", omit the `⚡ Next` section.

If any stage failed, add:
```
│  ❌ Failed at: {stage name}
│     {error description}
│     {suggested resolution}
```
