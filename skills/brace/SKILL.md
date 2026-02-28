---
name: brace
description: >
  Initialize any project directory with the GOTCHA/BRACE framework for agentic
  AI systems. Creates the 6-layer structure (Goals, Orchestration, Tools,
  Context, Hard prompts, Args), BRACE build methodology, and a project
  CLAUDE.md. Recommends claude-mem for persistent memory. Idempotent — safe
  to run on existing projects. Triggers: "init gotcha", "setup brace", "brace",
  "initialize framework", "bootstrap gotcha".
argument-hint: [--no-brace] [--force]
---

# Brace - GOTCHA/BRACE Framework Bootstrap

When this skill is invoked, IMMEDIATELY output the banner below before doing anything else.
Pick ONE tagline at random — vary your choice each time:

```
{tagline}

    ██╗██████╗ ██████╗  █████╗  ██████╗███████╗
   ██╔╝██╔══██╗██╔══██╗██╔══██╗██╔════╝██╔════╝
  ██╔╝ ██████╔╝██████╔╝███████║██║     █████╗
 ██╔╝  ██╔══██╗██╔══██╗██╔══██║██║     ██╔══╝
██╔╝   ██████╔╝██║  ██║██║  ██║╚██████╗███████╗
╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚══════╝

```

Taglines:
- Bracing the structure...
- Reinforcing before load!
- Locking in the framework!
- Preparing for heavy lifting!
- Cross-bracing the foundation!
- Tightening the load path!
- Structural integrity confirmed!
- Brace for impact!

Follow instructions in: [instructions.md](instructions.md)

## Subagent Architecture

- Phase 1 (scan): **Bash** subagent, **haiku** model
- Phase 4 (scaffold): **general-purpose** subagent (content generation)
- Phase 5 (verify): **Bash** subagent, **haiku** model

## Flags

- `--no-brace` — Skip BRACE build methodology
- `--force` — Overwrite existing files without prompting
