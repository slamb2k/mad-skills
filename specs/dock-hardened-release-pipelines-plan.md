# /dock Hardened Release Pipelines — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port mad-skills' own release-hardening (OIDC trusted publishing, signing/provenance, idempotent recovery, digest promotion) into the container pipelines `/dock` generates, for GitHub Actions + Azure Pipelines, secure by default.

**Architecture:** Inline, secure-by-default. Rewrite the GitHub Actions and Azure Pipelines sections of `skills/dock/references/pipeline-templates.md` so the hardened variant is the only variant; add a new `skills/dock/references/hardening.md` reference (rationale + the `deploy/SETUP.md` content dock emits); wire `skills/dock/SKILL.md` Phase 3/4/report to use them; extend `skills/dock/tests/evals.json`.

**Tech Stack:** Markdown skill templates (no runtime code). GitHub Actions (`docker/build-push-action`, `sigstore/cosign-installer`, `imjasonh/setup-crane`, `aws-actions/configure-aws-credentials`, `azure/login`, `google-github-actions/auth`). Azure Pipelines with Workload Identity Federation. Validation via `node scripts/validate-skills.js` and `node scripts/lint-skills.js`.

## Global Constraints

- Skill under change: `skills/dock` only. Do not modify other skills.
- Hardened is the **only** variant for GitHub Actions + Azure Pipelines — no dual templates.
- **GitLab CI section is left untouched.** (Non-goal.)
- No stored long-lived cloud credentials in generated pipelines — cloud registry auth is **OIDC/WIF**. GHCR keeps its ephemeral `GITHUB_TOKEN`.
- Keyless cosign (public Fulcio/Rekor) is the default; key-pair fallback is **documented, not generated**.
- Deployment references images by **immutable `@sha256:` digest**, never a mutable tag.
- Every task ends green on `npm run validate && npm run lint`.
- Commit style: conventional commits, scope `dock`. End commit messages with `Claude-Session: https://claude.ai/code/session_013sN7Nj3DxZaBExyPiBepmh`.
- Work happens on branch `feat/dock-hardened-pipelines` (created in Task 0).

---

## File Structure

| File | Responsibility |
|------|----------------|
| `skills/dock/references/hardening.md` | **New.** Explains OIDC federation, keyless cosign, digest promotion, idempotency guards; holds the canonical `deploy/SETUP.md` body dock writes per registry. |
| `skills/dock/references/pipeline-templates.md` | GitHub Actions + Azure Pipelines sections rewritten hardened. GitLab section unchanged. |
| `skills/dock/SKILL.md` | Phase 3 references hardened templates + emits `deploy/SETUP.md`; Phase 4 adds cosign/OIDC verify notes; Final Report gains 🔐 section. |
| `skills/dock/tests/evals.json` | Behavioral assertions for the hardened output. |

---

### Task 0: Branch

**Files:** none (git only)

- [ ] **Step 1: Create the working branch**

```bash
cd /home/slamb2k/work/mad-skills
git checkout main && git pull --ff-only origin main
git checkout -b feat/dock-hardened-pipelines
```

- [ ] **Step 2: Verify baseline is green**

Run: `npm run validate && npm run lint`
Expected: both pass (exit 0).

---

### Task 1: `hardening.md` reference + SETUP.md body

**Files:**
- Create: `skills/dock/references/hardening.md`

**Interfaces:**
- Produces: a reference with these exact `##` anchors that SKILL.md and later tasks cite — `## OIDC Registry Auth`, `## Signing & Provenance`, `## Idempotency Guards`, `## Digest-Pinned Promotion`, `## Generated deploy/SETUP.md`.

- [ ] **Step 1: Write the content check (the "failing test")**

Create `scratch check` expectation — after writing the file these greps must all return a match:
```bash
for s in "## OIDC Registry Auth" "## Signing & Provenance" "## Idempotency Guards" "## Digest-Pinned Promotion" "## Generated deploy/SETUP.md"; do
  grep -qF "$s" skills/dock/references/hardening.md || echo "MISSING: $s"
done
```

- [ ] **Step 2: Run it to confirm it fails**

Run the loop above.
Expected: every section prints `MISSING:` (file does not exist yet → grep errors / all missing).

- [ ] **Step 3: Write `skills/dock/references/hardening.md`**

````markdown
# Pipeline Hardening Reference

How `/dock` hardens the pipelines it generates. These patterns mirror
mad-skills' own release workflow, translated from npm publishing to OCI
containers. Hardened is the only mode for GitHub Actions and Azure Pipelines.

## OIDC Registry Auth

Never store long-lived cloud registry credentials in CI. Authenticate with the
CI provider's OIDC identity, federated to a cloud role/identity.

- **GHCR** — keep the ephemeral `GITHUB_TOKEN` (already short-lived, OIDC-backed).
  Requires `permissions: packages: write`.
- **AWS ECR** — `aws-actions/configure-aws-credentials@v4` with `role-to-assume`
  (an IAM role trusting the GitHub OIDC provider). No access keys.
- **Azure ACR** — `azure/login@v2` with Workload Identity Federation
  (`client-id` + `tenant-id` + `subscription-id`, federated credential scoped to
  the repo). No client secret. Then `az acr login`.
- **Google Artifact Registry** — `google-github-actions/auth@v2` with a Workload
  Identity Provider + service account. No SA key JSON.

All jobs that need OIDC set `permissions: id-token: write` (plus
`contents: read`). Azure Pipelines uses a **Workload Identity Federation service
connection** (`azureSubscription:`) instead of a stored password.

## Signing & Provenance

- Build with `provenance: true` and `sbom: true` (buildx emits SLSA provenance +
  SBOM attestations attached to the image).
- Sign the image **by digest** with keyless cosign (Fulcio certificate + Rekor
  transparency log, authorized by the `id-token: write` OIDC token — no signing
  key in secrets).
- Every promotion job runs `cosign verify` against the digest, asserting the
  certificate identity matches the workflow's OIDC issuer and
  `repo:OWNER/REPO`. Verification failure blocks promotion.

> **Private-infra note:** keyless cosign writes to the public Rekor log. Orgs
> that cannot use public transparency infra can switch to a key pair
> (`cosign generate-key-pair`, private key in a CI secret,
> `cosign sign --key`). This is a documented fallback — dock does not generate it.

## Idempotency Guards

- Before build, guard with `crane manifest <ref>` (fallback:
  `docker manifest inspect`). If the artifact already exists, skip build+push and
  reuse the existing digest — the container analog of mad-skills' `npm view`
  publish-guard.
- Promote/retag steps are check-then-act and tolerate an already-promoted digest
  ("recovery mode") so a re-run exits cleanly instead of failing.
- A `concurrency:` group keyed on workflow + ref (`cancel-in-progress`) prevents
  overlapping release runs from racing.

## Digest-Pinned Promotion

- The build job outputs `IMAGE@sha256:<digest>` as a job output.
- Dev, staging, and prod deploy by that **digest**, never a mutable tag. Tags
  like `latest` / `vX.Y.Z` may be attached for humans, but deploys resolve the
  digest.
- `deploy/environments.yml` records the deployed digest so the matrix captures
  exactly what shipped.

## Generated deploy/SETUP.md

`/dock` writes `deploy/SETUP.md` into the target repo, tailored to the chosen
registry. Template body (substitute `OWNER/REPO`, registry, cloud identifiers):

```markdown
# Deployment Setup — Required Before First Run

This pipeline uses keyless OIDC and image signing. Complete the cloud-side
trust below once; no long-lived credentials are stored in CI.

## 1. Federated identity (pick your registry)

### AWS ECR
- Create an IAM role trusting the GitHub OIDC provider
  (`token.actions.githubusercontent.com`), condition
  `token.actions.githubusercontent.com:sub = repo:OWNER/REPO:ref:refs/heads/main`
  (add tag refs for releases).
- Attach a policy allowing `ecr:*` push to your repository.
- Put the role ARN in the workflow `role-to-assume`.

### Azure ACR
- Register an app / user-assigned managed identity.
- Add a **federated credential** scoped to `repo:OWNER/REPO` (branch `main` and
  tag refs), subject `repo:OWNER/REPO:ref:refs/heads/main`.
- Grant it `AcrPush` on the registry.
- Set `client-id` / `tenant-id` / `subscription-id` in the workflow.

### Google Artifact Registry
- Create a Workload Identity Pool + provider for GitHub.
- Bind a service account with `artifactregistry.writer`, allowing
  `principalSet://…/attribute.repository/OWNER/REPO`.
- Set `workload_identity_provider` + `service_account` in the workflow.

## 2. Signing

Keyless cosign needs no setup — it uses the workflow OIDC token and the public
Rekor log. To verify locally:
`cosign verify --certificate-identity-regexp 'https://github.com/OWNER/REPO/.*' --certificate-oidc-issuer https://token.actions.githubusercontent.com REGISTRY/IMAGE@sha256:...`

If public transparency logging is not allowed, switch to a key pair (see the
Signing & Provenance note in the dock hardening reference).
```
````

- [ ] **Step 4: Run the content check to verify it passes**

Run the grep loop from Step 1.
Expected: no `MISSING:` lines.

- [ ] **Step 5: Validate + lint**

Run: `npm run validate && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add skills/dock/references/hardening.md
git commit -m "docs(dock): add pipeline hardening reference and SETUP.md body

Claude-Session: https://claude.ai/code/session_013sN7Nj3DxZaBExyPiBepmh"
```

---

### Task 2: Harden the GitHub Actions template

**Files:**
- Modify: `skills/dock/references/pipeline-templates.md` (GitHub Actions section — the `## GitHub Actions` → `### Build & Deploy Workflow` block currently using `docker/login-action` + `secrets.GITHUB_TOKEN`)

**Interfaces:**
- Consumes: the concepts from `hardening.md` (Task 1).
- Produces: a GH Actions template that contains `id-token: write`, `provenance: true`, `cosign sign`, `cosign verify`, a `crane manifest` guard, and a `@sha256:` digest job output named `image` referenced by deploy jobs.

- [ ] **Step 1: Write the content check**

After the edit these greps must all pass against the GitHub Actions section:
```bash
sec=skills/dock/references/pipeline-templates.md
for s in "id-token: write" "provenance: true" "cosign sign" "cosign verify" "crane manifest" "sha256"; do
  grep -qF "$s" "$sec" || echo "MISSING: $s"
done
```

- [ ] **Step 2: Run it to confirm it fails**

Run the loop.
Expected: `MISSING: id-token: write`, `MISSING: provenance: true`, `MISSING: cosign sign`, `MISSING: cosign verify`, `MISSING: crane manifest` (current template has none of these; `sha256` may already appear — that line may pass).

- [ ] **Step 3: Replace the GitHub Actions Build & Deploy workflow block**

Replace the existing `### Build & Deploy Workflow` YAML under `## GitHub Actions` with:

````markdown
### Build & Deploy Workflow (hardened)

Placeholders: `{REGISTRY}` (e.g. `ghcr.io/OWNER/REPO`), `{IMAGE_NAME}`.
GHCR uses the ephemeral `GITHUB_TOKEN`; cloud registries use OIDC (see the
commented block). Deployment is by digest and gated on signature verification.

```yaml
name: Release

on:
  pull_request:
  push:
    branches: [main]
    tags: ["v*"]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  REGISTRY: {REGISTRY}
  IMAGE_NAME: {IMAGE_NAME}

permissions:
  contents: read
  packages: write      # GHCR push
  id-token: write       # OIDC: cloud login + keyless cosign

jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      image: ${{ steps.digest.outputs.ref }}   # REGISTRY/IMAGE@sha256:...
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - uses: imjasonh/setup-crane@v0.4

      # Idempotency guard: skip build if this commit's image already exists.
      - name: Check existing image
        id: guard
        run: |
          TAG="${REGISTRY}/${IMAGE_NAME}:${GITHUB_SHA::7}"
          if crane manifest "$TAG" >/dev/null 2>&1; then
            echo "exists=true" >> "$GITHUB_OUTPUT"
            echo "::notice::$TAG already present — reusing digest."
          else
            echo "exists=false" >> "$GITHUB_OUTPUT"
          fi

      # GHCR login (ephemeral token). For cloud registries, replace with OIDC:
      #   AWS ECR:  aws-actions/configure-aws-credentials@v4 (role-to-assume) + aws ecr get-login-password
      #   Azure ACR: azure/login@v2 (WIF client-id/tenant-id/subscription-id) + az acr login
      #   GAR:      google-github-actions/auth@v2 (workload_identity_provider + service_account) + gcloud auth configure-docker
      - name: Login to GHCR
        if: steps.guard.outputs.exists == 'false'
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        id: build
        if: steps.guard.outputs.exists == 'false'
        uses: docker/build-push-action@v6
        with:
          context: .
          target: production
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest
          provenance: true
          sbom: true

      - uses: sigstore/cosign-installer@v3

      - name: Sign image (keyless)
        if: steps.guard.outputs.exists == 'false'
        run: cosign sign --yes "${REGISTRY}/${IMAGE_NAME}@${{ steps.build.outputs.digest }}"

      - name: Resolve digest reference
        id: digest
        run: |
          if [ "${{ steps.guard.outputs.exists }}" = "true" ]; then
            DIG=$(crane digest "${REGISTRY}/${IMAGE_NAME}:${GITHUB_SHA::7}")
          else
            DIG="${{ steps.build.outputs.digest }}"
          fi
          echo "ref=${REGISTRY}/${IMAGE_NAME}@${DIG}" >> "$GITHUB_OUTPUT"

  deploy-dev:
    needs: build
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: sigstore/cosign-installer@v3
      - name: Verify signature before deploy
        run: |
          cosign verify \
            --certificate-identity-regexp "https://github.com/${{ github.repository }}/.*" \
            --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
            "${{ needs.build.outputs.image }}"
      - name: Deploy to dev (by digest — never rebuild)
        run: echo "Deploy ${{ needs.build.outputs.image }} to dev"

  promote:
    needs: build
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: sigstore/cosign-installer@v3
      - name: Verify signature
        run: |
          cosign verify \
            --certificate-identity-regexp "https://github.com/${{ github.repository }}/.*" \
            --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
            "${{ needs.build.outputs.image }}"
      - name: Promote to staging (by digest)
        run: echo "Deploy ${{ needs.build.outputs.image }} to staging"
      - name: Promote to prod (by digest)
        run: echo "Deploy ${{ needs.build.outputs.image }} to prod"
```
````

- [ ] **Step 4: Run the content check to verify it passes**

Run the grep loop from Step 1.
Expected: no `MISSING:` lines.

- [ ] **Step 5: Validate + lint**

Run: `npm run validate && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add skills/dock/references/pipeline-templates.md
git commit -m "feat(dock): harden GitHub Actions template (OIDC, cosign, digest promote)

Claude-Session: https://claude.ai/code/session_013sN7Nj3DxZaBExyPiBepmh"
```

---

### Task 3: Harden the Azure Pipelines template

**Files:**
- Modify: `skills/dock/references/pipeline-templates.md` (Azure Pipelines section — currently `$(registry)` service-connection + stored password)

**Interfaces:**
- Produces: an Azure Pipelines template that authenticates to ACR via a **Workload Identity Federation service connection** (`azureSubscription:`), signs with cosign, verifies before promotion, and deploys by `@sha256:` digest.

- [ ] **Step 1: Write the content check**

```bash
sec=skills/dock/references/pipeline-templates.md
for s in "azureSubscription" "WorkloadIdentity" "cosign sign" "cosign verify" "sha256"; do
  grep -qF "$s" "$sec" || echo "MISSING: $s"
done
```

- [ ] **Step 2: Run it to confirm it fails**

Run the loop.
Expected: `MISSING: azureSubscription`, `MISSING: WorkloadIdentity`, `MISSING: cosign sign`, `MISSING: cosign verify` (current Azure section uses `$(registry)` password auth; note `azureSubscription`/`WorkloadIdentity` may be absent).

- [ ] **Step 3: Replace the Azure Pipelines section**

Replace the existing `## Azure DevOps Pipelines` YAML block with:

````markdown
## Azure DevOps Pipelines (hardened)

Uses a **Workload Identity Federation** service connection (`azureSubscription`)
for keyless ACR auth — no stored registry password. Images are signed and
deployed by digest.

```yaml
trigger:
  branches: { include: [main] }
  tags: { include: ["v*"] }

variables:
  azureSubscription: "<WIF-service-connection-name>"   # Workload Identity Federation
  registry: {REGISTRY}
  imageName: {IMAGE_NAME}

stages:
  - stage: Build
    jobs:
      - job: BuildSignPush
        pool: { vmImage: ubuntu-latest }
        steps:
          - task: AzureCLI@2
            displayName: ACR login (WorkloadIdentityFederation)
            inputs:
              azureSubscription: $(azureSubscription)
              scriptType: bash
              scriptLocation: inlineScript
              inlineScript: az acr login --name $(echo $(registry) | cut -d. -f1)

          - script: |
              TAG="$(registry)/$(imageName):$(Build.SourceVersion)"
              if docker manifest inspect "$TAG" >/dev/null 2>&1; then
                echo "##vso[task.setvariable variable=exists]true"
              else
                echo "##vso[task.setvariable variable=exists]false"
              fi
            displayName: Idempotency guard

          - script: |
              docker buildx build --target production \
                --provenance=true --sbom=true --push \
                -t $(registry)/$(imageName):$(Build.SourceVersion) .
              DIG=$(docker buildx imagetools inspect $(registry)/$(imageName):$(Build.SourceVersion) --format '{{.Manifest.Digest}}')
              echo "##vso[task.setvariable variable=digestRef;isOutput=true]$(registry)/$(imageName)@$DIG"
            name: build
            condition: ne(variables.exists, 'true')
            displayName: Build, provenance, push

          - script: cosign sign --yes $(build.digestRef)
            condition: ne(variables.exists, 'true')
            displayName: Sign image (keyless)

  - stage: Promote
    dependsOn: Build
    condition: startsWith(variables['Build.SourceBranch'], 'refs/tags/v')
    jobs:
      - job: VerifyAndDeploy
        pool: { vmImage: ubuntu-latest }
        variables:
          digestRef: $[ stageDependencies.Build.BuildSignPush.outputs['build.digestRef'] ]
        steps:
          - script: |
              cosign verify \
                --certificate-identity-regexp ".*" \
                --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
                $(digestRef)
            displayName: Verify signature (by sha256 digest)
          - script: echo "Deploy $(digestRef) to staging then prod (no rebuild)"
            displayName: Promote by digest
```
````

- [ ] **Step 4: Run the content check to verify it passes**

Run the grep loop from Step 1.
Expected: no `MISSING:` lines.

- [ ] **Step 5: Validate + lint**

Run: `npm run validate && npm run lint`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add skills/dock/references/pipeline-templates.md
git commit -m "feat(dock): harden Azure Pipelines template (WIF, cosign, digest promote)

Claude-Session: https://claude.ai/code/session_013sN7Nj3DxZaBExyPiBepmh"
```

---

### Task 4: Wire SKILL.md to the hardened templates + SETUP.md + report

**Files:**
- Modify: `skills/dock/SKILL.md` (Phase 3.3 CI/CD Workflow; Phase 3 add SETUP.md artifact; Phase 4 Verify; Final Report)

**Interfaces:**
- Consumes: `references/hardening.md` (Task 1) and the hardened sections of `references/pipeline-templates.md` (Tasks 2–3).
- Produces: SKILL.md instructions telling dock to read hardening.md, emit `deploy/SETUP.md`, and print a 🔐 section.

- [ ] **Step 1: Write the content check**

```bash
for s in "hardening.md" "deploy/SETUP.md" "Required cloud setup" "cosign"; do
  grep -qF "$s" skills/dock/SKILL.md || echo "MISSING: $s"
done
```

- [ ] **Step 2: Run it to confirm it fails**

Run the loop.
Expected: `MISSING: hardening.md`, `MISSING: deploy/SETUP.md`, `MISSING: Required cloud setup`, `MISSING: cosign`.

- [ ] **Step 3: Edit Phase 3.3 (CI/CD Workflow)**

In `## Phase 3: Generate Artifacts` → `### 3.3 — CI/CD Workflow`, after the line
`Read the appropriate template from `references/pipeline-templates.md`.` add:

```markdown
For GitHub Actions and Azure Pipelines, the templates are **hardened by default**
— read `references/hardening.md` for the OIDC auth, keyless cosign signing,
idempotency guards, and digest-pinned promotion these templates implement. The
generated workflow MUST include `id-token: write`, `provenance: true`, a cosign
`sign` in the build job and `verify` in every promotion job, an existence guard
before build, and deploy steps that reference the image by `@sha256:` digest.
(GitLab CI remains credential-based.)
```

- [ ] **Step 4: Add the SETUP.md artifact sub-section**

After `### 3.6 — Health Check Endpoint Guidance`, add a new sub-section:

```markdown
### 3.7 — Deployment Setup Guide (deploy/SETUP.md)

Because the pipelines are secure by default, first-run requires one-time
cloud-side trust. Generate `deploy/SETUP.md` from the **Generated deploy/SETUP.md**
section of `references/hardening.md`, substituting the target repo (`OWNER/REPO`),
chosen registry, and cloud identifiers. This file lists the federated-credential
/ IAM-trust steps and the cosign verification command.
```

- [ ] **Step 5: Edit Phase 4 (Verify)**

In `## Phase 4: Verify`, after the workflow YAML-validation bullets, add:

```markdown
- Confirm the generated GitHub/Azure workflow sets `id-token: write`, contains a
  cosign `sign`+`verify` pair, and references deploy images by `@sha256:` digest.
  These are required — flag their absence as a generation error.
```

- [ ] **Step 6: Edit the Final Report block**

In the Final Report box, add a 🔐 section between `📊 Pipeline flow` and `🔗 Links`:

```markdown
│  🔐 Required cloud setup
│     • Configure federated identity (see deploy/SETUP.md)
│     • {registry-specific: IAM role / ACR federated cred / GCP WIP}
│     • First run fails until trust is configured — this is expected
│
```

- [ ] **Step 7: Run the content check to verify it passes**

Run the grep loop from Step 1.
Expected: no `MISSING:` lines.

- [ ] **Step 8: Validate + lint**

Run: `npm run validate && npm run lint`
Expected: both pass.

- [ ] **Step 9: Commit**

```bash
git add skills/dock/SKILL.md
git commit -m "feat(dock): wire hardened templates, SETUP.md, and cloud-setup report

Claude-Session: https://claude.ai/code/session_013sN7Nj3DxZaBExyPiBepmh"
```

---

### Task 5: Behavioral evals

**Files:**
- Modify: `skills/dock/tests/evals.json`

**Interfaces:**
- Consumes: the hardened behavior from Tasks 1–4.
- Produces: a new eval case asserting dock describes OIDC/signing/digest promotion and generating `deploy/SETUP.md`.

- [ ] **Step 1: Add the eval case**

Append this object to the JSON array in `skills/dock/tests/evals.json` (before the closing `]`, comma-separated):

```json
{
  "name": "hardened-pipeline",
  "prompt": "/dock --skip-interview for a Node.js app deploying to AWS ECR",
  "assertions": [
    { "type": "semantic", "value": "Uses OIDC / keyless federated authentication to the container registry rather than stored long-lived credentials" },
    { "type": "semantic", "value": "Signs the built image (cosign) and verifies the signature before promoting to an environment" },
    { "type": "semantic", "value": "Promotes images by immutable sha256 digest rather than a mutable tag" },
    { "type": "semantic", "value": "Generates a deploy/SETUP.md describing the cloud-side federated-identity setup required before first run" }
  ]
}
```

- [ ] **Step 2: Validate JSON + skill structure**

Run: `node -e "JSON.parse(require('fs').readFileSync('skills/dock/tests/evals.json','utf8'))" && npm run validate && npm run lint`
Expected: no JSON error; validate + lint pass.

- [ ] **Step 3: (Optional) Run evals if an API key is present**

Run: `npm run eval -- --verbose` (needs `ANTHROPIC_API_KEY` or `OPENROUTER_API_KEY`)
Expected: the `hardened-pipeline` case passes its assertions. If no key, skip — CI gates evals behind `EVALS_ENABLED`.

- [ ] **Step 4: Commit**

```bash
git add skills/dock/tests/evals.json
git commit -m "test(dock): eval for hardened pipeline output

Claude-Session: https://claude.ai/code/session_013sN7Nj3DxZaBExyPiBepmh"
```

---

### Task 6: Ship

- [ ] **Step 1: Final full check**

Run: `npm run validate && npm run lint`
Expected: both pass.

- [ ] **Step 2: Ship the branch**

Invoke `/ship` (or open a PR for `feat/dock-hardened-pipelines` → main). CI runs validate + lint (+ evals if enabled); squash-merge on green.

---

## Self-Review

**Spec coverage:**
- OIDC keyless auth → Task 1 (reference) + Task 2 (GH) + Task 3 (Azure). ✅
- Signing + provenance → Task 1 + Task 2 (`cosign sign`/`provenance: true`) + Task 3. ✅
- Idempotent guards → Task 1 + Task 2 (`crane manifest`) + Task 3 (`docker manifest inspect`). ✅
- Digest-pinned promotion → Task 1 + Task 2 (`@sha256` job output) + Task 3. ✅
- Secure-by-default + setup callouts → Task 1 (SETUP.md body) + Task 4 (Phase 3.7 + 🔐 report). ✅
- GH + Azure only, GitLab untouched → Tasks 2–3 scope; Global Constraints. ✅
- Evals → Task 5. ✅

**Placeholder scan:** No "TBD/TODO"; template `{REGISTRY}`/`{IMAGE_NAME}`/`OWNER/REPO`/`<WIF-service-connection-name>` are intentional generator placeholders, consistent with existing dock templates.

**Type/name consistency:** build-job output named `image` (GH) / `build.digestRef` (Azure) referenced consistently in deploy jobs; `hardening.md` anchors cited by Task 4 match Task 1's produced anchors; content-check grep strings match the literals written in each task.
