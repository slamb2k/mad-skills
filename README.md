# MAD Skills

![Mad Skills](assets/mad-skills.png)

A skill framework for Claude Code. Ships 10 skills covering the full development lifecycle — from project initialization to shipping PRs.

## Skills

| Skill | Command | Description |
|-------|---------|-------------|
| **build** | `/build` | Context-isolated feature development pipeline. Takes a design/plan and executes explore, question, architect, implement, review, ship inside subagents. |
| **brace** | `/brace` | Initialize projects with a standard scaffold. Creates specs/, tools/, context/ directories, project CLAUDE.md, and branch protection. |
| **distil** | `/distil` | Generate multiple unique web design variations. Creates a Vite + React + TypeScript + Tailwind project with N designs at /1, /2, /3. |
| **dock** | `/dock` | Generate container release pipelines. Builds once, promotes immutable images through dev → staging → prod. Supports Azure Container Apps, AWS Fargate, Cloud Run, Kubernetes, Dokku, Coolify, CapRover. |
| **keel** | `/keel` | Generate IaC pipelines (Terraform, Bicep, Pulumi, CDK) to provision cloud infrastructure. Plans on PR, applies on merge. Provisions what /dock deploys to. |
| **prime** | `/prime` | Load project context before feature work. Supports domain-specific context (security, routing, dashboard, etc.). |
| **rig** | `/rig` | Bootstrap repos with lefthook hooks, commit templates, PR templates, and GitHub Actions workflows. Idempotent. |
| **ship** | `/ship` | Full PR lifecycle — sync with main, create branch, commit, push, create PR, wait for CI, fix issues, squash merge, cleanup. |
| **speccy** | `/speccy` | Interview-driven specification builder. Reviews code/docs, interviews through targeted questions, produces structured specs. |
| **sync** | `/sync` | Sync local repo with origin/main. Stashes changes, pulls, restores stash, cleans up stale branches. |

## Lifecycle Overview

The 10 skills form a complete development-to-deployment pipeline. Each skill produces artifacts that downstream skills consume.

```mermaid
graph LR
    A["/brace<br/>Project Init"] --> B["/rig<br/>Dev Tooling"]
    B --> C["/speccy<br/>Spec Builder"]
    C --> D["/build<br/>Features"]
    D --> E["/ship<br/>Merge PRs"]
    E --> F["/keel<br/>Infra (IaC)"]
    F --> G["/dock<br/>Deploy"]

    style A fill:#4a9eff,color:#fff
    style B fill:#4a9eff,color:#fff
    style C fill:#9b59b6,color:#fff
    style D fill:#2ecc71,color:#fff
    style E fill:#2ecc71,color:#fff
    style F fill:#e67e22,color:#fff
    style G fill:#e67e22,color:#fff
```

| Phase | Skills | What happens |
|-------|--------|--------------|
| **Setup** | `/brace` → `/rig` | Initialize project structure, install hooks, templates, CI workflows |
| **Develop** | `/speccy` → `/build` → `/ship` | Spec features, implement in isolated subagents, merge via PR lifecycle |
| **Deploy** | `/keel` → `/dock` | Provision cloud infrastructure, then deploy containers to it |

Supporting skills (`/sync`, `/prime`, `/distil`) are used as needed throughout:
- `/sync` — Pull latest changes before starting work
- `/prime` — Load domain context before complex features
- `/distil` — Generate multiple web design variations

---

## End-to-End Walkthrough

This walkthrough follows a Node.js app from an empty folder to a deployed container running on cloud infrastructure.

### Step 0: Session Guard

When you open Claude Code in any project with the mad-skills plugin installed, the **session guard** runs automatically. It validates your development environment before you write a single line of code.

```
┌─────────────────────────────────────────────────────┐
│  Session Guard — automatic on every session start    │
│                                                      │
│  ✅ CLAUDE.md found                                  │
│  ✅ Git repository initialized                       │
│  ✅ On branch: main                                  │
│  ⚠️  CLAUDE.md last modified 5 days ago              │
│  ℹ️  Task list configured: my-project                │
└─────────────────────────────────────────────────────┘
```

The session guard checks: git status, CLAUDE.md presence and freshness, task list configuration, and branch state. If issues are found, they're surfaced before your first prompt.

---

### Step 1: `/brace` — Initialize the Project

Start in an empty folder. `/brace` creates the project scaffold.

```
> /brace my-webapp
```

**What it generates:**

```
my-webapp/
├── CLAUDE.md              # AI-readable project instructions
├── .gitignore             # Ignores credentials, data, temp files
├── specs/                 # Specifications (/speccy → /build)
├── context/               # Domain knowledge and references
└── .tmp/                  # Scratch work (gitignored)
```

The CLAUDE.md it creates becomes the foundation — every subsequent skill reads it for project context.

---

### Step 2: `/rig` — Set Up Dev Tooling

With the skeleton in place, `/rig` bootstraps the development infrastructure.

```
> /rig
```

**What it generates:**

```
my-webapp/
├── .github/
│   ├── workflows/ci.yml       # PR validation pipeline
│   └── pull_request_template.md
├── .lefthook.yml              # Git hooks (lint, test on commit)
├── .commitlintrc.yml          # Conventional commit enforcement
└── .editorconfig              # Consistent formatting
```

`/rig` is idempotent — run it again later and it updates without overwriting your customizations.

---

### Step 3: `/speccy` — Specify What to Build

Before writing code, `/speccy` interviews you to create a detailed specification.

```
> /speccy a user authentication system with OAuth2
```

It asks targeted questions about requirements, edge cases, security concerns, and technical constraints, then produces a structured spec document that `/build` can consume.

---

### Step 4: `/build` — Implement Features

Feed the spec (or any design) to `/build`. It runs the entire development lifecycle inside isolated subagents so your main conversation stays clean.

```
> /build implement the auth system from specs/auth-spec.md
```

```mermaid
graph TD
    A["Stage 1: Explore<br/>Understand codebase"] --> B["Stage 2: Question<br/>Clarify ambiguities"]
    B --> C["Stage 3: Architect<br/>Design solution"]
    C --> D["Stage 4: Implement<br/>Write code"]
    D --> E["Stage 5: Review<br/>Check quality"]
    E --> F["Stage 6: Ship<br/>Invoke /ship"]

    style A fill:#3498db,color:#fff
    style B fill:#3498db,color:#fff
    style C fill:#9b59b6,color:#fff
    style D fill:#2ecc71,color:#fff
    style E fill:#e74c3c,color:#fff
    style F fill:#f39c12,color:#fff
```

Each stage runs in a subagent with its own context. The primary conversation only receives structured reports.

---

### Step 5: `/ship` — Merge via PR

When features are ready, `/ship` handles the entire PR lifecycle.

```
> /ship
```

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant Ship as /ship
    participant GH as GitHub
    participant CI as CI Pipeline

    Dev->>Ship: /ship
    Ship->>Ship: Stage 1: Sync with main
    Ship->>Ship: Stage 2: Analyze, commit, push
    Ship->>GH: Create PR
    Ship->>CI: Stage 3: Monitor checks
    CI-->>Ship: All checks passed ✅
    Ship->>GH: Stage 5: Squash merge
    Ship->>Ship: Sync local main, cleanup branches
    Ship-->>Dev: Ship complete ✅
```

If CI fails, `/ship` automatically reads the failure logs, fixes the code, pushes a fix commit, and re-monitors — up to 2 attempts before asking for help.

---

### Step 6: `/keel` — Provision Infrastructure

Before deploying, you need infrastructure. `/keel` interviews you about your cloud setup and generates IaC files.

```
> /keel
```

The interview covers: cloud provider, IaC tool, components needed, environments, state management, naming conventions, and resource sizing.

**Example output for Azure + Terraform:**

```
my-webapp/
├── infra/
│   ├── main.tf                  # Provider, backend, module calls
│   ├── variables.tf             # Input variables
│   ├── outputs.tf               # Registry URL, endpoints, connection strings
│   ├── versions.tf              # Required providers
│   ├── bootstrap.sh             # One-time state backend setup
│   ├── sync-outputs.sh          # Sync TF outputs → CI/CD variables
│   ├── environments/
│   │   ├── dev.tfvars
│   │   ├── staging.tfvars
│   │   └── prod.tfvars
│   └── modules/
│       ├── registry/            # Azure Container Registry
│       ├── compute/             # Azure Container Apps
│       ├── database/            # PostgreSQL Flexible Server
│       ├── networking/          # VNet, subnets
│       └── monitoring/          # Log Analytics, App Insights
└── .github/workflows/
    └── infra.yml                # Plan on PR, apply on merge
```

**Infrastructure pipeline flow:**

```mermaid
graph LR
    subgraph "PR Phase"
        A["Push infra/ changes"] --> B["terraform plan"]
        B --> C["Post plan as<br/>PR comment"]
    end

    subgraph "Merge Phase"
        D["Merge to main"] --> E["terraform apply<br/>(dev)"]
        E --> F["Sync outputs to<br/>CI/CD variables"]
    end

    subgraph "Promotion Phase"
        G["Manual dispatch"] --> H["terraform apply<br/>(staging)"]
        H --> I["terraform apply<br/>(prod)"]
    end

    C --> D
    F --> G

    style B fill:#3498db,color:#fff
    style E fill:#2ecc71,color:#fff
    style H fill:#e67e22,color:#fff
    style I fill:#e74c3c,color:#fff
```

After `/keel` applies, the infrastructure outputs (registry URL, compute endpoints, database connection strings) are synced as CI/CD variables for `/dock` to consume.

---

### Step 7: `/dock` — Deploy Containers

With infrastructure provisioned, `/dock` creates the release pipeline that builds and deploys your app.

```
> /dock
```

The interview covers: container registry, environments, deployment targets per environment, testing gates, secrets, and rollback strategy.

**Example output:**

```
my-webapp/
├── Dockerfile                   # Multi-stage: deps → build → test → production
├── .dockerignore
├── docker-compose.yml           # Local dev parity
├── deploy/
│   └── environments.yml         # Per-environment config matrix
└── .github/workflows/
    └── deploy.yml               # Build, push, deploy pipeline
```

**The build-once-promote-everywhere pipeline:**

```mermaid
graph TD
    subgraph "Build Phase (on merge to main)"
        A["Checkout code"] --> B["Build image<br/>target: test"]
        B --> C["Run tests<br/>inside container"]
        C --> D["Build image<br/>target: production"]
        D --> E["Push to registry<br/>tag: abc1234 + latest"]
    end

    subgraph "Deploy Dev"
        E --> F["Deploy abc1234<br/>to dev"]
        F --> G["Smoke tests ✅"]
    end

    subgraph "Promote to Staging (on release tag v1.2.3)"
        G -.-> H["Retag abc1234<br/>as v1.2.3"]
        H --> I["Deploy v1.2.3<br/>to staging"]
        I --> J["Integration +<br/>e2e tests ✅"]
    end

    subgraph "Promote to Production"
        J --> K["Deploy v1.2.3<br/>to production"]
        K --> L["Post-deploy<br/>smoke test ✅"]
    end

    style B fill:#3498db,color:#fff
    style D fill:#3498db,color:#fff
    style E fill:#2ecc71,color:#fff
    style H fill:#e67e22,color:#fff
    style I fill:#e67e22,color:#fff
    style K fill:#e74c3c,color:#fff

    linkStyle 6 stroke:#999,stroke-dasharray:5
```

The critical principle: the release tag step **retags** the existing tested image — it never rebuilds. The exact same bytes that passed tests on `main` are what runs in production.

---

### Full Architecture

Here's how all the pipelines connect in the final system:

```mermaid
graph TB
    subgraph "Developer Workflow"
        DEV["Developer"] -->|"/build"| CODE["Code Changes"]
        CODE -->|"/ship"| PR["Pull Request"]
    end

    subgraph "CI Pipeline (/rig)"
        PR --> LINT["Lint + Validate"]
        LINT --> TEST["Unit Tests"]
        TEST --> PASS{"Checks<br/>pass?"}
        PASS -->|Yes| MERGE["Merge to main"]
        PASS -->|No| FIX["/ship auto-fix"]
        FIX --> LINT
    end

    subgraph "Infrastructure Pipeline (/keel)"
        INFRA_PR["Infra PR"] --> PLAN["terraform plan"]
        PLAN --> INFRA_MERGE["Merge"]
        INFRA_MERGE --> APPLY_DEV["Apply to dev"]
        APPLY_DEV --> SYNC["Sync outputs →<br/>CI/CD vars"]
    end

    subgraph "Deployment Pipeline (/dock)"
        MERGE --> BUILD["Build container<br/>image"]
        BUILD --> PUSH["Push to registry<br/>:sha + :latest"]
        PUSH --> DEPLOY_DEV["Deploy to dev"]
        DEPLOY_DEV --> SMOKE["Smoke tests"]

        TAG["Release tag<br/>v1.2.3"] --> RETAG["Retag image<br/>(no rebuild)"]
        RETAG --> DEPLOY_STG["Deploy staging"]
        DEPLOY_STG --> E2E["e2e tests"]
        E2E --> DEPLOY_PROD["Deploy production"]
        DEPLOY_PROD --> FINAL["Post-deploy smoke"]
    end

    SYNC -.->|"Registry URL<br/>Endpoints"| BUILD

    style DEV fill:#4a9eff,color:#fff
    style MERGE fill:#2ecc71,color:#fff
    style BUILD fill:#3498db,color:#fff
    style PUSH fill:#3498db,color:#fff
    style RETAG fill:#e67e22,color:#fff
    style DEPLOY_PROD fill:#e74c3c,color:#fff
```

---

### Quick Reference: What Each Skill Generates

| Skill | Key artifacts | Consumed by |
|-------|--------------|-------------|
| `/brace` | `CLAUDE.md`, project skeleton | All other skills |
| `/rig` | `.github/workflows/ci.yml`, hooks, templates | `/ship` (CI checks) |
| `/speccy` | Specification document | `/build` (implementation guide) |
| `/build` | Feature code, tests | `/ship` (files to commit) |
| `/ship` | Commits, PRs, merged code | CI pipeline, `/dock` triggers |
| `/keel` | `infra/` (Terraform/Bicep), `infra.yml` workflow | `/dock` (infrastructure outputs) |
| `/dock` | `Dockerfile`, `deploy.yml`, `deploy/` config | CI/CD system (runtime) |
| `/sync` | Clean working tree | Any skill (pre-work) |
| `/prime` | Domain context in memory | `/build` (informed decisions) |
| `/distil` | Multiple web design variations | `/build` (chosen design) |

---

## Installation

Three methods are available. The table below shows what each delivers:

| | Plugin | npx skills | npm package |
|---|---|---|---|
| Skills (slash commands) | ✅ all 10 | ✅ all 10 | — |
| Agents (e.g. ship-analyzer) | ✅ | ❌ | — |
| Session hooks (session-guard) | ✅ | ❌ | — |
| Cross-agent (Cursor, Cline, etc.) | ❌ Claude Code only | ✅ | — |
| Selective skill install | ❌ | ✅ | — |
| Auto-updates | ✅ | ❌ | — |

### Plugin (recommended)

Installs skills, agents, and session hooks from the GitHub repo into
`~/.claude/plugins/`. Updates automatically. Claude Code only.

**Step 1 — Register the marketplace (one-time):**

From the CLI:
```bash
claude plugin marketplace add slamb2k/mad-skills
```

Or add manually to `~/.claude/settings.json`:
```json
"extraKnownMarketplaces": {
  "slamb2k": {
    "source": { "source": "github", "repo": "slamb2k/mad-skills" }
  }
}
```

**Step 2 — Install the plugin:**

From the CLI:
```bash
claude plugin install mad-skills@slamb2k
```

Or inside Claude Code:
```
/plugin install mad-skills@slamb2k
```

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
├── skills/                  # Skill definitions (10 skills)
│   ├── build/
│   ├── brace/
│   ├── distil/
│   ├── dock/
│   ├── keel/
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
    └── ci.yml               # Unified CI, evals, and release
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

**Unified pipeline** (`.github/workflows/ci.yml`):
- **On pull requests:** validate + lint, evals (when API key available), posts eval results as PR comments
- **On push to main (non-release):** validates, bumps patch version, creates auto-merge PR
- **On push to main (release):** creates version tag, publishes to npm with provenance, builds `.skill` packages, creates GitHub Release

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
