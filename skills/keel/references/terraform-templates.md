# Terraform Templates

Starter templates for common infrastructure components. Customize based on
INFRA_CONFIG from the interview. Each module is self-contained with its own
variables and outputs.

---

## Project Root

### versions.tf

```hcl
terraform {
  required_version = ">= 1.5"

  required_providers {
    # Include only the provider(s) selected in the interview
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    # aws = {
    #   source  = "hashicorp/aws"
    #   version = "~> 5.0"
    # }
    # google = {
    #   source  = "hashicorp/google"
    #   version = "~> 6.0"
    # }
  }
}
```

### main.tf — Azure

```hcl
terraform {
  backend "azurerm" {
    resource_group_name  = "{STATE_RG}"
    storage_account_name = "{STATE_STORAGE}"
    container_name       = "tfstate"
    key                  = "{PROJECT}.tfstate"
  }
}

provider "azurerm" {
  features {}
}

locals {
  name_prefix = "{NAMING_PREFIX}-${var.environment}"
  tags = {
    project     = "{PROJECT}"
    environment = var.environment
    managed_by  = "terraform"
  }
}

resource "azurerm_resource_group" "main" {
  name     = "rg-${local.name_prefix}"
  location = var.location
  tags     = local.tags
}

module "registry" {
  source              = "./modules/registry"
  name                = "acr${replace(local.name_prefix, "-", "")}"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = var.environment == "prod" ? "Premium" : "Basic"
  tags                = local.tags
}

# Add module calls for each selected component
```

### main.tf — AWS

```hcl
terraform {
  backend "s3" {
    bucket         = "{PROJECT}-tfstate"
    key            = "infra/{PROJECT}.tfstate"
    region         = "{REGION}"
    dynamodb_table = "{PROJECT}-tflock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "{PROJECT}"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

module "registry" {
  source = "./modules/registry"
  name   = "{PROJECT}-${var.environment}"
}
```

### main.tf — GCP

```hcl
terraform {
  backend "gcs" {
    bucket = "{PROJECT}-tfstate"
    prefix = "infra"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

module "registry" {
  source     = "./modules/registry"
  project_id = var.project_id
  location   = var.region
}
```

### variables.tf

```hcl
variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "location" {
  description = "Cloud region"
  type        = string
  default     = "{DEFAULT_REGION}"
}

variable "project" {
  description = "Project name"
  type        = string
  default     = "{PROJECT}"
}
```

### outputs.tf

```hcl
output "registry_url" {
  description = "Container registry login server URL"
  value       = module.registry.login_server
}

output "registry_name" {
  description = "Container registry name"
  value       = module.registry.name
}

# Add outputs for each provisioned component
```

---

## Module: Container Registry

### Azure (modules/registry/)

```hcl
# modules/registry/main.tf
resource "azurerm_container_registry" "this" {
  name                = var.name
  resource_group_name = var.resource_group_name
  location            = var.location
  sku                 = var.sku
  admin_enabled       = false
  tags                = var.tags
}

output "login_server" { value = azurerm_container_registry.this.login_server }
output "name" { value = azurerm_container_registry.this.name }
output "id" { value = azurerm_container_registry.this.id }
```

### AWS (modules/registry/)

```hcl
resource "aws_ecr_repository" "this" {
  name                 = var.name
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "this" {
  repository = aws_ecr_repository.this.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 50 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 50
      }
      action = { type = "expire" }
    }]
  })
}

output "repository_url" { value = aws_ecr_repository.this.repository_url }
output "name" { value = aws_ecr_repository.this.name }
```

### GCP (modules/registry/)

```hcl
resource "google_artifact_registry_repository" "this" {
  location      = var.location
  repository_id = var.name
  format        = "DOCKER"
  project       = var.project_id
}

output "repository_url" {
  value = "${var.location}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.this.repository_id}"
}
```

---

## Module: Managed Database

### Azure PostgreSQL Flexible Server

```hcl
# modules/database/main.tf
resource "azurerm_postgresql_flexible_server" "this" {
  name                          = "psql-${var.name_prefix}"
  resource_group_name           = var.resource_group_name
  location                      = var.location
  version                       = "16"
  administrator_login           = var.admin_username
  administrator_password        = var.admin_password
  storage_mb                    = var.environment == "prod" ? 65536 : 32768
  sku_name                      = var.environment == "prod" ? "GP_Standard_D2s_v3" : "B_Standard_B1ms"
  zone                          = var.environment == "prod" ? "1" : null
  tags                          = var.tags

  authentication {
    active_directory_auth_enabled = true
    password_auth_enabled         = true
  }
}

resource "azurerm_postgresql_flexible_server_database" "app" {
  name      = var.database_name
  server_id = azurerm_postgresql_flexible_server.this.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

resource "azurerm_postgresql_flexible_server_firewall_rule" "allow_azure" {
  name             = "AllowAzureServices"
  server_id        = azurerm_postgresql_flexible_server.this.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

output "fqdn" { value = azurerm_postgresql_flexible_server.this.fqdn }
output "connection_string" {
  value     = "postgresql://${var.admin_username}:${var.admin_password}@${azurerm_postgresql_flexible_server.this.fqdn}:5432/${var.database_name}?sslmode=require"
  sensitive = true
}
```

### AWS RDS PostgreSQL

```hcl
resource "aws_db_instance" "this" {
  identifier     = "${var.name_prefix}-db"
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.environment == "prod" ? "db.t3.medium" : "db.t3.micro"

  allocated_storage     = var.environment == "prod" ? 100 : 20
  max_allocated_storage = var.environment == "prod" ? 500 : 50
  storage_encrypted     = true

  db_name  = var.database_name
  username = var.admin_username
  password = var.admin_password

  multi_az               = var.environment == "prod"
  backup_retention_period = var.environment == "prod" ? 14 : 1
  skip_final_snapshot    = var.environment != "prod"

  vpc_security_group_ids = [var.db_security_group_id]
  db_subnet_group_name   = var.db_subnet_group_name

  tags = var.tags
}

output "endpoint" { value = aws_db_instance.this.endpoint }
output "connection_string" {
  value     = "postgresql://${var.admin_username}:${var.admin_password}@${aws_db_instance.this.endpoint}/${var.database_name}"
  sensitive = true
}
```

---

## Module: Serverless Containers

### Azure Container Apps

```hcl
resource "azurerm_container_app_environment" "this" {
  name                = "cae-${var.name_prefix}"
  resource_group_name = var.resource_group_name
  location            = var.location
  tags                = var.tags
}

output "id" { value = azurerm_container_app_environment.this.id }
output "default_domain" { value = azurerm_container_app_environment.this.default_domain }
```

### AWS ECS Fargate Cluster

```hcl
resource "aws_ecs_cluster" "this" {
  name = "${var.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = var.environment == "prod" ? "enabled" : "disabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = var.environment == "prod" ? "FARGATE" : "FARGATE_SPOT"
    weight            = 1
  }
}

output "cluster_arn" { value = aws_ecs_cluster.this.arn }
output "cluster_name" { value = aws_ecs_cluster.this.name }
```

---

## Module: Networking (Azure)

```hcl
resource "azurerm_virtual_network" "this" {
  name                = "vnet-${var.name_prefix}"
  resource_group_name = var.resource_group_name
  location            = var.location
  address_space       = [var.address_space]
  tags                = var.tags
}

resource "azurerm_subnet" "app" {
  name                 = "snet-app"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.this.name
  address_prefixes     = [cidrsubnet(var.address_space, 8, 1)]
}

resource "azurerm_subnet" "db" {
  name                 = "snet-db"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.this.name
  address_prefixes     = [cidrsubnet(var.address_space, 8, 2)]

  delegation {
    name = "postgresql"
    service_delegation {
      name = "Microsoft.DBforPostgreSQL/flexibleServers"
    }
  }
}

output "vnet_id" { value = azurerm_virtual_network.this.id }
output "app_subnet_id" { value = azurerm_subnet.app.id }
output "db_subnet_id" { value = azurerm_subnet.db.id }
```

---

## Module: Key Vault / Secrets

### Azure Key Vault

```hcl
data "azurerm_client_config" "current" {}

resource "azurerm_key_vault" "this" {
  name                = "kv-${var.name_prefix}"
  resource_group_name = var.resource_group_name
  location            = var.location
  tenant_id           = data.azurerm_client_config.current.tenant_id
  sku_name            = "standard"

  enable_rbac_authorization = true
  purge_protection_enabled  = var.environment == "prod"

  tags = var.tags
}

output "vault_uri" { value = azurerm_key_vault.this.vault_uri }
output "vault_id" { value = azurerm_key_vault.this.id }
```

### AWS Secrets Manager

```hcl
resource "aws_secretsmanager_secret" "app" {
  name        = "${var.name_prefix}/app-secrets"
  description = "Application secrets for ${var.name_prefix}"

  tags = var.tags
}

output "secret_arn" { value = aws_secretsmanager_secret.app.arn }
```

---

## Environment Variable Files

### dev.tfvars

```hcl
environment = "dev"
location    = "{REGION}"
# Minimal sizing — cost-optimized for development
```

### staging.tfvars

```hcl
environment = "staging"
location    = "{REGION}"
# Standard sizing — mirrors prod structure at lower scale
```

### prod.tfvars

```hcl
environment = "prod"
location    = "{REGION}"
# Production sizing — HA, redundancy, scaling enabled
```
