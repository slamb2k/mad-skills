# Changelog

All notable changes to MAD Skills will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
