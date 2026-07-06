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
