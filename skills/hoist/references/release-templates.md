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
