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

Ship changes through the complete PR lifecycle. Deterministic stages (sync, CI
polling, merge) run as bash scripts for speed and reliability. Only stages that
require reasoning (commit/PR authoring, CI fix analysis) use LLM subagents.
Stage prompts are in `references/stage-prompts.md`.

## Flags

Parse optional flags from the request:
- `--pr-only`: Stop after creating the PR
- `--no-squash`: Use regular merge instead of squash
- `--keep-branch`: Don't delete the source branch after merge
- `--no-superpowers`: Force standalone merge even when Superpowers is installed
- `--auto`: Autonomous mode — stop at an open PR and never merge, regardless of CI/review outcome (REQ-029). The PR description body is the report; see `references/autonomous-report.md`.

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
| superpowers | plugin | on-disk glob via scripts/lib/superpowers.js | no | fallback | Replaces final merge with superpowers:finishing-a-development-branch when present; see references/superpowers-deferral.md |

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
6. Always show the commit/PR agent: `✅ commit agent    general-purpose`

### Azure DevOps Setup (AzDO only)

When `PLATFORM == azdo`, run the AzDO tooling detection and configuration
validation in `references/azdo-setup.md` — it sets `AZDO_MODE` (cli vs REST
fallback), extracts `AZDO_ORG`/`AZDO_PROJECT`/`AZDO_ORG_URL`/`AZDO_PROJECT_URL_SAFE`
from the remote URL, configures `az devops` defaults (or the REST base URL + auth
header), and reports the `azdo context`. GitHub repos skip this section.

Pass `{AZDO_MODE}`, `{AZDO_ORG}`, `{AZDO_PROJECT}`, `{AZDO_PROJECT_URL_SAFE}`,
`{AZDO_ORG_URL}` into
all stage prompts alongside `{PLATFORM}`.

Read `default_branch` and `remote` from Stage 1's SYNC_REPORT. These are
substituted into all stage prompts as `{REMOTE}` and `{DEFAULT_BRANCH}`.

---

## Pre-Ship Location Check

Before syncing, run the shared root-mismatch check from
`references/location-check.md` (`{caller}` = "before syncing").

---

## Stage 1: Sync

Run the sync script directly (no LLM needed):

```bash
SKILL_ROOT="<resolved plugin root>"
bash "$SKILL_ROOT/skills/sync/scripts/sync.sh" "{REMOTE}" "{DEFAULT_BRANCH}"
```

Parse SYNC_REPORT from output markers. Extract `remote` and `default_branch`.
Abort if exit code is 1 (fatal).

---

## Stage 2: Commit, Push & Create PR

This stage needs to **read and understand code** to write good commit messages
and PR descriptions — it's one of the few stages that requires an LLM.

Launch **general-purpose subagent** (reads diffs + source files):

```
Task(
  subagent_type: "general-purpose",
  description: "Analyze, commit, push, and create PR",
  prompt: <read from references/stage-prompts.md#stage-2>
)
```

Substitute `{USER_INTENT}`, `{FILES_TO_INCLUDE}`, `{FILES_TO_EXCLUDE}`,
`{REMOTE}`, `{DEFAULT_BRANCH}`, `{PLATFORM}`, `{AZDO_MODE}`, `{AZDO_ORG}`,
`{AZDO_PROJECT}`, `{AZDO_PROJECT_URL_SAFE}`, `{AZDO_ORG_URL}`, `{PAT}`,
`{SKILL_ROOT}` into the prompt.

Parse SHIP_REPORT. Abort if failed.

**Rollback:** PR creation runs through `scripts/create-pr.sh`, which is
idempotent — it reuses an already-open PR on the branch (`reused=true`)
instead of erroring, so that is never a failure. If push succeeds but
`create-pr.sh` reports `status=failed`, report the error from its `errors`
field and suggest the manual PR creation command. Do NOT revert the push.
- GitHub: `gh pr create --head {branch}`
- Azure DevOps (cli): `az repos pr create --source-branch {branch} --target-branch {DEFAULT_BRANCH} --org {AZDO_ORG_URL} --project {AZDO_PROJECT}`
- Azure DevOps (rest): Create PR via `{AZDO_ORG_URL}/{AZDO_PROJECT}/_apis/git/repositories/{repo}/pullrequests?api-version=7.0`

**If `--pr-only` flag: Stop here and report PR URL to user.**

---

## Stage 3 + 4: CI Watch & Fix Loop

Run CI monitoring in the **foreground** so failures are caught and fixed
immediately. This stage loops: watch → detect failure → fix → push → watch again.

**Maximum 2 fix attempts.** If CI still fails after 2 rounds, report to user and stop.

**`--auto` mode:** CI-watch/fix-loop behavior is unchanged from interactive `/ship` — the 2-attempt cap already matches `--auto`'s bound (REQ-031). No dispatch needed here.

### Watch

Run the CI watch script directly (no LLM needed — just polling):

```bash
SKILL_ROOT="<resolved plugin root>"
bash "$SKILL_ROOT/skills/ship/scripts/ci-watch.sh" \
  "{PLATFORM}" "{PR_NUMBER}" "{BRANCH}" \
  --azdo-mode="{AZDO_MODE}" --azdo-org-url="{AZDO_ORG_URL}" \
  --azdo-project="{AZDO_PROJECT}" --azdo-project-url-safe="{AZDO_PROJECT_URL_SAFE}"
```

Briefly inform the user: `⏳ Watching CI for PR #{pr_number}...`

Parse CHECKS_REPORT from output markers. Exit code 0=passed, 1=failed, 2=timeout.

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
  if CHECKS.status == "all_passed":
    break  → proceed immediately to Stage 5 (do NOT ask user to confirm merge)
  if CHECKS.status == "no_checks":
    → prompt user via AskUserQuestion:
      "No CI checks found for PR #{PR_NUMBER} after waiting 30 seconds.
       The repository may not have CI configured, or checks may still be registering."
      Options:
      - "Merge without checks (Recommended)" → break to Stage 5
      - "Wait another 30 seconds" → re-run the watch (do not increment attempt)
      - "Cancel" → stop /ship and display failure banner
    break (if user chose merge or after re-wait resolves)
  attempt += 1
  run_fix(CHECKS.failing_checks)
  → loop back to watch

if attempt == 2 and still failing:
  → display failure banner and stop (see Failure Handling below)
```

### Failure Handling

When /ship fails at ANY point (CI exhausts fix attempts, merge fails, post-merge
verification fails), display the failure banner and STOP:

```
┌─ Ship · FAILED ──────────────────────────────────
│
│  ❌ PR #{PR_NUMBER} was NOT merged
│
│  Reason: {specific failure reason}
│  Branch: {BRANCH} (still active)
│
│  ⚠️  You are still on branch '{BRANCH}'.
│     Run /sync to return to main before starting new work.
│
└───────────────────────────────────────────────────
```

**Critical rules on failure:**
- Do NOT proceed to "What's Next?"
- Do NOT suggest next tasks or follow-up work
- Do NOT invoke `/sync` or any other skill
- Do NOT use language like "will be auto-merged" or "PR is pending"
- The failure banner is the LAST output — nothing follows it

---

## Stage 5: Merge & Final Sync

**If `--auto`: STOP HERE — do not merge.** `--auto` mode ends at an open PR
regardless of CI/review outcome (REQ-029). Read `references/autonomous-report.md`
for the `--auto` completion report format instead of proceeding to the merge
stage below.

Once checks pass, **immediately proceed to merge — do not ask the user for
confirmation.** The user invoked `/ship` expecting the full lifecycle; stopping
to ask defeats the purpose. Squash merge and delete the source branch are the
defaults (override via `--no-squash` and `--keep-branch` flags only).

### 5a. Merge the PR

**Superpowers deferral:** When Superpowers is detected and `--no-superpowers` is not set, after CI is green and auto-fix, announce `⚡ Superpowers detected — deferring final integration to superpowers:finishing-a-development-branch` and invoke that skill to present merge/PR/cleanup options instead of calling merge.sh directly (CI-poll + auto-fix and the no-manual-CI-trigger rule still apply); otherwise run merge.sh below.

Run the merge script directly (no LLM needed):

```bash
SKILL_ROOT="<resolved plugin root>"
bash "$SKILL_ROOT/skills/ship/scripts/merge.sh" \
  "{PLATFORM}" "{PR_NUMBER}" \
  {MERGE_FLAGS} {BRANCH_FLAGS} \
  --azdo-mode="{AZDO_MODE}" --azdo-org-url="{AZDO_ORG_URL}" \
  --azdo-project="{AZDO_PROJECT}" --azdo-project-url-safe="{AZDO_PROJECT_URL_SAFE}"
```

Parse LAND_REPORT from output markers. Exit code 0=merged, 1=failed.

### 5a-verify. Verify merge completed

After merge.sh reports success, verify the PR actually merged:

**GitHub:**
```bash
PR_STATE=$(gh pr view "$PR_NUMBER" --json state --jq '.state')
```
Expected: `"MERGED"`

**AzDO CLI:**
```bash
PR_STATE=$(az repos pr show --id "$PR_NUMBER" --query status -o tsv)
```
Expected: `"completed"`

**AzDO REST:**
```bash
PR_RESP=$(curl -s -H "$AUTH" "${AZDO_ORG_URL}/${AZDO_PROJECT_URL_SAFE}/_apis/git/repositories/${REPO_ID}/pullRequests/${PR_NUMBER}?api-version=7.1")
PR_STATE=$(echo "$PR_RESP" | jq -r '.status')
```
Expected: `"completed"`

If the PR is NOT in the expected merged/completed state, treat as a failure —
display the failure banner (see Failure Handling) with reason "PR merge was
accepted but PR is still in '{PR_STATE}' state. The merge may be queued or
deferred." and stop.

### 5b. Sync local repo

After the merge script succeeds, run the sync script to checkout the default
branch, pull the merge commit, and **clean up stale branches**:

```bash
bash "$SKILL_ROOT/skills/sync/scripts/sync.sh" "{REMOTE}" "{DEFAULT_BRANCH}"
```

After sync completes, verify the working tree is on the default branch:

```bash
CURRENT=$(git branch --show-current)
if [ "$CURRENT" != "{DEFAULT_BRANCH}" ]; then
  git checkout {DEFAULT_BRANCH}
  git pull {REMOTE} {DEFAULT_BRANCH}
fi
```

---

## What's Next?

**Only run this section if /ship succeeded (PR is merged).** If any failure
occurred, the failure banner was already displayed and nothing should follow it.

After a successful merge, determine what work comes next by checking these
sources (in priority order):

1. **Active tasks** — check `TaskList` for any in-progress or pending tasks
   in the current session
2. **Session context** — review the conversation so far for any stated plans,
   follow-up items, or deferred work the user mentioned
3. **Memory** — check Claude Code's built-in auto-memory
   (`~/.claude/projects/<project>/memory/MEMORY.md`) for recent checkpoints or
   plans related to this project

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
│  🌿 Now on: {DEFAULT_BRANCH} (up to date)
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

After presenting the report (PR merged, tree clean, not an active cycle),
resurface any deferred lifecycle step:
```bash
_R="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/marketplaces/slamb2k}"
node "$_R/hooks/session-guard.cjs" lifecycle-checkpoint
```
If the command prints a `LIFECYCLE_OFFER_BEGIN…END` block, present that offer to
the user via AskUserQuestion as instructed inside the block. If it prints nothing
(or `LIFECYCLE_OFFER_NONE`), do not mention the lifecycle engine.

## Follow-ups Ledger (REQ-010/044)

After the report, capture any follow-up ideas, deferred fixes, or open questions
surfaced during this ship (including anything listed in "What's Next?" that isn't
being acted on now) into the committed ledger so they survive `/clear`. Capture
is automatic and deduped — don't ask permission to capture, only decide what to
*do* with the items.

```bash
_R="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/marketplaces/slamb2k}"
node "$_R/hooks/session-guard.cjs" logbook-capture \
  '[{"title":"…","category":"ideas","source":"/ship #<pr>"}, …]'
```

If a captured item is also turned into a `TaskCreate` task, re-capture it with a
`"link":"task#<id>"` so it auto-resolves when the task completes (REQ-012). Then
show the current open ledger and mention any evictions:

```bash
node "$_R/hooks/session-guard.cjs" logbook-list
```

If no follow-ups were surfaced and the ledger is empty, show nothing (AC-008).
