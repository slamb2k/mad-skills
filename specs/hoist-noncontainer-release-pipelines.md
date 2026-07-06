# /hoist — Non-Container Release Pipelines

**Status:** Draft
**Date:** 2026-07-06
**Owner:** slamb2k
**Skill:** `skills/hoist` (new)

## Summary

`/hoist` is `/dock`'s non-container sibling. It generates **robust, secure
release pipelines that publish artifacts directly** — language packages, GitHub
Releases with binaries, static sites, and serverless functions — with **no
container image build** and far fewer infrastructure requirements. It shares
`/dock`'s detect → interview → generate → verify → report spine and the same
hardening ethos (OIDC/trusted publishing, provenance/attestation, idempotent
publish guards, no long-lived tokens), but the publish destination is a package
index / release / Pages host / function platform rather than an OCI registry.

It generalizes what this repo's own `.github/workflows/ci.yml` already does
(npm trusted publishing via OIDC, idempotent publish-before-tag) into a reusable
generator for other projects, so teams can **release quickly** without standing
up a registry or cloud compute.

## Goals

- Generate release pipelines for **four target families**: package registries,
  GitHub Releases + binaries, static sites/Pages, and serverless.
- **Secure by default**: OIDC/trusted publishing wherever the target supports
  it; provenance/attestation; idempotent, re-runnable publish; no stored
  long-lived credentials (token-only targets flagged as explicit exceptions).
- **Low infra**: no container registry, no cloud compute required for the
  common paths (packages, releases, Pages). Serverless is the one heavier tier.
- **Fast to release**: offer an auto-bump-on-merge trigger (this repo's own
  model) with an optional approval gate, plus tag and manual-dispatch models.
- Emit a `deploy/SETUP.md` listing the per-target one-time setup.

## Non-Goals

- **Container images / OCI publishing** — that is `/dock`.
- **Cloud infrastructure provisioning** — that is `/keel`. (`/hoist`'s
  serverless module may *reference* `/keel` for cloud identity but does not
  provision.)
- **The PR lifecycle** (commit/PR/merge) — that is `/ship`.
- **GitLab CI** — GitHub Actions + Azure Pipelines only.
- Deep per-target build-tool configuration beyond sensible detected defaults.

## Approach

One skill with **pluggable target modules**, mirroring how `/dock` supports many
per-environment deploy platforms behind a single spine. Rejected alternatives:

- **Four separate skills** (one per target family) — massive duplication of the
  detect/interview/verify spine and four banners/frontmatter to maintain, for
  what is one conceptual operation ("publish this project's artifact").
- **Extend `/dock`** with a `--no-container` mode — overloads a skill whose
  entire mental model is images/registries/digests; the trigger models and
  trusted-publishing story are different enough to warrant a distinct skill.

## Detailed Design

### Files created

| File | Responsibility |
|------|----------------|
| `skills/hoist/SKILL.md` | Frontmatter, ANSI-shadow banner + taglines, the five phases. |
| `skills/hoist/references/interview-guide.md` | Detection prompt + interview questions (target, registry/host, trigger model, approval gate, signing). |
| `skills/hoist/references/release-templates.md` | GitHub Actions + Azure Pipelines templates per target family × trigger model. |
| `skills/hoist/references/hardening.md` | OIDC/trusted-publishing, provenance/attestation, idempotency guards, approval gates; cross-links `/dock`'s hardening for serverless cloud identity. |
| `skills/hoist/references/setup-guides.md` | Per-target `deploy/SETUP.md` bodies. |
| `skills/hoist/tests/evals.json` | Behavioral evals. |

### Files modified (registration)

| File | Change |
|------|--------|
| `skills/manifest.json` | Regenerated via `npm run build:manifests`. |
| `CLAUDE.md` | Add `/hoist` to the skill guide, "When to Use", proactive suggestions, lifecycle ordering, and bump the "10 skills" count. |

### Phases (mirror `/dock`)

**Phase 0 — Sync.** Invoke `/sync` (fallback `git pull`) so generation runs
against current code.

**Phase 1 — Detection.** An Explore subagent produces a DETECTION_REPORT:
language/framework, package manifest(s) (`package.json`, `pyproject.toml`,
`Cargo.toml`, `*.gemspec`, `*.csproj`, `go.mod`), whether the project is a
library (publishable package), an app that ships binaries, a static site
(framework detected), or a serverless function; existing CI; existing release
config; detected registry from manifest metadata.

**Phase 2 — Interview.** Confirm the detected **target family**; then per family:
- **Registry** — which index (npm / PyPI / crates.io / RubyGems / NuGet / Go).
- **Release host** — GitHub Releases (default) / Azure artifacts.
- **Static host** — GitHub Pages / Azure Static Web Apps.
- **Serverless target** — Lambda / Cloudflare Workers / Vercel / Deno Deploy.
- **Trigger model** — auto-bump-on-merge / tag-triggered / manual-dispatch.
- **Approval gate** (auto-bump only) — add an environment protection gate
  before publish? (default: no.)
- **Signing** (binaries) — cosign keyless / minisign / none.

`--skip-interview` uses detected defaults + platform-aware defaults
(GitHub → GitHub Releases/Pages, npm/PyPI OIDC, auto-bump, no approval gate).

**Phase 3 — Generate.** Emit the CI workflow(s), a `SHA256SUMS`/checksum step
for binary targets, `deploy/environments`-style release config where useful, and
`deploy/SETUP.md`. All generated files are deterministic (no runtime LLM).

**Phase 4 — Verify.** Validate workflow YAML; confirm the generated workflow
carries the required hardening tokens for its target (see below); `--dry-run`
previews without writing.

**Final Report.** Box report with a **🔐 Required setup** section pointing at
`deploy/SETUP.md`, plus target, trigger model, and generated files.

### Target modules

| Module | Publish mechanism | Auth | Infra weight |
|--------|-------------------|------|--------------|
| **Package registries** | npm (`npm publish --provenance`), PyPI (`pypa/gh-action-pypi-publish` with attestations), RubyGems (trusted publishing) via **OIDC — no token**; crates.io / NuGet via **scoped token** (no OIDC — flagged exception); Go = tag only (proxy fetches) | OIDC where supported; scoped token otherwise | Lowest |
| **Releases + binaries** | cross-compile matrix → archives + `SHA256SUMS` → attach to GitHub Release (`softprops/action-gh-release`); optional cosign keyless / minisign signature; SLSA build provenance | `GITHUB_TOKEN` (ephemeral) + `id-token: write` for keyless signing | Low |
| **Static sites / Pages** | build (detected framework) → GitHub Pages (`actions/upload-pages-artifact` + `actions/deploy-pages`, `id-token: write`) or Azure Static Web Apps | OIDC (`id-token: write`) / SWA deployment token | Low |
| **Serverless** | Lambda (OIDC → AWS IAM role), Cloudflare Workers / Vercel / Deno Deploy (provider token) | OIDC federation (Lambda) or provider token — **heaviest**, may reference `/keel` | Highest |

### Trigger models

- **Auto-bump on merge to main** — compute the next version (semver patch by
  default, or conventional-commits `feat`/`fix`/`BREAKING`), then **publish
  before writing git** (idempotent: skip if the version already exists), then
  tag + create the release. Directly mirrors this repo's `ci.yml`.
  - **Optional approval gate:** publish job runs in a GitHub **Environment**
    (or Azure environment) with required reviewers, so the release pauses for
    a human approval before the publish step.
- **Tag-triggered** — on `vX.Y.Z` tag, build + publish that exact version.
- **Manual dispatch** — `workflow_dispatch` with a version / bump-type input.

### Shared hardening spine (secure by default)

1. **OIDC / trusted publishing** wherever supported (npm, PyPI, RubyGems,
   GitHub Pages, AWS Lambda via federation) — `permissions: id-token: write`,
   no stored publish token. Token-only targets (crates.io, NuGet, Cloudflare,
   Vercel, Deno) are generated with a **scoped token in a secret** and the
   `SETUP.md` explicitly flags them as the exception to the no-token rule.
2. **Provenance / attestation** — `npm publish --provenance`, PyPI
   attestations, SLSA build provenance for release binaries.
3. **Idempotent publish guard** — before publish, check whether the version
   already exists (`npm view <pkg>@<v>`, PyPI/crates index lookup,
   `gh release view vX.Y.Z`); skip if present so re-runs are safe (recovery
   mode). Publish happens **before** any git tag/commit so a publish failure
   leaves git clean — the `ci.yml` pattern.
4. **`concurrency:` guards** keyed on workflow + ref, `cancel-in-progress`.
5. **Checksums + optional signing** for binary releases (`SHA256SUMS`, cosign
   keyless or minisign).
6. **Optional approval gate** for auto-bump (environment protection).

### Generated deploy/SETUP.md

Per-target, copy-pasteable one-time setup, e.g.:
- **npm/PyPI/RubyGems** — configure the **trusted publisher** on the registry
  (reference repo `OWNER/REPO` + workflow filename); no token to create.
- **crates.io / NuGet / Cloudflare / Vercel / Deno** — create a scoped token,
  store as the named CI secret (flagged as the token exception).
- **GitHub Pages** — enable Pages (source: GitHub Actions).
- **Serverless (Lambda)** — create the IAM role + GitHub OIDC trust
  (`repo:OWNER/REPO`), or run `/keel` to provision it.

## Testing

- `skills/hoist/tests/evals.json` asserting, on representative prompts:
  - A package-registry prompt (npm) → describes OIDC trusted publishing (no
    token), `--provenance`, and an idempotent version guard.
  - A binaries prompt → describes a cross-compile matrix, `SHA256SUMS`, and
    attaching to a GitHub Release.
  - An auto-bump prompt with approval → describes an environment approval gate
    before publish.
  - Every generation → produces a `deploy/SETUP.md`.
- `npm run validate && npm run lint` pass (structure + SKILL.md format,
  including the dependency table and banner checks).
- Manual: `/hoist --dry-run` against a sample npm library and a sample
  binary-shipping CLI; eyeball the generated GitHub + Azure workflows and
  `SETUP.md`.

## Open Questions / Assumptions

- **Assumption:** security posture matches `/dock` (secure by default), so it is
  stated, not re-litigated per target. *(Confirmed in brainstorming.)*
- **Assumption:** one skill with target modules, not four skills. *(Confirmed.)*
- **Assumption:** crates.io / NuGet / Cloudflare / Vercel / Deno use scoped
  tokens (no OIDC trusted publishing available at authoring time); this is a
  documented exception, not a defect. Revisit if/when those add OIDC.
- **Assumption:** serverless may reference `/keel` for cloud identity but does
  not provision it. *(Confirmed.)*
- **Deferred:** GitLab CI templates — possible follow-up, out of scope.
