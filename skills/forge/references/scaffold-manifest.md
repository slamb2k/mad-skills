# Scaffold Manifest

Everything forge creates, grouped by component. Phase 4 uses this as its
creation checklist. Phase 1 uses it to detect existing structure.

## Core Files

| File | Source | Description |
|------|--------|-------------|
| `CLAUDE.md` | references/claude-md-template.md | Project operating document |
| `.gitignore` | assets/gitignore-template | Standard ignores |
| `~/.claude/CLAUDE.md` | assets/global-preferences-template.md | Global preferences (conditional on install_level) |

## Goals Layer

| Path | Source | Description |
|------|--------|-------------|
| `goals/` | mkdir | Process definitions directory |
| `goals/manifest.md` | generated | Index of all goal workflows |
| `goals/build_app.md` | references/forge-workflow.md | FORGE build methodology |

## Tools Layer

| Path | Source | Description |
|------|--------|-------------|
| `tools/` | mkdir | Deterministic scripts directory |
| `tools/manifest.md` | generated | Index of all tools |

## Context, Hard Prompts, Args Layers

| Path | Description |
|------|-------------|
| `context/` | Reference material and domain knowledge |
| `hardprompts/` | Reusable instruction templates |
| `args/` | Behaviour settings (YAML/JSON) |

## Temp

| Path | Description |
|------|-------------|
| `.tmp/` | Scratch work (gitignored) |

## Generated Manifest Content

### goals/manifest.md
```
# Goals Manifest

Index of all goal workflows in this project.

| Goal | File | Description |
|------|------|-------------|
| Build App | build_app.md | FORGE 5-step build methodology |

Add new goals here as they are created.
```

### tools/manifest.md
```
# Tools Manifest

Index of all tools in this project.

| Tool | Path | Description |
|------|------|-------------|

Add new tools here as they are created.
```
