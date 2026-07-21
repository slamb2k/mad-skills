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
WORKTREE_MODE=false
PRIMARY=""
WORKTREE_REMOVED="none"
MAIN_SYNC=""

emit_report() {
  echo "SYNC_REPORT_BEGIN"
  echo "status=$STATUS"
  echo "remote=$REMOTE"
  echo "default_branch=$DEFAULT_BRANCH"
  echo "main_updated_to=$MAIN_UPDATED_TO"
  echo "current_branch=$CURRENT_BRANCH"
  echo "worktree_mode=$WORKTREE_MODE"
  if [ "$WORKTREE_MODE" = true ]; then
    echo "primary_path=$PRIMARY"
    echo "worktree_removed=$WORKTREE_REMOVED"
    echo "main_sync=$MAIN_SYNC"
  fi
  echo "stash=$STASH_STATUS"
  echo "rebase=$REBASE_STATUS"
  echo "branches_cleaned=$BRANCHES_CLEANED"
  echo "worktrees_skipped=$WORKTREES_SKIPPED"
  echo "errors=$ERRORS"
  echo "SYNC_REPORT_END"
  exit "$EXIT_CODE"
}

# Stash uncommitted changes (REQ-006 worktree path / Step 2 non-worktree path).
do_stash() {
  if [ "$HAS_CHANGES" = true ] && [ "$NO_STASH" = false ]; then
    if git stash push -m "sync-auto-stash-$(date +%Y%m%d-%H%M%S)" 2>/dev/null; then
      STASH_CREATED=true
    fi
  fi
}

# Rebase (or merge with --no-rebase) onto DEFAULT_BRANCH, then restore any
# stash created by do_stash. Pass "false" to skip the rebase/merge step
# (already on the default branch) while still restoring the stash.
do_rebase_and_pop() {
  local should_rebase="${1:-true}"
  if [ "$should_rebase" = true ]; then
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

  if [ "$STASH_CREATED" = true ]; then
    if git stash pop 2>/dev/null; then
      STASH_STATUS="restored"
    else
      STASH_STATUS="conflict — run 'git stash show' to inspect"
      EXIT_CODE=2
    fi
  fi
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

GIT_DIR=$(git rev-parse --git-dir 2>/dev/null)
GIT_COMMON_DIR=$(git rev-parse --git-common-dir 2>/dev/null)
[ "$GIT_DIR" != "$GIT_COMMON_DIR" ] && WORKTREE_MODE=true
if [ "$WORKTREE_MODE" = true ]; then
  PRIMARY_LINE=$(git worktree list --porcelain 2>/dev/null | grep -m1 '^worktree ')
  PRIMARY="${PRIMARY_LINE#worktree }"
fi

HAS_CHANGES=false
if [ "$WORKTREE_MODE" = true ]; then
  # Ignore our own untracked auto-worktree sentinel — it must not count as dirt.
  if [ -n "$(git status --porcelain 2>/dev/null | grep -v '^?? \.mad-skills-auto$' | head -1)" ]; then
    HAS_CHANGES=true
  fi
else
  if [ -n "$(git status --porcelain 2>/dev/null | head -1)" ]; then
    HAS_CHANGES=true
  fi
fi

PRUNED=false

if [ "$WORKTREE_MODE" = true ]; then
  # Worktree mode: sync main in the primary checkout, then clean up this
  # worktree's branch if it's finished, or rebase it in place if not.
  WT_PATH=$(git rev-parse --show-toplevel 2>/dev/null)

  git fetch "$REMOTE" 2>/dev/null

  # REQ-003: primary-side main sync — never checked out here, never stashed.
  if [ -n "$(git -C "$PRIMARY" status --porcelain 2>/dev/null | head -1)" ]; then
    MAIN_SYNC="skipped (dirty primary)"
  elif [ "$(git -C "$PRIMARY" branch --show-current 2>/dev/null)" != "$DEFAULT_BRANCH" ]; then
    MAIN_SYNC="skipped (primary not on $DEFAULT_BRANCH)"
  else
    PRIMARY_BEFORE=$(git -C "$PRIMARY" rev-parse --short HEAD 2>/dev/null)
    if git -C "$PRIMARY" pull --ff-only "$REMOTE" "$DEFAULT_BRANCH" 2>/dev/null; then
      PRIMARY_AFTER=$(git -C "$PRIMARY" rev-parse --short HEAD 2>/dev/null)
      if [ "$PRIMARY_BEFORE" = "$PRIMARY_AFTER" ]; then
        MAIN_SYNC="already up to date"
      else
        MAIN_SYNC="updated"
      fi
    else
      MAIN_SYNC="skipped (pull failed)"
      EXIT_CODE=2
    fi
  fi

  PRIMARY_TIP=$(git -C "$PRIMARY" rev-parse --short "$DEFAULT_BRANCH" 2>/dev/null)
  if [ -n "$PRIMARY_TIP" ]; then
    MAIN_UPDATED_TO="$PRIMARY_TIP - $(git -C "$PRIMARY" log -1 --format=%s "$DEFAULT_BRANCH" 2>/dev/null)"
  fi

  # Finished check needs a fresh gone-upstream view.
  git fetch --prune "$REMOTE" 2>/dev/null
  PRUNED=true

  FINISHED=false
  GONE=false
  if git branch --merged "$DEFAULT_BRANCH" --format='%(refname:short)' 2>/dev/null | grep -qxF "$BRANCH"; then
    FINISHED=true
  fi
  if git branch -vv 2>/dev/null | grep ': gone]' | sed 's/^[+*]//' | awk '{print $1}' | grep -qxF "$BRANCH"; then
    FINISHED=true
    GONE=true
  fi

  if [ "$FINISHED" = true ]; then
    if [ "$NO_CLEANUP" = true ]; then
      WORKTREE_REMOVED="none"
    elif [ "$HAS_CHANGES" = true ]; then
      # REQ-005: never stash-and-destroy a dirty worktree.
      WORKTREE_REMOVED="skipped (dirty)"
      EXIT_CODE=2
    elif ! cd "$PRIMARY" 2>/dev/null; then
      WORKTREE_REMOVED="skipped (primary unavailable)"
      EXIT_CODE=2
    else
      # An untracked sentinel blocks plain (non-force) worktree removal — back
      # it up and remove it first, restoring it if removal fails below.
      WT_SENTINEL_BACKUP=""
      if [ -f "$WT_PATH/.mad-skills-auto" ]; then
        WT_SENTINEL_BACKUP=$(cat "$WT_PATH/.mad-skills-auto" 2>/dev/null)
        rm -f "$WT_PATH/.mad-skills-auto"
      fi

      if git worktree remove "$WT_PATH" 2>/dev/null; then
        WORKTREE_REMOVED="$WT_PATH"
      elif [ ! -d "$WT_PATH" ]; then
        git worktree prune 2>/dev/null
        WORKTREE_REMOVED="$WT_PATH"
      else
        WORKTREE_REMOVED="skipped (remove failed)"
        EXIT_CODE=2
        [ -n "$WT_SENTINEL_BACKUP" ] && printf '%s\n' "$WT_SENTINEL_BACKUP" > "$WT_PATH/.mad-skills-auto"
      fi

      if [ "$WORKTREE_REMOVED" = "$WT_PATH" ]; then
        if git branch -d "$BRANCH" 2>/dev/null; then
          BRANCHES_CLEANED="$BRANCH"
        elif [ "$GONE" = true ] && git branch -D "$BRANCH" 2>/dev/null; then
          # AC-003 sanctioned exception: squash-merged commits aren't
          # ancestors of default, so -d refuses; safe here because the
          # remote already deleted this exact branch and its worktree is
          # already gone.
          BRANCHES_CLEANED="$BRANCH"
        fi
        CURRENT_BRANCH="$DEFAULT_BRANCH"
      fi
    fi
  else
    # REQ-006: unfinished branch — today's behavior, scoped to the worktree.
    do_stash
    do_rebase_and_pop
  fi
else
  # Step 2: Stash changes
  do_stash

  # Step 3: Sync default branch
  git fetch "$REMOTE" 2>/dev/null

  if [ "$BRANCH" != "$DEFAULT_BRANCH" ]; then
    if ! git checkout "$DEFAULT_BRANCH" 2>/dev/null; then
      STATUS="failed"
      ERRORS="Failed to checkout $DEFAULT_BRANCH"
      EXIT_CODE=1
      [ "$STASH_CREATED" = true ] && git stash pop 2>/dev/null
      emit_report
    fi
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

  # Step 4: Return to branch, rebase, and restore stash
  if [ "$BRANCH" != "$DEFAULT_BRANCH" ]; then
    git checkout "$BRANCH" 2>/dev/null
    do_rebase_and_pop
  else
    do_rebase_and_pop false
  fi

  CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)
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
  [ "$PRUNED" = true ] || git fetch --prune 2>/dev/null

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
    SWEPT=$(IFS=,; echo "${CLEANED[*]}")
    if [ "$BRANCHES_CLEANED" = "none" ]; then
      BRANCHES_CLEANED="$SWEPT"
    else
      BRANCHES_CLEANED="$BRANCHES_CLEANED,$SWEPT"
    fi
  fi
  if [ ${#SKIPPED[@]} -gt 0 ]; then
    WORKTREES_SKIPPED=$(IFS=';'; echo "${SKIPPED[*]}")
  fi
fi

emit_report
