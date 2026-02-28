# Rig Configuration Steps

Procedural reference for Phase 4 — execute each approved item.

---

## 4a: Git Init (if needed)

```bash
git init
git checkout -b main
```

## 4b: Install Lefthook (if needed)

Detect package manager and install:

```bash
# Node projects
npm install --save-dev lefthook || bun add -d lefthook || yarn add -D lefthook || pnpm add -D lefthook

# Or global install
npm install -g lefthook
```

## 4c: Configure Lefthook

Read template from: `~/.claude/skills/rig/assets/lefthook.yml`

Customize based on detected scripts:
- If `lint` script exists -> use `npm run lint`
- If `format:check` script exists -> use `npm run format:check`
- If `typecheck` or `type-check` exists -> use that
- If `test` or `test:unit` exists -> use for pre-push

Write customized `lefthook.yml` to repo root.

Run: `lefthook install`

## 4d: Commit Template

Read template from: `~/.claude/skills/rig/assets/gitmessage`

Write to `.gitmessage` in repo root.

Configure git: `git config commit.template .gitmessage`

## 4e: PR Template

Read template from: `~/.claude/skills/rig/assets/pull_request_template.md`

Detect platform from remote URL (same pattern as ship skill):
```bash
REMOTE_URL=$(git remote get-url origin 2>/dev/null)
if echo "$REMOTE_URL" | grep -qiE 'dev\.azure\.com|visualstudio\.com'; then
  PLATFORM="azdo"
else
  PLATFORM="github"
fi
```

**If PLATFORM == github:**
  Create `.github/` directory if needed.
  Write to `.github/pull_request_template.md`

**If PLATFORM == azdo:**
  Create `.azuredevops/` directory if needed.
  Write to `.azuredevops/pull_request_template.md`
  (Azure DevOps also supports root-level `pull_request_template.md`)

## 4f: CI Workflow

Customize based on project:
- Set correct package manager (npm/bun/yarn/pnpm)
- Add build steps for detected components
- Configure test jobs appropriately

**If PLATFORM == github:**
  Read template from: `~/.claude/skills/rig/assets/ci.yml`
  Create `.github/workflows/` directory if needed.
  Write customized workflow to `.github/workflows/ci.yml`

**If PLATFORM == azdo:**
  Read template from: `~/.claude/skills/rig/assets/azure-pipelines.yml`
  Write customized pipeline to `azure-pipelines.yml` (repo root)

## 4g: Register Azure Pipelines (azdo only, if approved)

For each unregistered pipeline YAML file discovered in Phase 2, create the
pipeline in Azure DevOps. Only runs if the user approved this in Phase 3.

**Prerequisites:** `az devops` extension installed and configured with
`az devops configure --defaults organization=... project=...`.
If `az pipelines` commands fail, report the setup requirement and skip.

```bash
# Derive a pipeline name from the YAML filename
# azure-pipelines.yml -> "CI" (default)
# build.azure-pipelines.yml -> "Build"
# deploy.azure-pipelines.yml -> "Deploy"
YAML_PATH="azure-pipelines.yml"   # each discovered file
PIPELINE_NAME="CI"                # derived from filename, or ask user

# Get the repo name from the remote URL
REPO_NAME=$(basename -s .git "$(git remote get-url origin)")

az pipelines create \
  --name "$PIPELINE_NAME" \
  --yaml-path "$YAML_PATH" \
  --repository "$REPO_NAME" \
  --repository-type tfsgit \
  --branch main \
  --skip-first-run
```

**Naming convention:**
- `azure-pipelines.yml` -> pipeline name: `"CI"`
- `<name>.azure-pipelines.yml` -> pipeline name: capitalize `<name>`
- If the user chose a custom name in Phase 3, use that instead

**Error handling:**
- If `az pipelines create` fails with auth error -> report: `az login` required
- If it fails with "already exists" -> skip (idempotent)
- If `az devops` extension not installed -> report and skip
