#!/usr/bin/env bash
# create-pr.sh — Create (or reuse) a PR on GitHub or Azure DevOps
# Usage: create-pr.sh <PLATFORM> <TITLE> <BODY_FILE> <SOURCE_BRANCH> [--draft] [--target-branch=BRANCH] [--remote=NAME] [azdo options]
# AzDO options: --azdo-mode=cli|rest --azdo-org-url=URL --azdo-project=NAME --azdo-project-url-safe=NAME
# Env: AZURE_DEVOPS_EXT_PAT or AZDO_PAT (required for azdo rest mode)
# BODY_FILE must contain the PR body/description text (authored by the caller).
# If --target-branch is omitted, the repo's default branch is auto-detected.
# Idempotent: reuses an existing open PR on SOURCE_BRANCH instead of creating a duplicate.
# Exit codes: 0=success (created or reused), 1=failed
set -uo pipefail

PLATFORM="${1:?Usage: create-pr.sh <PLATFORM> <TITLE> <BODY_FILE> <SOURCE_BRANCH> [flags]}"
TITLE="${2:?Usage: create-pr.sh <PLATFORM> <TITLE> <BODY_FILE> <SOURCE_BRANCH> [flags]}"
BODY_FILE="${3:?Usage: create-pr.sh <PLATFORM> <TITLE> <BODY_FILE> <SOURCE_BRANCH> [flags]}"
SOURCE_BRANCH="${4:?Usage: create-pr.sh <PLATFORM> <TITLE> <BODY_FILE> <SOURCE_BRANCH> [flags]}"
shift 4

DRAFT=false
TARGET_BRANCH="" REMOTE=""
AZDO_MODE="" AZDO_ORG_URL="" AZDO_PROJECT="" AZDO_PROJECT_URL_SAFE=""

for arg in "$@"; do
  case "$arg" in
    --draft)                   DRAFT=true ;;
    --target-branch=*)         TARGET_BRANCH="${arg#*=}" ;;
    --remote=*)                REMOTE="${arg#*=}" ;;
    --azdo-mode=*)             AZDO_MODE="${arg#*=}" ;;
    --azdo-org-url=*)          AZDO_ORG_URL="${arg#*=}" ;;
    --azdo-project=*)          AZDO_PROJECT="${arg#*=}" ;;
    --azdo-project-url-safe=*) AZDO_PROJECT_URL_SAFE="${arg#*=}" ;;
  esac
done

STATUS="" PR_URL="" PR_NUMBER="" REUSED="false" ERRORS="none"

emit_report() {
  echo "PR_REPORT_BEGIN"
  echo "status=$STATUS"
  echo "pr_url=$PR_URL"
  echo "pr_number=$PR_NUMBER"
  echo "reused=$REUSED"
  echo "errors=$ERRORS"
  echo "PR_REPORT_END"
}

if [ ! -f "$BODY_FILE" ]; then
  STATUS="failed"
  ERRORS="body file not found: $BODY_FILE"
  emit_report
  exit 1
fi

# ── Resolve target branch (auto-detect default branch if not given) ────
[ -z "$REMOTE" ] && REMOTE=$(git remote | head -1)

if [ -z "$TARGET_BRANCH" ]; then
  TARGET_BRANCH=$(git symbolic-ref "refs/remotes/$REMOTE/HEAD" 2>/dev/null | sed 's|.*/||')
fi
if [ -z "$TARGET_BRANCH" ] && git show-ref --verify --quiet refs/heads/main; then
  TARGET_BRANCH="main"
fi
if [ -z "$TARGET_BRANCH" ] && git show-ref --verify --quiet refs/heads/master; then
  TARGET_BRANCH="master"
fi
if [ -z "$TARGET_BRANCH" ]; then
  STATUS="failed"
  ERRORS="could not determine default branch; pass --target-branch="
  emit_report
  exit 1
fi

DRAFT_JSON=$( [ "$DRAFT" = true ] && echo "true" || echo "false" )

# ── GitHub ──────────────────────────────────────────────
if [ "$PLATFORM" = "github" ]; then
  LIST_ERR=$(mktemp)
  EXISTING_JSON=$(gh pr list --head "$SOURCE_BRANCH" --state open --json number,url 2>"$LIST_ERR")
  if [ $? -ne 0 ]; then
    STATUS="failed"
    ERRORS="gh pr list failed: $(tr '\n' ' ' <"$LIST_ERR" | cut -c1-200)"
    rm -f "$LIST_ERR"
    emit_report
    exit 1
  fi
  rm -f "$LIST_ERR"

  EXISTING_COUNT=$(echo "$EXISTING_JSON" | jq 'length' 2>/dev/null || echo 0)
  if [ "${EXISTING_COUNT:-0}" -gt 0 ]; then
    STATUS="success"
    REUSED="true"
    PR_NUMBER=$(echo "$EXISTING_JSON" | jq -r '.[0].number')
    PR_URL=$(echo "$EXISTING_JSON" | jq -r '.[0].url')
    emit_report
    exit 0
  fi

  GH_DRAFT_FLAG=$( [ "$DRAFT" = true ] && echo "--draft" || echo "" )
  CREATE_ERR=$(mktemp)
  CREATE_OUT=$(gh pr create --title "$TITLE" --body-file "$BODY_FILE" --head "$SOURCE_BRANCH" --base "$TARGET_BRANCH" $GH_DRAFT_FLAG 2>"$CREATE_ERR")
  if [ $? -eq 0 ]; then
    # gh pr create prints the PR URL as the last line of stdout on success.
    PR_URL=$(echo "$CREATE_OUT" | tail -1 | tr -d '[:space:]')
    PR_NUMBER=$(echo "$PR_URL" | grep -oE '[0-9]+$')
    if [ -n "$PR_URL" ] && [ -n "$PR_NUMBER" ]; then
      STATUS="success"
    else
      STATUS="failed"
      ERRORS="gh pr create succeeded but PR URL could not be parsed from output"
    fi
  else
    STATUS="failed"
    ERRORS="gh pr create failed: $(tr '\n' ' ' <"$CREATE_ERR" | cut -c1-200)"
  fi
  rm -f "$CREATE_ERR"
  emit_report
  [ "$STATUS" = "success" ] && exit 0 || exit 1
fi

# ── Azure DevOps ────────────────────────────────────────
PAT="${AZURE_DEVOPS_EXT_PAT:-${AZDO_PAT:-}}"

# No PAT in env: ask git for the credential it uses to push to this remote
# (e.g. Git Credential Manager). Never prompts.
resolve_pat() {
  [ -n "$PAT" ] && return 0
  local url
  url=$(git remote get-url "$REMOTE" 2>/dev/null)
  [ -z "$url" ] && url="$AZDO_ORG_URL"
  [ -z "$url" ] && return 1
  PAT=$(printf 'url=%s\n\n' "$url" \
    | GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never git credential fill 2>/dev/null \
    | sed -n 's/^password=//p')
  [ -n "$PAT" ]
}

# AzDO caps PR descriptions at 4000 characters — a longer body is a 400.
AZDO_DESC_MAX=4000
DESCRIPTION=$(jq -Rrs --argjson max "$AZDO_DESC_MAX" \
  'if length > $max then .[0:($max - 100)] + "\n\n…(description truncated to fit Azure DevOps 4000-character limit)" else . end' \
  <"$BODY_FILE")

# ── AzDO CLI mode ──────────────────────────────────────
if [ "$AZDO_MODE" = "cli" ]; then
  LIST_ERR=$(mktemp)
  EXISTING_JSON=$(az repos pr list --source-branch "$SOURCE_BRANCH" --status active \
    --org "$AZDO_ORG_URL" --project "$AZDO_PROJECT" -o json 2>"$LIST_ERR")
  if [ $? -ne 0 ]; then
    STATUS="failed"
    ERRORS="az repos pr list failed: $(tr '\n' ' ' <"$LIST_ERR" | cut -c1-200)"
    rm -f "$LIST_ERR"
    emit_report
    exit 1
  fi
  rm -f "$LIST_ERR"

  REPO_NAME=$(basename -s .git "$(git remote get-url "$REMOTE")")
  EXISTING_COUNT=$(echo "$EXISTING_JSON" | jq 'length' 2>/dev/null || echo 0)
  if [ "${EXISTING_COUNT:-0}" -gt 0 ]; then
    STATUS="success"
    REUSED="true"
    PR_NUMBER=$(echo "$EXISTING_JSON" | jq -r '.[0].pullRequestId')
    PR_URL="$AZDO_ORG_URL/$AZDO_PROJECT_URL_SAFE/_git/$REPO_NAME/pullrequest/$PR_NUMBER"
    emit_report
    exit 0
  fi

  CREATE_ERR=$(mktemp)
  CREATE_JSON=$(az repos pr create \
    --title "$TITLE" \
    --description "$DESCRIPTION" \
    --source-branch "$SOURCE_BRANCH" \
    --target-branch "$TARGET_BRANCH" \
    --org "$AZDO_ORG_URL" --project "$AZDO_PROJECT" \
    --draft "$DRAFT_JSON" \
    --output json 2>"$CREATE_ERR")
  if [ $? -eq 0 ]; then
    STATUS="success"
    PR_NUMBER=$(echo "$CREATE_JSON" | jq -r '.pullRequestId')
    PR_URL="$AZDO_ORG_URL/$AZDO_PROJECT_URL_SAFE/_git/$REPO_NAME/pullrequest/$PR_NUMBER"
  else
    STATUS="failed"
    ERRORS="az repos pr create failed: $(tr '\n' ' ' <"$CREATE_ERR" | cut -c1-200)"
  fi
  # `az repos pr create` can 403 (TF400813) on an auth path git push doesn't
  # share. Fall back to REST with the same credential git push uses.
  if [ "$STATUS" = "failed" ] \
    && grep -qiE 'TF400813|(^|[^[:alnum:]])(401|403)([^[:alnum:]]|$)|unauthori[sz]ed|not authori[sz]ed|forbidden' "$CREATE_ERR" \
    && resolve_pat; then
    echo "az repos pr create auth failure — falling back to REST API" >&2
    STATUS="" ERRORS="none"
    AZDO_MODE="rest"
  fi
  rm -f "$CREATE_ERR"
  if [ "$AZDO_MODE" = "cli" ]; then
    emit_report
    [ "$STATUS" = "success" ] && exit 0 || exit 1
  fi
fi

# ── AzDO REST mode ─────────────────────────────────────
if [ "$AZDO_MODE" = "rest" ]; then
  resolve_pat
  AUTH="Authorization: Basic $(printf ":%s" "$PAT" | base64 | tr -d '\n')"
  REPO_NAME=$(basename -s .git "$(git remote get-url "$REMOTE")")
  PR_API="$AZDO_ORG_URL/$AZDO_PROJECT_URL_SAFE/_apis/git/repositories/$REPO_NAME/pullrequests"

  LIST_RESPONSE=$(curl -s -H "$AUTH" \
    "$PR_API?searchCriteria.sourceRefName=refs/heads/$SOURCE_BRANCH&searchCriteria.status=active&api-version=7.0" 2>&1)
  if ! echo "$LIST_RESPONSE" | jq -e 'type=="object" and (.value|type=="array")' >/dev/null 2>&1; then
    STATUS="failed"
    ERRORS="REST pr list failed: $( (echo "$LIST_RESPONSE" | jq -r '.message? // "unexpected response"' 2>/dev/null || echo "non-JSON response") | tr '\n' ' ' | cut -c1-200)"
    emit_report
    exit 1
  fi

  EXISTING_COUNT=$(echo "$LIST_RESPONSE" | jq '.value // [] | length')
  if [ "${EXISTING_COUNT:-0}" -gt 0 ]; then
    STATUS="success"
    REUSED="true"
    PR_NUMBER=$(echo "$LIST_RESPONSE" | jq -r '.value[0].pullRequestId')
    PR_URL="$AZDO_ORG_URL/$AZDO_PROJECT_URL_SAFE/_git/$REPO_NAME/pullrequest/$PR_NUMBER"
    emit_report
    exit 0
  fi

  CREATE_PAYLOAD=$(jq -n \
    --arg src "refs/heads/$SOURCE_BRANCH" \
    --arg tgt "refs/heads/$TARGET_BRANCH" \
    --arg title "$TITLE" \
    --arg desc "$DESCRIPTION" \
    --argjson draft "$DRAFT_JSON" \
    '{sourceRefName:$src, targetRefName:$tgt, title:$title, description:$desc, isDraft:$draft}')

  CREATE_RESPONSE=$(curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
    "$PR_API?api-version=7.0" -d "$CREATE_PAYLOAD" 2>&1)
  if ! echo "$CREATE_RESPONSE" | jq empty 2>/dev/null; then
    STATUS="failed"
    ERRORS="REST pr create returned non-JSON response"
    emit_report
    exit 1
  fi

  PR_NUMBER=$(echo "$CREATE_RESPONSE" | jq -r '.pullRequestId // empty')
  if [ -n "$PR_NUMBER" ]; then
    STATUS="success"
    PR_URL="$AZDO_ORG_URL/$AZDO_PROJECT_URL_SAFE/_git/$REPO_NAME/pullrequest/$PR_NUMBER"
  else
    ERR_MSG=$(echo "$CREATE_RESPONSE" | jq -r '.message // "unknown error"')
    STATUS="failed"
    ERRORS="REST pr create failed: $(echo "$ERR_MSG" | cut -c1-200)"
  fi
  emit_report
  [ "$STATUS" = "success" ] && exit 0 || exit 1
fi

STATUS="failed"
ERRORS="unknown platform/mode: PLATFORM=$PLATFORM AZDO_MODE=$AZDO_MODE"
emit_report
exit 1
