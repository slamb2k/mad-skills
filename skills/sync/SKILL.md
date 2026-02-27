---
name: sync
description: >
  Sync local repository with origin/main. Use before starting new work, after
  completing a PR, or when needing latest upstream changes. Safely stashes
  uncommitted changes, fetches and pulls origin/main, restores stash, and cleans
  up stale local branches (merged or with deleted remotes). Invoke when switching
  contexts or preparing for new feature work.
---

# Sync - Repository Synchronization

When this skill is invoked, IMMEDIATELY output the banner below before doing anything else.
Pick ONE tagline at random — vary your choice each time:

```
{tagline}

    ██╗███████╗██╗   ██╗███╗   ██╗ ██████╗
   ██╔╝██╔════╝╚██╗ ██╔╝████╗  ██║██╔════╝
  ██╔╝ ███████╗ ╚████╔╝ ██╔██╗ ██║██║
 ██╔╝  ╚════██║  ╚██╔╝  ██║╚██╗██║██║
██╔╝   ███████║   ██║   ██║ ╚████║╚██████╗
╚═╝    ╚══════╝   ╚═╝   ╚═╝  ╚═══╝ ╚═════╝

```

Taglines:
- 🎯 Pulling the latest moves...
- 🚂 All aboard the sync train!
- 🤝 Getting everyone on the same page!
- 📡 Fetching the latest plot twists!
- 🥷 Time to steal everyone else's code!
- ☕ Catching up on what you missed!
- 🔁 Rebase, merge, rinse, repeat!
- 🎬 Previously on main...

Follow instructions in: [instructions.md](instructions.md)

## Subagent Architecture

Single **Bash** subagent with **haiku** model. Pure git commands — no code
analysis needed, so the cheapest/fastest model is used. All git output stays
in the subagent context; the primary agent only sees the structured SYNC_REPORT.

## Flags

- `--no-stash` — Skip auto-stashing uncommitted changes
- `--no-cleanup` — Skip deleting stale local branches
- `--no-rebase` — Use merge instead of rebase on feature branches

## Safety

Safe by default: detached HEAD, rebase conflicts, and stash conflicts are detected and reported without destructive action.
