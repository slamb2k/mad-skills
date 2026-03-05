# MAD Skills

![Mad Skills](assets/mad-skills.png)

A skill framework for Claude Code. Ships 8 skills covering the full development lifecycle — from project initialization to shipping PRs.

## Skills

| Skill | Command | Description |
|-------|---------|-------------|
| **build** | `/build` | Context-isolated feature development pipeline. Takes a design/plan and executes explore, question, architect, implement, review, ship inside subagents. |
| **brace** | `/brace` | Initialize projects with the GOTCHA/BRACE framework. Creates 6-layer structure, BRACE build methodology, and project CLAUDE.md. |
| **distil** | `/distil` | Generate multiple unique web design variations. Creates a Vite + React + TypeScript + Tailwind project with N designs at /1, /2, /3. |
| **prime** | `/prime` | Load project context before feature work. Supports domain-specific context (security, routing, dashboard, etc.). |
| **rig** | `/rig` | Bootstrap repos with lefthook hooks, commit templates, PR templates, and GitHub Actions workflows. Idempotent. |
| **ship** | `/ship` | Full PR lifecycle — sync with main, create branch, commit, push, create PR, wait for CI, fix issues, squash merge, cleanup. |
| **speccy** | `/speccy` | Interview-driven specification builder. Reviews code/docs, interviews through targeted questions, produces structured specs. |
| **sync** | `/sync` | Sync local repo with origin/main. Stashes changes, pulls, restores stash, cleans up stale branches. |

## Installation

### Via skills CLI (recommended)

```bash
npx skills add slamb2k/mad-skills              # All skills
npx skills add slamb2k/mad-skills --skill ship  # Specific skills
npx skills add slamb2k/mad-skills -g            # Global install
```

### As a Claude Code plugin

```
/plugin install mad-skills@slamb2k
```

The plugin method also installs agents and session hooks automatically.

### Invoke skills

After installation, invoke skills with `/<skill-name>` (e.g., `/ship`, `/sync`).

## Repository Structure

```
mad-skills/
├── skills/                  # Skill definitions (8 skills)
│   ├── build/
│   ├── brace/
│   ├── distil/
│   ├── prime/
│   ├── rig/
│   ├── ship/
│   ├── speccy/
│   └── sync/
├── scripts/                 # Build and CI tooling
│   ├── validate-skills.js   # Structural validation
│   ├── lint-skills.js       # SKILL.md linting
│   ├── run-evals.js         # Eval runner (Anthropic/OpenRouter)
│   ├── build-manifests.js   # Generate skills/manifest.json
│   └── package-skills.js    # Package .skill archives
├── hooks/                   # Session hooks + plugin hook config
├── agents/                  # Agent definitions (ship-analyzer)
├── tests/results/           # Eval output
├── archive/                 # Legacy skills (v1.x)
├── .claude-plugin/          # Plugin metadata
│   ├── marketplace.json
│   └── plugin.json
└── .github/workflows/
    ├── ci.yml               # PR validation + evals
    └── release.yml          # Tagged release → npm + GitHub
```

### Skill Structure

Each skill in `skills/<name>/` follows a standard layout:

```
skills/<name>/
├── SKILL.md              # Frontmatter + banner + execution logic (single file)
├── references/           # Extracted prompts, contracts, guides
├── assets/               # Static files (templates, components)
└── tests/
    └── evals.json        # Eval cases for the skill
```

## Development

```bash
# Validate all skill structures
npm run validate

# Lint SKILL.md files
npm run lint

# Run evals (requires ANTHROPIC_API_KEY or OPENROUTER_API_KEY)
npm run eval
npm run eval -- --verbose
npm run eval:update              # Update eval snapshots

# Build
npm run build:manifests          # Generate skills/manifest.json
npm run build:skills             # Package .skill archives
npm run build                    # Both

# Full test suite
npm test                         # validate + lint + eval
```

## CI/CD

**PR pipeline** (`.github/workflows/ci.yml`):
- Triggers on all pull requests (required status check)
- Runs validate and lint
- Runs evals when API key is available (skipped for external PRs)
- Detects which skills changed and posts eval results as PR comments

**Release pipeline** (`.github/workflows/release.yml`):
- Triggers on push to main
- Validates, lints, runs evals, builds manifests
- Auto-bumps patch version across package.json, plugin.json, marketplace.json
- Creates version tag, publishes to npm with provenance
- Builds `.skill` packages and creates a GitHub Release

## Archive

Legacy skills from v1.x are preserved in `archive/` for reference:
- play-tight (Browser Automation)
- pixel-pusher (UI/UX Design)
- cyberarian (Document Lifecycle Management)
- start-right (Repository Scaffolding)
- graphite-skill (Git/Graphite Workflows)

## License

MIT — see [LICENSE](LICENSE)
