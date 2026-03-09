# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Repository Overview

**MAD Skills** is a skill framework for Claude Code. It ships 10 skills covering the full development lifecycle — from project initialization to shipping PRs. Skills are installed via `npx skills add slamb2k/mad-skills` or as a Claude Code plugin, and invoked as slash commands.

## Project Structure

```
mad-skills/
├── skills/                  # Skill definitions
│   ├── build/               # Context-isolated feature dev pipeline
│   ├── brace/               # GOTCHA/BRACE project initialization
│   ├── prime/               # Project context loading
│   ├── rig/                 # Repo bootstrapping (hooks, CI, templates)
│   ├── distil/              # Web design variation generator
│   ├── dock/                # Container release pipelines
│   ├── keel/                # Infrastructure as Code pipelines
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
├── hooks/                   # Session guard (Node.js)
│   ├── session-guard.cjs    # Entry point (check/remind subcommands)
│   └── lib/                 # Modular components (banner, config, git-checks, etc.)
├── agents/                  # Agent definitions (ship-analyzer.md)
├── tests/results/           # Eval output
├── archive/                 # Legacy v1.x skills
├── .claude-plugin/          # Plugin metadata
│   ├── marketplace.json
│   └── plugin.json
└── .github/workflows/
    └── ci.yml               # PR validation, evals, release (unified)
```

## Current Skills

| Skill | Status | Description |
|-------|--------|-------------|
| build | Complete | Context-isolated feature dev pipeline via subagents |
| brace | Complete | GOTCHA/BRACE project initialization |
| distil | Complete | Multiple web design variation generator |
| dock | Complete | Container release pipelines (build once, promote everywhere) |
| keel | Complete | Infrastructure as Code pipelines (Terraform, Bicep, Pulumi) |
| prime | Complete | Domain-specific project context loading |
| rig | Complete | Repo bootstrapping with hooks, templates, CI |
| ship | Complete | Full PR lifecycle (commit, merge, cleanup) |
| speccy | Complete | Interview-driven specification builder |
| sync | Complete | Repo sync with origin/main |

## Skill Lifecycle

Skills are designed to run in a specific order. Each skill produces artifacts that downstream skills consume.

```
/brace → /rig → /speccy → /build → /ship → /keel → /dock
 init    tools   spec      code    merge   infra   deploy
```

| Phase | Skills | Produces |
|-------|--------|----------|
| Setup | `/brace` → `/rig` | CLAUDE.md, project skeleton, CI workflows, hooks |
| Develop | `/speccy` → `/build` → `/ship` | Specs, feature code, merged PRs |
| Deploy | `/keel` → `/dock` | IaC files + pipeline, Dockerfile + deploy pipeline |

Key integration points:
- `/keel` outputs (registry URL, endpoints) feed into `/dock` pipelines as CI/CD variables
- `/rig` detects `/keel` and `/dock` artifacts and wires CI triggers
- `/ship` merge triggers both IaC apply (`/keel`) and container deploy (`/dock`)
- `/dock` never rebuilds on promotion — it retags the tested image from `main`

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

## CI/CD Pipeline

**ci.yml** — Unified CI and release workflow:
- **On pull requests:** validate + lint, then evals (with API key guard), posts eval results as PR comments
- **On push to main (non-release commits):** validates, bumps patch version, creates auto-merge PR
- **On push to main (release commits):** creates version tag, publishes to npm with provenance, builds `.skill` packages, creates GitHub Release
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
npm run validate          # Structure checks for all 10 skills
npm run lint              # SKILL.md format checks
npm run eval              # Eval assertions (requires API key)
```

Evals support both `ANTHROPIC_API_KEY` and `OPENROUTER_API_KEY` environment variables.

## Archive

The `archive/` folder contains **inactive** skills, agents, hooks, and other assets kept for historical reference only. They are **not part of the mad-skills release** — excluded from npm (`package.json` `files`), not installed by `npx skills`, and not supported. Do not treat anything in `archive/` as current or usable.

Contents: play-tight, pixel-pusher, cyberarian, start-right, graphite-skill, example-skill.
