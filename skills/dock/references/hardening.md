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
