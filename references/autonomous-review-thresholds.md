# Autonomous Review Depth Thresholds

Shared review-depth rule for `/build --auto` (GUD-002/CON-002). Evaluated
once, after implementation and before dispatching the native `/code-review`
and `/security-review` commands in subagents. Defined here — not inline in
`skills/build/SKILL.md` — so it can be tuned without touching skill logic
(CON-002).

## Threshold table

| Condition | Review depth |
|---|---|
| Diff touches ≤10 files AND none of the risk-keyword paths below | **Standard** |
| Diff touches >10 files | **Deep** |
| Diff touches any risk-keyword path below (regardless of file count) | **Deep** |

Either trigger alone is sufficient — the rule is an OR, not an AND, across
the file-count and risk-keyword-path checks.

## Risk-keyword paths

A diff matches this list if any changed file's path corresponds to one of
these categories:

- **Auth/session/credential code** — login, session, token, OAuth, and
  similar authentication/authorization logic.
- **`.env*` files** — any dotenv variant (`.env`, `.env.local`,
  `.env.production`, etc.).
- **Secrets/key material** — private keys, certificates, credential stores,
  anything holding secret values at rest.
- **CI/CD or deploy config** — `.github/workflows/**`, Dockerfiles, and
  Infrastructure-as-Code files (Terraform, Bicep, Pulumi, CDK, Kubernetes
  manifests).
- **Payment/billing logic** — code handling charges, invoices, payment
  provider integrations.
- **Data-deletion/migration code** — destructive data operations and schema
  migrations.

This list is deliberately keyword/path-based rather than judgment-based —
an LLM's per-run sense of "is this risky" is inconsistent across runs; a
fixed table is deterministic and testable.

## Consumption

`/build --auto`'s review-dispatch stage reads this table after the
implementation stage completes and before dispatching `/code-review` /
`/security-review`. The selected depth (Standard/Deep) is passed to those
subagents as their effort/scope input — this file does not itself change
what `/code-review`/`/security-review` do, only how much of the diff and how
deep a pass they're asked to apply.

## Tuning

Add or remove risk-keyword categories, or change the file-count threshold,
by editing this file only. No other file encodes this rule.
