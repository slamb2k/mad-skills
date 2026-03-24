# Azure DevOps CLI Reference for Claude Code

This document provides guidance for LLM agents constructing Azure DevOps CLI
commands. It addresses common pitfalls, inconsistent flag support across
subcommands, and REST API authentication patterns.

## Critical: `--project` Flag Is NOT Universal

The `--project` flag is **only supported by some `az devops` subcommands**.
Using it where it is not supported produces `ERROR: unrecognized arguments`.

### Commands that accept `--project`

| Command | `--project` | Notes |
|---------|------------|-------|
| `az repos pr create` | YES | Required if not configured via defaults |
| `az repos pr list` | YES | Filters by project |
| `az pipelines list` | YES | |
| `az pipelines runs list` | YES | |
| `az pipelines run` | YES | Queue a new run |
| `az repos policy list` | YES | |

### Commands that DO NOT accept `--project`

| Command | `--project` | Use instead |
|---------|------------|------------|
| `az repos pr update` | NO | `--org` only, or configure defaults |
| `az repos pr show` | NO | `--org` only, or configure defaults |
| `az devops invoke` | NO | Pass project in `--route-parameters` |

### Safe pattern

Always configure defaults at the start of a session, then omit `--project`
from commands that don't support it:

```bash
az devops configure --defaults \
  organization="$AZDO_ORG_URL" \
  project="$AZDO_PROJECT"
```

After this, commands that support `--project` will use the default, and
commands that don't (like `pr update` and `pr show`) will detect the project
from the `--org` URL or the PR ID.

For `az devops invoke`, pass the project via route parameters:

```bash
az devops invoke \
  --area build --resource timeline \
  --route-parameters buildId=12345 project="$AZDO_PROJECT" \
  --org "$AZDO_ORG_URL" -o json
```

---

## PR Merge Pattern

The correct command to squash-merge a PR:

```bash
az repos pr update \
  --id "$PR_NUMBER" \
  --status completed \
  --squash true \
  --delete-source-branch true \
  --merge-commit-message "commit message here" \
  --org "$AZDO_ORG_URL"
```

If the PR has branch policies that haven't been satisfied (e.g., no CI checks
registered, no required reviewers), add:

```bash
  --bypass-policy true \
  --bypass-policy-reason "Reason for bypass"
```

**Important:** After calling `pr update --status completed`, the merge may be
asynchronous. Poll with:

```bash
az repos pr show --id "$PR_NUMBER" --query status -o tsv --org "$AZDO_ORG_URL"
```

Expected result: `completed`. If still `active`, wait 5-10 seconds and retry.

---

## CI Pipeline Monitoring

### Branch name mismatch

Azure DevOps PR builds have `sourceBranch` set to `refs/pull/<N>/merge`, NOT
the feature branch name. When listing runs for a PR:

```bash
# WRONG — will return no results
az pipelines runs list --branch "feat/my-feature" ...

# CORRECT — match the PR merge ref
az pipelines runs list --branch "refs/pull/$PR_NUMBER/merge" \
  --org "$AZDO_ORG_URL" --project "$AZDO_PROJECT" \
  --top 1 -o json
```

Alternatively, list without branch filter and filter in `jq`:

```bash
az pipelines runs list --top 10 \
  --org "$AZDO_ORG_URL" --project "$AZDO_PROJECT" -o json \
  | jq "[.[] | select(.sourceBranch == \"refs/pull/$PR_NUMBER/merge\")]"
```

### Polling for completion

```bash
RESULT=$(az pipelines runs show --id "$RUN_ID" \
  --org "$AZDO_ORG_URL" --project "$AZDO_PROJECT" \
  --query result -o tsv)

# RESULT is one of: succeeded, failed, canceled, (empty if still running)
```

### Getting failed job details

Use the timeline API to find which jobs/steps failed:

```bash
az devops invoke \
  --area build --resource timeline \
  --route-parameters buildId="$RUN_ID" project="$AZDO_PROJECT" \
  --org "$AZDO_ORG_URL" -o json \
  | jq '[.records[] | select(.result=="failed") | {name, type}]'
```

To get log output from a failed step, extract the log URL from the timeline
record and fetch it with `curl` using PAT auth (see REST API section below).

---

## URL Formats and Org Detection

Azure DevOps has two URL formats. Both are valid, but REST API calls via
`curl` may only work with one depending on org configuration.

| Format | Example |
|--------|---------|
| Modern | `https://dev.azure.com/{ORG}/{PROJECT}/_git/{REPO}` |
| Legacy | `https://{ORG}.visualstudio.com/{PROJECT}/_git/{REPO}` |
| SSH | `{ORG}@vs-ssh.visualstudio.com:v3/{ORG}/{PROJECT}/{REPO}` |

### Preserve the original URL format

When the remote uses `visualstudio.com`, keep that format for REST API calls.
Do NOT normalize to `dev.azure.com` — some legacy organizations only respond
to the original domain.

```bash
REMOTE_URL=$(git remote get-url origin 2>/dev/null)

if echo "$REMOTE_URL" | grep -q 'dev\.azure\.com'; then
  AZDO_ORG=$(echo "$REMOTE_URL" | sed -n 's|.*dev\.azure\.com/\([^/]*\)/.*|\1|p')
  AZDO_ORG_URL="https://dev.azure.com/$AZDO_ORG"
elif echo "$REMOTE_URL" | grep -q 'visualstudio\.com'; then
  AZDO_ORG=$(echo "$REMOTE_URL" | sed -n 's|.*//\([^.]*\)\.visualstudio\.com.*|\1|p')
  # Keep the original domain for REST API compatibility
  AZDO_ORG_URL="https://${AZDO_ORG}.visualstudio.com"
fi
```

### URL-decoding project names

Project names with spaces are URL-encoded in remote URLs (e.g.,
`Velrada%20AI%20Agents`). The common `printf '%b'` approach fails when
`%20` is followed by hex characters (A-F, 0-9):

```bash
# BROKEN — fails on "Velrada%20AI%20Agents" (interprets %20A as \x20A)
AZDO_PROJECT=$(printf '%b' "${AZDO_PROJECT//%/\\x}")

# CORRECT — use Python for reliable URL decoding
AZDO_PROJECT=$(python3 -c "import urllib.parse; print(urllib.parse.unquote('$AZDO_PROJECT_URL_SAFE'))")
```

Keep both the URL-safe and decoded versions:

```bash
AZDO_PROJECT_URL_SAFE="Velrada%20AI%20Agents"  # for REST API URL paths
AZDO_PROJECT="Velrada AI Agents"                # for CLI --project flags
```

---

## REST API via `curl`

### Authentication

Use the `AZURE_DEVOPS_EXT_PAT` environment variable (this is the standard env
var that `az devops login` also reads):

```bash
TOKEN=$(printf ":%s" "$AZURE_DEVOPS_EXT_PAT" | base64 -w0)
AUTH="Authorization: Basic $TOKEN"
```

### DO NOT use `az rest` for Azure DevOps

`az rest` is designed for Azure Resource Manager (ARM) APIs. It cannot
automatically derive the correct Azure AD resource for Azure DevOps endpoints.
Even with `--resource "499b84ac-1321-427f-aa17-267ca6975798"` (the Azure DevOps
resource ID), it often fails for legacy organizations.

**Always use `curl` with PAT-based Basic auth for Azure DevOps REST APIs.**

### Common REST API patterns

```bash
# Build timeline (get failed steps)
curl -s -H "$AUTH" \
  "${AZDO_ORG_URL}/${AZDO_PROJECT_URL_SAFE}/_apis/build/builds/${BUILD_ID}/timeline?api-version=7.1"

# Build logs (get log content for a specific log ID)
curl -s -H "$AUTH" \
  "${AZDO_ORG_URL}/${AZDO_PROJECT_URL_SAFE}/_apis/build/builds/${BUILD_ID}/logs/${LOG_ID}?api-version=7.1"

# PR details
curl -s -H "$AUTH" \
  "${AZDO_ORG_URL}/${AZDO_PROJECT_URL_SAFE}/_apis/git/repositories/${REPO_NAME}/pullRequests/${PR_NUMBER}?api-version=7.1"

# Complete a PR (REST fallback)
curl -s -X PATCH -H "$AUTH" -H "Content-Type: application/json" \
  "${AZDO_ORG_URL}/${AZDO_PROJECT_URL_SAFE}/_apis/git/repositories/${REPO_NAME}/pullRequests/${PR_NUMBER}?api-version=7.1" \
  -d '{
    "status": "completed",
    "completionOptions": {
      "squashMerge": true,
      "deleteSourceBranch": true,
      "mergeCommitMessage": "commit message"
    }
  }'
```

---

## JSON Safety: Validate Before Piping to `jq`

Azure CLI commands can output warnings, error messages, or HTML instead of
JSON. Always validate before piping:

```bash
# Pattern 1: Capture output, validate, then parse
OUTPUT=$(az pipelines runs show --id "$RUN_ID" --org "$AZDO_ORG_URL" -o json 2>&1)
if echo "$OUTPUT" | jq empty 2>/dev/null; then
  echo "$OUTPUT" | jq '.result'
else
  echo "ERROR: Non-JSON response: $OUTPUT" >&2
fi

# Pattern 2: Use --output json and redirect stderr
RESULT=$(az repos pr show --id "$PR_NUMBER" --query status -o tsv 2>/dev/null)

# Pattern 3: For curl, check HTTP status
HTTP_CODE=$(curl -s -o /tmp/response.json -w "%{http_code}" -H "$AUTH" "$URL")
if [ "$HTTP_CODE" = "200" ]; then
  jq '.' /tmp/response.json
else
  echo "ERROR: HTTP $HTTP_CODE" >&2
fi
```

**Never swallow stderr with `2>/dev/null` on commands that might fail.**
Capture stderr to a variable instead:

```bash
OUTPUT=$(az repos pr update --id "$PR_NUMBER" --status completed 2>&1)
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
  echo "MERGE FAILED: $OUTPUT" >&2
fi
```

---

## Quick Reference: Common Operations

### Create PR

```bash
az repos pr create \
  --title "feat: description" \
  --description "## Summary ..." \
  --source-branch "$BRANCH" \
  --target-branch main \
  --org "$AZDO_ORG_URL" \
  --project "$AZDO_PROJECT" \
  --output json
```

### List runs for a PR

```bash
az pipelines runs list \
  --branch "refs/pull/$PR_NUMBER/merge" \
  --top 1 \
  --org "$AZDO_ORG_URL" \
  --project "$AZDO_PROJECT" \
  -o json
```

### Queue a pipeline run

```bash
az pipelines run \
  --id "$PIPELINE_ID" \
  --branch "$BRANCH" \
  --org "$AZDO_ORG_URL" \
  --project "$AZDO_PROJECT" \
  -o json
```

### Complete (merge) a PR

```bash
az repos pr update \
  --id "$PR_NUMBER" \
  --status completed \
  --squash true \
  --delete-source-branch true \
  --merge-commit-message "message" \
  --org "$AZDO_ORG_URL"
```

### Check PR status

```bash
az repos pr show \
  --id "$PR_NUMBER" \
  --query status \
  -o tsv \
  --org "$AZDO_ORG_URL"
```
