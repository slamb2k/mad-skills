#!/usr/bin/env bash
# sync.sh — Deterministic repo sync with origin/default-branch
# Usage: sync.sh <REMOTE> <DEFAULT_BRANCH> [--no-stash] [--no-cleanup] [--no-rebase]
# Output: Key-value SYNC_REPORT between BEGIN/END markers on stdout
# Exit codes: 0=success, 1=fatal, 2=partial (conflict warnings)
set -uo pipefail

REMOTE="${1:?Usage: sync.sh <REMOTE> <DEFAULT_BRANCH> [flags]}"
DEFAULT_BRANCH="${2:?Usage: sync.sh <REMOTE> <DEFAULT_BRANCH> [flags]}"
shift 2

NO_STASH=false; NO_CLEANUP=false; NO_REBASE=false
for arg in "$@"; do
  case "$arg" in
    --no-stash)   NO_STASH=true ;;
    --no-cleanup) NO_CLEANUP=true ;;
    --no-rebase)  NO_REBASE=true ;;
  esac
done

# Report fields
STATUS="success"
MAIN_UPDATED_TO=""
CURRENT_BRANCH=""
STASH_STATUS="none"
REBASE_STATUS="skipped"
BRANCHES_CLEANED="none"
WORKTREES_SKIPPED="none"
ERRORS="none"
STASH_CREATED=false
EXIT_CODE=0

emit_report() {
  echo "SYNC_REPORT_BEGIN"
  echo "status=$STATUS"
  echo "remote=$REMOTE"
  echo "default_branch=$DEFAULT_BRANCH"
  echo "main_updated_to=$MAIN_UPDATED_TO"
  echo "current_branch=$CURRENT_BRANCH"
  echo "stash=$STASH_STATUS"
  echo "rebase=$REBASE_STATUS"
  echo "branches_cleaned=$BRANCHES_CLEANED"
  echo "worktrees_skipped=$WORKTREES_SKIPPED"
  echo "errors=$ERRORS"
  echo "SYNC_REPORT_END"
  exit "$EXIT_CODE"
}

# Step 1: Check state
BRANCH=$(git branch --show-current 2>/dev/null || echo "DETACHED")
CURRENT_BRANCH="$BRANCH"

if [ "$BRANCH" = "DETACHED" ]; then
  STATUS="failed"
  ERRORS="Detached HEAD — cannot sync. Checkout a branch first."
  EXIT_CODE=1
  emit_report
fi

HAS_CHANGES=false
if [ -n "$(git status --porcelain 2>/dev/null | head -1)" ]; then
  HAS_CHANGES=true
fi

# Step 2: Stash changes
if [ "$HAS_CHANGES" = true ] && [ "$NO_STASH" = false ]; then
  if git stash push -m "sync-auto-stash-$(date +%Y%m%d-%H%M%S)" 2>/dev/null; then
    STASH_CREATED=true
  fi
fi

# Step 3: Sync default branch
git fetch "$REMOTE" 2>/dev/null

if [ "$BRANCH" != "$DEFAULT_BRANCH" ]; then
  git checkout "$DEFAULT_BRANCH" 2>/dev/null
fi

if ! git pull "$REMOTE" "$DEFAULT_BRANCH" --ff-only 2>/dev/null; then
  if ! git pull "$REMOTE" "$DEFAULT_BRANCH" --rebase 2>/dev/null; then
    STATUS="failed"
    ERRORS="Failed to pull $REMOTE/$DEFAULT_BRANCH"
    EXIT_CODE=1
    # Try to get back to original branch
    [ "$BRANCH" != "$DEFAULT_BRANCH" ] && git checkout "$BRANCH" 2>/dev/null
    # Restore stash if we created one
    [ "$STASH_CREATED" = true ] && git stash pop 2>/dev/null
    emit_report
  fi
fi

MAIN_COMMIT=$(git rev-parse --short HEAD 2>/dev/null)
MAIN_MESSAGE=$(git log -1 --format=%s 2>/dev/null)
MAIN_UPDATED_TO="$MAIN_COMMIT - $MAIN_MESSAGE"

# Step 4: Return to branch and update
if [ "$BRANCH" != "$DEFAULT_BRANCH" ]; then
  git checkout "$BRANCH" 2>/dev/null

  if [ "$NO_REBASE" = true ]; then
    if ! git merge "$DEFAULT_BRANCH" --no-edit 2>/dev/null; then
      REBASE_STATUS="conflict — merge aborted"
      EXIT_CODE=2
    else
      REBASE_STATUS="success"
    fi
  else
    if ! git rebase "$DEFAULT_BRANCH" 2>/dev/null; then
      git rebase --abort 2>/dev/null
      REBASE_STATUS="conflict — aborted, branch unchanged"
      EXIT_CODE=2
    else
      REBASE_STATUS="success"
    fi
  fi
fi

CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)

# Step 5: Restore stash
if [ "$STASH_CREATED" = true ]; then
  if git stash pop 2>/dev/null; then
    STASH_STATUS="restored"
  else
    STASH_STATUS="conflict — run 'git stash show' to inspect"
    EXIT_CODE=2
  fi
fi

# Print the worktree path a branch is checked out in, if any.
worktree_path_for_branch() {
  local target="$1" wt=""
  while IFS= read -r line; do
    case "$line" in
      "worktree "*) wt="${line#worktree }" ;;
      "branch refs/heads/$target")
        echo "$wt"; return 0 ;;
    esac
  done < <(git worktree list --porcelain 2>/dev/null)
  return 1
}

# Ensure a branch flagged for deletion is free of its worktree first.
# Returns 0 if safe to delete, 1 if it must be skipped (dirty --auto worktree).
prepare_branch_for_delete() {
  local branch="$1" wt
  wt=$(worktree_path_for_branch "$branch") || return 0
  [ -f "$wt/.mad-skills-auto" ] || return 0
  # Dirty if anything other than our own untracked sentinel is present.
  if [ -n "$(git -C "$wt" status --porcelain 2>/dev/null | grep -v '^?? \.mad-skills-auto$')" ]; then
    SKIPPED+=("$branch: worktree has uncommitted changes")
    return 1
  fi
  # Remove our sentinel first so a plain (non-force) worktree removal succeeds,
  # keeping its content so it can be restored if removal fails below.
  local sentinel_backup
  sentinel_backup=$(cat "$wt/.mad-skills-auto" 2>/dev/null)
  rm -f "$wt/.mad-skills-auto"
  if git worktree remove "$wt" 2>/dev/null; then
    return 0
  fi
  # Removal failed (lock, race, etc.) — restore the sentinel so this worktree
  # is still recognized as an auto worktree and retried on the next /sync.
  printf '%s\n' "$sentinel_backup" > "$wt/.mad-skills-auto"
  SKIPPED+=("$branch: worktree removal failed")
  return 1
}

# Step 6: Cleanup branches
if [ "$NO_CLEANUP" = false ]; then
  git fetch --prune 2>/dev/null

  CLEANED=()
  SKIPPED=()

  # Delete branches whose remote is gone
  while IFS= read -r b; do
    [ -z "$b" ] && continue
    [ "$b" = "$CURRENT_BRANCH" ] && continue
    prepare_branch_for_delete "$b" || continue
    if git branch -d "$b" 2>/dev/null; then
      CLEANED+=("$b")
    fi
  done < <(git branch -vv 2>/dev/null | grep ': gone]' | sed 's/^[+*]//' | awk '{print $1}')

  # Delete branches fully merged into default branch
  while IFS= read -r b; do
    b=$(echo "$b" | xargs)
    [ -z "$b" ] && continue
    [ "$b" = "$CURRENT_BRANCH" ] && continue
    prepare_branch_for_delete "$b" || continue
    if git branch -d "$b" 2>/dev/null; then
      CLEANED+=("$b")
    fi
  done < <(git branch --merged "$DEFAULT_BRANCH" --format='%(refname:short)' 2>/dev/null | grep -vxF "$DEFAULT_BRANCH")

  if [ ${#CLEANED[@]} -gt 0 ]; then
    BRANCHES_CLEANED=$(IFS=,; echo "${CLEANED[*]}")
  fi
  if [ ${#SKIPPED[@]} -gt 0 ]; then
    WORKTREES_SKIPPED=$(IFS=';'; echo "${SKIPPED[*]}")
  fi
fi

emit_report
