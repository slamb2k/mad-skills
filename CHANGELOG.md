# Changelog

All notable changes to MAD Skills will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **dock** — Container release pipeline generator. Builds once, promotes immutable images through environments (dev → staging → prod). Supports 8 deployment targets (Azure Container Apps, AWS Fargate, Cloud Run, Kubernetes, Dokku, Coolify, CapRover) and 3 CI systems (GitHub Actions, Azure Pipelines, GitLab CI)
- **keel** — Infrastructure as Code pipeline generator. Interview-driven provisioning of cloud infrastructure (registries, compute, databases, networking, secrets). Supports Terraform, Bicep, Pulumi, and AWS CDK. Plans on PR, applies on merge. Provisions what /dock deploys to

### Changed
- Skill count increased from 8 to 10
- Recommended skill order: `/brace` → `/rig` → `/build` → `/ship` → `/keel` → `/dock`
- Updated CLAUDE.md, README.md, and CHANGELOG.md to reflect new skills and unified CI/CD pipeline

## [2.0.14] - 2026-03-09

### Changed
- Unified CI and release into a single workflow (`ci.yml`); removed `release.yml`
- Renamed all hook files from `.js` to `.cjs` for explicit CommonJS module resolution

### Removed
- Shell-based session guard scripts (`session-guard.sh`, `session-guard-prompt.sh`) — fully replaced by Node.js implementation
- Orphaned "Detect Changed Skills" CI job

## [2.0.12] - 2026-03-09

### Added
- Node.js session guard (`hooks/session-guard.cjs` + `hooks/lib/`) replacing shell-based implementation
  - Subcommand dispatch: `check` (SessionStart) and `remind` (UserPromptSubmit)
  - Modular architecture: banner, config, git-checks, staleness, task-checks, output, state, utils

### Changed
- `hooks/hooks.json` updated to invoke `session-guard.cjs` instead of shell scripts

## [2.0.11] - 2026-03-08

### Fixed
- Session-guard-prompt hook switched to plain stdout output to avoid cosmetic "error" label in Claude Code UI

## [2.0.10] - 2026-03-08

### Fixed
- Scoped task list check to project-level settings
- Simplified marketplace versioning by removing redundant version field from `marketplace.json`

## [2.0.9] - 2026-03-08

### Fixed
- Wrapped hook commands in nested `hooks` array to match plugin system expectations

## [2.0.8] - 2026-03-08

### Fixed
- Release workflow uses PR-based flow to comply with branch protection rules
- Use `RELEASE_TOKEN` PAT for version bump PRs to trigger CI checks
- Removed invalid `agents`/`skills`/`hooks` fields from `plugin.json`

## [2.0.7] - 2026-03-03

### Changed
- Consolidated skills into single-file SKILL.md architecture (removed separate `instructions.md`)
- Removed CLI installer (`src/cli.js`); distribution via plugin or `npx skills` only
- Made plugin install the recommended installation method

### Added
- Commands, agents, and hooks included in npm package for plugin distribution
- Brace skill detects and cleans up legacy tools/memory system on re-run

### Fixed
- Skill YAML frontmatter compatibility fixes
- Session-guard banner rendering
- Ship skill updated to reference SKILL.md instead of removed instructions.md
- Restored blank line between tagline and ASCII art in skill banners

## [2.0.6] - 2026-02-28

### Fixed
- Added `repository` field to `package.json` for npm registry metadata

## [2.0.5] - 2026-02-28

### Changed
- Renamed skills: `/polish` → `/rig`, `/refinery` → `/distil`, `/forge` → `/brace`
- Introduced BRACE build methodology (Brief, Research, Architect, Construct, Evaluate) replacing FORGE
- Added `workflow_dispatch` trigger to release workflow for manual runs
- Temporarily disabled evals in CI and release workflows

## [2.0.0] - 2026-02-28

### Changed
- Migrated to npm-based skill framework (`@slamb2k/mad-skills`)
- Skills now live in `skills/` with standardized structure (SKILL.md + instructions.md + references/ + tests/)
- Replaced marketplace.json plugin system with npm packaging and npx installer

### Added
- **build** — Context-isolated feature development pipeline
- **brace** — Project initialization with GOTCHA/BRACE framework
- **rig** — Repository bootstrapping with hooks, templates, CI
- **prime** — Project context loading for informed decisions
- **distil** — Multiple web design variation generator
- **ship** — Full PR lifecycle (commit, push, PR, CI, merge)
- **sync** — Repository sync with origin/main
- Build infrastructure: `scripts/` (validate, lint, eval, build-manifests, package-skills)
- CLI installer: `src/cli.js` (npx support)
- Eval framework with OpenRouter and Anthropic API support
- Slash command stubs in `commands/`
- Session guard hook in `hooks/`
- Ship-analyzer agent in `agents/`
- CI pipeline (`.github/workflows/ci.yml`) with validate, lint, and eval jobs
- Release pipeline (`.github/workflows/release.yml`) with npm publish and GitHub Releases

### Archived
- play-tight (Browser Automation) — moved to `archive/`
- pixel-pusher (UI/UX Design System) — moved to `archive/`
- cyberarian (Document Lifecycle Management) — moved to `archive/`
- start-right (Repository Scaffolding) — moved to `archive/`
- graphite-skill (Git/Graphite Workflows) — moved to `archive/`

### Removed
- `VERSION` file (version now in package.json)
- Old plugin category system (debug-skills, design-skills, dev-flow, carbon-flow)

## [1.1.0] - 2025-11-13

### Added
- Pixel Pusher skill (UI/UX Design System)

## [1.0.0] - 2025-11-13

### Added
- Initial release of MAD Skills repository
- Play-Tight skill (Browser Automation)
- CI/CD pipeline with GitHub Actions
