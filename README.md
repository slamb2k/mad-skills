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

Three methods are available. The table below shows what each delivers:

| | Plugin | npx skills | npm package |
|---|---|---|---|
| Skills (slash commands) | ✅ all 8 | ✅ all 8 | — |
| Agents (e.g. ship-analyzer) | ✅ | ❌ | — |
| Session hooks (session-guard) | ✅ | ❌ | — |
| Cross-agent (Cursor, Cline, etc.) | ❌ Claude Code only | ✅ | — |
| Selective skill install | ❌ | ✅ | — |
| Auto-updates | ✅ | ❌ | — |

### Plugin (recommended)

```
/plugin install mad-skills@slamb2k
```

Installs skills, agents, and session hooks from the GitHub repo into `~/.claude/plugins/`. Updates automatically. Claude Code only.

> **First time setup — add the marketplace (one-time):**
>
> **Option A** — CLI (outside Claude Code):
> ```bash
> claude plugin marketplace add slamb2k/mad-skills
> ```
>
> **Option B** — Manual (add to `~/.claude/settings.json`):
> ```json
> "extraKnownMarketplaces": {
>   "slamb2k": {
>     "source": { "source": "github", "repo": "slamb2k/mad-skills" }
>   }
> }
> ```
>
> Then install the plugin inside Claude Code with `/plugin install mad-skills@slamb2k`, or from the CLI with `claude plugin install mad-skills@slamb2k`.

### npx skills

```bash
npx skills add slamb2k/mad-skills -g -y              # All skills, global
npx skills add slamb2k/mad-skills --skill ship -g -y  # Specific skill
```

Installs skills into `~/.claude/skills/` (and `~/.agents/skills/` for other agents). **Does not install agents or hooks.** This means:

- `/build` falls back to `general-purpose` agent for the ship stage instead of the optimised `ship-analyzer` agent
- The session-guard hook (CLAUDE.md staleness detection, git validation) is not active

Use this method when you need cross-agent compatibility (Cursor, Cline, Amp, etc.) or want to install individual skills.

> **Note for dotfiles users:** If `~/.claude/skills/` is symlinked from a dotfiles repo, `npx skills` will create broken relative symlinks. Replace the skills directory symlink with a real directory before installing. See [dotfiles compatibility](#dotfiles-compatibility) below.

### npm package

The `@slamb2k/mad-skills` npm package is the **release artifact** — it is published on every merge to main and is used internally by the plugin system. It does not provide a CLI and cannot be used to install skills directly.

### Invoke skills

After installation, invoke skills with `/<skill-name>` (e.g., `/ship`, `/sync`).

### Upgrading from the old CLI (`npx @slamb2k/mad-skills`)

If you previously installed via the v2.0.x CLI, clean up stale artifacts first:

```bash
# Remove old command stubs
rm -f ~/.claude/commands/{brace,build,distil,prime,rig,ship,sync,speccy}.md

# Remove installer manifest and stale skill files
rm -f ~/.claude/.mad-skills-manifest.json
rm -f ~/.claude/skills/*/instructions.md
```

Then install fresh using plugin or npx skills above.

### Dotfiles compatibility

If you manage `~/.claude` via a dotfiles repo with symlinked subdirectories, `npx skills` creates relative symlinks that break when `~/.claude/skills/` is not physically located at `~/.claude/skills/`.

**Fix:** ensure `~/.claude/skills/` is a real directory (not a symlink), and do not re-symlink it from dotfiles. For custom/local skills you want in dotfiles, use per-skill absolute symlinks in your install script:

```bash
ln -sfn "$DOTFILES_DIR/skills/my-skill" "$HOME/.claude/skills/my-skill"
```

`npx skills` will leave entries it did not create untouched.

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

The `archive/` folder contains **inactive** skills, agents, hooks, and other assets from previous versions. These are kept for historical reference only — they are **not part of the mad-skills release**, not published to npm, not installed by `npx skills`, and not supported.

| Name | Description |
|------|-------------|
| play-tight | Browser Automation (v1.x) |
| pixel-pusher | UI/UX Design (v1.x) |
| cyberarian | Document Lifecycle Management (v1.x) |
| start-right | Repository Scaffolding (v1.x) |
| graphite-skill | Git/Graphite Workflows (v1.x) |
| example-skill | Scaffold template for new skills |

## License

MIT — see [LICENSE](LICENSE)
