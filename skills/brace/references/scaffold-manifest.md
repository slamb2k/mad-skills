# Scaffold Manifest

Everything brace creates, grouped by component. Phase 4 uses this as its
creation checklist. Phase 1 uses it to detect existing structure.

## Core Files

| File | Source | Description |
|------|--------|-------------|
| `CLAUDE.md` | references/claude-md-template.md | Project operating document |
| `.gitignore` | assets/gitignore-template | Standard ignores |
| `~/.claude/CLAUDE.md` | assets/global-preferences-template.md | Global preferences (when install_level is "global") |

## Project Directories

| Path | Description |
|------|-------------|
| `specs/` | Specifications produced by `/speccy`, consumed by `/build` |
| `context/` | Reference material and domain knowledge |
| `.tmp/` | Scratch work (gitignored) |
