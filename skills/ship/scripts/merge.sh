#!/usr/bin/env bash
# merge.sh — Merge a PR on GitHub or Azure DevOps
# Usage: merge.sh <PLATFORM> <PR_NUMBER> [--squash|--merge] [--delete-branch|--keep-branch] [azdo options]
# AzDO options: --azdo-mode=cli|rest --azdo-org-url=URL --azdo-project=NAME --azdo-project-url-safe=NAME
# Env: AZURE_DEVOPS_EXT_PAT or AZDO_PAT (required for azdo rest mode)
# Exit codes: 0=merged, 1=failed, 2=failed after retry
set -uo pipefail

PLATFORM="${1:?Usage: merge.sh <PLATFORM> <PR_NUMBER> [flags]}"
PR_NUMBER="${2:?Usage: merge.sh <PLATFORM> <PR_NUMBER> [flags]}"
shift 2

SQUASH=true DELETE_BRANCH=true
AZDO_MODE="" AZDO_ORG_URL="" AZDO_PROJECT="" AZDO_PROJECT_URL_SAFE=""

for arg in "$@"; do
  case "$arg" in
    --merge)                   SQUASH=false ;;
    --squash)                  SQUASH=true ;;
    --keep-branch)             DELETE_BRANCH=false ;;
    --delete-branch)           DELETE_BRANCH=true ;;
    --azdo-mode=*)             AZDO_MODE="${arg#*=}" ;;
    --azdo-org-url=*)          AZDO_ORG_URL="${arg#*=}" ;;
    --azdo-project=*)          AZDO_PROJECT="${arg#*=}" ;;
    --azdo-project-url-safe=*) AZDO_PROJECT_URL_SAFE="${arg#*=}" ;;
  esac
done

STATUS="" MERGE_COMMIT="" MERGE_TYPE="" BRANCH_DELETED="" ERRORS="none"

emit_report() {
  echo "LAND_REPORT_BEGIN"
  echo "status=$STATUS"
  echo "merge_commit=$MERGE_COMMIT"
  echo "merge_type=$MERGE_TYPE"
  echo "branch_deleted=$BRANCH_DELETED"
  echo "errors=$ERRORS"
  echo "LAND_REPORT_END"
}

MERGE_TYPE=$( [ "$SQUASH" = true ] && echo "squash" || echo "merge" )

# ── GitHub ──────────────────────────────────────────────
if [ "$PLATFORM" = "github" ]; then
  GH_MERGE_FLAG=$( [ "$SQUASH" = true ] && echo "--squash" || echo "--merge" )
  GH_BRANCH_FLAG=$( [ "$DELETE_BRANCH" = true ] && echo "--delete-branch" || echo "" )

  if gh pr merge "$PR_NUMBER" $GH_MERGE_FLAG $GH_BRANCH_FLAG 2>/dev/null; then
    STATUS="success"
    MERGE_COMMIT=$(gh pr view "$PR_NUMBER" --json mergeCommit -q '.mergeCommit.oid' 2>/dev/null | head -c 7)
    BRANCH_DELETED=$DELETE_BRANCH
  else
    STATUS="failed"
    ERRORS="gh pr merge failed"
    BRANCH_DELETED=false
  fi
  emit_report
  [ "$STATUS" = "success" ] && exit 0 || exit 1
fi

# ── Azure DevOps ────────────────────────────────────────
PAT="${AZURE_DEVOPS_EXT_PAT:-${AZDO_PAT:-}}"
SQUASH_FLAG=$( [ "$SQUASH" = true ] && echo "true" || echo "false" )
DELETE_FLAG=$( [ "$DELETE_BRANCH" = true ] && echo "true" || echo "false" )

# ── AzDO CLI mode ──────────────────────────────────────
if [ "$AZDO_MODE" = "cli" ]; then
  # Wait for all policies to reach terminal state (approved/rejected/notApplicable)
  POLICY_TIMEOUT=20  # 20 iterations × 15 seconds = 5 minutes
  for POLICY_ITER in $(seq 1 $POLICY_TIMEOUT); do
    POLICY_JSON=$(az repos pr policy list --id "$PR_NUMBER" --org "$AZDO_ORG_URL" --project "$AZDO_PROJECT" -o json 2>/dev/null || echo "[]")

    REJECTED=$(echo "$POLICY_JSON" | jq '[.[] | select(.status=="rejected")] | length')
    PENDING=$(echo "$POLICY_JSON" | jq '[.[] | select(.status=="running" or .status=="queued" or .status=="pending")] | length')

    if [ "${REJECTED:-0}" -gt 0 ]; then
      STATUS="failed"
      ERRORS="policies rejected"
      MERGE_COMMIT=""; BRANCH_DELETED=false
      emit_report; exit 1
    fi

    if [ "${PENDING:-0}" -eq 0 ]; then
      break  # All policies terminal
    fi

    if [ "$POLICY_ITER" -eq "$POLICY_TIMEOUT" ]; then
      STATUS="failed"
      ERRORS="policies not evaluated after 5 minutes"
      MERGE_COMMIT=""; BRANCH_DELETED=false
      emit_report; exit 1
    fi

    sleep 15
  done

  # Complete the PR
  if az repos pr update --id "$PR_NUMBER" --status completed \
    --org "$AZDO_ORG_URL" --project "$AZDO_PROJECT" \
    --squash "$SQUASH_FLAG" \
    --delete-source-branch "$DELETE_FLAG" 2>/dev/null; then
    STATUS="success"
    MERGE_COMMIT=$(git rev-parse --short HEAD 2>/dev/null)
    BRANCH_DELETED=$DELETE_BRANCH
  else
    # Retry once after 30s (policies may still be evaluating)
    sleep 30
    if az repos pr update --id "$PR_NUMBER" --status completed \
      --org "$AZDO_ORG_URL" --project "$AZDO_PROJECT" \
      --squash "$SQUASH_FLAG" \
      --delete-source-branch "$DELETE_FLAG" 2>/dev/null; then
      STATUS="success"
      MERGE_COMMIT=$(git rev-parse --short HEAD 2>/dev/null)
      BRANCH_DELETED=$DELETE_BRANCH
    else
      STATUS="failed"
      ERRORS="Merge failed after retry"
      MERGE_COMMIT=""; BRANCH_DELETED=false
      emit_report; exit 2
    fi
  fi
  emit_report
  exit 0
fi

# ── AzDO REST mode ─────────────────────────────────────
if [ "$AZDO_MODE" = "rest" ]; then
  AUTH="Authorization: Basic $(echo -n ":$PAT" | base64)"
  REPO_NAME=$(basename -s .git "$(git remote get-url origin)")
  PR_API="$AZDO_ORG_URL/$AZDO_PROJECT_URL_SAFE/_apis/git/repositories/$REPO_NAME/pullrequests/$PR_NUMBER"

  # Wait for all policy evaluations to reach terminal state
  POLICY_TIMEOUT=20
  for POLICY_ITER in $(seq 1 $POLICY_TIMEOUT); do
    EVALS=$(curl -s -H "$AUTH" \
      "$AZDO_ORG_URL/$AZDO_PROJECT_URL_SAFE/_apis/policy/evaluations?artifactId=vstfs:///CodeReview/CodeReviewId/$AZDO_PROJECT_URL_SAFE/$PR_NUMBER&api-version=7.0" 2>/dev/null || echo '{"value":[]}')

    REJECTED=$(echo "$EVALS" | jq '[.value[] | select(.status=="rejected")] | length')
    PENDING=$(echo "$EVALS" | jq '[.value[] | select(.status=="running" or .status=="queued" or .status=="pending")] | length')

    if [ "${REJECTED:-0}" -gt 0 ]; then
      STATUS="failed"
      ERRORS="PR has rejected policy evaluations"
      MERGE_COMMIT=""; BRANCH_DELETED=false
      emit_report; exit 1
    fi

    if [ "${PENDING:-0}" -eq 0 ]; then
      break
    fi

    if [ "$POLICY_ITER" -eq "$POLICY_TIMEOUT" ]; then
      STATUS="failed"
      ERRORS="policies not evaluated after 5 minutes"
      MERGE_COMMIT=""; BRANCH_DELETED=false
      emit_report; exit 1
    fi

    sleep 15
  done

  # Resolve merge strategy
  MERGE_STRATEGY=$( [ "$SQUASH" = true ] && echo "squash" || echo "noFastForward" )

  # Complete the PR
  RESPONSE=$(curl -s -X PATCH -H "$AUTH" -H "Content-Type: application/json" \
    "$PR_API?api-version=7.0" \
    -d "{\"status\": \"completed\", \"completionOptions\": {\"mergeStrategy\": \"$MERGE_STRATEGY\", \"deleteSourceBranch\": $DELETE_FLAG}}")

  PR_STATUS=$(echo "$RESPONSE" | jq -r '.status // empty')
  if [ "$PR_STATUS" = "completed" ]; then
    STATUS="success"
    MERGE_COMMIT=$(echo "$RESPONSE" | jq -r '.lastMergeCommit.commitId // empty' | head -c 7)
    BRANCH_DELETED=$DELETE_BRANCH
  else
    STATUS="failed"
    ERRORS="REST merge returned status: ${PR_STATUS:-unknown}"
    MERGE_COMMIT=""; BRANCH_DELETED=false
    emit_report; exit 1
  fi
  emit_report
  exit 0
fi
