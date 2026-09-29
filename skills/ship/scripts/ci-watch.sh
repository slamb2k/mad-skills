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

  # Grace period: wait for checks to register (CI may not trigger immediately).
  # A `gh` call failure (rate limit, auth, network) must not read the same as
  # "no checks registered yet" — track the two separately.
  GRACE_POLLS=0
  GRACE_JSON="[]"
  GRACE_CALL_OK=true
  for _ in $(seq 1 3); do
    GRACE_POLLS=$((GRACE_POLLS + 1))
    GRACE_ERR=$(mktemp)
    GRACE_JSON=$(gh pr checks "$PR_NUMBER" --json name,state 2>"$GRACE_ERR")
    if [ $? -eq 0 ]; then
      GRACE_CALL_OK=true
    else
      GRACE_CALL_OK=false
      GRACE_JSON="[]"
    fi
    if [ "$GRACE_JSON" != "[]" ]; then
      rm -f "$GRACE_ERR"
      break
    fi
    sleep 10
  done

  # If the last poll was a real failure (not a genuine empty result), don't
  # silently report "no_checks" — that would let /ship proceed to merge
  # believing CI hasn't started when we actually just don't know.
  if [ "$GRACE_JSON" = "[]" ] && ! $GRACE_CALL_OK; then
    STATUS="no_checks"; FAILING="none"
    CHECKS="error:checks lookup failed: $(tr '\n' ' ' <"$GRACE_ERR" | cut -c1-200)"
    rm -f "$GRACE_ERR"
    emit_report; exit 3
  fi
  rm -f "$GRACE_ERR" 2>/dev/null

  # If no checks found after grace period, report and exit
  if [ "$GRACE_JSON" = "[]" ]; then
    STATUS="no_checks"; CHECKS=""; FAILING="none"
    emit_report; exit 0
  fi

  # gh pr checks --watch blocks until done, but can return early — e.g. right
  # after a branch update while checks are still (re-)registering, or with an
  # external check (GitGuardian) still in_progress. Loop until every check is
  # terminal AND the set of check names is stable across two consecutive
  # polls, so late-registering required checks aren't read as already passed.
  WATCH_DEADLINE=$(( $(date +%s) + 1800 ))
  PREV_NAMES=""
  while :; do
    gh pr checks "$PR_NUMBER" --watch --fail-fast 2>/dev/null || true

    # Parse status. This determines whether /ship proceeds to merge —
    # a call failure here must not silently read as "[]" (which would fall
    # through to FAIL_COUNT=0 and falsely report all_passed).
    CHECKS_ERR=$(mktemp)
    CHECKS_JSON=$(gh pr checks "$PR_NUMBER" --json name,state 2>"$CHECKS_ERR")
    if [ $? -ne 0 ]; then
      STATUS="no_checks"; FAILING="none"
      CHECKS="error:checks lookup failed: $(tr '\n' ' ' <"$CHECKS_ERR" | cut -c1-200)"
      rm -f "$CHECKS_ERR"
      emit_report; exit 3
    fi
    rm -f "$CHECKS_ERR"

    PENDING_COUNT=$(echo "$CHECKS_JSON" | jq '[.[] | select(.state=="PENDING" or .state=="QUEUED" or .state=="IN_PROGRESS" or .state=="EXPECTED" or .state=="REQUESTED" or .state=="WAITING")] | length')
    CUR_NAMES=$(echo "$CHECKS_JSON" | jq -r '[.[].name] | sort | join(",")')
    if [ "${PENDING_COUNT:-0}" -eq 0 ] && [ "$CUR_NAMES" = "$PREV_NAMES" ]; then
      break
    fi
    PREV_NAMES="$CUR_NAMES"
    if [ "$(date +%s)" -ge "$WATCH_DEADLINE" ]; then
      STATUS="pending"
      CHECKS=$(echo "$CHECKS_JSON" | jq -r '.[] | "\(.name):\(.state | ascii_downcase)"' | paste -sd, -)
      FAILING="none"
      emit_report; exit 2
    fi
    sleep 10
  done

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
  # Same credential git push uses (e.g. Git Credential Manager) — see create-pr.sh
  if [ -z "$PAT" ] && [ -n "$AZDO_ORG_URL" ]; then
    PAT=$(printf 'url=%s\n\n' "$AZDO_ORG_URL" \
      | GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never git credential fill 2>/dev/null \
      | sed -n 's/^password=//p')
  fi
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
    # Check PR policies. `az repos pr policy list` does not accept --project
    # (unlike `az repos policy list` / `az pipelines runs list`, which do) —
    # passing it fails every call. A call failure must not silently read as
    # "no policies exist," which would falsely report no_checks/all_passed.
    POLICY_ERR=$(mktemp)
    POLICY_COUNT=$(az repos pr policy list --id "$PR_NUMBER" \
      --org "$AZDO_ORG_URL" \
      --query "length(@)" -o tsv 2>"$POLICY_ERR")
    if [ $? -ne 0 ]; then
      STATUS="no_checks"; FAILING="none"
      CHECKS="error:policy check failed: $(tr '\n' ' ' <"$POLICY_ERR" | cut -c1-200)"
      rm -f "$POLICY_ERR"
      emit_report; exit 3
    fi
    rm -f "$POLICY_ERR"
    if [ "$POLICY_COUNT" = "0" ] || [ -z "$POLICY_COUNT" ]; then
      STATUS="no_checks"; CHECKS=""; FAILING="none"
      emit_report; exit 0
    fi
    # Policies exist but no CI pipeline ever registered on either branch
    # pattern — CI_BRANCH was never set on this path (only inside the
    # RUNS_FOUND=true branches above), so there is nothing to poll
    # `az pipelines runs list --branch` for. Report policy status directly
    # instead of falling into the pipeline-run wait loop below with an
    # empty --branch filter.
    REJECTED=$(az repos pr policy list --id "$PR_NUMBER" \
      --org "$AZDO_ORG_URL" \
      --query "[?status=='rejected'] | length(@)" -o tsv 2>/dev/null || echo "0")
    if [ "${REJECTED:-0}" -gt 0 ]; then
      STATUS="some_failed"; CHECKS="policy:rejected"; FAILING="branch policy"
      emit_report; exit 1
    else
      STATUS="pending"; CHECKS="policy:pending"; FAILING="none"
      emit_report; exit 2
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
      --query "[?status!='completed'] | length(@)" -o tsv 2>/dev/null)
    if [ "$IN_PROGRESS" = "0" ] || [ -z "$IN_PROGRESS" ]; then break; fi
    sleep 15
  done

  # Determine final status
  RUNS_TABLE=$(az pipelines runs list --branch "$CI_BRANCH" --top 5 \
    --org "$AZDO_ORG_URL" --project "$AZDO_PROJECT" \
    --query "[].{name:definition.name, status:status, result:result}" -o json 2>/dev/null)
  if ! echo "$RUNS_TABLE" | jq -e 'type=="array"' >/dev/null 2>&1; then
    STATUS="no_checks"; FAILING="none"; CHECKS="error:az pipelines runs list failed"
    emit_report; exit 3
  fi
  CHECKS=$(echo "$RUNS_TABLE" | jq -r '.[] | "\(.name):\(.result // "pending")"' | paste -sd, -)
  FAILING=$(echo "$RUNS_TABLE" | jq -r '.[] | select(.result=="failed") | .name' | paste -sd, -)

  # Also check PR policies. Same --project caveat as above.
  POLICY_ERR2=$(mktemp)
  REJECTED=$(az repos pr policy list --id "$PR_NUMBER" \
    --org "$AZDO_ORG_URL" \
    --query "[?status=='rejected'] | length(@)" -o tsv 2>"$POLICY_ERR2")
  if [ $? -ne 0 ]; then
    STATUS="no_checks"; FAILING="none"
    CHECKS="error:policy check failed: $(tr '\n' ' ' <"$POLICY_ERR2" | cut -c1-200)"
    rm -f "$POLICY_ERR2"
    emit_report; exit 3
  fi
  rm -f "$POLICY_ERR2"

  FAIL_COUNT=$(echo "$RUNS_TABLE" | jq '[.[] | select(.result=="failed")] | length')
  STILL_RUNNING=$(echo "$RUNS_TABLE" | jq '[.[] | select(.result==null or .status!="completed")] | length')

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
  POLICY_URL="$AZDO_ORG_URL/$AZDO_PROJECT_URL_SAFE/_apis/policy/evaluations?artifactId=vstfs:///CodeReview/CodeReviewId/$AZDO_PROJECT_URL_SAFE/$PR_NUMBER&api-version=7.0"

  # GET a list endpoint into RESPONSE. Anything that isn't {"value":[...]}
  # (HTML login page, empty 401 body, {"message":"TF400813..."} error object)
  # is a failed call — never "zero builds", which would read as no_checks or
  # all_passed.
  rest_list() {
    RESPONSE=$(curl -s -H "$AUTH" "$1" 2>&1)
    if ! echo "$RESPONSE" | jq -e 'type=="object" and (.value|type=="array")' >/dev/null 2>&1; then
      local msg
      msg=$(echo "$RESPONSE" | jq -r '.message? // empty' 2>/dev/null | tr '\n' ' ' | cut -c1-200)
      STATUS="no_checks"; FAILING="none"
      CHECKS="error:${msg:-non-JSON or unexpected API response}"
      emit_report; exit 3
    fi
  }

  # Grace period: wait for CI to start (max 2 min)
  # Try PR merge ref first, then fall back to branch name
  RUNS_FOUND=false
  BUILDS_URL=""
  GRACE_POLLS=0
  for _ in $(seq 1 8); do
    GRACE_POLLS=$((GRACE_POLLS + 1))
    # Try PR merge ref first (AzDO sets sourceBranch to refs/pull/<N>/merge)
    PR_BUILDS_URL="${BUILDS_BASE}?branchName=refs/pull/$PR_NUMBER/merge&\$top=5&api-version=7.0"
    rest_list "$PR_BUILDS_URL"
    RUN_COUNT=$(echo "$RESPONSE" | jq '.value // [] | length')
    if [ -n "$RUN_COUNT" ] && [ "$RUN_COUNT" != "0" ]; then
      RUNS_FOUND=true; BUILDS_URL="$PR_BUILDS_URL"; break
    fi
    # Fallback: try branch name directly
    BRANCH_BUILDS_URL="${BUILDS_BASE}?branchName=refs/heads/$BRANCH&\$top=5&api-version=7.0"
    rest_list "$BRANCH_BUILDS_URL"
    RUN_COUNT=$(echo "$RESPONSE" | jq '.value // [] | length')
    if [ -n "$RUN_COUNT" ] && [ "$RUN_COUNT" != "0" ]; then
      RUNS_FOUND=true; BUILDS_URL="$BRANCH_BUILDS_URL"; break
    fi
    sleep 15
  done

  if [ "$RUNS_FOUND" = false ]; then
    rest_list "$POLICY_URL"
    EVAL_COUNT=$(echo "$RESPONSE" | jq '.value // [] | length')
    if [ "$EVAL_COUNT" = "0" ] || [ -z "$EVAL_COUNT" ]; then
      STATUS="no_checks"; CHECKS=""; FAILING="none"
      emit_report; exit 0
    fi
    # Policies exist but no build ever registered on either ref. Report
    # policy status directly (mirrors CLI mode) — polling an empty build list
    # would otherwise fall through to all_passed with nothing run.
    REJECTED=$(echo "$RESPONSE" | jq '[.value // [] | .[] | select(.status=="rejected")] | length')
    if [ "${REJECTED:-0}" -gt 0 ]; then
      STATUS="some_failed"; CHECKS="policy:rejected"; FAILING="branch policy"
      emit_report; exit 1
    fi
    STATUS="pending"; CHECKS="policy:pending"; FAILING="none"
    emit_report; exit 2
  fi

  # REST builds: status is notStarted|inProgress|cancelling|postponed|none
  # until "completed"; result is only set once completed. Anything not
  # completed is still running — never passed.
  REST_FAILED_FILTER='[.value // [] | .[] | select(.result=="failed" or .result=="canceled")] | length'
  REST_RUNNING_FILTER='[.value // [] | .[] | select(.status!="completed")] | length'

  # Wait for runs with fail-fast (max 30 min)
  for _ in $(seq 1 120); do
    rest_list "$BUILDS_URL"
    BUILDS_JSON="$RESPONSE"

    FAIL_COUNT=$(echo "$BUILDS_JSON" | jq "$REST_FAILED_FILTER")
    if [ "${FAIL_COUNT:-0}" -gt 0 ]; then break; fi

    IN_PROGRESS=$(echo "$BUILDS_JSON" | jq "$REST_RUNNING_FILTER")
    if [ "$IN_PROGRESS" = "0" ]; then break; fi
    sleep 15
  done

  # Final status
  rest_list "$BUILDS_URL"
  BUILDS_JSON="$RESPONSE"
  CHECKS=$(echo "$BUILDS_JSON" | jq -r '.value // [] | .[] | "\(.definition.name):\(if .status=="completed" then (.result // "unknown") else (.status // "pending") end)"' | paste -sd, -)
  FAILING=$(echo "$BUILDS_JSON" | jq -r '.value // [] | .[] | select(.result=="failed" or .result=="canceled") | .definition.name' | paste -sd, -)
  FAIL_COUNT=$(echo "$BUILDS_JSON" | jq "$REST_FAILED_FILTER")
  STILL_RUNNING=$(echo "$BUILDS_JSON" | jq "$REST_RUNNING_FILTER")

  # Check policy evaluations
  rest_list "$POLICY_URL"
  REJECTED=$(echo "$RESPONSE" | jq '[.value // [] | .[] | select(.status=="rejected")] | length')

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
