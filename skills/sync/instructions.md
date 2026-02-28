# Sync Instructions

Synchronize local repository with the remote default branch using a single
Bash subagent to isolate all git operations from the primary conversation.

## Flags

Parse optional flags from the request:
- `--no-stash`: Don't auto-stash uncommitted changes
- `--no-cleanup`: Don't delete stale local branches
- `--no-rebase`: Use merge instead of rebase when on a feature branch

---

## Pre-flight

Before starting, check all dependencies in this table:

| Dependency | Type | Check | Required | Resolution | Detail |
|-----------|------|-------|----------|------------|--------|
| git | cli | `git --version` | yes | stop | Install from https://git-scm.com |

For each row, in order:
1. Run the Check command (for cli/npm) or test file existence (for agent/skill)
2. If found: continue silently
3. If missing: apply Resolution strategy
   - **stop**: notify user with Detail, halt execution
   - **url**: notify user with Detail (install link), halt execution
   - **install**: notify user, run the command in Detail, continue if successful
   - **ask**: notify user, offer to run command in Detail, continue either way (or halt if required)
   - **fallback**: notify user with Detail, continue with degraded behavior
4. After all checks: summarize what's available and what's degraded

---

## Pre-flight Detection

Before launching the subagent, detect the remote and default branch:

```
REMOTE=$(git remote | head -1)   # usually "origin"
DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/$REMOTE/HEAD 2>/dev/null | sed 's|.*/||')
```

Fallback chain if `symbolic-ref` fails:
1. Check `git show-ref --verify refs/heads/main` → use `main`
2. Check `git show-ref --verify refs/heads/master` → use `master`
3. If neither exists, report error and stop

Pass `{REMOTE}` and `{DEFAULT_BRANCH}` into the subagent prompt.

---

## Execution

Launch a **Bash subagent** (haiku — pure git commands, no code analysis needed):

```
Task(
  subagent_type: "Bash",
  model: "haiku",
  description: "Sync repo with {DEFAULT_BRANCH}",
  prompt: <see prompt below>
)
```

### Subagent Prompt

```
Synchronize this git repository with {REMOTE}/{DEFAULT_BRANCH}. Execute the
following steps in order and report results.

Limit SYNC_REPORT to 15 lines maximum.

FLAGS: {flags from request, or "none"}

## Steps

1. **Check state**
   BRANCH=$(git branch --show-current 2>/dev/null || echo "DETACHED")
   CHANGES=$(git status --porcelain | head -20)
   Record: current_branch=$BRANCH, has_changes=(non-empty CHANGES)

   If BRANCH == "DETACHED":
     Record error: "Detached HEAD — cannot sync. Checkout a branch first."
     Skip to Output.

2. **Stash changes** (skip if --no-stash or no changes)
   If has_changes and not --no-stash:
     git stash push -m "sync-auto-stash-$(date +%Y%m%d-%H%M%S)"
     Record: stash_created=true

3. **Sync {DEFAULT_BRANCH}**
   git fetch {REMOTE}
   If BRANCH != "{DEFAULT_BRANCH}":
     git checkout {DEFAULT_BRANCH}
   git pull {REMOTE} {DEFAULT_BRANCH} --ff-only
   If pull fails (diverged):
     git pull {REMOTE} {DEFAULT_BRANCH} --rebase
   Record: main_commit=$(git rev-parse --short HEAD)
   Record: main_message=$(git log -1 --format=%s)

4. **Return to branch and update** (skip if already on {DEFAULT_BRANCH})
   If current_branch != "{DEFAULT_BRANCH}":
     git checkout $BRANCH
     If --no-rebase:
       git merge {DEFAULT_BRANCH} --no-edit
     Else:
       git rebase {DEFAULT_BRANCH}
       If rebase fails:
         git rebase --abort
         Record: rebase_status="conflict — aborted, branch unchanged"

5. **Restore stash** (if created in step 2)
   If stash_created:
     git stash pop
     If pop fails (conflict):
       Record: stash="conflict — run 'git stash show' to inspect"
     Else:
       Record: stash="restored"

6. **Cleanup branches** (skip if --no-cleanup)
   git fetch --prune

   # Delete branches whose remote is gone
   for branch in $(git branch -vv | grep ': gone]' | awk '{print $1}'); do
     if [ "$branch" != "$BRANCH" ]; then
       git branch -d "$branch" 2>/dev/null && echo "Deleted: $branch"
     fi
   done

   # Delete branches fully merged into {DEFAULT_BRANCH} (except current)
   for branch in $(git branch --merged {DEFAULT_BRANCH} | grep -v '^\*' | grep -v '{DEFAULT_BRANCH}'); do
     branch=$(echo "$branch" | xargs)
     if [ "$branch" != "$BRANCH" ] && [ -n "$branch" ]; then
       git branch -d "$branch" 2>/dev/null && echo "Deleted: $branch"
     fi
   done

   Record: branches_cleaned={list of deleted branches, or "none"}

7. **Final state**
   echo "Branch: $(git branch --show-current)"
   echo "HEAD: $(git log -1 --format='%h %s')"
   echo "Status: $(git status --short | wc -l) modified files"

## Output Format

SYNC_REPORT:
- status: success|failed
- remote: {REMOTE}
- default_branch: {DEFAULT_BRANCH}
- main_updated_to: {commit} - {message}
- current_branch: {branch}
- stash: restored|none|conflict
- rebase: success|conflict|skipped
- branches_cleaned: {list or "none"}
- errors: {any errors encountered}
```

---

## Report to User

Parse the subagent's SYNC_REPORT and present a clean summary:

```
Sync complete
  Main:    {commit} - {message}
  Branch:  {current_branch}
  Stash:   {status}
  Cleaned: {branches or "none"}
```

If errors occurred, report them clearly with suggested resolution:
- Detached HEAD → suggest `git checkout <branch>`
- Rebase conflict → suggest `git rebase {DEFAULT_BRANCH}` manually and resolve
- Stash conflict → suggest `git stash show` and `git stash pop` manually
