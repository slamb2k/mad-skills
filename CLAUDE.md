# CLAUDE.md

## Skill Usage Guide

MAD Skills provides 10 skills covering the full development lifecycle. When this
plugin is installed, use these skills proactively — don't wait for the user to
invoke them by name if the situation clearly calls for one.

### When to Use Each Skill

| Situation | Skill | Example Invocation |
|-----------|-------|--------------------|
| Starting a new project or directory | `/brace` | `/brace` or `/brace --force` |
| Bootstrapping repo tooling (hooks, CI, templates) | `/rig` | `/rig` or `/rig --skip-system-check` |
| Need project context before significant work | `/prime` | `/prime` or `/prime auth,api` |
| Designing a feature or system that needs a spec | `/speccy` | `/speccy user authentication with OAuth` |
| Implementing a feature from a plan or spec | `/build` | `/build specs/auth.md` or `/build <detailed plan>` |
| Shipping completed work (commit, PR, merge) | `/ship` | `/ship` or `/ship --pr-only` |
| Syncing with origin/main or cleaning up branches | `/sync` | `/sync` or `/sync --no-cleanup` |
| Provisioning cloud infrastructure (IaC) | `/keel` | `/keel` or `/keel --tool terraform` |
| Setting up container deployment pipelines | `/dock` | `/dock` or `/dock --skip-interview` |
| Generating web design variations | `/distil` | `/distil 3 --port 5173` |

### Lifecycle Ordering

Skills produce artifacts that downstream skills consume. The recommended order:

```
/brace → /rig → /speccy → specs/ → /build → /ship → /keel → /dock
 init    tools   spec    artifact   code    merge   infra   deploy
```

- **Setup:** `/brace` creates project structure, `/rig` adds hooks + CI
- **Develop:** `/speccy` designs features, `/build` implements them, `/ship` merges PRs
- **Deploy:** `/keel` provisions infrastructure, `/dock` deploys containers to it
- **Utility:** `/sync` keeps your branch current, `/prime` loads project context

### Proactive Skill Suggestions

Suggest or invoke these skills when you observe:
- User says "let's start" or creates an empty directory → `/brace`
- User asks about CI, hooks, linting, or repo setup → `/rig`
- User describes a feature that needs planning → `/speccy`
- User has a plan/spec and wants to implement → `/build`
- User says "ship it", "create a PR", or work is complete → `/ship`
- User mentions infrastructure, cloud, Terraform, Bicep → `/keel`
- User mentions Docker, deployment, containers, pipelines → `/dock`
- User needs latest from main or wants to clean branches → `/sync`
- User is about to do significant work and needs context → `/prime`
- User wants to explore design directions for a web UI → `/distil`

### Cross-Skill Integration

Skills call each other where it makes sense:
- `/ship` invokes `/sync` after merging to sync the local repo
- `/build` and `/speccy` invoke `/prime` to load project context first
- `/dock`, `/keel`, and `/rig` invoke `/sync` before scanning to avoid stale state
- `/keel` outputs feed into `/dock` pipelines (registry URLs, compute endpoints)
- `/build` invokes `/ship` at the end to merge the completed feature
- `/speccy` writes specs to `specs/`, `/build` reads them via file path detection
  (e.g., `/build specs/user-auth.md` reads the file as its plan)

### Output Formatting

All skills follow these visual conventions for user-facing output.

**Input display** — immediately after the banner, show parsed arguments:
```
┌─ Input ────────────────────────────────────────
│  {Field}:  {value}
│  Flags:    {parsed flags or "none"}
└────────────────────────────────────────────────
```

**Pre-flight** — show dependency check results:
```
── Pre-flight ───────────────────────────────────
  ✅ {dep}           {version or "found"}
  ⚠️ {dep}           not found → {fallback detail}
  ❌ {dep}           missing → {resolution}
──────────────────────────────────────────────────
```

**Stage headers** — for each major phase/stage:
```
━━ {N} · {Stage Name} ━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Status icons:** ✅ done · ❌ failed · ⚠️ degraded · ⏳ working · ⏭️ skipped

**Final report** — box format with emoji section headers and clickable links:
```
┌─ {Skill} · Report ─────────────────────────────
│
│  ✅ {Skill} complete
│
│  {key metrics}
│
│  📝 {Details}
│     • item 1
│     • item 2
│
│  📊 {Stats}
│
│  🔗 Links
│     {clickable URLs to PRs, runs, files}
│
│  ⚡ Next steps
│     1. {actionable step}
│
└─────────────────────────────────────────────────
```

### Platform Support

Skills auto-detect the hosting platform from the git remote URL and adapt
their behavior accordingly. Both GitHub and Azure DevOps are first-class:

| Capability | GitHub | Azure DevOps |
|-----------|--------|--------------|
| Platform detection | `github.com` in remote | `dev.azure.com` / `visualstudio.com` in remote |
| CLI tooling | `gh` | `az devops` (falls back to REST API with PAT) |
| CI templates | GitHub Actions | Azure Pipelines |
| Container registry | ghcr.io | Azure Container Registry |
| Secrets management | GitHub Secrets | Azure Key Vault |
| Branch protection | Branch protection rules | Branch policies |
| PR workflow | `gh pr create/merge` | `az repos pr create` / REST API |

Skills that are platform-aware: `/ship`, `/brace`, `/rig`, `/dock`, `/keel`.
Skills that are platform-agnostic: `/sync`, `/prime`, `/speccy`, `/build`, `/distil`.

### Script-Based Execution

Deterministic stages (sync, CI polling, merge) use bundled bash scripts in
`skills/<name>/scripts/` — no LLM needed. LLM subagents (general-purpose,
Explore, feature-dev:code-explorer/architect/reviewer) are only used for
stages that require reasoning: commit/PR authoring, CI fix analysis, and
code exploration.

---

## Repository Development

Guidance for contributing to the mad-skills repository itself.

### Repository Overview

**MAD Skills** is a skill framework for Claude Code. It ships 10 skills
covering the full development lifecycle with first-class support for both
GitHub and Azure DevOps platforms. Skills are installed via
`npx skills add slamb2k/mad-skills` or as a Claude Code plugin, and invoked
as slash commands.

### Project Structure

```
mad-skills/
├── skills/                  # Skill definitions (10 skills)
│   ├── brace/               # Project scaffold initialization
│   ├── build/               # Context-isolated feature dev pipeline
│   ├── distil/              # Web design variation generator
│   ├── dock/                # Container release pipelines
│   ├── keel/                # Infrastructure as Code pipelines
│   ├── prime/               # Project context loading
│   ├── rig/                 # Repo bootstrapping (hooks, CI, templates)
│   ├── ship/                # Full PR lifecycle
│   ├── speccy/              # Interview-driven spec builder
│   └── sync/                # Repo sync with origin/main
├── scripts/                 # Build and CI tooling
│   ├── validate-skills.js   # Structural validation
│   ├── lint-skills.js       # SKILL.md linting
│   ├── run-evals.js         # Eval runner (Anthropic/OpenRouter)
│   ├── build-manifests.js   # Generate skills/manifest.json
│   └── package-skills.js    # Package .skill archives
├── hooks/                   # Session guard (Node.js)
│   ├── hooks.json           # Plugin hook definitions
│   ├── session-guard.cjs    # Entry point (check/remind subcommands)
│   └── lib/                 # Modular components
│       ├── banner.cjs       # ASCII banner rendering
│       ├── config.cjs       # Configuration constants
│       ├── git-checks.cjs   # Git status checks
│       ├── output.cjs       # Output formatting
│       ├── staleness.cjs    # CLAUDE.md staleness detection
│       ├── state.cjs        # Persistent state (dismissals)
│       ├── task-checks.cjs  # Task list checks
│       └── utils.cjs        # Shared utilities
├── tests/                   # Eval test results
│   └── results/             # JSON eval output (latest.json symlink)
├── archive/                 # Inactive skills (historical reference)
│   ├── cyberarian/          # Archived skill
│   ├── example-skill/       # Archived skill
│   ├── graphite-skill/      # Archived skill
│   ├── pixel-pusher/        # Archived skill
│   ├── play-tight/          # Archived skill
│   └── start-right/         # Archived skill
├── assets/                  # Project-level static assets
│   └── mad-skills.png       # Logo/branding
├── .claude-plugin/          # Plugin metadata
│   ├── marketplace.json
│   └── plugin.json
└── .github/workflows/
    └── ci.yml               # PR validation, evals, release (unified)
```

### Development Commands

```bash
npm run validate          # Validate all skill structures
npm run lint              # Lint SKILL.md files
npm run eval              # Run evals (needs API key)
npm run eval -- --verbose # Verbose eval output
npm run build:manifests   # Generate skills/manifest.json
npm run build:skills      # Package .skill archives
npm run build             # Both manifests + skills
npm test                  # validate + lint + eval
```

No build step required for development. Scripts run directly with Node.js (>=18).

### Skill Architecture

Each skill follows the standard layout:

```
skills/<name>/
├── SKILL.md              # Frontmatter + banner + full execution logic
├── scripts/              # Deterministic bash scripts (no LLM needed)
├── references/           # Extracted prompts, contracts, guides
├── assets/               # Static files (templates, components)
└── tests/
    └── evals.json        # Eval test cases
```

**SKILL.md frontmatter** (required fields):
- `name` — Skill identifier (matches directory name)
- `description` — When to trigger + what it does (primary machine trigger)
- `argument-hint` — Usage hint shown to users (e.g., `--flag, <required arg>`)
- `allowed-tools` — Tools the skill may use (include `Agent` if using subagents)

**Execution strategy**: Prefer deterministic bash scripts (in `scripts/`) for
stages that are pure CLI commands — they're faster, cheaper, and more reliable
than LLM subagents. Use LLM subagents only for stages that require reasoning:
code analysis, commit message authoring, PR descriptions, debugging failures.
Use Explore for codebase scanning and general-purpose for complex logic.

### CI/CD Pipeline

**ci.yml** — Unified CI and release workflow:
- **On pull requests:** validate + lint, then evals (with API key guard)
- **On push to main:** validates, bumps patch version, commits + tags, publishes to npm, builds `.skill` packages, creates GitHub Release

### Adding New Skills

1. Create `skills/<name>/` with SKILL.md, references/, tests/evals.json
2. Include full YAML frontmatter: name, description, argument-hint, allowed-tools
3. Add ASCII art banner with random taglines
4. Use bash scripts in `scripts/` for deterministic stages; LLM subagents only for reasoning
5. Add pre-flight dependency table (6-column format) with fallback strategies
6. Add platform detection if the skill interacts with CI/CD or git hosting APIs
7. Run `npm run validate && npm run lint` to verify
8. Run `npm run eval` to test

### Testing

```bash
npm run validate          # Structure checks for all 10 skills
npm run lint              # SKILL.md format checks
npm run eval              # Eval assertions (requires API key)
```

Evals support both `ANTHROPIC_API_KEY` and `OPENROUTER_API_KEY`.

### Archive

The `archive/` folder contains inactive skills kept for historical reference.
Not part of the release — excluded from npm and not supported.

## Question & Assumption Accountability

Nothing gets silently dropped. Every open question, assumption, and deferred
decision must be explicitly recorded and revisited.

- When you make an assumption, **state it explicitly** and record it
- When a question cannot be answered immediately, log it as an open item
- When you defer a fix or skip an edge case, document why and what triggers it
- At the end of each task, review all assumptions and open questions
- Present unresolved items to the user with context and suggested actions
- Unresolved items go to persistent tasks (`TaskCreate`), to CLAUDE.md as
  "Known Issues", or to memory for future session awareness
- At the start of new work, check for outstanding items from previous sessions
- Never close a task with unacknowledged open questions

## Memory

For persistent memory across sessions, install the **claude-mem** plugin:
```
claude plugin install claude-mem
```

claude-mem automatically captures context via lifecycle hooks and provides
MCP tools for search, timeline, and observation management. Claude Code's
built-in auto memory (`~/.claude/projects/<project>/memory/MEMORY.md`)
handles curated facts.

## Guardrails

- Verify tool output format before chaining into another tool
- Do not assume APIs support batch operations — check first
- Preserve intermediate outputs when workflows fail mid-execution
- Use persistent tasks (`TaskCreate`/`TaskUpdate`) for cross-session tracking
- Temporary files go in `.tmp/` — never store important data there
