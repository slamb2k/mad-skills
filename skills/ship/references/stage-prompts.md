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

   **If PLATFORM == github:**
     gh pr create --title "<type>: <concise title>" --body "$(cat <<'EOF'
     ## Summary
     <1-3 sentences: what and why>

     ## Changes
     <bullet list of key changes>

     ## Testing
     - [ ] <verification steps>
     EOF
     )"

   **If PLATFORM == azdo AND AZDO_MODE == cli:**
     az repos pr create \
       --title "<type>: <concise title>" \
       --description "$(cat <<'EOF'
     ## Summary
     <1-3 sentences: what and why>

     ## Changes
     <bullet list of key changes>

     ## Testing
     - [ ] <verification steps>
     EOF
     )" \
       --source-branch "$BRANCH" \
       --target-branch "{DEFAULT_BRANCH}" \
       --org "{AZDO_ORG_URL}" --project "{AZDO_PROJECT}" \
       --output json

   **If PLATFORM == azdo AND AZDO_MODE == rest:**
     REPO_NAME=$(basename -s .git "$(git remote get-url origin)")
     AUTH="Authorization: Basic $(echo -n ":{PAT}" | base64)"
     PR_JSON=$(curl -s -X POST \
       -H "$AUTH" \
       -H "Content-Type: application/json" \
       "{AZDO_ORG_URL}/{AZDO_PROJECT_URL_SAFE}/_apis/git/repositories/$REPO_NAME/pullrequests?api-version=7.0" \
       -d "{\"sourceRefName\": \"refs/heads/$BRANCH\", \"targetRefName\": \"refs/heads/{DEFAULT_BRANCH}\", \"title\": \"<type>: <concise title>\", \"description\": \"## Summary\\n<1-3 sentences>\\n\\n## Changes\\n<bullets>\\n\\n## Testing\\n- [ ] <steps>\"}")

6. **Gather info**

   **If PLATFORM == github:**
     PR_URL=$(gh pr view --json url -q .url)
     PR_NUMBER=$(gh pr view --json number -q .number)

   **If PLATFORM == azdo AND AZDO_MODE == cli:**
     # If az repos pr create returned JSON, parse it directly:
     PR_NUMBER=$(echo "$PR_JSON" | jq -r '.pullRequestId')
     # Otherwise list to find it:
     PR_NUMBER=$(az repos pr list --source-branch "$BRANCH" --status active \
       --org "{AZDO_ORG_URL}" --project "{AZDO_PROJECT}" \
       --query '[0].pullRequestId' -o tsv)
     PR_URL="{AZDO_ORG_URL}/{AZDO_PROJECT_URL_SAFE}/_git/$(basename -s .git "$(git remote get-url origin)")/pullrequest/$PR_NUMBER"

   **If PLATFORM == azdo AND AZDO_MODE == rest:**
     # Parse from the create response JSON:
     PR_NUMBER=$(echo "$PR_JSON" | jq -r '.pullRequestId')
     REPO_NAME=$(basename -s .git "$(git remote get-url origin)")
     PR_URL="{AZDO_ORG_URL}/{AZDO_PROJECT_URL_SAFE}/_git/$REPO_NAME/pullrequest/$PR_NUMBER"

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
     # Download logs locally — more reliable than timeline API on legacy domains
     LOGDIR=$(mktemp -d)
     az pipelines logs download --run-id $RUN_ID --path "$LOGDIR" \
       --org "{AZDO_ORG_URL}" --project "{AZDO_PROJECT}" 2>/dev/null
     if [ -d "$LOGDIR" ] && [ "$(ls "$LOGDIR")" ]; then
       grep -ril "error\|fail\|##vso\[task.logissue" "$LOGDIR" | head -5 | while read f; do
         echo "=== $(basename "$f") ==="
         grep -i "error\|fail\|##vso\[task.logissue" "$f" | tail -30
       done
     fi
     rm -rf "$LOGDIR"

   **If PLATFORM == azdo AND AZDO_MODE == rest:**
     AUTH="Authorization: Basic $(echo -n ":{PAT}" | base64)"
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
