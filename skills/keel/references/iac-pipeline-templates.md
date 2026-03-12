# IaC Pipeline Templates

CI/CD pipeline templates for infrastructure-as-code. Each implements the
plan-on-PR, apply-on-merge pattern with environment promotion.

Template variables:
- `{IAC_TOOL}`: terraform, bicep, pulumi, cdk
- `{DEFAULT_BRANCH}`: main or master
- `{CLOUD_PROVIDER}`: azure, aws, gcp
- `{STATE_BACKEND}`: backend config details
- `{INFRA_DIR}`: path to IaC files (default: infra/)
- `{ENVIRONMENTS}`: list of environments (dev, staging, prod)
- `{PLATFORM}`: github or azdo — determines which pipeline template to use
- `{SERVICE_CONNECTION}`: Azure DevOps service connection name (AzDO only)

---

## GitHub Actions

### Terraform

File: `.github/workflows/infra.yml`

```yaml
name: Infrastructure

on:
  pull_request:
    paths:
      - "infra/**"
      - ".github/workflows/infra.yml"
  push:
    branches: [{DEFAULT_BRANCH}]
    paths:
      - "infra/**"
      - ".github/workflows/infra.yml"
  workflow_dispatch:
    inputs:
      environment:
        description: "Target environment"
        required: true
        type: choice
        options: [dev, staging, prod]
      action:
        description: "Action to perform"
        required: true
        type: choice
        options: [plan, apply]

concurrency:
  group: infra-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

permissions:
  contents: read
  pull-requests: write
  id-token: write  # For OIDC auth

env:
  TF_IN_AUTOMATION: true
  INFRA_DIR: infra

jobs:
  # ── Plan (runs on every PR) ──────────────────────────────────
  plan:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    strategy:
      matrix:
        environment: [{ENVIRONMENTS_LIST}]
    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: "~1.9"

      # Cloud auth — choose one based on provider
      # Azure:
      - uses: azure/login@v2
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}
      # AWS (OIDC):
      # - uses: aws-actions/configure-aws-credentials@v4
      #   with:
      #     role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
      #     aws-region: ${{ vars.AWS_REGION }}
      # GCP (Workload Identity):
      # - uses: google-github-actions/auth@v2
      #   with:
      #     workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
      #     service_account: ${{ secrets.SA_EMAIL }}

      - name: Terraform Init
        working-directory: ${{ env.INFRA_DIR }}
        run: terraform init

      - name: Terraform Plan
        id: plan
        working-directory: ${{ env.INFRA_DIR }}
        run: |
          terraform plan \
            -var-file=environments/${{ matrix.environment }}.tfvars \
            -out=plan-${{ matrix.environment }}.tfplan \
            -no-color 2>&1 | tee plan-output.txt
        continue-on-error: true

      - name: Comment PR with plan
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const plan = fs.readFileSync('${{ env.INFRA_DIR }}/plan-output.txt', 'utf8');
            const truncated = plan.length > 60000 ? plan.slice(-60000) : plan;
            const body = `### Terraform Plan — \`${{ matrix.environment }}\`
            \`\`\`
            ${truncated}
            \`\`\`
            *Triggered by ${{ github.actor }} in ${{ github.event.pull_request.head.ref }}*`;
            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: body
            });

      - name: Fail if plan errored
        if: steps.plan.outcome == 'failure'
        run: exit 1

  # ── Apply Dev (on merge to main) ────────────────────────────
  apply-dev:
    if: github.ref == 'refs/heads/{DEFAULT_BRANCH}' && github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: dev
    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: "~1.9"

      - uses: azure/login@v2
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}

      - name: Terraform Init
        working-directory: ${{ env.INFRA_DIR }}
        run: terraform init

      - name: Terraform Apply
        working-directory: ${{ env.INFRA_DIR }}
        run: |
          terraform apply \
            -var-file=environments/dev.tfvars \
            -auto-approve

      - name: Sync outputs to GitHub variables
        working-directory: ${{ env.INFRA_DIR }}
        run: |
          REGISTRY_URL=$(terraform output -raw registry_url 2>/dev/null) || true
          if [ -n "$REGISTRY_URL" ]; then
            gh variable set REGISTRY_URL --body "$REGISTRY_URL"
          fi
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  # ── Apply Staging (manual dispatch or tag) ───────────────────
  apply-staging:
    if: >
      github.event_name == 'workflow_dispatch' &&
      github.event.inputs.environment == 'staging' &&
      github.event.inputs.action == 'apply'
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: "~1.9"

      - uses: azure/login@v2
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}

      - name: Terraform Init & Apply
        working-directory: ${{ env.INFRA_DIR }}
        run: |
          terraform init
          terraform apply \
            -var-file=environments/staging.tfvars \
            -auto-approve

  # ── Apply Prod (manual dispatch with approval) ───────────────
  apply-prod:
    if: >
      github.event_name == 'workflow_dispatch' &&
      github.event.inputs.environment == 'prod' &&
      github.event.inputs.action == 'apply'
    runs-on: ubuntu-latest
    environment: production  # Requires approval in GitHub settings
    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: "~1.9"

      - uses: azure/login@v2
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}

      - name: Terraform Init & Apply
        working-directory: ${{ env.INFRA_DIR }}
        run: |
          terraform init
          terraform apply \
            -var-file=environments/prod.tfvars \
            -auto-approve
```

### Bicep

File: `.github/workflows/infra.yml`

```yaml
name: Infrastructure

on:
  pull_request:
    paths: ["infra/**"]
  push:
    branches: [{DEFAULT_BRANCH}]
    paths: ["infra/**"]
  workflow_dispatch:
    inputs:
      environment:
        required: true
        type: choice
        options: [dev, staging, prod]

permissions:
  contents: read
  pull-requests: write
  id-token: write

env:
  INFRA_DIR: infra

jobs:
  # ── What-If (plan equivalent for Bicep) ──────────────────────
  what-if:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    strategy:
      matrix:
        environment: [{ENVIRONMENTS_LIST}]
    steps:
      - uses: actions/checkout@v4

      - uses: azure/login@v2
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}

      - name: Bicep What-If
        run: |
          az deployment sub what-if \
            --location {REGION} \
            --template-file ${{ env.INFRA_DIR }}/main.bicep \
            --parameters ${{ env.INFRA_DIR }}/environments/${{ matrix.environment }}.bicepparam \
            --no-pretty-print > whatif-output.txt 2>&1

      - name: Comment PR
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const output = fs.readFileSync('whatif-output.txt', 'utf8');
            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: `### Bicep What-If — \`${{ matrix.environment }}\`\n\`\`\`\n${output.slice(-60000)}\n\`\`\``
            });

  # ── Deploy Dev ───────────────────────────────────────────────
  deploy-dev:
    if: github.ref == 'refs/heads/{DEFAULT_BRANCH}' && github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: dev
    steps:
      - uses: actions/checkout@v4
      - uses: azure/login@v2
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}

      - name: Deploy
        run: |
          az deployment sub create \
            --location {REGION} \
            --template-file ${{ env.INFRA_DIR }}/main.bicep \
            --parameters ${{ env.INFRA_DIR }}/environments/dev.bicepparam

  # ── Deploy Staging/Prod (manual dispatch) ────────────────────
  deploy-env:
    if: github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    environment: ${{ github.event.inputs.environment }}
    steps:
      - uses: actions/checkout@v4
      - uses: azure/login@v2
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}

      - name: Deploy
        run: |
          az deployment sub create \
            --location {REGION} \
            --template-file ${{ env.INFRA_DIR }}/main.bicep \
            --parameters ${{ env.INFRA_DIR }}/environments/${{ github.event.inputs.environment }}.bicepparam
```

---

## Azure DevOps Pipelines

### Terraform

File: `azure-pipelines-infra.yml`

```yaml
trigger:
  branches:
    include: [{DEFAULT_BRANCH}]
  paths:
    include: [infra/*]

pr:
  paths:
    include: [infra/*]

variables:
  infraDir: infra
  serviceConnection: "{SERVICE_CONNECTION}"

stages:
  - stage: Plan
    condition: eq(variables['Build.Reason'], 'PullRequest')
    jobs:
      - job: TerraformPlan
        pool:
          vmImage: ubuntu-latest
        steps:
          - task: TerraformInstaller@1
            inputs:
              terraformVersion: latest

          - task: TerraformTaskV4@4
            displayName: Init
            inputs:
              provider: azurerm
              command: init
              workingDirectory: $(infraDir)
              backendServiceArm: $(serviceConnection)
              backendAzureRmResourceGroupName: "{STATE_RG}"
              backendAzureRmStorageAccountName: "{STATE_STORAGE}"
              backendAzureRmContainerName: tfstate
              backendAzureRmKey: "{PROJECT}.tfstate"

          - task: TerraformTaskV4@4
            displayName: Plan
            inputs:
              provider: azurerm
              command: plan
              workingDirectory: $(infraDir)
              commandOptions: "-var-file=environments/dev.tfvars"
              environmentServiceNameAzureRM: $(serviceConnection)

  - stage: ApplyDev
    condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/{DEFAULT_BRANCH}'))
    jobs:
      - deployment: ApplyDev
        environment: dev
        pool:
          vmImage: ubuntu-latest
        strategy:
          runOnce:
            deploy:
              steps:
                - checkout: self
                - task: TerraformInstaller@1
                  inputs:
                    terraformVersion: latest
                - task: TerraformTaskV4@4
                  displayName: Init
                  inputs:
                    provider: azurerm
                    command: init
                    workingDirectory: $(infraDir)
                    backendServiceArm: $(serviceConnection)
                    backendAzureRmResourceGroupName: "{STATE_RG}"
                    backendAzureRmStorageAccountName: "{STATE_STORAGE}"
                    backendAzureRmContainerName: tfstate
                    backendAzureRmKey: "{PROJECT}.tfstate"
                - task: TerraformTaskV4@4
                  displayName: Apply
                  inputs:
                    provider: azurerm
                    command: apply
                    workingDirectory: $(infraDir)
                    commandOptions: "-var-file=environments/dev.tfvars -auto-approve"
                    environmentServiceNameAzureRM: $(serviceConnection)
```

### Bicep

File: `azure-pipelines-infra.yml`

```yaml
trigger:
  branches:
    include: [{DEFAULT_BRANCH}]
  paths:
    include: [infra/*]

pr:
  paths:
    include: [infra/*]

variables:
  infraDir: infra
  serviceConnection: "{SERVICE_CONNECTION}"
  location: "{REGION}"

stages:
  - stage: WhatIf
    condition: eq(variables['Build.Reason'], 'PullRequest')
    jobs:
      - job: BicepWhatIf
        pool:
          vmImage: ubuntu-latest
        steps:
          - task: AzureCLI@2
            displayName: Bicep What-If
            inputs:
              azureSubscription: $(serviceConnection)
              scriptType: bash
              scriptLocation: inlineScript
              inlineScript: |
                az deployment sub what-if \
                  --location $(location) \
                  --template-file $(infraDir)/main.bicep \
                  --parameters $(infraDir)/environments/dev.bicepparam \
                  --no-pretty-print

  - stage: DeployDev
    condition: and(succeeded(), eq(variables['Build.SourceBranch'], 'refs/heads/{DEFAULT_BRANCH}'))
    jobs:
      - deployment: DeployDev
        environment: dev
        pool:
          vmImage: ubuntu-latest
        strategy:
          runOnce:
            deploy:
              steps:
                - checkout: self
                - task: AzureCLI@2
                  displayName: Deploy Dev
                  inputs:
                    azureSubscription: $(serviceConnection)
                    scriptType: bash
                    scriptLocation: inlineScript
                    inlineScript: |
                      az deployment sub create \
                        --location $(location) \
                        --template-file $(infraDir)/main.bicep \
                        --parameters $(infraDir)/environments/dev.bicepparam

  - stage: DeployEnv
    condition: eq(variables['Build.Reason'], 'Manual')
    jobs:
      - deployment: DeployEnv
        environment: $(targetEnvironment)
        pool:
          vmImage: ubuntu-latest
        strategy:
          runOnce:
            deploy:
              steps:
                - checkout: self
                - task: AzureCLI@2
                  displayName: Deploy $(targetEnvironment)
                  inputs:
                    azureSubscription: $(serviceConnection)
                    scriptType: bash
                    scriptLocation: inlineScript
                    inlineScript: |
                      az deployment sub create \
                        --location $(location) \
                        --template-file $(infraDir)/main.bicep \
                        --parameters $(infraDir)/environments/$(targetEnvironment).bicepparam
```

---

## Bootstrap Scripts

### Azure state backend

```bash
#!/bin/bash
# infra/bootstrap.sh — Run once to create Terraform state backend
set -euo pipefail

PROJECT="{PROJECT}"
LOCATION="{REGION}"
RG_NAME="rg-${PROJECT}-tfstate"
SA_NAME="st${PROJECT//[^a-z0-9]/}tfstate"

echo "Creating state backend for ${PROJECT}..."

az group create --name "$RG_NAME" --location "$LOCATION" --output none
az storage account create \
  --name "$SA_NAME" \
  --resource-group "$RG_NAME" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --min-tls-version TLS1_2 \
  --output none
az storage container create \
  --name tfstate \
  --account-name "$SA_NAME" \
  --output none

echo "State backend ready:"
echo "  Resource Group: $RG_NAME"
echo "  Storage Account: $SA_NAME"
echo "  Container: tfstate"
```

### AWS state backend

```bash
#!/bin/bash
set -euo pipefail

PROJECT="{PROJECT}"
REGION="{REGION}"
BUCKET="${PROJECT}-tfstate"
TABLE="${PROJECT}-tflock"

echo "Creating state backend for ${PROJECT}..."

aws s3api create-bucket \
  --bucket "$BUCKET" \
  --region "$REGION" \
  --create-bucket-configuration LocationConstraint="$REGION"

aws s3api put-bucket-versioning \
  --bucket "$BUCKET" \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket "$BUCKET" \
  --server-side-encryption-configuration '{
    "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "aws:kms"}}]
  }'

aws dynamodb create-table \
  --table-name "$TABLE" \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

echo "State backend ready:"
echo "  S3 Bucket: $BUCKET"
echo "  DynamoDB Table: $TABLE"
```

---

## Output Sync Script

### infra/sync-outputs.sh

Reads IaC outputs and sets them as CI/CD variables for /dock pipelines:

```bash
#!/bin/bash
# Sync Terraform outputs to GitHub variables/secrets for /dock
set -euo pipefail

cd "$(dirname "$0")"

echo "Syncing infrastructure outputs..."

# Public values → GitHub Variables
REGISTRY_URL=$(terraform output -raw registry_url 2>/dev/null) || true
[ -n "$REGISTRY_URL" ] && gh variable set REGISTRY_URL --body "$REGISTRY_URL"

COMPUTE_ENDPOINT=$(terraform output -raw compute_endpoint 2>/dev/null) || true
[ -n "$COMPUTE_ENDPOINT" ] && gh variable set COMPUTE_ENDPOINT --body "$COMPUTE_ENDPOINT"

# Sensitive values → GitHub Secrets
DB_URL=$(terraform output -raw database_connection_string 2>/dev/null) || true
[ -n "$DB_URL" ] && gh secret set DATABASE_URL --body "$DB_URL"

echo "Outputs synced to GitHub."
```

### infra/sync-outputs.sh (Azure DevOps)

Reads IaC outputs and sets them as Azure DevOps variable group variables for /dock pipelines:

```bash
#!/bin/bash
# Sync Terraform outputs to Azure DevOps variable group for /dock
set -euo pipefail

cd "$(dirname "$0")"

PROJECT="{PROJECT}"
VG_NAME="${PROJECT}-infra-outputs"

echo "Syncing infrastructure outputs to Azure DevOps..."

# Resolve or create the variable group
VG_ID=$(az pipelines variable-group list \
  --query "[?name=='${VG_NAME}'].id | [0]" -o tsv 2>/dev/null)

if [ -z "$VG_ID" ]; then
  echo "Creating variable group: ${VG_NAME}"
  VG_ID=$(az pipelines variable-group create \
    --name "$VG_NAME" \
    --variables placeholder=true \
    --query "id" -o tsv)
fi

# Helper: update or create a variable in the group
upsert_var() {
  local name="$1" value="$2" secret="${3:-false}"
  if az pipelines variable-group variable list --group-id "$VG_ID" \
      --query "\"${name}\"" -o tsv &>/dev/null; then
    az pipelines variable-group variable update \
      --group-id "$VG_ID" --name "$name" --value "$value" --secret "$secret" --output none
  else
    az pipelines variable-group variable create \
      --group-id "$VG_ID" --name "$name" --value "$value" --secret "$secret" --output none
  fi
}

# Public values
REGISTRY_URL=$(terraform output -raw registry_url 2>/dev/null) || true
[ -n "$REGISTRY_URL" ] && upsert_var "REGISTRY_URL" "$REGISTRY_URL"

COMPUTE_ENDPOINT=$(terraform output -raw compute_endpoint 2>/dev/null) || true
[ -n "$COMPUTE_ENDPOINT" ] && upsert_var "COMPUTE_ENDPOINT" "$COMPUTE_ENDPOINT"

# Sensitive values
DB_URL=$(terraform output -raw database_connection_string 2>/dev/null) || true
[ -n "$DB_URL" ] && upsert_var "DATABASE_URL" "$DB_URL" true

echo "Outputs synced to Azure DevOps variable group: ${VG_NAME} (ID: ${VG_ID})"
```
