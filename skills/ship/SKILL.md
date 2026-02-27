---
name: ship
description: >
  Ship changes through the full PR lifecycle. Use after completing feature work
  to commit, push, create PR, wait for checks, and merge. Handles the entire
  workflow: syncs with main, creates feature branch if needed, groups commits
  logically with semantic messages, creates detailed PR, monitors CI, fixes
  issues, squash merges, and cleans up. Invoke when work is ready to ship.
---

# Ship - Full PR Lifecycle

When this skill is invoked, IMMEDIATELY output the banner below before doing anything else.
Pick ONE tagline at random — vary your choice each time:

```
{tagline}

    ██╗███████╗██╗  ██╗██╗██████╗
   ██╔╝██╔════╝██║  ██║██║██╔══██╗
  ██╔╝ ███████╗███████║██║██████╔╝
 ██╔╝  ╚════██║██╔══██║██║██╔═══╝
██╔╝   ███████║██║  ██║██║██║
╚═╝    ╚══════╝╚═╝  ╚═╝╚═╝╚═╝

```

Taglines:
- 🚚 Special delivery!!!
- 📦 If it compiles, it ships!
- 🚢 Anchors aweigh!
- 🙏 git push and pray!
- ⚡ Shipping faster than Amazon Prime!
- 🏀 Yeet the code into production!
- 📬 Another one for the merge queue!
- 🟢 LGTM — Let's Get This Merged!

Follow instructions in: [instructions.md](instructions.md)

## Subagent Architecture

All work runs in subagents to keep the primary conversation context clean:

| Stage | Agent Type | Model | Purpose |
|-------|-----------|-------|---------|
| Sync | Bash | haiku | Git sync (cheap, fast) |
| Ship | ship-analyzer | sonnet | Analyze code, commit, push, create PR |
| CI | Bash (background) | haiku | Poll checks without blocking |
| Fix CI | general-purpose | default | Read code, fix failures |
| Land | Bash | haiku | Merge + final sync |

The `ship-analyzer` custom agent (`~/.claude/agents/ship-analyzer.md`) reads
source files to write meaningful commit messages and PR descriptions.
Falls back to `general-purpose` if not installed.

