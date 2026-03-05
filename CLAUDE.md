# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Repository Overview

**MAD Skills** is a skill framework for Claude Code. It ships 8 skills covering the full development lifecycle — from project initialization to shipping PRs. Skills are installed via `npx skills add slamb2k/mad-skills` or as a Claude Code plugin, and invoked as slash commands.

## Project Structure

```
mad-skills/
├── skills/                  # Skill definitions
│   ├── build/               # Context-isolated feature dev pipeline
│   ├── brace/               # GOTCHA/BRACE project initialization
│   ├── prime/               # Project context loading
│   ├── rig/                 # Repo bootstrapping (hooks, CI, templates)
│   ├── distil/              # Web design variation generator
│   ├── ship/                # Full PR lifecycle
│   ├── speccy/              # Interview-driven spec builder
│   └── sync/                # Repo sync with origin/main
├── scripts/                 # Build and CI tooling
│   ├── validate-skills.js   # Structural validation
│   ├── lint-skills.js       # SKILL.md linting
│   ├── run-evals.js         # Eval runner (Anthropic/OpenRouter)
│   ├── build-manifests.js   # Generate skills/manifest.json
│   └── package-skills.js    # Package .skill archives
├── hooks/hooks.json         # Plugin hook definitions
├── hooks/                   # Session hooks (session-guard.sh, session-guard-prompt.sh)
├── agents/                  # Agent definitions (ship-analyzer.md)
├── tests/results/           # Eval output
├── archive/                 # Legacy v1.x skills
├── .claude-plugin/          # Plugin metadata
│   ├── marketplace.json
│   └── plugin.json
└── .github/workflows/
    ├── ci.yml               # PR validation + evals
    └── release.yml          # Tagged release → npm + GitHub
```

## Current Skills

| Skill | Status | Description |
|-------|--------|-------------|
| build | Complete | Context-isolated feature dev pipeline via subagents |
| brace | Complete | GOTCHA/BRACE project initialization |
| distil | Complete | Multiple web design variation generator |
| prime | Complete | Domain-specific project context loading |
| rig | Complete | Repo bootstrapping with hooks, templates, CI |
| ship | Complete | Full PR lifecycle (commit, merge, cleanup) |
| speccy | Complete | Interview-driven specification builder |
| sync | Complete | Repo sync with origin/main |

## Development Commands

```bash
npm run validate          # Validate all skill structures
npm run lint              # Lint SKILL.md files
npm run eval              # Run evals (needs API key)
npm run eval -- --verbose # Verbose eval output
npm run eval:update       # Update eval snapshots
npm run build:manifests   # Generate skills/manifest.json
npm run build:skills      # Package .skill archives
npm run build             # Both manifests + skills
npm test                  # validate + lint + eval
```

No build step is required for development. Scripts run directly with Node.js (>=18).

## Skill Architecture

Each skill follows the standard layout:

```
skills/<name>/
├── SKILL.md              # Frontmatter + banner + full execution logic
├── references/           # Extracted prompts, contracts, guides
├── assets/               # Static files (templates, components)
└── tests/
    └── evals.json        # Eval test cases
```

**SKILL.md**: Single entrypoint. YAML frontmatter (`name`, `description`, optional `argument-hint`, `allowed-tools`), ASCII art banner, then full orchestration logic. References content from `references/` for large prompt blocks.

**references/**: Large prompt blocks, report schemas, and guides loaded on demand.

**tests/evals.json**: Eval cases with prompts and assertions for automated testing.

## CI/CD Pipelines

**ci.yml** — PR validation:
- Triggers on all pull requests (required status check)
- Jobs: validate + lint, then evals (with API key guard)
- Posts eval results as PR comments

**release.yml** — Release on merge to main:
- Triggers on push to main
- Validates, lints, runs evals, builds manifests
- Auto-bumps patch version in package.json, plugin.json, and marketplace.json
- Creates version tag, publishes to npm, creates GitHub Release
- No manual version bumping needed — every merge to main creates a release

## Adding New Skills

1. Create `skills/<name>/` with:
   - `SKILL.md` — Frontmatter + banner + execution logic (single file)
   - `references/` — Supporting prompts and guides
   - `tests/evals.json` — Eval test cases
2. Run `npm run validate` and `npm run lint` to verify
3. Run `npm run eval` to test evals

## Testing

```bash
npm run validate          # Structure checks for all 8 skills
npm run lint              # SKILL.md format checks
npm run eval              # Eval assertions (requires API key)
```

Evals support both `ANTHROPIC_API_KEY` and `OPENROUTER_API_KEY` environment variables.

## Archive

Legacy v1.x skills are preserved in `archive/` for reference: play-tight, pixel-pusher, cyberarian, start-right, graphite-skill.
