# Dock Interview Guide

Prompts and questions for the detection and interview phases of /dock.

---

## Detection Prompt

**Agent:** Explore (quick)

```
Scan the codebase to detect stack, infrastructure, and existing deployment config.
Report findings in a structured DETECTION_REPORT.

Limit DETECTION_REPORT to 30 lines maximum.

## What to scan

1. **Language & Framework**
   Look for these files (in priority order):
   - package.json → Node.js (check for next, nuxt, express, fastify, etc.)
   - requirements.txt / pyproject.toml / setup.py → Python (check for django, flask, fastapi)
   - go.mod → Go
   - Cargo.toml → Rust
   - Gemfile → Ruby (check for rails, sinatra)
   - pom.xml / build.gradle → Java/Kotlin (check for spring-boot)
   - mix.exs → Elixir
   - composer.json → PHP (check for laravel)
   - *.csproj / *.sln → .NET

2. **Package Manager**
   - Node: check for bun.lockb (bun), pnpm-lock.yaml (pnpm), yarn.lock (yarn), package-lock.json (npm)
   - Python: check for uv.lock (uv), poetry.lock (poetry), Pipfile.lock (pipenv), requirements.txt (pip)
   - Others: go.sum, Cargo.lock, Gemfile.lock, etc.

3. **Entry Point**
   - package.json scripts.start / scripts.dev
   - Procfile web entry
   - main.go, main.py, app.py, server.js, index.ts, etc.
   - Framework-specific (next start, rails server, uvicorn, gunicorn)

4. **Port**
   - Existing Dockerfile EXPOSE
   - Framework defaults (Next.js=3000, Django=8000, FastAPI=8000, Rails=3000, Spring=8080, Go=8080)
   - Environment variable references to PORT

5. **Existing Dockerfile**
   - Dockerfile, Dockerfile.*, .dockerignore
   - docker-compose.yml, docker-compose.*.yml
   - Report: exists? multi-stage? base image? what it does

6. **Existing CI/CD**
   - .github/workflows/*.yml → GitHub Actions (list workflow names)
   - azure-pipelines.yml → Azure Pipelines
   - .gitlab-ci.yml → GitLab CI
   - Report: what triggers exist, any deployment steps already present

7. **Existing Deployment Config**
   - Helm charts (Chart.yaml)
   - Kubernetes manifests (*.yaml with kind: Deployment/Service)
   - fly.toml → Fly.io
   - Procfile → Heroku/Dokku
   - app.json → Heroku
   - captain-definition → CapRover
   - Bicep/ARM templates (*.bicep, azuredeploy.json)
   - Terraform files (*.tf)
   - CDK files (cdk.json)
   - Pulumi files (Pulumi.yaml)

8. **Environment Config**
   - .env, .env.example, .env.development, .env.production
   - Environment variable patterns in config files

## Output Format

DETECTION_REPORT:
- language: {detected language}
- framework: {detected framework or "none"}
- package_manager: {detected package manager}
- entry_point: {main file or start command}
- port: {detected port or "unknown"}
- existing_dockerfile: {yes/no, brief description if yes}
- existing_ci: {system name or "none", brief description}
- existing_deploy: {platform or "none", brief description}
- env_files: {list or "none"}
- confidence: {high/medium/low — how certain the detection is}
- notes: {anything ambiguous or noteworthy}
```

---

## Interview Questions

Use AskUserQuestion for each topic. Present detected values as defaults.
Skip questions where detection provided high-confidence answers (but mention
what was detected so the user can override).

### Registry Selection

Present detected registry or suggest based on CI system:

```
Based on your {CI_SYSTEM} setup, I'd suggest {SUGGESTED_REGISTRY}.

Which container registry should images be pushed to?

Options:
1. GitHub Container Registry (ghcr.io) (Recommended for GitHub repos)
2. Azure Container Registry
3. AWS ECR (Elastic Container Registry)
4. Google Artifact Registry
5. Docker Hub
6. Self-hosted (provide URL)
```

Mapping:
- GitHub Actions → suggest ghcr.io
- Azure Pipelines → suggest Azure Container Registry
- GitLab CI → suggest GitLab Container Registry
- No CI → suggest ghcr.io (most universal)

### Environment Topology

```
How many deployment stages do you need?

Options:
1. Simple: dev → prod (2-stage) (Recommended for small projects)
2. Standard: dev → staging → prod (3-stage)
3. Custom: define your own stages
```

### Target Platform (per environment)

Ask once per environment:

```
Where should the {ENV_NAME} environment be deployed?

Options:
1. Azure Container Apps (Recommended — serverless containers, auto-scaling)
2. Azure App Service for Containers
3. AWS Fargate (ECS)
4. Google Cloud Run
5. Kubernetes (any distribution)
6. Dokku (self-hosted PaaS)
7. Coolify (self-hosted PaaS)
8. CapRover (self-hosted PaaS)
9. Other (specify)
```

If user picks the same platform for all environments, note that environment
separation will be handled via namespaces/resource groups/projects rather than
distinct platforms.

### Testing Gates

```
What tests should gate each environment promotion?

I'll set these defaults — adjust as needed:

Build stage:     unit tests, linting, type checks
Dev deploy:      smoke tests (health check + basic request)
Staging deploy:  integration tests, e2e tests
Prod deploy:     post-deploy smoke test

Do these work, or would you like to customize?
```

### Secrets Management

```
How are deployment secrets managed?

Options:
1. GitHub Secrets / Variables (Recommended for GitHub Actions)
2. Azure Key Vault
3. AWS Secrets Manager / Parameter Store
4. Environment variables in deployment platform
5. Doppler
6. 1Password (via CLI)
7. HashiCorp Vault
```

### Rollback Strategy

```
What rollback strategy should the pipeline use?

Options:
1. Simple rollback (Recommended) — redeploy previous image tag on failure
2. Blue-green — maintain two environments, swap traffic on deploy
3. Canary — gradual traffic shift with automatic rollback on error thresholds
```

### Networking (optional)

Only ask if the deployment target needs explicit networking config:

```
Do you need custom domain configuration?

Options:
1. No — use platform-provided URLs (Recommended for now)
2. Yes — I have domains for each environment
```

If yes, collect domain per environment and TLS preference (auto/manual).
