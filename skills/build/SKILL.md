---
name: build
description: >
  Context-isolated feature development pipeline. Takes a detailed design/plan
  as argument and executes the full feature-dev lifecycle (explore, question,
  architect, implement, review, ship) inside subagents so the primary
  conversation stays compact. Use when you have a well-defined plan and want
  autonomous execution with minimal context window consumption.
argument-hint: Detailed design/plan to implement
---

# Build - Context-Isolated Feature Development

When this skill is invoked, IMMEDIATELY output the banner below before doing anything else.
Pick ONE tagline at random — vary your choice each time.
CRITICAL: Reproduce the banner EXACTLY character-for-character. The first line of the art has 4 leading spaces — you MUST preserve them.

```
{tagline}

⠀   ██╗██████╗ ██╗   ██╗██╗██╗     ██████╗
   ██╔╝██╔══██╗██║   ██║██║██║     ██╔══██╗
  ██╔╝ ██████╔╝██║   ██║██║██║     ██║  ██║
 ██╔╝  ██╔══██╗██║   ██║██║██║     ██║  ██║
██╔╝   ██████╔╝╚██████╔╝██║███████╗██████╔╝
╚═╝    ╚═════╝  ╚═════╝ ╚═╝╚══════╝╚═════╝
```

Taglines:
- ⚙️ Compiling hopes and dreams...
- 🏗️ Bob the Builder has entered the chat!
- 🤖 Assembling the Voltron of code!
- 🏭 Feature factory: ONLINE
- ☕ Hold my coffee, I'm building!
- 📦 Some assembly required...
- 🧱 Bricks, mortar, and semicolons!
- 🏎️ Let's see what this baby can do!

Follow instructions in: [instructions.md](instructions.md)

Architecture, agent types, and report budgets are documented in `references/`.

## Flags

- `--skip-questions`: Skip clarifying questions (plan is fully specified)
- `--skip-review`: Skip code review stage
- `--no-ship`: Stop after docs update (don't commit/push/PR)
- `--parallel-impl`: Allow parallel implementation agents
