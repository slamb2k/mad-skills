---
name: forge
description: >
  Initialize any project directory with the GOTCHA/FORGE framework for agentic
  AI systems. Creates the 6-layer structure (Goals, Orchestration, Tools,
  Context, Hard prompts, Args), FORGE build methodology, and a project
  CLAUDE.md. Recommends claude-mem for persistent memory. Idempotent — safe
  to run on existing projects. Triggers: "init gotcha", "setup forge", "forge",
  "initialize framework", "bootstrap gotcha".
argument-hint: [--no-forge] [--force]
---

# Forge - GOTCHA/FORGE Framework Bootstrap

When this skill is invoked, IMMEDIATELY output the banner below before doing anything else.
Pick ONE tagline at random — vary your choice each time:

```
{tagline}

    ██╗███████╗ ██████╗ ██████╗  ██████╗ ███████╗
   ██╔╝██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝
  ██╔╝ █████╗  ██║   ██║██████╔╝██║  ███╗█████╗
 ██╔╝  ██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝
██╔╝   ██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗
╚═╝    ╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝

```

Taglines:
- 🔥 Firing up the forge...
- ⚒️ Hammer meets anvil!
- 🔥 The forge burns bright!
- ⚒️ Shaping raw ideas into steel!
- 🔥 Stoking the flames of creation!
- ⛏️ From ore to architecture!
- 🔥 Heat, hammer, shape, temper!
- ⚒️ Forging something extraordinary...

Follow instructions in: [instructions.md](instructions.md)

## Subagent Architecture

- Phase 1 (scan): **Bash** subagent, **haiku** model
- Phase 4 (scaffold): **general-purpose** subagent (content generation)
- Phase 5 (verify): **Bash** subagent, **haiku** model

## Flags

- `--no-forge` — Skip FORGE build methodology
- `--force` — Overwrite existing files without prompting
