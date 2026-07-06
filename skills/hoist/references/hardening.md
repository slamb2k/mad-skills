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
