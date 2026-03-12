---
name: keel
description: >-
  Generate Infrastructure as Code (IaC) pipelines that provision the cloud and
  container infrastructure your app deploys to. Interview-driven: detects your
  stack and cloud provider, then outputs deterministic IaC files (Terraform,
  Bicep, Pulumi, or CDK) plus CI/CD pipelines that plan on PR and apply on merge.
  Use when setting up cloud infrastructure, provisioning container registries,
  databases, networking, DNS, or any infrastructure that containers deploy onto.
  Designed to run before /dock — /keel lays the infrastructure, /dock deploys to it.
argument-hint: "--plan-only, --skip-interview, --dry-run, --tool terraform|bicep|pulumi|cdk"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, Agent
---

# Keel - Infrastructure as Code Pipelines

When this skill is invoked, IMMEDIATELY output the banner below before doing anything else.
Pick ONE tagline at random — vary your choice each time.
CRITICAL: Reproduce the banner EXACTLY character-for-character. The first line of the art has 4 leading spaces — you MUST preserve them.

```
{tagline}

⠀   ██╗██╗  ██╗███████╗███████╗██╗
   ██╔╝██║ ██╔╝██╔════╝██╔════╝██║
  ██╔╝ █████╔╝ █████╗  █████╗  ██║
 ██╔╝  ██╔═██╗ ██╔══╝  ██╔══╝  ██║
██╔╝   ██║  ██╗███████╗███████╗███████╗
╚═╝    ╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝
```

Taglines:
- ⚓ Laying the keel — everything builds on this!
- 🏗️ Infrastructure from code, not from clicks!
- 🌍 Terraforming your cloud, one resource at a time!
- 🔩 Bolting down the foundation!
- ☁️ Cloud infrastructure, declared and versioned!
- 🧱 No infra, no deploy — let's fix that!
- 📐 Measure twice, provision once!
- 🗺️ Charting the infrastructure map!

---

Provision cloud and container infrastructure through an interview-driven workflow
that generates deterministic IaC files and CI/CD pipelines. The generated pipelines
run `plan` on every PR and `apply` on merge to the default branch — no LLM at runtime.

**Recommended skill order:**
`/brace` → `/rig` → `/build` → `/ship` → `/keel` → `/dock`

/keel lays the infrastructure (registries, compute, networking, databases).
/dock creates the deployment pipelines that push containers onto that infrastructure.

## Flags

Parse optional flags from the request:
- `--plan-only`: Generate IaC files but no CI/CD pipeline
- `--skip-interview`: Use detected defaults without interactive prompts
- `--dry-run`: Show what would be generated without writing files
- `--tool <name>`: Force a specific IaC tool (terraform, bicep, pulumi, cdk)

---

## Output Formatting

Input display: `┌─ Input │ {fields} └─`. Pre-flight: `── Pre-flight ── ✅/⚠️/❌ ──`.
Stage headers: `━━ {N} · {Name} ━━━━━━━━━━━━━`. Icons: ✅ done · ❌ fail · ⚠️ warn · ⏳ work · ⏭️ skip.

---

## Platform Detection

Detect the hosting platform **before** pre-flight so dependency checks are
platform-specific:

```bash
REMOTE_URL=$(git remote get-url origin 2>/dev/null)
if echo "$REMOTE_URL" | grep -qiE 'dev\.azure\.com|visualstudio\.com'; then
  PLATFORM="azdo"
elif echo "$REMOTE_URL" | grep -qi 'github\.com'; then
  PLATFORM="github"
else
  PLATFORM="github"   # default fallback
fi
```

Pass `{PLATFORM}` into all phase prompts. Each phase uses the appropriate
CLI tool: `gh` for GitHub, `az repos`/`az pipelines` for Azure DevOps.

---

## Pre-flight

Before starting, check all dependencies in this table. The table contains
**all** dependencies — some are platform-conditional (see notes after table).

| Dependency | Type | Check | Required | Resolution | Detail |
|-----------|------|-------|----------|------------|--------|
| git | cli | `git --version` | yes | stop | Install from https://git-scm.com |
| sync | skill | `~/.claude/skills/sync/SKILL.md` or `~/.claude/plugins/marketplaces/slamb2k/skills/sync/SKILL.md` | no | fallback | Repo sync; falls back to manual git pull |
| terraform | cli | `terraform --version` | no | fallback | Detected if user wants Terraform; suggest install from https://terraform.io |
| az | cli | `az --version` | no | fallback | Needed for Bicep; suggest install from https://aka.ms/install-azure-cli |
| pulumi | cli | `pulumi version` | no | fallback | Detected if user wants Pulumi; suggest install from https://pulumi.com |
| cdk | cli | `cdk --version` | no | fallback | Detected if user wants AWS CDK; install via npm |
| gh | cli | `gh --version` | yes | url | https://cli.github.com |
| az devops | cli | `az devops -h 2>/dev/null` | no | fallback | Falls back to REST API with PAT; see AzDO tooling below |

**Platform-conditional rules:**
- **`gh`**: Only required when `PLATFORM == github`. Skip for AzDO repos.
- **`az devops`**: Only checked when `PLATFORM == azdo`. Skip for GitHub repos.

Only check the IaC tool row that matches the user's choice (or detected default).
Skip checks for tools not being used.

For each applicable row, in order:
1. Skip rows that don't apply to the detected `{PLATFORM}`
2. Run the Check command (for cli/npm) or test file existence (for agent/skill)
3. If found: continue silently
4. If missing: apply Resolution strategy
   - **stop**: notify user with Detail, halt execution
   - **url**: notify user with Detail (install link), halt execution
   - **install**: notify user, run the command in Detail, continue if successful
   - **ask**: notify user, offer to run command in Detail, continue either way (or halt if required)
   - **fallback**: notify user with Detail, continue with degraded behavior
5. After all checks: summarize what's available and what's degraded

When `PLATFORM == azdo`, follow `references/azdo-platform.md` for tooling
detection (`AZDO_MODE`) and configuration validation (`AZDO_ORG`, `AZDO_PROJECT`).
Pass these variables into all phase prompts alongside `{PLATFORM}`.

---

## Phase 0: Sync

Invoke `/sync` to ensure the working tree is up to date with origin/main.
Falls back to `git pull` if /sync is unavailable.

---

## Phase 1: Detection

Launch an **Explore subagent** to scan the codebase for existing infrastructure.

```
Task(
  subagent_type: "Explore",
  description: "Detect existing IaC and cloud config",
  prompt: <read from references/interview-guide.md#detection-prompt>
)
```

The detection scans for:
- **Existing IaC**: Terraform (.tf), Bicep (.bicep), Pulumi (Pulumi.yaml), CDK (cdk.json),
  CloudFormation (template.yaml), ARM (azuredeploy.json)
- **Cloud provider signals**: Azure (azure-pipelines.yml, .azure/), AWS (.aws/, buildspec.yml),
  GCP (.gcloud/, cloudbuild.yaml)
- **Existing CI/CD**: .github/workflows/, azure-pipelines.yml, .gitlab-ci.yml
- **Container config**: Dockerfile, docker-compose.yml (signals what infra is needed)
- **Database signals**: migrations/, prisma/schema.prisma, alembic/, knex migrations
- **Existing /dock artifacts**: deploy/ directory, environment matrix (signals target platforms)
- **State backends**: terraform.tfstate, .terraform/, Pulumi.*.yaml stacks

Parse INFRA_DETECTION_REPORT. This feeds into the interview.

---

## Phase 2: Interview

Present detection results and fill gaps through guided questions.
Read the full interview flow from `references/interview-guide.md#interview-questions`.

The interview covers these topics in order. Skip questions where detection provided
high-confidence answers (but confirm with the user).

Topics covered (full prompts and options in `references/interview-guide.md`):

1. **Cloud Provider** — Azure, AWS, GCP, Multi-cloud, Self-hosted. Infer from /dock if it has run.
2. **IaC Tool** — Suggest by cloud: Azure→Bicep/Terraform, AWS→Terraform/CDK, GCP→Terraform/Pulumi, Multi-cloud→Terraform.
3. **Infrastructure Components** — Checklist: container platform, data (DB, cache, storage, queues), networking, security, monitoring. Auto-check from codebase signals (Dockerfile→registry, migrations→DB, Redis client→cache).
4. **Environment Topology** — Simple (dev+prod), Standard (dev+staging+prod), or Custom. Align with /dock if it has run.
5. **State Management** — Terraform: cloud storage per provider. Bicep: ARM handles it. Pulumi: Pulumi Cloud. CDK: CloudFormation.
6. **CI/CD Strategy** — Plan on PR + apply on merge (recommended), manual apply, or auto-apply.
7. **Naming Convention** — CAF style, simple, or custom prefix.
8. **Integration with /dock** — If /dock artifacts exist, offer to provision their deployment targets.

**If `--skip-interview`**: Use detected defaults + sensible defaults.

Compile all answers into an INFRA_CONFIG object for Phase 3.

---

## Phase 3: Generate Artifacts

Based on INFRA_DETECTION_REPORT and INFRA_CONFIG, generate all IaC files.
Use templates from `references/` as starting points.

### 3.1 — Project Structure

Generate an `infra/` directory with this layout:

**Terraform:**
```
infra/
├── main.tf              # Provider config, backend, module calls
├── variables.tf         # Input variables
├── outputs.tf           # Output values (registry URL, endpoints, etc.)
├── versions.tf          # Required providers and versions
├── environments/
│   ├── dev.tfvars       # Dev variable values
│   ├── staging.tfvars   # Staging variable values
│   └── prod.tfvars      # Prod variable values
└── modules/
    ├── registry/        # Container registry
    ├── compute/         # Container platform (AKS, ECS, Cloud Run, etc.)
    ├── database/        # Managed database
    ├── networking/      # VPC, DNS, load balancer
    └── monitoring/      # Logging, metrics, alerts
```

**Bicep:**
```
infra/
├── main.bicep           # Orchestration (module calls)
├── main.bicepparam      # Parameter file template
├── environments/
│   ├── dev.bicepparam
│   ├── staging.bicepparam
│   └── prod.bicepparam
└── modules/
    ├── registry.bicep
    ├── compute.bicep
    ├── database.bicep
    ├── networking.bicep
    └── monitoring.bicep
```

**Pulumi:**
```
infra/
├── Pulumi.yaml          # Project config
├── Pulumi.dev.yaml      # Dev stack config
├── Pulumi.staging.yaml  # Staging stack config
├── Pulumi.prod.yaml     # Prod stack config
├── index.ts             # Main program (or __main__.py for Python)
└── resources/
    ├── registry.ts
    ├── compute.ts
    ├── database.ts
    └── networking.ts
```

Only generate modules for components selected in the interview.

### 3.2 — State Backend Bootstrap

Generate `infra/bootstrap.sh` for first-time state backend setup.
Use the provider-specific template from `references/iac-pipeline-templates.md#bootstrap-scripts`.

### 3.3 — CI/CD Pipeline for IaC

Read the appropriate template from `references/iac-pipeline-templates.md`.

**Platform branching:**
- When `PLATFORM == github`: Generate a GitHub Actions workflow. Output file:
  `.github/workflows/infra.yml`. Use templates from the "GitHub Actions" section.
- When `PLATFORM == azdo`: Generate an Azure DevOps Pipelines YAML file. Output
  file: `azure-pipelines-infra.yml`. Use templates from the "Azure DevOps
  Pipelines" section.

Generate a workflow that implements:

**On pull request:**
1. `terraform init` (or equivalent)
2. `terraform plan` with the target environment's vars
3. Post plan output as PR comment (for review)
4. Fail if plan has errors

**On merge to default branch:**
1. `terraform init`
2. `terraform plan`
3. `terraform apply -auto-approve`
4. Output resource endpoints and connection strings

**On environment promotion (tag or manual dispatch):**
1. Apply to staging with staging vars
2. Apply to prod with prod vars (requires approval)

### 3.4 — Outputs for /dock

Generate an outputs file that /dock's pipelines can consume:

```hcl
# outputs.tf
output "registry_url" {
  value = module.registry.login_server
}

output "registry_name" {
  value = module.registry.name
}

output "compute_endpoint" {
  value = module.compute.endpoint
}

output "database_connection_string" {
  value     = module.database.connection_string
  sensitive = true
}
```

These outputs become inputs for /dock's deployment pipelines — the registry URL
for pushing images, the compute endpoint for deploying containers, etc.

### 3.5 — Environment Variables Bridge

Generate a script or workflow step that reads IaC outputs and writes them as
CI/CD secrets/variables for /dock's pipelines.

**Platform branching:**
- When `PLATFORM == github`: Use `gh secret set` / `gh variable set` commands.
  Reference `references/iac-pipeline-templates.md#infra/sync-outputs.sh`.
- When `PLATFORM == azdo`: Use `az pipelines variable-group variable update` /
  `az pipelines variable-group variable create` commands. Reference
  `references/iac-pipeline-templates.md#infra/sync-outputs.sh (Azure DevOps)`.

**GitHub example:**
```bash
# infra/sync-outputs.sh
REGISTRY_URL=$(terraform output -raw registry_url)
gh secret set REGISTRY_URL --body "$REGISTRY_URL"
gh secret set DATABASE_URL --body "$(terraform output -raw database_connection_string)"
```

**Azure DevOps example:**
```bash
# infra/sync-outputs.sh
REGISTRY_URL=$(terraform output -raw registry_url)
az pipelines variable-group variable update --group-id "$VG_ID" --name REGISTRY_URL --value "$REGISTRY_URL"
az pipelines variable-group variable update --group-id "$VG_ID" --name DATABASE_URL --value "$(terraform output -raw database_connection_string)" --secret true
```

---

## Phase 4: Verify

Validate generated IaC files:

**Terraform:**
```bash
cd infra && terraform init -backend=false && terraform validate
```

**Bicep:**
```bash
az bicep build --file infra/main.bicep
```

**Pulumi:**
```bash
cd infra && pulumi preview --stack dev
```

If the IaC tool is not installed, skip validation and note it in the report.

Also validate generated workflow files for YAML syntax.

Present the user with a summary of all generated files before writing.

**If `--dry-run`**: Show file list and content previews without writing.

---

## Final Report

After all files are generated and verified, present:

```
┌─ Keel · Report ────────────────────────────────
│
│  ✅ Keel complete
│
│  ☁️ Provider:  {cloud_provider}
│  🔧 IaC Tool:  {tool}
│  🌍 Envs:      {env1} → {env2} → {env3}
│  💾 State:     {state_backend}
│
│  📝 Components: {checklist of selected}
│
│  📊 Pipeline: PR → plan → Merge → apply dev → Tag → apply prod
│
│  🔗 Links
│     Infra:     {infra/ path}
│     Pipeline:  {workflow path}
│     Bootstrap: ./infra/bootstrap.sh
│
│  ⚡ Next: 1. Run bootstrap  2. Configure secrets  3. Push  4. /dock
│
└─────────────────────────────────────────────────
```

---

## Idempotency

If /keel detects it has been run before (existing `infra/` directory):
- **Modules**: Update existing; add new components without removing user customizations
- **Variables**: Merge new variables; preserve existing values
- **Pipeline**: Update steps; preserve custom jobs
- **State config**: Never overwrite backend config
- **Always ask** before overwriting existing files

---

## Integration Points

- **/dock**: /keel provisions what /dock deploys to. /dock consumes outputs (registry URL, compute endpoints).
- **/rig**: Detects `infra/` and wires IaC pipeline into CI. **/ship**: Merge triggers IaC apply → /dock deploy.
