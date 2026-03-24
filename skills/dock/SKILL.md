---
name: dock
description: >-
  Generate container-based release pipelines that build once and promote immutable
  artifacts through environments (dev → staging → prod). Detects your stack, interviews
  for infrastructure choices, then outputs deterministic CI/CD files (Dockerfile,
  workflows, deployment manifests) that run without an LLM. Use when setting up
  deployment pipelines, containerizing an app, creating release workflows, or
  connecting CI to container-friendly infrastructure (Azure Container Apps, AWS Fargate,
  Google Cloud Run, Kubernetes, Dokku, Coolify, CapRover, etc.).
argument-hint: "--registry-only, --skip-interview, --dry-run"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, Agent
---

# Dock - Container Release Pipelines

When this skill is invoked, IMMEDIATELY output the banner below before doing anything else.
Pick ONE tagline at random — vary your choice each time.
CRITICAL: Reproduce the banner EXACTLY character-for-character. The first line of the art has 4 leading spaces — you MUST preserve them.

```
{tagline}

⠀   ██╗██████╗  ██████╗  ██████╗██╗  ██╗
   ██╔╝██╔══██╗██╔═══██╗██╔════╝██║ ██╔╝
  ██╔╝ ██║  ██║██║   ██║██║     █████╔╝
 ██╔╝  ██║  ██║██║   ██║██║     ██╔═██╗
██╔╝   ██████╔╝╚██████╔╝╚██████╗██║  ██╗
╚═╝    ╚═════╝  ╚═════╝  ╚═════╝╚═╝  ╚═╝
```

Taglines:
- 🐳 Containerize all the things!
- 📦 Build once, deploy everywhere!
- 🚀 From code to container in one shot!
- ⚓ Anchoring your release pipeline!
- 🏗️ Immutable artifacts, mutable environments!
- 🔒 Same image, every stage, every time!
- 🌊 Shipping containers since... just now!
- 🎯 One build to rule them all!

---

Generate container-based release pipelines following the **build-once, promote-everywhere**
philosophy. Every artifact is built exactly once, tested, tagged with git SHA + semver,
pushed to a registry, and promoted through environments without rebuilding.

All generated files are deterministic — no LLM required at runtime.

## Flags

Parse optional flags from the request:
- `--registry-only`: Only generate Dockerfile, .dockerignore, and registry config (skip deployment)
- `--skip-interview`: Use detected defaults without interactive prompts
- `--dry-run`: Show what would be generated without writing files

---

## Output Formatting

After the banner, display parsed input:
```
┌─ Input ────────────────────────────────────────
│  {Field}:  {value}
│  Flags:    {parsed flags or "none"}
└────────────────────────────────────────────────
```

Pre-flight results:
```
── Pre-flight ───────────────────────────────────
  ✅ {dep}           {version or "found"}
  ⚠️ {dep}           not found → {fallback detail}
  ❌ {dep}           missing → stopping
──────────────────────────────────────────────────
```

Stage/phase headers: `━━ {N} · {Name} ━━━━━━━━━━━━━━━━━━━━━━━━━`

Status icons: ✅ done · ❌ failed · ⚠️ degraded · ⏳ working · ⏭️ skipped

---

## Platform Detection

Detect the hosting platform **before** pre-flight so dependency checks are
platform-specific:

```bash
REMOTE_URL=$(git remote get-url origin 2>/dev/null)
if echo "$REMOTE_URL" | grep -qiE 'dev\.azure\.com|visualstudio\.com'; then
  PLATFORM="azdo"
elif echo "$REMOTE_URL" | grep -qi 'github\.com'; then
  PLATFORM="github"
else
  PLATFORM="github"   # default fallback
fi
```

Pass `{PLATFORM}` into all phase prompts. Each phase uses the appropriate
CLI tool and registry defaults based on the detected platform.

---

## Pre-flight

Before starting, check dependencies:

| Dependency | Type | Check | Required | Resolution | Detail |
|-----------|------|-------|----------|------------|--------|
| docker | cli | `docker --version` | no | ask | Needed for local build verification; skip verify phase if absent |
| git | cli | `git --version` | yes | stop | Install from https://git-scm.com |
| sync | skill | `ls .claude/skills/sync/SKILL.md ~/.claude/skills/sync/SKILL.md ~/.claude/plugins/marketplaces/slamb2k/skills/sync/SKILL.md 2>/dev/null` | no | fallback | Repo sync; falls back to manual git pull |
| az devops | cli | `az devops -h 2>/dev/null` | no | fallback | Falls back to REST API with PAT; see AzDO tooling below |

**Platform-conditional rules:**
- **`az devops`**: Only checked when `PLATFORM == azdo`. Skip for GitHub repos.

For each applicable row, in order:
1. Skip rows that don't apply to the detected `{PLATFORM}`
2. Run the Check command (for cli/npm) or test file existence (for agent/skill)
3. If found: continue silently
4. If missing: apply Resolution strategy
   - **stop**: notify user with Detail, halt execution
   - **url**: notify user with Detail (install link), halt execution
   - **install**: notify user, run the command in Detail, continue if successful
   - **ask**: notify user, offer to run command in Detail, continue either way (or halt if required)
   - **fallback**: notify user with Detail, continue with degraded behavior
5. After all checks: summarize what's available and what's degraded

When `PLATFORM == azdo`, follow the shared AzDO platform guide
(repo root: references/azdo-platform.md) for tooling detection (`AZDO_MODE`)
and configuration validation (`AZDO_ORG`, `AZDO_PROJECT`).
Pass these variables into all phase prompts alongside `{PLATFORM}`.

---

## Phase 0: Sync

Invoke `/sync` to ensure the working tree is up to date with origin/main before
scanning. If /sync is unavailable, run `git pull` manually. This prevents
generating pipelines against stale code.

---

## Phase 1: Detection

Launch an **Explore subagent** to scan the codebase and produce a DETECTION_REPORT.

```
Task(
  subagent_type: "Explore",
  description: "Detect stack and existing infrastructure",
  prompt: <read from references/interview-guide.md#detection-prompt>
)
```

The detection prompt scans for:
- **Language & framework**: package.json, requirements.txt, go.mod, Cargo.toml, Gemfile, pom.xml, etc.
- **Existing Dockerfile**: Dockerfile, Dockerfile.*, docker-compose.yml
- **Existing CI**: .github/workflows/, azure-pipelines.yml, .gitlab-ci.yml
- **Existing deploy config**: Helm charts, Kubernetes manifests, Procfile, app.json, fly.toml, dokku config
- **Package manager**: npm/yarn/pnpm/bun, pip/uv/poetry, go modules, cargo, bundler, maven/gradle
- **Entry point**: main file, start scripts, Procfile commands
- **Port**: exposed ports in existing config or framework defaults
- **Environment files**: .env, .env.example, .env.* patterns

Parse DETECTION_REPORT. This feeds into the interview phase.

---

## Phase 2: Interview

Present the detection results to the user and fill in gaps through guided questions.
Read the full interview flow from `references/interview-guide.md#interview-questions`.

The interview covers these topics in order. Skip questions where detection already
provided a confident answer (but confirm with the user).

### 2.1 — Stack Confirmation

Confirm detected language, framework, and entry point. Ask only if detection was
ambiguous (e.g., monorepo with multiple stacks).

### 2.2 — Container Registry

Detect from existing CI config or ask:
- GitHub Container Registry (ghcr.io) — default for GitHub repos
- Azure Container Registry
- AWS ECR
- Google Artifact Registry
- Docker Hub
- Self-hosted registry

### 2.3 — Environment Topology

Ask how many deployment stages and the promotion model:
- **Simple**: dev → prod (2-stage)
- **Standard**: dev → staging → prod (3-stage, default)
- **Custom**: user-defined stages

For each environment, ask the deployment target:
- Azure App Service for Containers
- Azure Container Apps
- AWS Fargate
- Google Cloud Run
- Kubernetes (any distribution)
- Dokku
- Coolify
- CapRover
- Other (user-specified)

Different environments can use different targets (e.g., dev=Dokku, prod=Azure Container Apps).

### 2.4 — Testing Gates

For each environment promotion, ask what tests gate the promotion:
- **Build gate** (before registry push): unit tests, linting, type checks
- **Dev gate**: smoke tests, health check verification
- **Staging gate**: integration tests, e2e tests
- **Prod gate**: final smoke test post-deploy

### 2.5 — Secrets & Configuration

How environment-specific config is managed:
- GitHub Secrets / Variables (default for GitHub Actions)
- Azure Key Vault
- AWS Secrets Manager
- Environment variables in deployment platform
- Doppler / 1Password / Vault

### 2.6 — Networking & Domains

Optional — ask only if deploying to platforms that need this:
- Custom domain per environment?
- TLS certificate management (auto via platform, Let's Encrypt, manual)
- Load balancer or ingress configuration

### 2.7 — Rollback Strategy

- **Simple rollback** (default): redeploy previous image tag on failure
- **Blue-green**: maintain two environments, swap traffic
- **Canary**: gradual traffic shift with automatic rollback on error thresholds

**If `--skip-interview` flag**: Use detected defaults + sensible platform-aware
defaults for everything else:
- **GitHub** (`PLATFORM == github`): ghcr.io, 3-stage, GitHub Secrets, simple rollback
- **Azure DevOps** (`PLATFORM == azdo`): Azure Container Registry, 3-stage, Azure Key Vault, simple rollback

Compile all answers into a DOCK_CONFIG object for Phase 3.

---

## Phase 3: Generate Artifacts

Based on DETECTION_REPORT and DOCK_CONFIG, generate all pipeline files.
Use templates from `references/` as starting points and customize for the
detected stack and chosen platforms.

### 3.1 — Dockerfile & .dockerignore

Read `references/dockerfile-templates.md` for the detected stack.

Generate a multi-stage Dockerfile:
- **Stage 1 — deps**: Install dependencies only (maximizes cache hits)
- **Stage 2 — build**: Copy source, run build step
- **Stage 3 — test**: Run unit tests against the build
- **Stage 4 — production**: Minimal runtime image with built artifacts only

Generate `.dockerignore` excluding: `.git`, `node_modules`, `__pycache__`, `.env*`,
test fixtures, documentation, IDE config.

### 3.2 — docker-compose.yml

Generate a local development compose file that mirrors the production image
with development overrides (volume mounts, hot reload, debug ports).

### 3.3 — CI/CD Workflow

Detect CI system from Phase 1 (GitHub Actions / Azure Pipelines / GitLab CI).
Read the appropriate template from `references/pipeline-templates.md`.

Generate a workflow that implements:

**On pull request:**
1. Build image tagged with `pr-{number}-{sha:7}`
2. Run test stage inside the image
3. Push to registry (optional — configurable)
4. Comment build status on PR

**On merge to main (or default branch):**
1. Build image tagged with `{sha:7}` and `latest`
2. Run full test suite inside the image
3. Push to registry
4. Deploy to dev environment
5. Run dev-gate tests (smoke tests)

**On release tag (vX.Y.Z):**
1. Retag the existing `{sha:7}` image as `vX.Y.Z` — **do NOT rebuild**
2. Deploy to staging
3. Run staging-gate tests
4. On success: deploy to prod
5. Run prod-gate tests (post-deploy smoke)

Key principle: the release workflow **never rebuilds**. It promotes the exact
image that was tested on main.

### 3.4 — Deployment Manifests

Based on the chosen platforms per environment, read the appropriate section
from `references/platform-deploy-guides.md` and generate:

- **Kubernetes**: Helm chart or kustomize overlays with per-environment values
- **Azure Container Apps**: Bicep/ARM template or `az containerapp` commands in workflow
- **Azure App Service**: App Service deployment slots config
- **AWS Fargate**: ECS task definition + service config
- **Google Cloud Run**: Cloud Run service YAML or `gcloud run deploy` commands
- **Dokku**: Procfile + dokku git push deployment step
- **Coolify**: API-based deployment step or docker-compose based
- **CapRover**: captain-definition file + deploy step

### 3.5 — Environment Matrix

Generate an environment matrix config file (`deploy/environments.json` or
`deploy/environments.yml`) defining per-environment settings:

```yaml
environments:
  dev:
    target: <platform>
    registry_tag_pattern: "{sha:7}"
    auto_deploy: true
    tests: [smoke]
  staging:
    target: <platform>
    registry_tag_pattern: "v{version}"
    auto_deploy: false  # requires manual approval or tag
    tests: [integration, e2e]
  prod:
    target: <platform>
    registry_tag_pattern: "v{version}"
    auto_deploy: false
    tests: [smoke-post-deploy]
```

### 3.6 — Health Check Endpoint Guidance

If the detected framework doesn't already have a health endpoint, add a comment
in the generated workflow noting that a `/healthz` or `/health` endpoint is
recommended for deployment readiness probes.

---

## Phase 4: Verify

If Docker is available, run a verification step:

```bash
docker build --target production -t dock-verify:test .
```

If the build succeeds, report success. If it fails, diagnose and fix the
Dockerfile. Skip this phase if Docker is not installed (noted in pre-flight).

Also validate generated workflow files:
- GitHub Actions: check YAML syntax
- Azure Pipelines: check YAML syntax
- GitLab CI: check YAML syntax

Present the user with a summary of all generated files before writing.

**If `--dry-run` flag**: Show the file list and content previews without writing.

---

## Final Report

After all files are generated and verified, present:

```
┌─ Dock · Report ────────────────────────────────
│
│  ✅ Dock complete
│
│  🔧 Stack:      {language} / {framework}
│  📦 Registry:   {registry}
│  🌍 Stages:     {env1} → {env2} → {env3}
│
│  📝 Generated files
│     • {file} — {brief description}
│     • {file} — {brief description}
│     • ...
│
│  📊 Pipeline flow
│     PR    → build + test
│     Merge → build + test → push → deploy dev → smoke
│     Tag   → retag (no rebuild) → staging → e2e → prod
│
│  🔗 Links
│     Dockerfile:  {path}
│     Workflow:    {path}
│     Compose:     {path}
│
│  ⚡ Next steps
│     1. Review generated files
│     2. Configure secrets: {list}
│     3. Push to trigger first pipeline run
│
└─────────────────────────────────────────────────
```

---

## Idempotency

If /dock detects it has been run before (existing `deploy/` directory, existing
deployment workflow), it should:
- **Dockerfile**: Update if stack detection shows changes; preserve custom stages
- **Workflow**: Merge new steps; never overwrite user customizations without confirmation
- **Manifests**: Update image references; preserve environment-specific overrides
- **Always ask** before overwriting existing files

---

## Integration with /rig and /ship

- **/rig integration**: When /rig runs after /dock, it should detect `deploy/`
  artifacts and wire the CI workflow to trigger deployment on merge to main.
- **/ship integration**: /ship's merge step naturally triggers the deployment
  workflow created by /dock. No special coupling needed — the CI/CD workflow
  handles the handoff via branch/tag triggers.
