# Ship Stage Prompts

Subagent prompts for each ship stage. The orchestrator reads these and
substitutes template variables before launching each subagent.

`{PLATFORM}` is either `github` or `azdo` (detected from remote URL).
`{AZDO_MODE}` is `cli` or `rest` (only relevant when PLATFORM == azdo).
`{AZDO_ORG}`, `{AZDO_PROJECT}`, `{AZDO_PROJECT_URL_SAFE}`, `{AZDO_ORG_URL}` provide AzDO context.
Use `{AZDO_PROJECT}` for CLI `--project` flags and display. Use `{AZDO_PROJECT_URL_SAFE}` in REST API URL paths.

---

## Stage 2: Commit, Push & Create PR

**Agent:** ship-analyzer (fallback: general-purpose)

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
   - Never add Co-Authored-By or attribution lines
   - Use HEREDOC for commit messages (ensures proper formatting)
   - Types: feat, fix, refactor, docs, chore, test, perf

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

**Agent:** Bash (haiku, background)

```
Monitor PR/pipeline status checks until complete. Fail fast — stop polling the
moment any check fails so fixes can start immediately.

Limit CHECKS_REPORT to 10 lines maximum.

PLATFORM: {PLATFORM}
PR_NUMBER: {PR_NUMBER}
BRANCH: {BRANCH}

## Steps

**If PLATFORM == github:**

1. **Wait for checks — fail fast on first failure**
   gh pr checks {PR_NUMBER} --watch --fail-fast

2. **Report final status**
   gh pr checks {PR_NUMBER}

**If PLATFORM == azdo AND AZDO_MODE == cli:**

1. **Wait for CI to start** (pipelines may take time to trigger after PR creation)
   Poll until at least one run appears (max 2 minutes, check every 15s):
   ```
   RUNS_FOUND=false
   for i in $(seq 1 8); do
     RUN_COUNT=$(az pipelines runs list --branch "$BRANCH" --top 5 \
       --org "{AZDO_ORG_URL}" --project "{AZDO_PROJECT}" \
       --query "length(@)" -o tsv 2>/dev/null)
     if [ -n "$RUN_COUNT" ] && [ "$RUN_COUNT" != "0" ]; then
       RUNS_FOUND=true
       break
     fi
     sleep 15
   done
   ```
   If no runs appear after 2 minutes, also check PR policy evaluations:
   ```
   az repos pr policy list --id {PR_NUMBER} \
     --org "{AZDO_ORG_URL}" --project "{AZDO_PROJECT}" \
     --query "[].{name:configuration.type.displayName, status:status}" -o table
   ```
   If no policies exist either, report `no_checks`.

2. **Wait for runs to complete — with fail-fast** (max 30 minutes, check every 15s)
   ```
   for i in $(seq 1 120); do
     # Check for failures FIRST — stop immediately if any run has failed
     FAILED=$(az pipelines runs list --branch "$BRANCH" --top 5 \
       --org "{AZDO_ORG_URL}" --project "{AZDO_PROJECT}" \
       --query "[?result=='failed'] | length(@)" -o tsv 2>/dev/null)
     if [ -n "$FAILED" ] && [ "$FAILED" != "0" ]; then
       echo "CI failure detected — stopping wait"
       break
     fi

     # Then check if anything is still running
     IN_PROGRESS=$(az pipelines runs list --branch "$BRANCH" --top 5 \
       --org "{AZDO_ORG_URL}" --project "{AZDO_PROJECT}" \
       --query "[?status=='inProgress'] | length(@)" -o tsv 2>/dev/null)
     if [ "$IN_PROGRESS" = "0" ] || [ -z "$IN_PROGRESS" ]; then break; fi
     sleep 15
   done
   ```

3. **Determine final status**
   Query both pipeline runs and PR policy evaluations:
   ```
   az pipelines runs list --branch "$BRANCH" --top 5 \
     --org "{AZDO_ORG_URL}" --project "{AZDO_PROJECT}" \
     --query "[].{name:definition.name, status:status, result:result}" -o table
   az repos pr policy list --id {PR_NUMBER} \
     --org "{AZDO_ORG_URL}" --project "{AZDO_PROJECT}" \
     --query "[].{name:configuration.type.displayName, status:status}" -o table
   ```

   **Map results to CHECKS_REPORT status:**
   - Any pipeline with `result == "failed"` → `some_failed`
   - Any policy with `status == "rejected"` → `some_failed`
   - All pipelines `result == "succeeded"` AND no rejected policies → `all_passed`
   - Pipelines still `inProgress` after timeout → `pending`
   - No pipelines and no policies found → `no_checks`

   **IMPORTANT:** Do NOT report `all_passed` if any run has `result == "failed"`.
   Do NOT continue waiting once a failure is detected — report `some_failed`
   immediately with the failing check names.

**If PLATFORM == azdo AND AZDO_MODE == rest:**

1. **Wait for CI to start** (max 2 minutes, check every 15s)
   ```
   REPO_NAME=$(basename -s .git "$(git remote get-url origin)")
   AUTH="Authorization: Basic $(echo -n ":{PAT}" | base64)"
   BUILDS_URL="{AZDO_ORG_URL}/{AZDO_PROJECT_URL_SAFE}/_apis/build/builds?branchName=refs/heads/$BRANCH&\$top=5&api-version=7.0"

   RUNS_FOUND=false
   for i in $(seq 1 8); do
     RUN_COUNT=$(curl -s -H "$AUTH" "$BUILDS_URL" | jq '.value | length')
     if [ -n "$RUN_COUNT" ] && [ "$RUN_COUNT" != "0" ]; then
       RUNS_FOUND=true
       break
     fi
     sleep 15
   done
   ```
   If no runs appear, check PR policy evaluations via REST:
   ```
   EVALS=$(curl -s -H "$AUTH" \
     "{AZDO_ORG_URL}/{AZDO_PROJECT_URL_SAFE}/_apis/policy/evaluations?artifactId=vstfs:///CodeReview/CodeReviewId/{AZDO_PROJECT_URL_SAFE}/{PR_NUMBER}&api-version=7.0")
   EVAL_COUNT=$(echo "$EVALS" | jq '.value | length')
   ```
   If no evaluations exist either, report `no_checks`.

2. **Wait for runs to complete — with fail-fast** (max 30 minutes, check every 15s)
   ```
   for i in $(seq 1 120); do
     BUILDS_JSON=$(curl -s -H "$AUTH" "$BUILDS_URL")

     # Check for failures FIRST
     FAILED=$(echo "$BUILDS_JSON" | jq '[.value[] | select(.result=="failed")] | length')
     if [ "$FAILED" != "0" ]; then
       echo "CI failure detected — stopping wait"
       break
     fi

     # Check if anything still running
     IN_PROGRESS=$(echo "$BUILDS_JSON" | jq '[.value[] | select(.status=="inProgress")] | length')
     if [ "$IN_PROGRESS" = "0" ]; then break; fi
     sleep 15
   done
   ```

3. **Determine final status** — same mapping rules as CLI mode above.

## Output Format

CHECKS_REPORT:
- status: all_passed|some_failed|pending|no_checks
- checks:
  - name: {check name}
    status: success|failure|pending
- failing_checks: {list of failed check names, or "none"}
```

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

**Agent:** Bash (haiku)

```
Merge the pull request. Do NOT sync locally — the orchestrator handles that
via /sync after this subagent returns.
Do NOT ask the user for confirmation — proceed immediately.

Limit LAND_REPORT to 10 lines maximum.

PLATFORM: {PLATFORM}
PR_NUMBER: {PR_NUMBER}
MERGE_FLAGS: {--squash (default) | --merge if --no-squash}
BRANCH_FLAGS: {--delete-branch (default) | omit if --keep-branch}

## Steps

1. **Merge**

   **If PLATFORM == github:**
     gh pr merge {PR_NUMBER} {MERGE_FLAGS} {BRANCH_FLAGS}

   **If PLATFORM == azdo AND AZDO_MODE == cli:**
     # 1. Verify all policies pass before attempting merge
     REJECTED=$(az repos pr policy list --id {PR_NUMBER} \
       --org "{AZDO_ORG_URL}" --project "{AZDO_PROJECT}" \
       --query "[?status=='rejected'] | length(@)" -o tsv 2>/dev/null)
     if [ -n "$REJECTED" ] && [ "$REJECTED" != "0" ]; then
       echo "ERROR: $REJECTED PR policies are rejected — cannot merge"
       az repos pr policy list --id {PR_NUMBER} \
         --org "{AZDO_ORG_URL}" --project "{AZDO_PROJECT}" \
         --query "[?status=='rejected'].{name:configuration.type.displayName, status:status}" -o table
       exit 1
     fi

     # 2. Resolve merge strategy from flags
     if echo "{MERGE_FLAGS}" | grep -q "\-\-merge"; then
       SQUASH_FLAG="false"
     else
       SQUASH_FLAG="true"
     fi
     if echo "{BRANCH_FLAGS}" | grep -q "\-\-keep-branch"; then
       DELETE_FLAG="false"
     else
       DELETE_FLAG="true"
     fi

     # 3. Complete the PR
     az repos pr update --id {PR_NUMBER} --status completed \
       --org "{AZDO_ORG_URL}" --project "{AZDO_PROJECT}" \
       --squash "$SQUASH_FLAG" \
       --delete-source-branch "$DELETE_FLAG"
     MERGE_RC=$?

     # 4. If merge fails (e.g. policies still evaluating), wait and retry once
     if [ $MERGE_RC -ne 0 ]; then
       echo "Merge failed, waiting 30s for policies to finalize..."
       sleep 30
       az repos pr update --id {PR_NUMBER} --status completed \
         --org "{AZDO_ORG_URL}" --project "{AZDO_PROJECT}" \
         --squash "$SQUASH_FLAG" \
         --delete-source-branch "$DELETE_FLAG"
     fi

   **If PLATFORM == azdo AND AZDO_MODE == rest:**
     AUTH="Authorization: Basic $(echo -n ":{PAT}" | base64)"
     REPO_NAME=$(basename -s .git "$(git remote get-url origin)")
     PR_API="{AZDO_ORG_URL}/{AZDO_PROJECT_URL_SAFE}/_apis/git/repositories/$REPO_NAME/pullrequests/{PR_NUMBER}"

     # 1. Check for rejected policy evaluations
     EVALS=$(curl -s -H "$AUTH" \
       "{AZDO_ORG_URL}/{AZDO_PROJECT_URL_SAFE}/_apis/policy/evaluations?artifactId=vstfs:///CodeReview/CodeReviewId/{AZDO_PROJECT_URL_SAFE}/{PR_NUMBER}&api-version=7.0")
     REJECTED=$(echo "$EVALS" | jq '[.value[] | select(.status=="rejected")] | length')
     if [ "$REJECTED" != "0" ]; then
       echo "ERROR: PR has rejected policy evaluations — cannot merge"
       echo "$EVALS" | jq '.value[] | select(.status=="rejected") | {name: .configuration.type.displayName, status}'
       exit 1
     fi

     # 2. Resolve merge strategy from flags
     if echo "{MERGE_FLAGS}" | grep -q "\-\-merge"; then
       MERGE_STRATEGY="noFastForward"
     else
       MERGE_STRATEGY="squash"
     fi
     if echo "{BRANCH_FLAGS}" | grep -q "\-\-keep-branch"; then
       DELETE_BRANCH="false"
     else
       DELETE_BRANCH="true"
     fi

     # 3. Complete the PR
     curl -s -X PATCH -H "$AUTH" -H "Content-Type: application/json" \
       "$PR_API?api-version=7.0" \
       -d "{\"status\": \"completed\", \"completionOptions\": {\"mergeStrategy\": \"$MERGE_STRATEGY\", \"deleteSourceBranch\": $DELETE_BRANCH}}"

2. **Report**
   MERGE_COMMIT=$(git rev-parse --short HEAD)

## Output Format

LAND_REPORT:
- status: success|failed
- merge_commit: {hash}
- merge_type: squash|merge
- branch_deleted: true|false
- errors: {any errors}
```
