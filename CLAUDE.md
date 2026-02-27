# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Repository Overview

**MAD Skills** is an npm-based skill framework for Claude Code. It ships 7 skills covering the full development lifecycle — from project initialization to shipping PRs. Skills are installed via `npx @slamb2k/mad-skills` and invoked as slash commands.

## Project Structure

```
mad-skills/
├── skills/                  # Skill definitions
│   ├── build/               # Context-isolated feature dev pipeline
│   ├── forge/               # GOTCHA/FORGE project initialization
│   ├── polish/              # Repo bootstrapping (hooks, CI, templates)
│   ├── prime/               # Project context loading
│   ├── refinery/            # Web design variation generator
│   ├── ship/                # Full PR lifecycle
│   └── sync/                # Repo sync with origin/main
├── scripts/                 # Build and CI tooling
│   ├── validate-skills.js   # Structural validation
│   ├── lint-skills.js       # SKILL.md linting
│   ├── run-evals.js         # Eval runner (Anthropic/OpenRouter)
│   ├── build-manifests.js   # Generate skills/manifest.json
│   └── package-skills.js    # Package .skill archives
├── src/cli.js               # npx installer CLI
├── commands/                # Slash command stubs (one per skill)
├── hooks/                   # Session hooks (session-guard.sh)
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
| forge | Complete | GOTCHA/FORGE project initialization |
| polish | Complete | Repo bootstrapping with hooks, templates, CI |
| prime | Complete | Domain-specific project context loading |
| refinery | Complete | Multiple web design variation generator |
| ship | Complete | Full PR lifecycle (commit, merge, cleanup) |
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
├── SKILL.md              # Frontmatter (name, description) + ASCII banner
├── instructions.md       # Execution logic (max 500 lines)
├── references/           # Extracted prompts, contracts, guides
├── assets/               # Static files (templates, components)
└── tests/
    └── evals.json        # Eval test cases
```

**SKILL.md**: Frontmatter with `name`, `description`, and optional `argument-hint`. Must include an ASCII art banner that displays immediately on invocation. Max 30 lines.

**instructions.md**: The orchestration skeleton. References content from `references/` files for progressive disclosure. Max 500 lines.

**references/**: Large prompt blocks, report schemas, and guides loaded on demand by the orchestrator.

**tests/evals.json**: Eval cases with prompts and assertions for automated testing.

## CI/CD Pipelines

**ci.yml** — PR validation:
- Triggers on PRs touching `skills/`, `scripts/`, `src/`, or `package.json`
- Jobs: validate + lint, then evals (with API key guard)
- Posts eval results as PR comments

**release.yml** — Tagged releases:
- Triggers on `v*` tags
- Validates, lints, runs evals, builds manifests
- Publishes to npm with provenance
- Builds `.skill` packages for GitHub Release

## Adding New Skills

1. Create `skills/<name>/` with:
   - `SKILL.md` — Frontmatter + banner (max 30 lines)
   - `instructions.md` — Execution logic (max 500 lines)
   - `references/` — Supporting prompts and guides
   - `tests/evals.json` — Eval test cases
2. Create `commands/<name>.md` — Slash command stub
3. Run `npm run validate` and `npm run lint` to verify
4. Run `npm run eval` to test evals

## Testing

```bash
npm run validate          # Structure checks for all 7 skills
npm run lint              # SKILL.md format checks
npm run eval              # Eval assertions (requires API key)
```

Evals support both `ANTHROPIC_API_KEY` and `OPENROUTER_API_KEY` environment variables.

## Archive

Legacy v1.x skills are preserved in `archive/` for reference: play-tight, pixel-pusher, cyberarian, start-right, graphite-skill.
