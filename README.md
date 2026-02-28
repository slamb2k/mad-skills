# MAD Skills

![Mad Skills](assets/mad-skills.png)

An npm-based skill framework for Claude Code. Ships 7 skills covering the full development lifecycle — from project initialization to shipping PRs.

## Skills

| Skill | Command | Description |
|-------|---------|-------------|
| **build** | `/build` | Context-isolated feature development pipeline. Takes a design/plan and executes explore, question, architect, implement, review, ship inside subagents. |
| **brace** | `/brace` | Initialize projects with the GOTCHA/BRACE framework. Creates 6-layer structure, BRACE build methodology, and project CLAUDE.md. |
| **distil** | `/distil` | Generate multiple unique web design variations. Creates a Vite + React + TypeScript + Tailwind project with N designs at /1, /2, /3. |
| **prime** | `/prime` | Load project context before feature work. Supports domain-specific context (security, routing, dashboard, etc.). |
| **rig** | `/rig` | Bootstrap repos with lefthook hooks, commit templates, PR templates, and GitHub Actions workflows. Idempotent. |
| **ship** | `/ship` | Full PR lifecycle — sync with main, create branch, commit, push, create PR, wait for CI, fix issues, squash merge, cleanup. |
| **sync** | `/sync` | Sync local repo with origin/main. Stashes changes, pulls, restores stash, cleans up stale branches. |

## Installation

```bash
# Install globally
npm install -g @slamb2k/mad-skills

# Or run directly with npx
npx @slamb2k/mad-skills --list             # List available skills
npx @slamb2k/mad-skills                    # Install all skills
npx @slamb2k/mad-skills --skill ship,sync  # Install specific skills
```

Skills are installed as slash commands in your Claude Code environment. After installation, invoke them with `/<skill-name>` (e.g., `/ship`, `/sync`).

## Repository Structure

```
mad-skills/
├── skills/                  # Skill definitions (7 skills)
│   ├── build/
│   ├── brace/
│   ├── distil/
│   ├── prime/
│   ├── rig/
│   ├── ship/
│   └── sync/
├── scripts/                 # Build and CI tooling
│   ├── validate-skills.js   # Structural validation
│   ├── lint-skills.js       # SKILL.md linting
│   ├── run-evals.js         # Eval runner (Anthropic/OpenRouter)
│   ├── build-manifests.js   # Generate skills/manifest.json
│   └── package-skills.js    # Package .skill archives
├── src/
│   └── cli.js               # npx installer CLI
├── commands/                # Slash command stubs
├── hooks/                   # Session hooks (session-guard)
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
├── SKILL.md              # Frontmatter (name, description) + banner
├── instructions.md       # Execution logic (max 500 lines)
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
- Creates version tag from package.json, publishes to npm with provenance
- Builds `.skill` packages and creates a GitHub Release
- Skips publish if the version tag already exists

## Archive

Legacy skills from v1.x are preserved in `archive/` for reference:
- play-tight (Browser Automation)
- pixel-pusher (UI/UX Design)
- cyberarian (Document Lifecycle Management)
- start-right (Repository Scaffolding)
- graphite-skill (Git/Graphite Workflows)

## License

MIT — see [LICENSE](LICENSE)
