# Ship Stage Prompts

Subagent prompts for each ship stage. The orchestrator reads these and
substitutes template variables before launching each subagent.

`{PLATFORM}` is either `github` or `azdo` (detected from remote URL).

---

## Stage 2: Commit, Push & Create PR

**Agent:** ship-analyzer (fallback: general-purpose)

```
Ship the following changes. Analyze the diffs, create semantic commits,
push to a feature branch, and create a pull request.

Limit SHIP_REPORT to 15 lines maximum.

PLATFORM: {PLATFORM}
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

   **If PLATFORM == azdo:**
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
       --output json

6. **Gather info**

   **If PLATFORM == github:**
     PR_URL=$(gh pr view --json url -q .url)
     PR_NUMBER=$(gh pr view --json number -q .number)

   **If PLATFORM == azdo:**
     # If az repos pr create returned JSON, parse it directly:
     PR_NUMBER=$(echo "$PR_JSON" | jq -r '.pullRequestId')
     # Otherwise list to find it:
     PR_NUMBER=$(az repos pr list --source-branch "$BRANCH" --status active --query '[0].pullRequestId' -o tsv)
     PR_URL=$(az repos pr show --id $PR_NUMBER --query 'repository.webUrl' -o tsv)/pullrequest/$PR_NUMBER

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
Monitor PR/pipeline status checks until complete.

Limit CHECKS_REPORT to 10 lines maximum.

PLATFORM: {PLATFORM}
PR_NUMBER: {PR_NUMBER}
BRANCH: {BRANCH}

## Steps

**If PLATFORM == github:**

1. **Wait for checks to complete**
   gh pr checks {PR_NUMBER} --watch

2. **Report final status**
   gh pr checks {PR_NUMBER}

**If PLATFORM == azdo:**

1. **Wait for CI to start** (pipelines may take time to trigger after PR creation)
   Poll until at least one run appears (max 2 minutes, check every 15s):
   ```
   RUNS_FOUND=false
   for i in $(seq 1 8); do
     RUN_COUNT=$(az pipelines runs list --branch "$BRANCH" --top 5 --query "length(@)" -o tsv 2>/dev/null)
     if [ -n "$RUN_COUNT" ] && [ "$RUN_COUNT" != "0" ]; then
       RUNS_FOUND=true
       break
     fi
     sleep 15
   done
   ```
   If no runs appear after 2 minutes, also check PR policy evaluations:
   ```
   az repos pr policy list --id {PR_NUMBER} --query "[].{name:configuration.type.displayName, status:status}" -o table
   ```
   If no policies exist either, report `no_checks`.

2. **Wait for runs to complete** (max 30 minutes, check every 30s)
   ```
   for i in $(seq 1 60); do
     IN_PROGRESS=$(az pipelines runs list --branch "$BRANCH" --top 5 --query "[?status=='inProgress'] | length(@)" -o tsv)
     if [ "$IN_PROGRESS" = "0" ] || [ -z "$IN_PROGRESS" ]; then break; fi
     sleep 30
   done
   ```

3. **Report final status**
   Check both pipeline runs and PR policy evaluations:
   ```
   az pipelines runs list --branch "$BRANCH" --top 5 --query "[].{name:definition.name, status:status, result:result}" -o table
   az repos pr policy list --id {PR_NUMBER} --query "[].{name:configuration.type.displayName, status:status}" -o table
   ```
   A policy status of `approved` or `queued` with no `rejected` means passed.
   A pipeline result of `succeeded` means passed; `failed` means failed.

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

   **If PLATFORM == azdo:**
     RUN_ID=$(az pipelines runs list --branch {BRANCH} --top 1 --query "[?result=='failed'].id | [0]" -o tsv)
     az pipelines runs show --id $RUN_ID --output json
     # Get timeline for detailed step failures:
     az devops invoke --area build --resource timeline \
       --route-parameters project=$(az devops configure -l --query '[?name==`project`].value' -o tsv) buildId=$RUN_ID \
       --api-version 7.0 --query "records[?result=='failed'].{name:name, log:log.url}" -o table

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
Merge the pull request and sync local {DEFAULT_BRANCH}.

Limit LAND_REPORT to 10 lines maximum.

PLATFORM: {PLATFORM}
PR_NUMBER: {PR_NUMBER}
MERGE_FLAGS: {--squash (default) | --merge if --no-squash}
BRANCH_FLAGS: {--delete-branch (default) | omit if --keep-branch}

## Steps

1. **Merge**

   **If PLATFORM == github:**
     gh pr merge {PR_NUMBER} {MERGE_FLAGS} {BRANCH_FLAGS}

   **If PLATFORM == azdo:**
     # 1. Verify all policies pass before attempting merge
     REJECTED=$(az repos pr policy list --id {PR_NUMBER} --query "[?status=='rejected'] | length(@)" -o tsv 2>/dev/null)
     if [ -n "$REJECTED" ] && [ "$REJECTED" != "0" ]; then
       echo "ERROR: $REJECTED PR policies are rejected — cannot merge"
       az repos pr policy list --id {PR_NUMBER} --query "[?status=='rejected'].{name:configuration.type.displayName, status:status}" -o table
       # Report failure
       exit 1
     fi

     # 2. Complete the PR with merge strategy
     MERGE_STRATEGY="squash"   # default; use "noFastForward" if --no-squash
     DELETE_BRANCH="true"      # default; use "false" if --keep-branch

     az repos pr update --id {PR_NUMBER} --status completed \
       --squash $( [ "$MERGE_STRATEGY" = "squash" ] && echo "true" || echo "false" ) \
       --delete-source-branch $DELETE_BRANCH

     # 3. If merge fails (e.g. policies still evaluating), wait and retry once
     if [ $? -ne 0 ]; then
       echo "Merge failed, waiting 30s for policies to finalize..."
       sleep 30
       az repos pr update --id {PR_NUMBER} --status completed \
         --squash $( [ "$MERGE_STRATEGY" = "squash" ] && echo "true" || echo "false" ) \
         --delete-source-branch $DELETE_BRANCH
     fi

2. **Sync local {DEFAULT_BRANCH}**
   git checkout {DEFAULT_BRANCH}
   git pull {REMOTE} {DEFAULT_BRANCH}

3. **Restore working state** (if there were stashed changes)
   git stash pop (only if stash exists from Stage 1)

4. **Cleanup stale branches**
   git fetch --prune
   for branch in $(git branch -vv | grep ': gone]' | awk '{print $1}'); do
     git branch -d "$branch" 2>/dev/null
   done

5. **Report**
   MERGE_COMMIT=$(git rev-parse --short HEAD)

## Output Format

LAND_REPORT:
- status: success|failed
- merge_commit: {hash}
- merge_type: squash|merge
- branch_deleted: true|false
- branches_cleaned: {list or "none"}
- errors: {any errors}
```
