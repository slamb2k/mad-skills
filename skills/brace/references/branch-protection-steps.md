# Branch Protection Steps

Procedural reference for Phase 6 — platform-specific branch protection commands.

---

## Platform Detection

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

---

## GitHub

### Check existing protection

```bash
gh api repos/{owner}/{repo}/branches/{default_branch}/protection
```
404 = unprotected.

### Apply protection

```bash
gh api repos/{owner}/{repo}/branches/{default_branch}/protection \
  -X PUT -f required_pull_request_reviews='{"required_approving_review_count":1}' \
  -f enforce_admins=false \
  -f restrictions=null \
  -f required_status_checks=null \
  -F allow_force_pushes=false \
  -F allow_deletions=false
```

---

## Azure DevOps

### Extract org and project

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
  AZDO_ORG_URL="https://${AZDO_ORG}.visualstudio.com"
fi
# URL-decode for CLI/display; keep URL-safe versions for REST API paths
AZDO_PROJECT_URL_SAFE="$AZDO_PROJECT"
AZDO_ORG=$(python3 -c "import urllib.parse; print(urllib.parse.unquote('$AZDO_ORG'))")
AZDO_PROJECT=$(python3 -c "import urllib.parse; print(urllib.parse.unquote('$AZDO_PROJECT_URL_SAFE'))")
REPO_NAME=$(basename -s .git "$REMOTE_URL")
```

If org/project extraction fails, report ⚠️ and skip branch policies.

### Check existing policies

**CLI:**
```bash
az repos policy list \
  --org "$AZDO_ORG_URL" --project "$AZDO_PROJECT" \
  --repository-id "$REPO_NAME" --branch "$default_branch" \
  --query "[].type.displayName" -o tsv
```

**REST fallback:**
```bash
AUTH="Authorization: Basic $(printf ":%s" "$PAT" | base64 | tr -d '\n')"
# Get repository ID first
REPO_ID=$(curl -s -H "$AUTH" \
  "$AZDO_ORG_URL/$AZDO_PROJECT_URL_SAFE/_apis/git/repositories/$REPO_NAME?api-version=7.0" \
  | jq -r '.id')
# List branch policies
curl -s -H "$AUTH" \
  "$AZDO_ORG_URL/$AZDO_PROJECT_URL_SAFE/_apis/policy/configurations?api-version=7.0" \
  | jq "[.value[] | select(.settings.scope[]?.refName == \"refs/heads/$default_branch\" and .settings.scope[]?.repositoryId == \"$REPO_ID\")]"
```

### Create minimum reviewer policy

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
  "$AZDO_ORG_URL/$AZDO_PROJECT_URL_SAFE/_apis/policy/configurations?api-version=7.0" \
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
