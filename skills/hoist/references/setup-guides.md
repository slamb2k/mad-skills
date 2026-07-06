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
