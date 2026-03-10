# Scaffold Manifest

Everything brace creates, grouped by component. Phase 4 uses this as its
creation checklist. Phase 1 uses it to detect existing structure.

## Core Files

| File | Source | Description |
|------|--------|-------------|
| `CLAUDE.md` | references/claude-md-template.md | Project operating document |
| `.gitignore` | assets/gitignore-template | Standard ignores |
| `~/.claude/CLAUDE.md` | assets/global-preferences-template.md | Global preferences (conditional on install_level) |

## Specs Layer

| Path | Description |
|------|-------------|
| `specs/` | Specifications produced by `/speccy`, consumed by `/build` |

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

### tools/manifest.md
```
# Tools Manifest

Index of all tools in this project.

| Tool | Path | Description |
|------|------|-------------|

Add new tools here as they are created.
```
