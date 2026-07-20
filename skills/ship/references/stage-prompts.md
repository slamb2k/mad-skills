# Ship Stage Prompts

Subagent prompts for each ship stage. The orchestrator reads these and
substitutes template variables before launching each subagent.

`{PLATFORM}` is either `github` or `azdo` (detected from remote URL).
`{AZDO_MODE}` is `cli` or `rest` (only relevant when PLATFORM == azdo).
`{AZDO_ORG}`, `{AZDO_PROJECT}`, `{AZDO_PROJECT_URL_SAFE}`, `{AZDO_ORG_URL}` provide AzDO context.
Use `{AZDO_PROJECT}` for CLI `--project` flags and display. Use `{AZDO_PROJECT_URL_SAFE}` in REST API URL paths.

---

## Stage 2: Commit, Push & Create PR

**Agent:** general-purpose

This is the only shipping stage that requires an LLM — it reads and understands
code to produce meaningful commit messages and PR descriptions.

```
Ship the following changes. Analyze the diffs, create semantic commits,
push to a feature branch, and create a pull request.

Limit SHIP_REPORT to 15 lines maximum.

CRITICAL — READ THIS FIRST:
PLATFORM: {PLATFORM}
Use ONLY the tools for this platform. GitHub = gh CLI. Azure DevOps = az repos CLI.
NEVER use gh commands on an Azure DevOps repository — they WILL fail.

USER INTENT: {USER_INTENT}

FILES TO INCLUDE: {FILES_TO_INCLUDE}

FILES TO EXCLUDE: {FILES_TO_EXCLUDE}

## Principles

1. **Read before writing** — Always read the actual diff AND relevant source
   files before composing commit messages. Never guess at intent from filenames.
2. **Semantic grouping** — Group related changes into logical commits. A
   "logical group" shares a single purpose.
3. **Concise but complete** — Commit messages explain WHAT and WHY in 1-2
   sentences. PR descriptions give the full picture.
4. **No attribution** — Never add Co-Authored-By or Generated-by lines.
5. **Prioritize impact** — When changes span many files, read the most
   impactful diffs first (source > tests > config).

## Commit message format

```text
<type>(<scope>): <imperative description>

<optional body: what changed and why, wrapped at 72 chars>
```

Types: feat, fix, refactor, docs, chore, test, perf

Good examples:
- feat(auth): replace pairing gate with channel allowlist
- fix(memory): correct positional arg order in get_recent_commitments

Bad examples:
- update files (too vague)
- feat: changes to auth system (no scope, vague)

## Steps

1. **Analyze changes**
   - Run: git status, git diff, git diff --cached
   - Read source files where the diff alone doesn't explain intent
   - Identify logical commit groupings

2. **Create branch** (if on {DEFAULT_BRANCH})
   git checkout -b <type>/<descriptive-name>

3. **Commit in logical groups**
   For each logical group:
     git add <specific-files>
     git commit -m "$(cat <<'EOF'
     <type>(<scope>): <description>

     <body if needed>
     EOF
     )"

   Rules:
   - Use HEREDOC for commit messages (ensures proper formatting)
   - Use `git add -p` when only some hunks in a file belong in a given commit
   - Always verify the push succeeded before creating the PR

4. **Push**
   git push -u {REMOTE} $BRANCH

5. **Create PR**
   - Read: git log {REMOTE}/{DEFAULT_BRANCH}..HEAD --format="%h %s%n%b"
   - Read: git diff {REMOTE}/{DEFAULT_BRANCH} (skim for PR description context)
   - Compose the PR title ("<type>: <concise title>") and write the PR body to
     a temp file:

     PR_BODY_FILE=$(mktemp)
     cat > "$PR_BODY_FILE" <<'EOF'
     ## Summary
     <1-3 sentences: what and why>

     ## Changes
     <bullet list of key changes>

     ## Testing
     - [ ] <verification steps>
     EOF

   - Run the shared PR-creation script — it handles GitHub, AzDO CLI, and
     AzDO REST internally, and reuses an already-open PR on the branch
     instead of erroring. Do not call `gh`/`az repos`/`curl` directly:

     PR_OUTPUT=$(bash "{SKILL_ROOT}/skills/ship/scripts/create-pr.sh" \
       "{PLATFORM}" "<type>: <concise title>" "$PR_BODY_FILE" "$BRANCH" \
       --target-branch="{DEFAULT_BRANCH}" --remote="{REMOTE}" \
       --azdo-mode="{AZDO_MODE}" --azdo-org-url="{AZDO_ORG_URL}" \
       --azdo-project="{AZDO_PROJECT}" --azdo-project-url-safe="{AZDO_PROJECT_URL_SAFE}")
     rm -f "$PR_BODY_FILE"

6. **Parse PR result**

   Extract fields from the `PR_REPORT_BEGIN`/`END` block in `$PR_OUTPUT`:
     STATUS=$(echo "$PR_OUTPUT" | sed -n 's/^status=//p')
     PR_URL=$(echo "$PR_OUTPUT" | sed -n 's/^pr_url=//p')
     PR_NUMBER=$(echo "$PR_OUTPUT" | sed -n 's/^pr_number=//p')
     PR_ERRORS=$(echo "$PR_OUTPUT" | sed -n 's/^errors=//p')

   `status` is the sole source of truth for success/failure — a `reused=true`
   PR is still `status=success`; only `status=failed` is a real failure. If
   STATUS is not "success", stop and report status: failed below, with
   PR_ERRORS as the errors field.

   COMMITS=$(git log {REMOTE}/{DEFAULT_BRANCH}..HEAD --oneline)
   DIFF_STAT=$(git diff {REMOTE}/{DEFAULT_BRANCH} --shortstat)
   FILES_CHANGED=$(git diff {REMOTE}/{DEFAULT_BRANCH} --name-only)

## Output Format

SHIP_REPORT:
- status: success|failed
- platform: {PLATFORM}
- branch: {branch name}
- pr_url: {url}
- pr_number: {number}
- pr_title: {title}
- commit_count: {number}
- commits: {list of commit messages}
- files_changed: {list}
- diff_summary: {insertions/deletions}
- errors: {any errors}
```

---

## Stage 3: Wait for CI

**Replaced by script:** `scripts/ci-watch.sh`

The orchestrator runs this script directly via Bash — no LLM needed.
See `skills/ship/scripts/ci-watch.sh` for the full implementation.

Output is a structured `CHECKS_REPORT` between `CHECKS_REPORT_BEGIN`/`END` markers.
Exit codes: 0=all_passed, 1=some_failed, 2=timeout, 3=tool error.

---

## Stage 4: Fix Failing Checks

**Agent:** general-purpose (default model)

```
Fix failing CI checks for PR #{PR_NUMBER} on branch {BRANCH}.

Limit FIX_REPORT to 10 lines maximum.

PLATFORM: {PLATFORM}
FAILING CHECKS: {FAILING_CHECKS}

## Steps

1. **Get failure details**

   **If PLATFORM == github:**
     gh run list --branch {BRANCH} --status failure --json databaseId --jq '.[0].databaseId'
     gh run view <run-id> --log-failed

   **If PLATFORM == azdo AND AZDO_MODE == cli:**
     RUN_ID=$(az pipelines runs list --branch {BRANCH} --top 1 \
       --org "{AZDO_ORG_URL}" --project "{AZDO_PROJECT}" \
       --query "[?result=='failed'].id | [0]" -o tsv)
     az pipelines runs show --id $RUN_ID \
       --org "{AZDO_ORG_URL}" --project "{AZDO_PROJECT}" --output json
     # `az pipelines` has no `logs download` command (verified against
     # `az pipelines --help` — it doesn't exist). Fetching log content is a
     # REST-only operation with no CLI equivalent: use the same
     # timeline-then-curl pattern as REST mode below.
     AUTH="Authorization: Basic $(printf ":%s" "{PAT}" | base64 | tr -d '\n')"
     TIMELINE=$(curl -s -H "$AUTH" \
       "{AZDO_ORG_URL}/{AZDO_PROJECT_URL_SAFE}/_apis/build/builds/$RUN_ID/timeline?api-version=7.0")
     echo "$TIMELINE" | jq -r '.records[] | select(.result=="failed") | "\(.name): \(.log.url // "no log URL")"'
     for LOG_URL in $(echo "$TIMELINE" | jq -r '.records[] | select(.result=="failed") | .log.url // empty'); do
       echo "=== Log: $LOG_URL ==="
       curl -s -H "$AUTH" "$LOG_URL" | tail -50
     done

   **If PLATFORM == azdo AND AZDO_MODE == rest:**
     AUTH="Authorization: Basic $(printf ":%s" "{PAT}" | base64 | tr -d '\n')"
     # Get failed build ID
     RUN_ID=$(curl -s -H "$AUTH" \
       "{AZDO_ORG_URL}/{AZDO_PROJECT_URL_SAFE}/_apis/build/builds?branchName=refs/heads/{BRANCH}&resultFilter=failed&\$top=1&api-version=7.0" \
       | jq -r '.value[0].id')
     # Get timeline for step-level failures
     TIMELINE=$(curl -s -H "$AUTH" \
       "{AZDO_ORG_URL}/{AZDO_PROJECT_URL_SAFE}/_apis/build/builds/$RUN_ID/timeline?api-version=7.0")
     # Extract failed task names and log URLs
     echo "$TIMELINE" | jq -r '.records[] | select(.result=="failed") | "\(.name): \(.log.url // "no log URL")"'
     # Fetch actual log content from each failed task's log URL
     for LOG_URL in $(echo "$TIMELINE" | jq -r '.records[] | select(.result=="failed") | .log.url // empty'); do
       echo "=== Log: $LOG_URL ==="
       curl -s -H "$AUTH" "$LOG_URL" | tail -50
     done

2. **Analyze and fix**
   Read the relevant source files, understand the failures, fix the code.

3. **Commit and push**
   git add <fixed-files>
   git commit -m "$(cat <<'EOF'
   fix: address CI feedback - {specific issue}
   EOF
   )"
   git push

CRITICAL — after pushing, your job is DONE. Return immediately.
- Do NOT manually trigger, queue, or run any CI builds or pipelines
- Do NOT use `az pipelines run`, `gh workflow run`, or any build-triggering command
- The PR build policy will trigger automatically on push
- The orchestrator will poll for the new build via ci-watch.sh

## Output Format

FIX_REPORT:
- status: fixed|unable_to_fix
- changes_made: {description}
- files_modified: {list}
- errors: {if unable to fix, why}
```

---

## Stage 5: Merge & Final Sync

**Replaced by script:** `scripts/merge.sh`

The orchestrator runs this script directly via Bash — no LLM needed.
See `skills/ship/scripts/merge.sh` for the full implementation.

Output is a structured `LAND_REPORT` between `LAND_REPORT_BEGIN`/`END` markers.
Exit codes: 0=merged, 1=failed, 2=failed after retry.
