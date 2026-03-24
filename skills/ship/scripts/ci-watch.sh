#!/usr/bin/env bash
# ci-watch.sh — Poll CI/pipeline checks until complete with fail-fast
# Usage: ci-watch.sh <PLATFORM> <PR_NUMBER> <BRANCH> [azdo options]
# AzDO options: --azdo-mode=cli|rest --azdo-org-url=URL --azdo-project=NAME --azdo-project-url-safe=NAME
# Env: AZURE_DEVOPS_EXT_PAT or AZDO_PAT (required for azdo rest mode)
# Exit codes: 0=all_passed/no_checks, 1=some_failed, 2=pending (timeout), 3=tool error
set -uo pipefail

PLATFORM="${1:?Usage: ci-watch.sh <PLATFORM> <PR_NUMBER> <BRANCH>}"
PR_NUMBER="${2:?Usage: ci-watch.sh <PLATFORM> <PR_NUMBER> <BRANCH>}"
BRANCH="${3:?Usage: ci-watch.sh <PLATFORM> <PR_NUMBER> <BRANCH>}"
shift 3

AZDO_MODE="" AZDO_ORG_URL="" AZDO_PROJECT="" AZDO_PROJECT_URL_SAFE=""
for arg in "$@"; do
  case "$arg" in
    --azdo-mode=*)             AZDO_MODE="${arg#*=}" ;;
    --azdo-org-url=*)          AZDO_ORG_URL="${arg#*=}" ;;
    --azdo-project=*)          AZDO_PROJECT="${arg#*=}" ;;
    --azdo-project-url-safe=*) AZDO_PROJECT_URL_SAFE="${arg#*=}" ;;
  esac
done

STATUS="" CHECKS="" FAILING=""
GRACE_POLLS=0

emit_report() {
  echo "CHECKS_REPORT_BEGIN"
  echo "status=$STATUS"
  echo "checks=$CHECKS"
  echo "failing_checks=${FAILING:-none}"
  echo "grace_period_polls=$GRACE_POLLS"
  echo "CHECKS_REPORT_END"
}

# ── GitHub ──────────────────────────────────────────────
if [ "$PLATFORM" = "github" ]; then
  if ! command -v gh &>/dev/null; then
    STATUS="no_checks"; FAILING="none"
    emit_report; exit 3
  fi

  # Grace period: wait for checks to register (CI may not trigger immediately)
  GRACE_POLLS=0
  GRACE_JSON="[]"
  for _ in $(seq 1 3); do
    GRACE_POLLS=$((GRACE_POLLS + 1))
    GRACE_JSON=$(gh pr checks "$PR_NUMBER" --json name,state 2>/dev/null || echo "[]")
    if [ "$GRACE_JSON" != "[]" ]; then
      break
    fi
    sleep 10
  done

  # If no checks found after grace period, report and exit
  if [ "$GRACE_JSON" = "[]" ]; then
    STATUS="no_checks"; CHECKS=""; FAILING="none"
    emit_report; exit 0
  fi

  # gh pr checks --watch blocks until done; --fail-fast stops on first failure
  gh pr checks "$PR_NUMBER" --watch --fail-fast 2>/dev/null || true

  # Parse final status
  CHECKS_JSON=$(gh pr checks "$PR_NUMBER" --json name,state 2>/dev/null || echo "[]")

  FAIL_COUNT=$(echo "$CHECKS_JSON" | jq '[.[] | select(.state=="FAILURE")] | length')
  CHECKS=$(echo "$CHECKS_JSON" | jq -r '.[] | "\(.name):\(.state | ascii_downcase)"' | paste -sd, -)
  FAILING=$(echo "$CHECKS_JSON" | jq -r '.[] | select(.state=="FAILURE") | .name' | paste -sd, -)

  if [ "${FAIL_COUNT:-0}" -gt 0 ]; then
    STATUS="some_failed"
    emit_report; exit 1
  else
    STATUS="all_passed"; FAILING="none"
    emit_report; exit 0
  fi
fi

# ── Azure DevOps ────────────────────────────────────────

# Resolve PAT for REST mode
PAT="${AZURE_DEVOPS_EXT_PAT:-${AZDO_PAT:-}}"
AUTH=""
if [ "$AZDO_MODE" = "rest" ]; then
  if [ -z "$PAT" ]; then
    STATUS="no_checks"; FAILING="none"
    CHECKS="error:no PAT configured"
    emit_report; exit 3
  fi
  AUTH="Authorization: Basic $(printf ":%s" "$PAT" | base64 | tr -d '\n')"
fi

# ── AzDO CLI mode ──────────────────────────────────────
if [ "$AZDO_MODE" = "cli" ]; then
  # Grace period: wait for CI to start (max 2 min)
  # Try PR merge ref first, then fall back to branch name
  RUNS_FOUND=false
  CI_BRANCH=""
  GRACE_POLLS=0
  for _ in $(seq 1 8); do
    GRACE_POLLS=$((GRACE_POLLS + 1))
    # Try PR merge ref first (AzDO sets sourceBranch to refs/pull/<N>/merge)
    RUN_COUNT=$(az pipelines runs list --branch "refs/pull/$PR_NUMBER/merge" --top 5 \
      --org "$AZDO_ORG_URL" --project "$AZDO_PROJECT" \
      --query "length(@)" -o tsv 2>/dev/null)
    if [ -n "$RUN_COUNT" ] && [ "$RUN_COUNT" != "0" ]; then
      RUNS_FOUND=true; CI_BRANCH="refs/pull/$PR_NUMBER/merge"; break
    fi
    # Fallback: try branch name directly
    RUN_COUNT=$(az pipelines runs list --branch "$BRANCH" --top 5 \
      --org "$AZDO_ORG_URL" --project "$AZDO_PROJECT" \
      --query "length(@)" -o tsv 2>/dev/null)
    if [ -n "$RUN_COUNT" ] && [ "$RUN_COUNT" != "0" ]; then
      RUNS_FOUND=true; CI_BRANCH="$BRANCH"; break
    fi
    sleep 15
  done

  if [ "$RUNS_FOUND" = false ]; then
    # Check PR policies
    POLICY_COUNT=$(az repos pr policy list --id "$PR_NUMBER" \
      --org "$AZDO_ORG_URL" --project "$AZDO_PROJECT" \
      --query "length(@)" -o tsv 2>/dev/null || echo "0")
    if [ "$POLICY_COUNT" = "0" ] || [ -z "$POLICY_COUNT" ]; then
      STATUS="no_checks"; CHECKS=""; FAILING="none"
      emit_report; exit 0
    fi
  fi

  # Wait for runs to complete with fail-fast (max 30 min)
  for _ in $(seq 1 120); do
    FAILED=$(az pipelines runs list --branch "$CI_BRANCH" --top 5 \
      --org "$AZDO_ORG_URL" --project "$AZDO_PROJECT" \
      --query "[?result=='failed'] | length(@)" -o tsv 2>/dev/null)
    if [ -n "$FAILED" ] && [ "$FAILED" != "0" ]; then
      break
    fi

    IN_PROGRESS=$(az pipelines runs list --branch "$CI_BRANCH" --top 5 \
      --org "$AZDO_ORG_URL" --project "$AZDO_PROJECT" \
      --query "[?status=='inProgress'] | length(@)" -o tsv 2>/dev/null)
    if [ "$IN_PROGRESS" = "0" ] || [ -z "$IN_PROGRESS" ]; then break; fi
    sleep 15
  done

  # Determine final status
  RUNS_TABLE=$(az pipelines runs list --branch "$CI_BRANCH" --top 5 \
    --org "$AZDO_ORG_URL" --project "$AZDO_PROJECT" \
    --query "[].{name:definition.name, result:result}" -o json 2>/dev/null || echo "[]")
  CHECKS=$(echo "$RUNS_TABLE" | jq -r '.[] | "\(.name):\(.result // "pending")"' | paste -sd, -)
  FAILING=$(echo "$RUNS_TABLE" | jq -r '.[] | select(.result=="failed") | .name' | paste -sd, -)

  # Also check PR policies
  REJECTED=$(az repos pr policy list --id "$PR_NUMBER" \
    --org "$AZDO_ORG_URL" --project "$AZDO_PROJECT" \
    --query "[?status=='rejected'] | length(@)" -o tsv 2>/dev/null || echo "0")

  FAIL_COUNT=$(echo "$RUNS_TABLE" | jq '[.[] | select(.result=="failed")] | length')
  STILL_RUNNING=$(echo "$RUNS_TABLE" | jq '[.[] | select(.result==null)] | length')

  if [ "${FAIL_COUNT:-0}" -gt 0 ] || [ "${REJECTED:-0}" -gt 0 ]; then
    STATUS="some_failed"
    emit_report; exit 1
  elif [ "${STILL_RUNNING:-0}" -gt 0 ]; then
    STATUS="pending"; FAILING="none"
    emit_report; exit 2
  else
    STATUS="all_passed"; FAILING="none"
    emit_report; exit 0
  fi
fi

# ── AzDO REST mode ─────────────────────────────────────
if [ "$AZDO_MODE" = "rest" ]; then
  BUILDS_BASE="$AZDO_ORG_URL/$AZDO_PROJECT_URL_SAFE/_apis/build/builds"

  # Grace period: wait for CI to start (max 2 min)
  # Try PR merge ref first, then fall back to branch name
  RUNS_FOUND=false
  BUILDS_URL=""
  GRACE_POLLS=0
  for _ in $(seq 1 8); do
    GRACE_POLLS=$((GRACE_POLLS + 1))
    # Try PR merge ref first (AzDO sets sourceBranch to refs/pull/<N>/merge)
    PR_BUILDS_URL="${BUILDS_BASE}?branchName=refs/pull/$PR_NUMBER/merge&\$top=5&api-version=7.0"
    RESPONSE=$(curl -s -H "$AUTH" "$PR_BUILDS_URL" 2>&1)
    if ! echo "$RESPONSE" | jq empty 2>/dev/null; then
      STATUS="no_checks"; FAILING="none"; CHECKS="error:non-JSON API response"
      emit_report; exit 3
    fi
    RUN_COUNT=$(echo "$RESPONSE" | jq '.value | length')
    if [ -n "$RUN_COUNT" ] && [ "$RUN_COUNT" != "0" ]; then
      RUNS_FOUND=true; BUILDS_URL="$PR_BUILDS_URL"; break
    fi
    # Fallback: try branch name directly
    BRANCH_BUILDS_URL="${BUILDS_BASE}?branchName=refs/heads/$BRANCH&\$top=5&api-version=7.0"
    RESPONSE=$(curl -s -H "$AUTH" "$BRANCH_BUILDS_URL" 2>&1)
    if ! echo "$RESPONSE" | jq empty 2>/dev/null; then
      STATUS="no_checks"; FAILING="none"; CHECKS="error:non-JSON API response"
      emit_report; exit 3
    fi
    RUN_COUNT=$(echo "$RESPONSE" | jq '.value | length')
    if [ -n "$RUN_COUNT" ] && [ "$RUN_COUNT" != "0" ]; then
      RUNS_FOUND=true; BUILDS_URL="$BRANCH_BUILDS_URL"; break
    fi
    sleep 15
  done

  if [ "$RUNS_FOUND" = false ]; then
    RESPONSE=$(curl -s -H "$AUTH" \
      "$AZDO_ORG_URL/$AZDO_PROJECT_URL_SAFE/_apis/policy/evaluations?artifactId=vstfs:///CodeReview/CodeReviewId/$AZDO_PROJECT_URL_SAFE/$PR_NUMBER&api-version=7.0" 2>&1)
    if ! echo "$RESPONSE" | jq empty 2>/dev/null; then
      STATUS="no_checks"; FAILING="none"; CHECKS="error:non-JSON API response"
      emit_report; exit 3
    fi
    EVAL_COUNT=$(echo "$RESPONSE" | jq '.value | length')
    if [ "$EVAL_COUNT" = "0" ] || [ -z "$EVAL_COUNT" ]; then
      STATUS="no_checks"; CHECKS=""; FAILING="none"
      emit_report; exit 0
    fi
    # Default BUILDS_URL for subsequent polling if policies exist but no runs yet
    BUILDS_URL="${BUILDS_BASE}?branchName=refs/pull/$PR_NUMBER/merge&\$top=5&api-version=7.0"
  fi

  # Wait for runs with fail-fast (max 30 min)
  for _ in $(seq 1 120); do
    RESPONSE=$(curl -s -H "$AUTH" "$BUILDS_URL" 2>&1)
    if ! echo "$RESPONSE" | jq empty 2>/dev/null; then
      STATUS="no_checks"; FAILING="none"; CHECKS="error:non-JSON API response"
      emit_report; exit 3
    fi
    BUILDS_JSON="$RESPONSE"

    FAIL_COUNT=$(echo "$BUILDS_JSON" | jq '[.value[] | select(.result=="failed")] | length')
    if [ "${FAIL_COUNT:-0}" -gt 0 ]; then break; fi

    IN_PROGRESS=$(echo "$BUILDS_JSON" | jq '[.value[] | select(.status=="inProgress")] | length')
    if [ "$IN_PROGRESS" = "0" ]; then break; fi
    sleep 15
  done

  # Final status
  RESPONSE=$(curl -s -H "$AUTH" "$BUILDS_URL" 2>&1)
  if ! echo "$RESPONSE" | jq empty 2>/dev/null; then
    STATUS="no_checks"; FAILING="none"; CHECKS="error:non-JSON API response"
    emit_report; exit 3
  fi
  BUILDS_JSON="$RESPONSE"
  CHECKS=$(echo "$BUILDS_JSON" | jq -r '.value[] | "\(.definition.name):\(.result // "pending")"' | paste -sd, -)
  FAILING=$(echo "$BUILDS_JSON" | jq -r '.value[] | select(.result=="failed") | .definition.name' | paste -sd, -)
  FAIL_COUNT=$(echo "$BUILDS_JSON" | jq '[.value[] | select(.result=="failed")] | length')
  STILL_RUNNING=$(echo "$BUILDS_JSON" | jq '[.value[] | select(.status=="inProgress")] | length')

  # Check policy evaluations
  RESPONSE=$(curl -s -H "$AUTH" \
    "$AZDO_ORG_URL/$AZDO_PROJECT_URL_SAFE/_apis/policy/evaluations?artifactId=vstfs:///CodeReview/CodeReviewId/$AZDO_PROJECT_URL_SAFE/$PR_NUMBER&api-version=7.0" 2>&1)
  if ! echo "$RESPONSE" | jq empty 2>/dev/null; then
    REJECTED="0"
  else
    REJECTED=$(echo "$RESPONSE" | jq '[.value[] | select(.status=="rejected")] | length')
  fi

  if [ "${FAIL_COUNT:-0}" -gt 0 ] || [ "${REJECTED:-0}" -gt 0 ]; then
    STATUS="some_failed"
    emit_report; exit 1
  elif [ "${STILL_RUNNING:-0}" -gt 0 ]; then
    STATUS="pending"; FAILING="none"
    emit_report; exit 2
  else
    STATUS="all_passed"; FAILING="none"
    emit_report; exit 0
  fi
fi
