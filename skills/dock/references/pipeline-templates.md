# CI/CD Pipeline Templates

Templates for the build-once-promote-everywhere pipeline pattern. Each template
implements the same three-trigger flow:
- **PR**: build + test (optionally push)
- **Merge to main**: build + test + push + deploy dev
- **Release tag**: retag (no rebuild) + deploy staging + deploy prod

Template variables:
- `{REGISTRY}`: Full registry URL (e.g., ghcr.io/owner/repo)
- `{IMAGE_NAME}`: Image name without registry (e.g., my-app)
- `{DEFAULT_BRANCH}`: main or master
- `{PORT}`: Application port
- `{DEV_TARGET}`, `{STAGING_TARGET}`, `{PROD_TARGET}`: Deployment platform per env
- `{TEST_CMD}`: Test command (e.g., npm test, pytest, go test ./...)
- `{BUILD_CMD}`: Build command if separate from Dockerfile (optional)

---

## GitHub Actions

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

### Reusable deploy step patterns

The `{*_DEPLOY_COMMANDS}` placeholders are replaced with platform-specific
commands from `platform-deploy-guides.md`. See that file for per-platform
deployment steps.

---

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

---

## GitLab CI

File: `.gitlab-ci.yml`

```yaml
stages:
  - build
  - deploy-dev
  - promote-staging
  - promote-prod

variables:
  REGISTRY: {REGISTRY}
  IMAGE_NAME: {IMAGE_NAME}

# ── Build & Test ──────────────────────────────────────────────
build:
  stage: build
  image: docker:27
  services:
    - docker:27-dind
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH == "{DEFAULT_BRANCH}"
  script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
    - docker build --target test -t $IMAGE_NAME:test .
    - docker build --target production -t $REGISTRY/$IMAGE_NAME:$CI_COMMIT_SHORT_SHA .
    - |
      if [ "$CI_COMMIT_BRANCH" = "{DEFAULT_BRANCH}" ]; then
        docker tag $REGISTRY/$IMAGE_NAME:$CI_COMMIT_SHORT_SHA $REGISTRY/$IMAGE_NAME:latest
        docker push $REGISTRY/$IMAGE_NAME:$CI_COMMIT_SHORT_SHA
        docker push $REGISTRY/$IMAGE_NAME:latest
      fi

# ── Deploy to Dev ─────────────────────────────────────────────
deploy-dev:
  stage: deploy-dev
  rules:
    - if: $CI_COMMIT_BRANCH == "{DEFAULT_BRANCH}"
  environment:
    name: dev
  script:
    - echo "Deploying $REGISTRY/$IMAGE_NAME:$CI_COMMIT_SHORT_SHA to dev"
    # {DEV_DEPLOY_COMMANDS}

# ── Promote to Staging ────────────────────────────────────────
promote-staging:
  stage: promote-staging
  rules:
    - if: $CI_COMMIT_TAG =~ /^v/
  environment:
    name: staging
  script:
    - echo "Retagging $CI_COMMIT_SHORT_SHA as $CI_COMMIT_TAG — no rebuild"
    # Retag in registry, then deploy
    # {STAGING_DEPLOY_COMMANDS}

# ── Promote to Production ─────────────────────────────────────
promote-prod:
  stage: promote-prod
  rules:
    - if: $CI_COMMIT_TAG =~ /^v/
  environment:
    name: production
  needs: [promote-staging]
  script:
    - echo "Deploying $CI_COMMIT_TAG to production"
    # {PROD_DEPLOY_COMMANDS}
```

---

## docker-compose.yml (Local Development)

Always generate this for local dev parity:

```yaml
services:
  app:
    build:
      context: .
      target: build  # Use build stage for dev (includes dev deps)
    ports:
      - "{PORT}:{PORT}"
    volumes:
      - .:/app
      - /app/node_modules  # Prevent overwriting container's node_modules
    environment:
      - NODE_ENV=development
    env_file:
      - .env
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:{PORT}/healthz"]
      interval: 10s
      timeout: 3s
      start_period: 10s
```

Adapt the volumes, environment, and healthcheck for the detected stack.
