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

### Build & Deploy Workflow

File: `.github/workflows/deploy.yml`

```yaml
name: Build & Deploy

on:
  pull_request:
  push:
    branches: [{DEFAULT_BRANCH}]
    tags: ["v*"]

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

env:
  REGISTRY: {REGISTRY}
  IMAGE_NAME: {IMAGE_NAME}

permissions:
  contents: read
  packages: write

jobs:
  # ── Build & Test ──────────────────────────────────────────────
  build:
    runs-on: ubuntu-latest
    # Skip for release tags — we retag, not rebuild
    if: ${{ !startsWith(github.ref, 'refs/tags/v') }}
    outputs:
      image_tag: ${{ steps.meta.outputs.tags }}
      sha_short: ${{ steps.vars.outputs.sha_short }}
    steps:
      - uses: actions/checkout@v4

      - name: Set variables
        id: vars
        run: echo "sha_short=$(git rev-parse --short HEAD)" >> "$GITHUB_OUTPUT"

      - name: Docker meta
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=sha,prefix=
            type=ref,event=pr,prefix=pr-
            type=raw,value=latest,enable=${{ github.ref == format('refs/heads/{0}', '{DEFAULT_BRANCH}') }}

      - uses: docker/setup-buildx-action@v3

      - name: Login to registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and test
        uses: docker/build-push-action@v6
        with:
          context: .
          target: test
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Build and push production image
        if: github.event_name == 'push'
        uses: docker/build-push-action@v6
        with:
          context: .
          target: production
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ── Deploy to Dev ─────────────────────────────────────────────
  deploy-dev:
    needs: build
    if: github.ref == 'refs/heads/{DEFAULT_BRANCH}'
    runs-on: ubuntu-latest
    environment: dev
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to dev
        run: |
          # {DEV_DEPLOY_COMMANDS}
          echo "Deploying ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ needs.build.outputs.sha_short }} to dev"

      - name: Smoke test
        run: |
          # Wait for deployment to be ready, then hit health endpoint
          sleep 10
          curl -f "$DEV_URL/healthz" || exit 1

  # ── Promote to Staging (on release tag) ───────────────────────
  promote-staging:
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    environment: staging
    outputs:
      version: ${{ steps.version.outputs.tag }}
    steps:
      - uses: actions/checkout@v4

      - name: Extract version
        id: version
        run: echo "tag=${GITHUB_REF#refs/tags/}" >> "$GITHUB_OUTPUT"

      - name: Login to registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Retag image (no rebuild)
        run: |
          SHA=$(git rev-parse --short HEAD)
          docker buildx imagetools create \
            --tag "${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ steps.version.outputs.tag }}" \
            "${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${SHA}"

      - name: Deploy to staging
        run: |
          # {STAGING_DEPLOY_COMMANDS}
          echo "Deploying ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ steps.version.outputs.tag }} to staging"

      - name: Run staging tests
        run: |
          # Integration and e2e tests against staging
          echo "Running staging gate tests..."

  # ── Promote to Production ─────────────────────────────────────
  promote-prod:
    needs: promote-staging
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - name: Deploy to production
        run: |
          # {PROD_DEPLOY_COMMANDS}
          echo "Deploying ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ needs.promote-staging.outputs.version }} to production"

      - name: Post-deploy smoke test
        run: |
          sleep 10
          curl -f "$PROD_URL/healthz" || exit 1
```

### Reusable deploy step patterns

The `{*_DEPLOY_COMMANDS}` placeholders are replaced with platform-specific
commands from `platform-deploy-guides.md`. See that file for per-platform
deployment steps.

---

## Azure DevOps Pipelines

File: `azure-pipelines.yml`

```yaml
trigger:
  branches:
    include: [{DEFAULT_BRANCH}]
  tags:
    include: ["v*"]

pr:
  branches:
    include: [{DEFAULT_BRANCH}]

variables:
  registry: {REGISTRY}
  imageName: {IMAGE_NAME}
  vmImageName: ubuntu-latest

stages:
  # ── Build & Test ──────────────────────────────────────────────
  - stage: Build
    condition: not(startsWith(variables['Build.SourceBranch'], 'refs/tags/v'))
    jobs:
      - job: BuildAndTest
        pool:
          vmImage: $(vmImageName)
        steps:
          - task: Docker@2
            displayName: Build test image
            inputs:
              command: build
              dockerfile: Dockerfile
              arguments: --target test -t $(imageName):test

          - task: Docker@2
            displayName: Build production image
            inputs:
              command: build
              dockerfile: Dockerfile
              arguments: --target production -t $(registry)/$(imageName):$(Build.SourceVersion)

          - task: Docker@2
            displayName: Push to registry
            condition: eq(variables['Build.SourceBranch'], 'refs/heads/{DEFAULT_BRANCH}')
            inputs:
              command: push
              containerRegistry: $(dockerRegistryServiceConnection)
              repository: $(imageName)
              tags: |
                $(Build.SourceVersion)
                latest

  # ── Deploy to Dev ─────────────────────────────────────────────
  - stage: DeployDev
    condition: eq(variables['Build.SourceBranch'], 'refs/heads/{DEFAULT_BRANCH}')
    dependsOn: Build
    jobs:
      - deployment: DeployDev
        environment: dev
        pool:
          vmImage: $(vmImageName)
        strategy:
          runOnce:
            deploy:
              steps:
                - script: |
                    echo "Deploying $(registry)/$(imageName):$(Build.SourceVersion) to dev"
                    # {DEV_DEPLOY_COMMANDS}

  # ── Promote to Staging ────────────────────────────────────────
  - stage: PromoteStaging
    condition: startsWith(variables['Build.SourceBranch'], 'refs/tags/v')
    jobs:
      - deployment: DeployStaging
        environment: staging
        pool:
          vmImage: $(vmImageName)
        strategy:
          runOnce:
            deploy:
              steps:
                - script: |
                    TAG=${BUILD_SOURCEBRANCH#refs/tags/}
                    echo "Retagging and deploying $TAG to staging"
                    # Retag — do NOT rebuild
                    # {STAGING_DEPLOY_COMMANDS}

  # ── Promote to Production ─────────────────────────────────────
  - stage: PromoteProd
    condition: startsWith(variables['Build.SourceBranch'], 'refs/tags/v')
    dependsOn: PromoteStaging
    jobs:
      - deployment: DeployProd
        environment: production
        pool:
          vmImage: $(vmImageName)
        strategy:
          runOnce:
            deploy:
              steps:
                - script: |
                    TAG=${BUILD_SOURCEBRANCH#refs/tags/}
                    echo "Deploying $TAG to production"
                    # {PROD_DEPLOY_COMMANDS}
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
