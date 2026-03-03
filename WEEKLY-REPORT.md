# Mad Skills — Weekly Change Report

**Period:** 27 Feb 2026 — 3 Mar 2026
**Total:** 24 commits across 12 merged PRs | 133 files changed | +8,041 / -2,851 lines

---

## Executive Summary

This week transformed mad-skills from a loose collection of root-level skill directories into a fully published npm package with CI/CD, eval-driven quality gates, and a complete developer experience layer. The repository was restructured, skills were renamed for clarity, and the framework gained commands, agents, hooks, and banner rendering fixes — culminating in v2.0.7 on npm.

---

## PR #6 — Migrate to npm-based skill framework with evals

**Merged:** 27 Feb | **Scope:** 132 files | +7,421 / -2,851

The foundational restructure of the entire repository. This PR archived all legacy v1.x skills (`cyberarian`, `play-tight`, `pixel-pusher`, `start-right`, `graphite-skill`) into `archive/` and rebuilt the project as a publishable npm package.

**Package infrastructure:**
- `package.json` with ESM module type, `bin` entry for `npx @slamb2k/mad-skills`, and full script suite (`validate`, `lint`, `eval`, `build`, `test`)
- `src/cli.js` — the npx installer CLI supporting `--list`, `--skill`, `--target`, and `--upgrade` flags
- Five build/validation scripts: `validate-skills.js` (structure checks), `lint-skills.js` (SKILL.md quality), `run-evals.js` (LLM-based assertion runner supporting `contains`, `not_contains`, `regex`, `semantic`, and `file_created` types), `build-manifests.js` (generates `skills/manifest.json`), and `package-skills.js` (creates `.skill` ZIP archives for marketplace distribution)

**Skills migrated to `skills/`:**
All 7 skills (build, forge, polish, prime, refinery, ship, sync) moved under the `skills/` directory with standardised structure: `SKILL.md`, `instructions.md`, `references/`, optional `assets/`, and `tests/evals.json`.

**CI/CD pipelines:**
- `ci.yml` — validates structure, lints SKILL.md files, runs evals on PRs (with API key guard for external forks), posts eval summary as PR comments, and detects which skills changed
- `release.yml` — on semver tag push: validates, evals, publishes to npm with provenance, packages `.skill` files, and creates a GitHub Release with artifacts

**Developer experience:**
- `commands/` — slash command stubs wiring each skill
- `hooks/session-guard.sh` — SessionStart hook checking git state, CLAUDE.md freshness, and drift detection
- `agents/ship-analyzer.md` — specialised subagent for semantic commit messages and PR descriptions
- `.claude-plugin/` metadata for marketplace integration

---

## PR #7 — Add project banner image

**Merged:** 27 Feb | **Scope:** 1 file | +0 / -0 (binary)

Added `assets/mad-skills.png` (1024x572 PNG) as the project header image referenced in README.md.

---

## PR #8 — Make Skills CI a required check and simplify release trigger

**Merged:** 27 Feb | **Scope:** 4 files | +31 / -23

Two targeted CI improvements:

1. **CI workflow:** Removed `paths` filter so Skills CI runs on every PR regardless of which files changed. This allows it to be set as a required branch protection status check — previously, PRs touching only non-`skills/` files would skip CI entirely, making the required check unsatisfiable.

2. **Release workflow:** Switched from tag-based triggering (`v*` push) to push-to-main triggering. The workflow now reads the version from `package.json`, creates the git tag automatically, and skips publish/release if that tag already exists. This eliminates the manual `git tag` step from the release process.

---

## PR #9 — Rename polish→rig, refinery→distil, forge→brace with BRACE methodology

**Merged:** 28 Feb | **Scope:** 45 files | +693 / -283

A comprehensive rename of three skills to clearer, more memorable identifiers:

| Old Name | New Name | Rationale |
|----------|----------|-----------|
| `/polish` | `/rig` | "Rig" better conveys bootstrapping and setup |
| `/refinery` | `/distil` | "Distil" better conveys extracting design variations |
| `/forge` | `/brace` | "Brace" introduces a new methodology acronym |

**BRACE methodology:** The `/brace` rename also replaced the FORGE build methodology (Frame/Outline/Rig/Generate/Evaluate) with BRACE (Brief/Research/Architect/Construct/Evaluate). A new `brace-workflow.md` replaced `forge-workflow.md`, and the legacy-upgrade detection system was extended to recognise both ATLAS and FORGE naming in existing projects.

**Pre-flight dependency tables:** All skills gained structured markdown tables in `instructions.md` declaring their dependencies with type, check command, resolution strategy, and detail. The validator (`validate-skills.js`) was extended with `validateDependencyTable()` to verify table structure, and the CLI installer gained `parseDependencyTable()`, `checkDependency()`, `resolveDependency()`, and `checkSkillDependencies()` to check and resolve dependencies at install time.

All command stubs, manifest, documentation, evals, and references were updated throughout.

---

## PR #10 — Add workflow_dispatch trigger to release workflow

**Merged:** 28 Feb | **Scope:** 3 files | +69 / -15

Added `workflow_dispatch` to the Release workflow so it can be manually triggered from the GitHub Actions UI. This enables re-running a release after transient failures without pushing a new commit to main. Also temporarily disabled evals in both CI and release workflows pending stability improvements.

---

## PR #11 — Bump version to 2.0.5 with CHANGELOG

**Merged:** 28 Feb | **Scope:** 3 files | +10 / -2

Version bump from 2.0.0 to 2.0.5 across `package.json` and `plugin.json`, with a CHANGELOG entry documenting the skill renames (PR #9), the BRACE methodology introduction, the `workflow_dispatch` trigger (PR #10), and the temporary eval disable.

---

## PR #12 — Add repository field to package.json

**Merged:** 28 Feb | **Scope:** 1 file | +4 / -0

Added the `repository` field (`type: "git"`, `url: "https://github.com/slamb2k/mad-skills"`) to `package.json` so the npm registry displays the GitHub source link on the package page and downstream tools can resolve the source location.

---

## PR #13 — Bump version to 2.0.6

**Merged:** 28 Feb | **Scope:** 2 files | +2 / -2

Version bump from 2.0.5 to 2.0.6 in `package.json` and `plugin.json` to trigger a new release.

---

## PR #14 — Include commands, agents, and hooks in npm package

**Merged:** 3 Mar | **Scope:** 12 files | +109 / -45

Extended the npm package and CLI installer to ship the full developer experience alongside skills:

**Package distribution:** Added `commands/`, `agents/`, `hooks/`, and `.claude-plugin/` to the `files` array in `package.json`, ensuring they're included in the published npm tarball.

**CLI installer (`src/cli.js`):** Added `installSupplementary()` function that copies commands, agents, and hooks as sibling directories of the skills target. Files are copied with the same skip/upgrade semantics as skills — existing files are skipped unless `--upgrade` is passed. Shell scripts (`.sh`) are automatically made executable via `chmod 755` after copy.

**Plugin metadata:** Added `commands`, `agents`, `skills`, and `hooks` path declarations to `plugin.json`. Fixed the stale version in `marketplace.json` (was still `0.3.1`).

**Banner rendering fix:** All 7 `SKILL.md` files were updated to fix a persistent issue where the first line of ASCII art lost its 4 leading spaces when rendered by the LLM. The fix uses a U+2800 (Braille Pattern Blank) character as an invisible anchor at column 0 of the first art line, combined with a `CRITICAL:` instruction directing exact character-for-character reproduction. Multiple approaches were tested — the braille blank alone failed, the instruction alone failed, but the combination reliably preserves whitespace.

---

## PR #15 — Restore blank line between tagline and ASCII art

**Merged:** 3 Mar | **Scope:** 7 files | +7 / -0

A cosmetic fix across all 7 skill banners. PR #14's banner changes had removed the blank line between the `{tagline}` and the ASCII art block. This PR restores that spacing so the tagline doesn't run directly into the art, improving visual clarity when skills are invoked.

---

## PR #16 — Bump version to 2.0.7

**Merged:** 3 Mar | **Scope:** 3 files | +3 / -3

Version bump from 2.0.6 to 2.0.7 across all three version files (`package.json`, `plugin.json`, `marketplace.json`). Required because the `v2.0.6` tag already existed from a prior release, causing the release workflow's `git tag` step to fail.

---

## PR #17 — Detect and clean up legacy tools/memory system on re-run

**Merged:** 3 Mar | **Scope:** 6 files | +91 / -26

Extends the BRACE skill's idempotent re-run logic to detect and offer cleanup of the legacy `tools/memory/` + `memory/` directory system used by older GOTCHA-initialised projects (before claude-mem). This works alongside the existing ATLAS/FORGE naming upgrade path.

**Phase 1 scan:** Added check #7 to detect `tools/memory/` directories and `memory/MEMORY.md` files, reporting `has_legacy_memory` in the SCAN_REPORT.

**Phase 1b legacy detection:** Unified the legacy detection prompt to cover both ATLAS/FORGE naming and the old memory system. When any legacy components are found, a single combined AskUserQuestion prompt describes what was detected and offers "Yes, upgrade all" or "No, leave as-is".

**Phase 3 plan:** When legacy memory is confirmed, assigns `remove` status to `tools/memory/` and `memory/`, and `cleanup` status to `tools/manifest.md`, `.gitignore`, and `CLAUDE.md` for reference removal.

**Phase 4 scaffold:** Added `remove` handler that deletes directories (`git rm -r` if tracked, `rm -rf` otherwise), extracting any `## Key Decisions` section from `memory/MEMORY.md` into `preserved_content` before deletion. Added `cleanup` handler that strips memory tool rows from `tools/manifest.md`, removes the `memory/*.npy` gitignore entry, and replaces the `## Memory System` section in CLAUDE.md with a claude-mem reference.

**Phase 5 verification:** Added check #5 verifying that `tools/memory/` and `memory/` are absent post-cleanup, reporting `legacy_memory_cleaned` in the VERIFY_REPORT.

**Report template:** Added a conditional `Removed:` section and `[removed]` status indicator.

**Gitignore template:** Removed the `memory/*.npy` entry since it's no longer relevant for new projects.

**CI improvement (folded in):** Replaced the `if: false` disable on the eval job with a `vars.EVALS_ENABLED` repository variable gate. The eval job now always runs (satisfying required status checks) but skips actual eval steps unless the variable is set to `true`. The same gate was applied to the release workflow's eval step.

---

## Timeline

| Date | PRs | Theme |
|------|-----|-------|
| 27 Feb | #6, #7, #8 | Foundation — npm package, CI/CD, banner image |
| 28 Feb | #9, #10, #11, #12, #13 | Polish — skill renames, BRACE methodology, versioning |
| 3 Mar | #14, #15, #16, #17 | Completeness — full package distribution, banner fixes, legacy cleanup |

## Version History

| Version | PR(s) | Key Changes |
|---------|-------|-------------|
| 2.0.0 | #6 | Initial npm package with 7 skills |
| 2.0.5 | #9, #10, #11 | Skill renames, BRACE methodology, eval disable |
| 2.0.6 | #12, #13 | Repository metadata, version bump |
| 2.0.7 | #14, #15, #16, #17 | Full package distribution, banner fixes, legacy memory cleanup, CI eval gate |
