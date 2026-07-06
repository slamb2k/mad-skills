# /hoist Non-Container Release Pipelines — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `/hoist` skill that generates secure, low-infra, non-container release pipelines (package registries, GitHub Releases + binaries, static sites/Pages, serverless) for GitHub Actions + Azure Pipelines.

**Architecture:** Standard mad-skills skill layout (`skills/hoist/` with SKILL.md + references + tests). Templates are **canonical + composable**: one hardened release workflow per CI platform with per-target publish snippets and per-trigger `on:`/version blocks, not 24 separate variants. Mirrors `/dock`'s structure and this repo's own `ci.yml` hardening.

**Tech Stack:** Markdown skill templates (no runtime code). GitHub Actions (`npm publish --provenance`, `pypa/gh-action-pypi-publish`, `softprops/action-gh-release`, `actions/deploy-pages`, `sigstore/cosign-installer`, `aws-actions/configure-aws-credentials`). Azure Pipelines. Validation via `node scripts/validate-skills.js`, `node scripts/lint-skills.js`; manifest via `node scripts/build-manifests.js`.

## Global Constraints

- New skill directory `skills/hoist/` only; the one cross-cutting edit is `CLAUDE.md` (Task 8) and the generated `skills/manifest.json` (Task 8).
- Platforms: **GitHub Actions + Azure Pipelines** only. No GitLab CI.
- Secure by default: OIDC/trusted publishing where supported; provenance/attestation; idempotent publish guard; no long-lived tokens. Token-only targets (crates.io, NuGet, Cloudflare, Vercel, Deno) are the **flagged exception**.
- Publish happens **before** any git tag/commit (publish-before-git-write), guarded by a version-exists check so re-runs are idempotent.
- SKILL.md frontmatter MUST include: `name: hoist`, `description`, `argument-hint`, `allowed-tools` (include `Agent`, `AskUserQuestion`). Include an ASCII banner + random taglines and a 6-column pre-flight dependency table (validator checks these).
- Every task ends green on `npm run validate && npm run lint`.
- Commit style: conventional commits, scope `hoist`. End commit bodies with `Claude-Session: https://claude.ai/code/session_013sN7Nj3DxZaBExyPiBepmh`.
- Work on branch `feat/hoist-skill-spec` (already checked out; spec already committed there).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `skills/hoist/references/hardening.md` | The hardening spine: OIDC/trusted publishing, provenance, idempotent publish guard, approval gates. |
| `skills/hoist/references/release-templates.md` | Canonical hardened GitHub Actions + Azure Pipelines release workflows, with per-target publish snippets and per-trigger blocks. |
| `skills/hoist/references/interview-guide.md` | Detection prompt + interview questions. |
| `skills/hoist/references/setup-guides.md` | Per-target `deploy/SETUP.md` bodies. |
| `skills/hoist/SKILL.md` | Frontmatter, banner, five phases wiring the references. |
| `skills/hoist/tests/evals.json` | Behavioral evals. |
| `CLAUDE.md`, `skills/manifest.json` | Registration (Task 8). |

Build order: references first (hardening → templates → interview → setup), then SKILL.md ties them together, then evals, then registration. SKILL.md depends on the reference anchors existing.

---

### Task 1: `hardening.md` — the release hardening spine

**Files:** Create `skills/hoist/references/hardening.md`

**Interfaces:**
- Produces `##` anchors cited by later tasks: `## Trusted Publishing (OIDC)`, `## Provenance & Attestation`, `## Idempotent Publish Guard`, `## Approval Gate`, `## Token Exceptions`.

- [ ] **Step 1: Content check (the failing test)**

```bash
for s in "## Trusted Publishing (OIDC)" "## Provenance & Attestation" "## Idempotent Publish Guard" "## Approval Gate" "## Token Exceptions"; do
  grep -qF "$s" skills/hoist/references/hardening.md 2>/dev/null || echo "MISSING: $s"
done
```

- [ ] **Step 2: Run it, confirm all MISSING** (file absent).

- [ ] **Step 3: Create `skills/hoist/references/hardening.md`**

````markdown
# Release Hardening Reference

How `/hoist` hardens the release pipelines it generates. Same ethos as `/dock`,
translated from container promotion to artifact publishing. Secure by default.

## Trusted Publishing (OIDC)

Publish with the CI provider's OIDC identity instead of a stored token, wherever
the registry supports it:

- **npm** — `permissions: id-token: write` + `npm publish --provenance`. Configure
  the package's trusted publisher on npmjs.com (repo + workflow). No `NODE_AUTH_TOKEN`.
- **PyPI** — `pypa/gh-action-pypi-publish` with `id-token: write`; configure a
  PyPI trusted publisher. No API token.
- **RubyGems** — trusted publishing via OIDC; configure on rubygems.org.
- **GitHub Pages** — `id-token: write` + `actions/deploy-pages`.
- **AWS Lambda** — `aws-actions/configure-aws-credentials` with `role-to-assume`
  (GitHub OIDC → IAM role). No access keys.

Azure Pipelines uses a **Workload Identity Federation service connection**
(`azureSubscription`) where cloud auth is needed.

## Provenance & Attestation

- npm: `--provenance` (SLSA provenance attestation).
- PyPI: `gh-action-pypi-publish` emits attestations by default.
- Binaries: generate SLSA build provenance and attach it to the release.

## Idempotent Publish Guard

Publish is **check-then-act** and runs **before** any git tag/commit, so a failed
publish leaves git clean and a re-run is safe (recovery mode):

- npm: `npm view <pkg>@<version> version` — skip publish if it returns.
- PyPI: query the simple index / `pip index versions`.
- crates.io: query the index; RubyGems: `gem list -r -e`.
- GitHub Release: `gh release view vX.Y.Z` — skip if it exists.

Only after a successful (or already-present) publish does the workflow tag +
create the release. A `concurrency:` group keyed on workflow + ref with
`cancel-in-progress` prevents overlapping release runs.

## Approval Gate

For the auto-bump-on-merge trigger, optionally run the publish job in a protected
**environment** so it pauses for human approval before publishing:

- GitHub: `environment: release` on the publish job + required reviewers configured
  on the `release` environment.
- Azure: an environment with a manual-approval check.

## Token Exceptions

Registries/platforms without OIDC trusted publishing at authoring time use a
**scoped token stored as a CI secret** — the documented exception to the
no-token rule. Flag these in `deploy/SETUP.md`:

- crates.io (`CARGO_REGISTRY_TOKEN`), NuGet (`NUGET_API_KEY`),
  Cloudflare (`CLOUDFLARE_API_TOKEN`), Vercel (`VERCEL_TOKEN`),
  Deno Deploy (`DENO_DEPLOY_TOKEN`).

Use the narrowest scope the platform allows (publish-only, single package/project).
````

- [ ] **Step 4: Run content check — no MISSING.**
- [ ] **Step 5:** `npm run validate && npm run lint` — both pass.
- [ ] **Step 6: Commit**

```bash
git add skills/hoist/references/hardening.md
git commit -m "docs(hoist): add release hardening reference

Claude-Session: https://claude.ai/code/session_013sN7Nj3DxZaBExyPiBepmh"
```

---

### Task 2: `release-templates.md` — GitHub Actions canonical workflow

**Files:** Create `skills/hoist/references/release-templates.md` (GitHub section; Azure appended in Task 3)

**Interfaces:**
- Produces anchors `## GitHub Actions` and, under it, the canonical workflow plus `### Trigger blocks`, `### Publish snippets by target`.
- Consumes concepts from `hardening.md`.

- [ ] **Step 1: Content check**

```bash
f=skills/hoist/references/release-templates.md
for s in "## GitHub Actions" "id-token: write" "--provenance" "npm view" "environment: release" "action-gh-release" "deploy-pages" "### Publish snippets by target"; do
  grep -qF "$s" "$f" 2>/dev/null || echo "MISSING: $s"
done
```

- [ ] **Step 2: Run it, confirm MISSING** (file absent).

- [ ] **Step 3: Create `skills/hoist/references/release-templates.md`** with the GitHub section:

````markdown
# Release Pipeline Templates

Canonical, composable hardened release workflows. The generator picks ONE
trigger block and ONE publish snippet for the detected target, and drops
unused jobs. Placeholders: `{DEFAULT_BRANCH}`, `{PKG_NAME}`, `{ARTIFACT}`.

## GitHub Actions

### Canonical release workflow

```yaml
name: Release

on: {} # replaced by ONE trigger block from "### Trigger blocks" below

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: write     # tag + create release
  id-token: write     # OIDC trusted publishing / keyless signing

jobs:
  release:
    runs-on: ubuntu-latest
    # environment: release   # uncomment for the optional approval gate (auto-bump)
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }

      # Resolve VERSION per trigger — see "### Trigger blocks".
      - name: Resolve version
        id: version
        run: echo "value=<resolved>" >> "$GITHUB_OUTPUT"

      # Idempotency guard (publish-before-git-write). Example: npm.
      - name: Skip if already published
        id: guard
        run: |
          if npm view "{PKG_NAME}@${{ steps.version.outputs.value }}" version >/dev/null 2>&1; then
            echo "exists=true" >> "$GITHUB_OUTPUT"
          else
            echo "exists=false" >> "$GITHUB_OUTPUT"
          fi

      - name: Build
        if: steps.guard.outputs.exists == 'false'
        run: echo "build {ARTIFACT}"    # replaced by detected build step

      # Publish — ONE snippet from "### Publish snippets by target".
      - name: Publish
        if: steps.guard.outputs.exists == 'false'
        run: npm publish --provenance --access public

      # Tag + release only after successful publish (auto-bump trigger).
      - name: Tag and release
        if: steps.guard.outputs.exists == 'false'
        uses: softprops/action-gh-release@v2
        with:
          tag_name: v${{ steps.version.outputs.value }}
          generate_release_notes: true
```

### Trigger blocks

Pick ONE and substitute into `on:` (and adjust the version-resolve step):

```yaml
# auto-bump on merge to main
on:
  push: { branches: [{DEFAULT_BRANCH}] }
# version-resolve: compute next semver patch (or conventional-commits) in-CI

# tag-triggered
on:
  push: { tags: ["v*"] }
# version-resolve: VERSION = ${GITHUB_REF_NAME#v}

# manual dispatch
on:
  workflow_dispatch:
    inputs: { version: { description: "x.y.z", required: true } }
# version-resolve: VERSION = ${{ inputs.version }}
```

### Publish snippets by target

Replace the "Publish" step body:

- **npm:** `npm publish --provenance --access public`
- **PyPI:** `- uses: pypa/gh-action-pypi-publish@release/v1` (with `id-token: write`; attestations on by default)
- **RubyGems:** `gem push {ARTIFACT}.gem` (OIDC trusted publishing)
- **crates.io (token):** `cargo publish` with `CARGO_REGISTRY_TOKEN` secret
- **NuGet (token):** `dotnet nuget push {ARTIFACT}.nupkg -k $NUGET_API_KEY -s https://api.nuget.org/v3/index.json`
- **Go:** no publish step — the tag is the release; the module proxy fetches it
- **Binaries → GitHub Release:** cross-compile matrix → `sha256sum * > SHA256SUMS` → optional `cosign sign-blob`/`minisign` → `softprops/action-gh-release@v2` with `files: dist/*`
- **Static site → Pages:** `- uses: actions/upload-pages-artifact@v3` then `- uses: actions/deploy-pages@v4` (`id-token: write`)
- **Serverless (Lambda):** `- uses: aws-actions/configure-aws-credentials@v4` (`role-to-assume`) then `aws lambda update-function-code ...`
````

- [ ] **Step 4: Run content check — no MISSING.**
- [ ] **Step 5:** `npm run validate && npm run lint`.
- [ ] **Step 6: Commit**

```bash
git add skills/hoist/references/release-templates.md
git commit -m "docs(hoist): add GitHub Actions release templates

Claude-Session: https://claude.ai/code/session_013sN7Nj3DxZaBExyPiBepmh"
```

---

### Task 3: `release-templates.md` — Azure Pipelines section

**Files:** Modify `skills/hoist/references/release-templates.md` (append Azure section)

**Interfaces:** Adds `## Azure Pipelines` with a canonical release pipeline using a WIF service connection where cloud auth is needed, the same trigger/publish composition, and the idempotency guard.

- [ ] **Step 1: Content check**

```bash
f=skills/hoist/references/release-templates.md
for s in "## Azure Pipelines" "azureSubscription" "workflow_dispatch:" ; do :; done
for s in "## Azure Pipelines" "azureSubscription" "npm view"; do grep -qF "$s" "$f" || echo "MISSING: $s"; done
```
(Note: `npm view` already present from Task 2; the Azure additions are `## Azure Pipelines` and `azureSubscription`.)

- [ ] **Step 2: Run it — expect MISSING `## Azure Pipelines`, MISSING `azureSubscription`.**

- [ ] **Step 3: Append the Azure section** to `skills/hoist/references/release-templates.md`:

````markdown
## Azure Pipelines

Canonical release pipeline. Cloud auth (Lambda/SWA) uses a Workload Identity
Federation service connection (`azureSubscription`); package registries use OIDC
or a scoped token secret per target.

```yaml
trigger:                      # pick ONE, mirroring the GitHub trigger blocks
  branches: { include: [{DEFAULT_BRANCH}] }   # auto-bump
  # tags: { include: ["v*"] }                 # tag-triggered
# (manual: use the Pipelines UI "Run pipeline" with a version variable)

pool: { vmImage: ubuntu-latest }

stages:
  - stage: Release
    jobs:
      - deployment: Publish
        environment: release   # optional approval gate (add a manual-approval check)
        strategy:
          runOnce:
            deploy:
              steps:
                - script: |
                    VERSION="<resolved per trigger>"
                    if npm view "{PKG_NAME}@$VERSION" version >/dev/null 2>&1; then
                      echo "##vso[task.setvariable variable=exists]true"
                    else
                      echo "##vso[task.setvariable variable=exists]false"
                    fi
                  displayName: Idempotency guard
                - script: npm publish --provenance --access public
                  condition: ne(variables.exists, 'true')
                  displayName: Publish (npm shown; swap per target)
                # Cloud targets: wrap deploy in AzureCLI@2 with azureSubscription (WIF).
```
````

- [ ] **Step 4: Run content check — no MISSING.**
- [ ] **Step 5:** `npm run validate && npm run lint`.
- [ ] **Step 6: Commit**

```bash
git add skills/hoist/references/release-templates.md
git commit -m "docs(hoist): add Azure Pipelines release template

Claude-Session: https://claude.ai/code/session_013sN7Nj3DxZaBExyPiBepmh"
```

---

### Task 4: `interview-guide.md` — detection + interview

**Files:** Create `skills/hoist/references/interview-guide.md`

**Interfaces:** Produces anchors `## Detection Prompt` and `## Interview Questions` cited by SKILL.md Phases 1–2.

- [ ] **Step 1: Content check**

```bash
for s in "## Detection Prompt" "## Interview Questions" "trigger model" "approval gate"; do
  grep -qF "$s" skills/hoist/references/interview-guide.md 2>/dev/null || echo "MISSING: $s"
done
```

- [ ] **Step 2: Run it — all MISSING.**

- [ ] **Step 3: Create `skills/hoist/references/interview-guide.md`**

````markdown
# Interview Guide

## Detection Prompt

Scan the repo and return a DETECTION_REPORT (max 20 lines):
- language/framework
- manifest(s): package.json / pyproject.toml / Cargo.toml / *.gemspec / *.csproj / go.mod
- target family: `package` (library) | `binaries` (app shipping executables) |
  `static` (static-site framework) | `serverless` (function handler)
- detected registry from manifest metadata (npm/PyPI/crates/RubyGems/NuGet/Go)
- existing CI: .github/workflows/ , azure-pipelines.yml
- existing release config

## Interview Questions

Ask only where detection is ambiguous; confirm otherwise.

1. **Target family** — confirm `package` / `binaries` / `static` / `serverless`.
2. **Registry / host** — the specific index (npm/PyPI/…), GitHub Releases vs
   Azure artifacts, GitHub Pages vs Azure Static Web Apps, or the serverless
   provider (Lambda/Cloudflare/Vercel/Deno).
3. **Trigger model** — auto-bump-on-merge / tag-triggered / manual-dispatch.
4. **Approval gate** — (auto-bump only) run publish in a protected `release`
   environment with required reviewers? Default: no.
5. **Signing** — (binaries) cosign keyless / minisign / none.

`--skip-interview`: use detected defaults + GitHub Releases/Pages, OIDC where
supported, auto-bump, no approval gate.
````

- [ ] **Step 4: Content check — no MISSING.**
- [ ] **Step 5:** `npm run validate && npm run lint`.
- [ ] **Step 6: Commit**

```bash
git add skills/hoist/references/interview-guide.md
git commit -m "docs(hoist): add detection and interview guide

Claude-Session: https://claude.ai/code/session_013sN7Nj3DxZaBExyPiBepmh"
```

---

### Task 5: `setup-guides.md` — per-target SETUP.md bodies

**Files:** Create `skills/hoist/references/setup-guides.md`

**Interfaces:** Produces anchor `## Generated deploy/SETUP.md` cited by SKILL.md Phase 3.

- [ ] **Step 1: Content check**

```bash
for s in "## Generated deploy/SETUP.md" "trusted publisher" "Token exception" "GitHub Pages" "OWNER/REPO"; do
  grep -qF "$s" skills/hoist/references/setup-guides.md 2>/dev/null || echo "MISSING: $s"
done
```

- [ ] **Step 2: Run it — all MISSING.**

- [ ] **Step 3: Create `skills/hoist/references/setup-guides.md`**

````markdown
# Setup Guides

`/hoist` writes `deploy/SETUP.md` into the target repo, tailored to the chosen
target. Bodies below (substitute `OWNER/REPO`, package name, workflow filename).

## Generated deploy/SETUP.md

### npm / PyPI / RubyGems (trusted publisher — no token)
- Configure the **trusted publisher** on the registry: reference repo `OWNER/REPO`
  and the workflow filename (e.g. `.github/workflows/release.yml`).
- No token to create. The workflow's `id-token: write` does the rest.

### crates.io / NuGet / Cloudflare / Vercel / Deno (Token exception)
- Create a scoped, publish-only token on the platform.
- Store it as the named CI secret (`CARGO_REGISTRY_TOKEN` / `NUGET_API_KEY` /
  `CLOUDFLARE_API_TOKEN` / `VERCEL_TOKEN` / `DENO_DEPLOY_TOKEN`).
- This is the documented exception to the no-token rule.

### GitHub Pages
- Repo Settings → Pages → Source: **GitHub Actions**. No token.

### Serverless (AWS Lambda)
- Create an IAM role trusting the GitHub OIDC provider, condition
  `sub = repo:OWNER/REPO:ref:refs/heads/main`; grant the lambda update
  permissions; put the role ARN in `role-to-assume`. Or run `/keel` to
  provision this.

### Approval gate (optional, auto-bump)
- Create a `release` environment and add required reviewers so publishing pauses
  for approval.
````

- [ ] **Step 4: Content check — no MISSING.**
- [ ] **Step 5:** `npm run validate && npm run lint`.
- [ ] **Step 6: Commit**

```bash
git add skills/hoist/references/setup-guides.md
git commit -m "docs(hoist): add per-target setup guides

Claude-Session: https://claude.ai/code/session_013sN7Nj3DxZaBExyPiBepmh"
```

---

### Task 6: `SKILL.md` — frontmatter, banner, five phases

**Files:** Create `skills/hoist/SKILL.md`

**Interfaces:** Consumes all four references (Tasks 1–5). This is the skill entry point.

- [ ] **Step 1: Content check**

```bash
f=skills/hoist/SKILL.md
for s in "name: hoist" "argument-hint:" "allowed-tools:" "██" "Pre-flight" "hardening.md" "release-templates.md" "interview-guide.md" "setup-guides.md" "deploy/SETUP.md" "Required setup"; do
  grep -qF "$s" "$f" 2>/dev/null || echo "MISSING: $s"
done
```

- [ ] **Step 2: Run it — all MISSING.**

- [ ] **Step 3: Create `skills/hoist/SKILL.md`** with this structure (fill the banner with an ANSI-shadow rendering of "HOIST" like the other skills; keep 8 taglines):

````markdown
---
name: hoist
description: >-
  Generate secure, low-infrastructure release pipelines that publish artifacts
  directly — language packages (npm, PyPI, crates, RubyGems, NuGet, Go), GitHub
  Releases with binaries, static sites/Pages, or serverless functions — without
  building a container image. OIDC/trusted publishing, provenance, idempotent
  publish guards, and three trigger models (auto-bump with optional approval,
  tag, manual). The non-container sibling of /dock. Use when releasing a package
  or app that doesn't ship as a container.
argument-hint: "--skip-interview, --dry-run, --registry <name>"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, Agent
---

# Hoist - Non-Container Release Pipelines

When this skill is invoked, IMMEDIATELY output the banner below before doing anything else.
Pick ONE tagline at random — vary your choice each time.
CRITICAL: Reproduce the banner EXACTLY character-for-character. The first line of the art has 4 leading characters (one invisible braille-blank + 3 spaces) — you MUST preserve them.

```
{tagline}

⠀   ██╗██╗  ██╗ ██████╗ ██╗███████╗████████╗
   ██╔╝██║  ██║██╔═══██╗██║██╔════╝╚══██╔══╝
  ██╔╝ ███████║██║   ██║██║███████╗   ██║
 ██╔╝  ██╔══██║██║   ██║██║╚════██║   ██║
██╔╝   ██║  ██║╚██████╔╝██║███████║   ██║
╚═╝    ╚═╝  ╚═╝ ╚═════╝ ╚═╝╚══════╝   ╚═╝
```

Taglines:
- 📦 Up and away — published!
- 🏗️ Hoisting your release skyward!
- 🚀 From main to registry in one pull!
- 🪝 Latched on, lifting off!
- ⬆️ Straight to the top shelf!
- 🎁 Wrapped, signed, and shipped!
- 🛎️ Release, served fresh!
- 🔖 Tag it and bag it!

## Flags
- `--skip-interview`: detected + platform-aware defaults
- `--dry-run`: show generated files without writing
- `--registry <name>`: force the target registry

## Output Formatting
(Input box, Pre-flight table, stage headers, status icons — copy the conventions
from skills/dock/SKILL.md.)

## Pre-flight
6-column dependency table: git (required, stop), gh (optional for GitHub release
ops), sync (optional skill, fallback git pull), node/language toolchain (optional,
detected). Follow the resolution-strategy list format used by other skills.

## Platform Detection
Detect github vs azdo from the remote URL (same block as skills/dock/SKILL.md).

## Phase 0: Sync
Invoke /sync (fallback git pull).

## Phase 1: Detection
Explore subagent using references/interview-guide.md#detection-prompt → DETECTION_REPORT.

## Phase 2: Interview
Follow references/interview-guide.md#interview-questions. Compile HOIST_CONFIG
(target, registry/host, trigger model, approval gate, signing).

## Phase 3: Generate
Read references/release-templates.md and references/hardening.md. Emit the CI
workflow for the detected target + chosen trigger (secure by default: id-token,
provenance, idempotent publish guard, concurrency; token exceptions per
hardening.md). For binaries, add SHA256SUMS + optional signing. Generate
deploy/SETUP.md from references/setup-guides.md.

## Phase 4: Verify
Validate workflow YAML. Confirm the generated workflow carries the required
hardening for its target (OIDC/`id-token: write` or a flagged token secret;
provenance where supported; the version-exists guard; publish-before-tag).
--dry-run previews without writing.

## Final Report
Box report with target, trigger model, generated files, and a 🔐 Required setup
section pointing at deploy/SETUP.md.

## Integration
Complements /dock (containers) — pick whichever fits. Runs after /rig; /ship's
merge can trigger the generated auto-bump release. Only the serverless target may
reference /keel for cloud identity.
````

- [ ] **Step 4: Content check — no MISSING.**
- [ ] **Step 5:** `npm run validate && npm run lint` — must pass (validator checks frontmatter fields, dependency table, banner presence).
- [ ] **Step 6: Commit**

```bash
git add skills/hoist/SKILL.md
git commit -m "feat(hoist): add SKILL.md with five-phase release pipeline flow

Claude-Session: https://claude.ai/code/session_013sN7Nj3DxZaBExyPiBepmh"
```

---

### Task 7: `evals.json` — behavioral evals

**Files:** Create `skills/hoist/tests/evals.json`

- [ ] **Step 1: Create `skills/hoist/tests/evals.json`**

```json
[
  {
    "name": "banner-display",
    "prompt": "/hoist",
    "assertions": [
      { "type": "contains", "value": "██" },
      { "type": "semantic", "value": "Displays an ASCII art banner for the hoist skill before doing anything else" }
    ]
  },
  {
    "name": "npm-trusted-publishing",
    "prompt": "/hoist --skip-interview for an npm library",
    "assertions": [
      { "type": "semantic", "value": "Uses npm OIDC trusted publishing with no stored NODE_AUTH_TOKEN" },
      { "type": "semantic", "value": "Publishes with provenance (npm publish --provenance)" },
      { "type": "semantic", "value": "Guards publish with a version-already-exists check so re-runs are idempotent" }
    ]
  },
  {
    "name": "binaries-release",
    "prompt": "/hoist for a Go CLI that ships cross-platform binaries",
    "assertions": [
      { "type": "semantic", "value": "Builds cross-platform binaries in a matrix and produces SHA256SUMS checksums" },
      { "type": "semantic", "value": "Attaches the artifacts to a GitHub Release" }
    ]
  },
  {
    "name": "auto-bump-approval",
    "prompt": "/hoist an npm package, auto-bump on merge to main with an approval gate before publishing",
    "assertions": [
      { "type": "semantic", "value": "Auto-computes the next version and publishes on merge to the default branch" },
      { "type": "semantic", "value": "Runs the publish step behind an environment approval gate requiring a human reviewer" },
      { "type": "semantic", "value": "Generates a deploy/SETUP.md describing the required one-time setup" }
    ]
  }
]
```

- [ ] **Step 2: Validate JSON + skill**

Run: `node -e "JSON.parse(require('fs').readFileSync('skills/hoist/tests/evals.json','utf8'))" && npm run validate && npm run lint`
Expected: no JSON error; validate + lint pass.

- [ ] **Step 3: Commit**

```bash
git add skills/hoist/tests/evals.json
git commit -m "test(hoist): add behavioral evals

Claude-Session: https://claude.ai/code/session_013sN7Nj3DxZaBExyPiBepmh"
```

---

### Task 8: Register the skill (manifest + CLAUDE.md)

**Files:** Modify `CLAUDE.md`; regenerate `skills/manifest.json`

- [ ] **Step 1: Regenerate the manifest**

Run: `npm run build:manifests`
Expected: `skills/manifest.json` now includes a `hoist` entry (verify: `node -e "const m=require('./skills/manifest.json'); console.log(JSON.stringify(m).includes('hoist'))"` prints `true`).

- [ ] **Step 2: Update `CLAUDE.md`** — make these edits:
  - In the "When to Use Each Skill" table, add a row: `| Releasing a non-container package/app | `/hoist` | `/hoist` or `/hoist --skip-interview` |`.
  - In "Proactive Skill Suggestions", add: `- User mentions publishing a package, npm/PyPI release, GitHub Release, or Pages deploy → `/hoist``.
  - In "Lifecycle Ordering", note `/hoist` as the non-container counterpart to `/dock`.
  - In the platform-support section, add `/hoist` to platform-aware skills.
  - Update any "10 skills" / "ships 10 skills" counts to the new total (11, excluding archived; confirm current count first with `ls -d skills/*/ | wc -l`).

- [ ] **Step 3: Validate**

Run: `npm run validate && npm run lint`
Expected: both pass; `hoist` appears in the validate output as a valid skill.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md skills/manifest.json
git commit -m "chore(hoist): register skill in manifest and CLAUDE.md

Claude-Session: https://claude.ai/code/session_013sN7Nj3DxZaBExyPiBepmh"
```

---

### Task 9: Ship

- [ ] **Step 1: Final check** — `npm run validate && npm run lint` (and `node --test scripts/lib/*.test.js` if present) all pass.
- [ ] **Step 2:** Invoke `/ship` (or PR `feat/hoist-skill-spec` → main). CI runs validate + lint; squash-merge on green.

---

## Self-Review

**Spec coverage:**
- Four target modules → Task 2/3 publish snippets (npm/PyPI/RubyGems/crates/NuGet/Go, binaries, Pages, serverless). ✅
- Three trigger models + optional approval gate → Task 2 trigger blocks + `environment: release`; Task 3 Azure; Task 4 interview; Task 5 setup. ✅
- Hardening spine (OIDC/trusted publishing, provenance, idempotent guard, token exceptions, approval) → Task 1. ✅
- GH + Azure, no GitLab → Tasks 2–3; Global Constraints. ✅
- deploy/SETUP.md + 🔐 report → Task 5 + Task 6 Phase 3/Final Report. ✅
- Five phases → Task 6. ✅
- Evals → Task 7. Registration (manifest + CLAUDE.md) → Task 8. ✅

**Placeholder scan:** `{DEFAULT_BRANCH}`, `{PKG_NAME}`, `{ARTIFACT}`, `OWNER/REPO`, `<resolved>` are intentional generator placeholders consistent with `/dock`. The SKILL.md banner art is now pre-rendered verbatim in Task 6 Step 3 (ANSI-shadow "HOIST" with the leading slash-diagonal) — pure transcription, no implementer generation. Step 5's validator gate (`██` present + structure valid) still guards against a mangled paste.

**Type/name consistency:** reference anchors produced in Tasks 1/2/3/4/5 (`## Trusted Publishing (OIDC)`, `## GitHub Actions`, `## Azure Pipelines`, `## Detection Prompt`, `## Interview Questions`, `## Generated deploy/SETUP.md`) are exactly the strings SKILL.md (Task 6) and the content-checks reference. Secret names in Task 1 (`CARGO_REGISTRY_TOKEN`, etc.) match Task 5's SETUP body.
