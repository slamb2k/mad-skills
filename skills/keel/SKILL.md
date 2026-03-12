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

### AzDO Tooling Detection

When `PLATFORM == azdo`, determine which tooling is available. Set `AZDO_MODE`
for use in all subsequent phases:

```bash
if az devops -h &>/dev/null; then
  AZDO_MODE="cli"
else
  AZDO_MODE="rest"
fi
```

- **`cli`**: Use `az repos` / `az pipelines` commands (preferred)
- **`rest`**: Use Azure DevOps REST API via `curl`. Requires a PAT (personal
  access token) in `AZURE_DEVOPS_EXT_PAT` or `AZDO_PAT` env var. If no PAT
  is found, prompt the user to either install the CLI or set the env var.

Report in pre-flight:
- ✅ `az devops cli` — version found
- ⚠️ `az devops cli` — not found → using REST API fallback
- ❌ `az devops cli` — not found, no PAT configured → halt with setup instructions

### AzDO Configuration Validation

When `PLATFORM == azdo`, extract organization and project from the remote URL
and validate they are usable. These values are needed by every `az repos` /
`az pipelines` command and every REST API call.

```bash
# Extract org and project from remote URL patterns:
#   https://dev.azure.com/{ORG}/{PROJECT}/_git/{REPO}
#   https://{ORG}@dev.azure.com/{ORG}/{PROJECT}/_git/{REPO}
#   {ORG}@vs-ssh.visualstudio.com:v3/{ORG}/{PROJECT}/{REPO}

REMOTE_URL=$(git remote get-url origin 2>/dev/null)

if echo "$REMOTE_URL" | grep -q 'dev\.azure\.com'; then
  AZDO_ORG=$(echo "$REMOTE_URL" | sed -n 's|.*dev\.azure\.com/\([^/]*\)/.*|\1|p')
  AZDO_PROJECT=$(echo "$REMOTE_URL" | sed -n 's|.*dev\.azure\.com/[^/]*/\([^/]*\)/.*|\1|p')
  AZDO_ORG_URL="https://dev.azure.com/$AZDO_ORG"
elif echo "$REMOTE_URL" | grep -q 'vs-ssh\.visualstudio\.com'; then
  AZDO_ORG=$(echo "$REMOTE_URL" | sed -n 's|.*vs-ssh\.visualstudio\.com:v3/\([^/]*\)/.*|\1|p')
  AZDO_PROJECT=$(echo "$REMOTE_URL" | sed -n 's|.*vs-ssh\.visualstudio\.com:v3/[^/]*/\([^/]*\)/.*|\1|p')
  AZDO_ORG_URL="https://dev.azure.com/$AZDO_ORG"
elif echo "$REMOTE_URL" | grep -q 'visualstudio\.com'; then
  AZDO_ORG=$(echo "$REMOTE_URL" | sed -n 's|.*//\([^.]*\)\.visualstudio\.com.*|\1|p')
  AZDO_PROJECT=$(echo "$REMOTE_URL" | sed -n 's|.*/\([^/]*\)/_git/.*|\1|p')
  AZDO_ORG_URL="https://dev.azure.com/$AZDO_ORG"
fi

if [ -z "$AZDO_ORG" ] || [ -z "$AZDO_PROJECT" ]; then
  echo "❌ Could not extract organization/project from remote URL"
  echo "   Remote: $REMOTE_URL"
  echo ""
  echo "Ensure the remote URL follows one of these formats:"
  echo "  https://dev.azure.com/{ORG}/{PROJECT}/_git/{REPO}"
  echo "  https://{ORG}.visualstudio.com/{PROJECT}/_git/{REPO}"
  echo "  {ORG}@vs-ssh.visualstudio.com:v3/{ORG}/{PROJECT}/{REPO}"
  # HALT — cannot proceed without org/project context
fi
```

When `AZDO_MODE == cli`, also configure the defaults so commands work correctly:
```bash
az devops configure --defaults organization="$AZDO_ORG_URL" project="$AZDO_PROJECT"
```

When `AZDO_MODE == rest`, store these for API calls:
- Base URL: `$AZDO_ORG_URL/$AZDO_PROJECT/_apis`
- Auth header: `Authorization: Basic $(echo -n ":$PAT" | base64)`

Report in pre-flight:
- ✅ `azdo context` — org: `{AZDO_ORG}`, project: `{AZDO_PROJECT}`
- ❌ `azdo context` — could not parse from remote URL → halt with instructions

Pass `{AZDO_MODE}`, `{AZDO_ORG}`, `{AZDO_PROJECT}`, `{AZDO_ORG_URL}` into
all phase prompts alongside `{PLATFORM}`.

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

### 2.1 — Cloud Provider

```
Which cloud provider(s) will host your infrastructure?

Options:
1. Azure (Recommended if Azure signals detected)
2. AWS
3. Google Cloud
4. Multi-cloud
5. Self-hosted / VPS (Dokku, Coolify, CapRover)
```

If /dock has already run, infer from the deployment targets chosen there.

### 2.2 — IaC Tool

Suggest based on cloud provider:
- Azure → Bicep (native) or Terraform (universal)
- AWS → Terraform or CDK
- GCP → Terraform or Pulumi
- Multi-cloud → Terraform
- Self-hosted → Terraform (for VPS provisioning) or skip IaC

```
Which Infrastructure as Code tool do you want to use?

Options:
1. Terraform (Recommended — universal, multi-cloud)
2. Bicep (Azure-native, simpler syntax)
3. Pulumi (code-first, TypeScript/Python/Go)
4. AWS CDK (AWS-native, TypeScript/Python)
```

### 2.3 — Infrastructure Components

Present a checklist based on detected needs. The goal is to provision everything
/dock needs to deploy to, plus supporting services.

```
Which infrastructure components do you need?

Container platform:
  [x] Container registry (required for /dock)
  [ ] Kubernetes cluster (AKS/EKS/GKE)
  [ ] Serverless containers (Container Apps/Fargate/Cloud Run)
  [ ] Self-hosted PaaS (Dokku/Coolify/CapRover on VPS)

Data:
  [ ] Managed database (PostgreSQL, MySQL, SQL Server, etc.)
  [ ] Cache (Redis, Memcached)
  [ ] Object storage (S3, Blob Storage, GCS)
  [ ] Message queue (SQS, Service Bus, Pub/Sub)

Networking:
  [ ] DNS zone
  [ ] CDN / Front Door
  [ ] Virtual network / VPC
  [ ] Load balancer (if not using platform-managed)
  [ ] API Gateway

Security:
  [ ] Key Vault / Secrets Manager
  [ ] Managed identity / IAM roles
  [ ] SSL/TLS certificates

Monitoring:
  [ ] Log aggregation (Application Insights, CloudWatch, Cloud Logging)
  [ ] Metrics / dashboards
  [ ] Alerts
```

Auto-check components if /dock detection or the codebase signals them:
- Dockerfile found → container registry checked
- Database migrations found → managed database checked
- Redis client in deps → cache checked
- S3/Blob SDK in deps → object storage checked

### 2.4 — Environment Topology

Align with /dock's environments if it has run. Otherwise ask:

```
How many environments do you need?

Options:
1. Simple: dev + prod (Recommended for starting out)
2. Standard: dev + staging + prod
3. Custom: define your own
```

Each environment gets its own IaC state and variable set. Resource sizing
scales with the environment tier (dev=small, staging=medium, prod=large).

### 2.5 — State Management

Where to store IaC state (critical for team collaboration):

**Terraform:**
```
Where should Terraform state be stored?

Options:
1. Azure Blob Storage (Recommended for Azure)
2. AWS S3 + DynamoDB (Recommended for AWS)
3. Google Cloud Storage (Recommended for GCP)
4. Terraform Cloud
5. Local (not recommended for teams)
```

**Bicep:** No state management needed (Azure Resource Manager handles it).

**Pulumi:** Pulumi Cloud (default) or self-managed backend.

**CDK:** CloudFormation handles state.

### 2.6 — CI/CD for Infrastructure

```
How should infrastructure changes be applied?

Options:
1. Plan on PR, apply on merge (Recommended)
2. Plan on PR, manual apply via approval
3. Plan and apply on merge (no PR preview)
```

All options generate a pipeline. Option 1 is the default and safest for teams.

### 2.7 — Naming Convention

```
What naming convention should resources use?

Options:
1. Azure CAF style: {resource-type}-{project}-{env}-{region} (Recommended)
2. Simple: {project}-{resource}-{env}
3. Custom prefix: {user-defined}
```

### 2.8 — Integration with /dock

If /dock artifacts exist, ask:
```
I found /dock deployment config. Should /keel provision the infrastructure
those pipelines deploy to?

Detected targets:
  dev:     {platform}
  staging: {platform}
  prod:    {platform}

I'll provision: container registry, {platform}-specific compute, networking.
```

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
