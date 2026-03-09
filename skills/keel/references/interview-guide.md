# Keel Interview Guide

Prompts and questions for the detection and interview phases of /keel.

---

## Detection Prompt

**Agent:** Explore (medium)

```
Scan the codebase to detect existing infrastructure-as-code, cloud provider
signals, and infrastructure dependencies.

Limit INFRA_DETECTION_REPORT to 30 lines maximum.

## What to scan

1. **Existing IaC**
   - Terraform: *.tf files, .terraform/, terraform.tfstate, .terraform.lock.hcl
   - Bicep: *.bicep, *.bicepparam
   - Pulumi: Pulumi.yaml, Pulumi.*.yaml
   - AWS CDK: cdk.json, cdk.out/
   - CloudFormation: template.yaml, template.json, *-template.yml
   - ARM: azuredeploy.json, azuredeploy.parameters.json
   Report: tool, file locations, what resources are defined

2. **Cloud provider signals**
   - Azure: .azure/, azure-pipelines.yml, AZURE_* env vars in workflows,
     @azure packages in deps, Bicep files, ARM templates
   - AWS: .aws/, buildspec.yml, AWS_* env vars, @aws-sdk packages,
     CDK files, CloudFormation templates, SAM templates
   - GCP: .gcloud/, cloudbuild.yaml, GOOGLE_* env vars, @google-cloud packages
   Report: detected provider(s) with confidence

3. **CI/CD system**
   - .github/workflows/*.yml → GitHub Actions
   - azure-pipelines.yml → Azure Pipelines
   - .gitlab-ci.yml → GitLab CI
   Report: system, existing infra-related jobs if any

4. **Container config (signals for /dock integration)**
   - Dockerfile, docker-compose.yml
   - deploy/ directory (from /dock)
   - deploy/environments.json or .yml
   Report: what deployment targets are configured

5. **Database signals**
   - prisma/schema.prisma → PostgreSQL/MySQL/SQLite
   - migrations/ or alembic/ → database migrations
   - knex migrations, sequelize migrations
   - Database connection string patterns in .env.example
   Report: database type and ORM/migration tool

6. **Cache/queue signals**
   - Redis client packages (ioredis, redis, bull, celery)
   - Message queue packages (amqplib, @azure/service-bus, @aws-sdk/client-sqs)
   Report: detected services

7. **Storage signals**
   - S3/Blob Storage SDK packages
   - File upload handling code
   Report: detected storage needs

8. **State backends**
   - terraform.tfstate (local state — bad sign)
   - backend config blocks in *.tf
   - Pulumi.*.yaml with backend settings
   Report: current state management

## Output Format

INFRA_DETECTION_REPORT:
- existing_iac: {tool and files, or "none"}
- cloud_provider: {detected provider(s) with confidence}
- ci_system: {detected CI system}
- dock_config: {deployment targets from /dock, or "none"}
- database: {type and migration tool, or "none"}
- cache: {redis/memcached, or "none"}
- storage: {blob/s3/gcs, or "none"}
- queue: {service bus/sqs/pubsub, or "none"}
- state_backend: {current state management, or "none"}
- confidence: {high/medium/low}
- notes: {anything ambiguous}
```

---

## Interview Questions

Use AskUserQuestion for each topic. Present detected values as defaults.
Skip questions where detection provided high-confidence answers.

### Cloud Provider

```
Which cloud provider(s) will host your infrastructure?

{If detected: "I detected {PROVIDER} signals in your codebase."}

Options:
1. Azure (Recommended if Azure signals detected)
2. AWS (Recommended if AWS signals detected)
3. Google Cloud
4. Multi-cloud (provision across providers)
5. Self-hosted / VPS (provision a VPS, install Dokku/Coolify/CapRover)
```

### IaC Tool

Suggest based on provider:

```
Which Infrastructure as Code tool should I use?

{If existing IaC detected: "I found existing {TOOL} files in your project."}

Options:
1. Terraform (Recommended — works with any cloud, largest ecosystem)
2. Bicep (Azure-native, simpler syntax, no state management needed)
3. Pulumi (code-first in TypeScript/Python/Go, great type safety)
4. AWS CDK (AWS-native, TypeScript/Python, compiles to CloudFormation)
```

Decision matrix (present if user is unsure):

| Factor | Terraform | Bicep | Pulumi | CDK |
|--------|-----------|-------|--------|-----|
| Multi-cloud | ✅ | ❌ Azure only | ✅ | ❌ AWS only |
| State mgmt | External (S3/Blob) | None (ARM) | Cloud or self | None (CFN) |
| Language | HCL | Bicep DSL | TS/Py/Go | TS/Py |
| Learning curve | Medium | Low | Low (if you code) | Medium |
| Ecosystem | Largest | Azure only | Growing | AWS only |

### Infrastructure Components

Present detected + suggested components:

```
Which infrastructure components do you need?

Based on your codebase, I suggest these. Check/uncheck as needed:

Container platform:
  {auto-checked items based on detection}
  [ ] Container registry
  [ ] Kubernetes cluster (AKS/EKS/GKE)
  [ ] Serverless containers (Container Apps/Fargate/Cloud Run)
  [ ] Self-hosted PaaS (Dokku/Coolify/CapRover on VPS)

Data:
  {auto-checked if database migrations detected}
  [ ] Managed PostgreSQL
  [ ] Managed MySQL
  [ ] Redis cache
  [ ] Object storage (Blob/S3/GCS)
  [ ] Message queue (Service Bus/SQS/Pub-Sub)

Networking:
  [ ] DNS zone
  [ ] CDN / Front Door / CloudFront
  [ ] Virtual network / VPC
  [ ] API Gateway

Security:
  [ ] Key Vault / Secrets Manager
  [ ] Managed identity / IAM roles

Monitoring:
  [ ] Application Insights / CloudWatch / Cloud Logging
  [ ] Dashboards and alerts
```

### Environment Topology

```
How many infrastructure environments do you need?

{If /dock config found: "I see /dock configured {N} environments: {list}.
I'll match those."}

Options:
1. Simple: dev + prod (Recommended to start)
2. Standard: dev + staging + prod
3. Custom: define your own
```

### State Management (Terraform/Pulumi only)

```
Where should infrastructure state be stored?

Options (based on {PROVIDER}):
1. {Provider-native option} (Recommended)
2. Terraform Cloud / Pulumi Cloud
3. Local (not recommended for teams)
```

Provider-native defaults:
- Azure → Azure Blob Storage
- AWS → S3 + DynamoDB lock
- GCP → Google Cloud Storage

### CI/CD Strategy

```
How should infrastructure changes be applied?

Options:
1. Plan on PR, auto-apply on merge (Recommended)
2. Plan on PR, manual approval to apply
3. Apply on merge only (no PR preview)
```

### Naming Convention

```
What naming convention for cloud resources?

Options:
1. Cloud Adoption Framework style (Recommended)
   Example: rg-myapp-dev-eastus, acr-myapp-dev
2. Simple: {project}-{resource}-{env}
   Example: myapp-registry-dev, myapp-db-dev
3. Custom prefix (you define the pattern)
```

### Resource Sizing

```
What resource sizing tier?

Options:
1. Minimal (Recommended for dev — smallest/cheapest SKUs)
2. Standard (balanced cost/performance)
3. Production (high availability, redundancy, scaling)

I'll use tier-appropriate sizing per environment:
  dev = Minimal, staging = Standard, prod = Production
```

### /dock Integration

If /dock artifacts detected:

```
I found /dock deployment config targeting:
  {env}: {platform} for each environment

Should I provision the infrastructure for those targets?
This includes: container registry, {platform} compute resources, networking.

Options:
1. Yes, provision everything /dock needs (Recommended)
2. Yes, but let me customize which components
3. No, I'll provision separately
```
