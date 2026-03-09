# Platform Deployment Guides

Deployment commands and manifests for each supported container platform.
These are inserted into the `{*_DEPLOY_COMMANDS}` placeholders in the
pipeline templates.

Template variables available in all commands:
- `{REGISTRY}`: Full registry URL
- `{IMAGE_NAME}`: Image name
- `{TAG}`: Image tag (SHA or version)
- `{PORT}`: Application port
- `{ENV_NAME}`: Environment name (dev, staging, prod)

---

## Azure Container Apps

Recommended for most workloads. Serverless containers with auto-scaling,
built-in ingress, managed TLS.

### Workflow steps (GitHub Actions)

```yaml
- name: Login to Azure
  uses: azure/login@v2
  with:
    creds: ${{ secrets.AZURE_CREDENTIALS }}

- name: Deploy to Container Apps
  uses: azure/container-apps-deploy-action@v2
  with:
    imageToDeploy: {REGISTRY}/{IMAGE_NAME}:{TAG}
    containerAppName: {APP_NAME}-{ENV_NAME}
    resourceGroup: {RESOURCE_GROUP}
    containerAppEnvironment: {ENV_NAME}
```

### Infrastructure setup (Bicep)

Generate `deploy/azure-container-apps.bicep` if user wants IaC:

```bicep
param location string = resourceGroup().location
param envName string
param imageName string
param registryServer string

resource containerAppEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${envName}'
  location: location
  properties: {
    zoneRedundant: envName == 'prod'
  }
}

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-${envName}'
  location: location
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: {PORT}
        transport: 'auto'
      }
      registries: [
        {
          server: registryServer
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'app'
          image: imageName
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/healthz'
                port: {PORT}
              }
              periodSeconds: 30
            }
          ]
        }
      ]
      scale: {
        minReplicas: envName == 'prod' ? 2 : 1
        maxReplicas: envName == 'prod' ? 10 : 3
      }
    }
  }
}
```

### Required secrets

- `AZURE_CREDENTIALS`: Service principal JSON for Azure login
- Registry access: Use managed identity (preferred) or registry credentials

---

## Azure App Service for Containers

Traditional PaaS with deployment slots. Good for teams already using App Service.

### Workflow steps

```yaml
- name: Login to Azure
  uses: azure/login@v2
  with:
    creds: ${{ secrets.AZURE_CREDENTIALS }}

- name: Deploy to App Service
  uses: azure/webapps-deploy@v3
  with:
    app-name: {APP_NAME}-{ENV_NAME}
    images: {REGISTRY}/{IMAGE_NAME}:{TAG}
    slot-name: staging  # For blue-green: deploy to slot first
```

### Blue-green with slots

```yaml
- name: Deploy to staging slot
  uses: azure/webapps-deploy@v3
  with:
    app-name: {APP_NAME}-{ENV_NAME}
    images: {REGISTRY}/{IMAGE_NAME}:{TAG}
    slot-name: staging

- name: Smoke test staging slot
  run: curl -f "https://{APP_NAME}-{ENV_NAME}-staging.azurewebsites.net/healthz"

- name: Swap slots
  run: az webapp deployment slot swap -g {RESOURCE_GROUP} -n {APP_NAME}-{ENV_NAME} --slot staging --target-slot production
```

---

## AWS Fargate (ECS)

Serverless containers on AWS. Requires ECS cluster, task definition, service.

### Workflow steps

```yaml
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
    aws-region: ${{ vars.AWS_REGION }}

- name: Login to ECR
  uses: aws-actions/amazon-ecr-login@v2

- name: Update ECS task definition
  id: task-def
  uses: aws-actions/amazon-ecs-render-task-definition@v1
  with:
    task-definition: deploy/ecs-task-{ENV_NAME}.json
    container-name: app
    image: {REGISTRY}/{IMAGE_NAME}:{TAG}

- name: Deploy to ECS
  uses: aws-actions/amazon-ecs-deploy-task-definition@v2
  with:
    task-definition: ${{ steps.task-def.outputs.task-definition }}
    service: {SERVICE_NAME}-{ENV_NAME}
    cluster: {CLUSTER_NAME}
    wait-for-service-stability: true
```

### Task definition template

Generate `deploy/ecs-task-{ENV_NAME}.json`:

```json
{
  "family": "{IMAGE_NAME}-{ENV_NAME}",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "containerDefinitions": [
    {
      "name": "app",
      "image": "{REGISTRY}/{IMAGE_NAME}:{TAG}",
      "portMappings": [{ "containerPort": {PORT} }],
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:{PORT}/healthz || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 15
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/{IMAGE_NAME}-{ENV_NAME}",
          "awslogs-region": "{AWS_REGION}",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

---

## Google Cloud Run

Serverless containers on GCP. Simplest deployment model.

### Workflow steps

```yaml
- name: Authenticate to Google Cloud
  uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
    service_account: ${{ secrets.SA_EMAIL }}

- name: Deploy to Cloud Run
  uses: google-github-actions/deploy-cloudrun@v2
  with:
    service: {IMAGE_NAME}-{ENV_NAME}
    region: {GCP_REGION}
    image: {REGISTRY}/{IMAGE_NAME}:{TAG}
    flags: |
      --port={PORT}
      --min-instances=${{ env.ENV_NAME == 'prod' && '2' || '0' }}
      --max-instances=${{ env.ENV_NAME == 'prod' && '100' || '10' }}
```

### Required setup

- Workload Identity Federation (preferred over service account keys)
- Artifact Registry repository
- Cloud Run service in each region/environment

---

## Kubernetes

Most flexible. Generates Helm chart or kustomize overlays.

### Helm chart structure

Generate `deploy/helm/{IMAGE_NAME}/`:

```
deploy/helm/{IMAGE_NAME}/
├── Chart.yaml
├── values.yaml           # Default values
├── values-dev.yaml       # Dev overrides
├── values-staging.yaml   # Staging overrides
├── values-prod.yaml      # Prod overrides
└── templates/
    ├── deployment.yaml
    ├── service.yaml
    ├── ingress.yaml
    └── hpa.yaml
```

### Workflow steps

```yaml
- name: Set up kubectl
  uses: azure/setup-kubectl@v4

- name: Set kubeconfig
  run: echo "${{ secrets.KUBECONFIG_{ENV_NAME} }}" | base64 -d > kubeconfig
  env:
    KUBECONFIG: kubeconfig

- name: Deploy with Helm
  run: |
    helm upgrade --install {IMAGE_NAME} deploy/helm/{IMAGE_NAME} \
      --namespace {ENV_NAME} \
      --values deploy/helm/{IMAGE_NAME}/values-{ENV_NAME}.yaml \
      --set image.repository={REGISTRY}/{IMAGE_NAME} \
      --set image.tag={TAG} \
      --wait --timeout 5m
```

### values.yaml template

```yaml
replicaCount: 1

image:
  repository: {REGISTRY}/{IMAGE_NAME}
  tag: latest
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: {PORT}

ingress:
  enabled: false
  className: nginx

resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi

livenessProbe:
  httpGet:
    path: /healthz
    port: {PORT}
  initialDelaySeconds: 15
  periodSeconds: 30

autoscaling:
  enabled: false
  minReplicas: 1
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80
```

---

## Dokku

Self-hosted PaaS. Simplest deployment — git push based.

### Workflow steps

```yaml
- name: Deploy to Dokku
  uses: dokku/github-action@master
  with:
    git_remote_url: ssh://dokku@{DOKKU_HOST}:22/{APP_NAME}-{ENV_NAME}
    ssh_private_key: ${{ secrets.DOKKU_SSH_KEY }}
    git_push_flags: --force
    deploy_docker_image: {REGISTRY}/{IMAGE_NAME}:{TAG}
```

### Setup commands (run once on Dokku host)

```bash
dokku apps:create {APP_NAME}-{ENV_NAME}
dokku ports:set {APP_NAME}-{ENV_NAME} http:80:{PORT}
dokku letsencrypt:enable {APP_NAME}-{ENV_NAME}
```

---

## Coolify

Self-hosted PaaS with API. Deploy via webhook or API call.

### Workflow steps

```yaml
- name: Deploy to Coolify
  run: |
    curl -X POST "https://{COOLIFY_HOST}/api/v1/deploy" \
      -H "Authorization: Bearer ${{ secrets.COOLIFY_TOKEN }}" \
      -H "Content-Type: application/json" \
      -d '{
        "uuid": "{COOLIFY_APP_UUID}",
        "image": "{REGISTRY}/{IMAGE_NAME}:{TAG}",
        "force_rebuild": false
      }'
```

---

## CapRover

Self-hosted PaaS. Uses captain-definition file.

### captain-definition

Generate `captain-definition`:

```json
{
  "schemaVersion": 2,
  "imageName": "{REGISTRY}/{IMAGE_NAME}:{TAG}"
}
```

### Workflow steps

```yaml
- name: Deploy to CapRover
  uses: caprover/deploy-from-github@v1.1.2
  with:
    server: https://{CAPROVER_HOST}
    app: {APP_NAME}-{ENV_NAME}
    token: ${{ secrets.CAPROVER_TOKEN }}
    image: {REGISTRY}/{IMAGE_NAME}:{TAG}
```

---

## Rollback Patterns

### Simple rollback

Add a rollback step that triggers on deploy failure:

```yaml
- name: Rollback on failure
  if: failure()
  run: |
    PREV_TAG=$(git describe --tags --abbrev=0 HEAD~1 2>/dev/null || echo "latest")
    # Redeploy with previous tag using same deploy command
    echo "Rolling back to $PREV_TAG"
```

### Blue-green (Azure App Service example)

See Azure App Service section — use deployment slots.

### Canary (Kubernetes)

Requires a service mesh (Istio, Linkerd) or ingress controller with traffic splitting.
Generate an Istio VirtualService:

```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: {IMAGE_NAME}
spec:
  hosts:
    - {IMAGE_NAME}
  http:
    - route:
        - destination:
            host: {IMAGE_NAME}
            subset: stable
          weight: 90
        - destination:
            host: {IMAGE_NAME}
            subset: canary
          weight: 10
```
