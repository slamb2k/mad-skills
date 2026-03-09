# Bicep Templates

Azure-native IaC templates. Bicep compiles to ARM and deploys via Azure Resource
Manager — no external state management needed. Azure handles idempotency natively.

---

## Project Root

### main.bicep

```bicep
targetScope = 'subscription'

@description('Deployment environment')
@allowed(['dev', 'staging', 'prod'])
param environment string

@description('Azure region')
param location string = 'eastus'

@description('Project name')
param project string = '{PROJECT}'

var namePrefix = '${project}-${environment}'
var tags = {
  project: project
  environment: environment
  managedBy: 'bicep'
}

// Resource Group
resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-${namePrefix}'
  location: location
  tags: tags
}

// Container Registry (shared across environments or per-env)
module registry 'modules/registry.bicep' = {
  scope: rg
  name: 'registry'
  params: {
    name: 'acr${replace(namePrefix, '-', '')}'
    location: location
    sku: environment == 'prod' ? 'Premium' : 'Basic'
    tags: tags
  }
}

// Add module deployments for each selected component

// Outputs for /dock integration
output registryUrl string = registry.outputs.loginServer
output registryName string = registry.outputs.name
output resourceGroupName string = rg.name
```

### main.bicepparam (template)

```bicep
using 'main.bicep'

param environment = '{ENV}'
param location = '{REGION}'
param project = '{PROJECT}'
```

---

## Module: Container Registry

### modules/registry.bicep

```bicep
@description('Registry name (must be globally unique, alphanumeric)')
param name string

@description('Azure region')
param location string

@description('SKU tier')
@allowed(['Basic', 'Standard', 'Premium'])
param sku string = 'Basic'

param tags object = {}

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: name
  location: location
  sku: {
    name: sku
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
  tags: tags
}

output loginServer string = acr.properties.loginServer
output name string = acr.name
output id string = acr.id
```

---

## Module: Container Apps

### modules/container-apps.bicep

```bicep
@description('Environment name prefix')
param namePrefix string

@description('Azure region')
param location string

param tags object = {}

@description('Minimum replicas (0 for dev, 2 for prod)')
param minReplicas int = 0

@description('Maximum replicas')
param maxReplicas int = 10

resource containerAppEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-${namePrefix}'
  location: location
  properties: {
    zoneRedundant: minReplicas >= 2
  }
  tags: tags
}

output environmentId string = containerAppEnv.id
output defaultDomain string = containerAppEnv.properties.defaultDomain
output name string = containerAppEnv.name
```

---

## Module: PostgreSQL

### modules/database.bicep

```bicep
@description('Server name prefix')
param namePrefix string

@description('Azure region')
param location string

@description('Administrator login')
@secure()
param adminUsername string

@description('Administrator password')
@secure()
param adminPassword string

@description('Database name')
param databaseName string = 'app'

@description('Environment tier for sizing')
@allowed(['dev', 'staging', 'prod'])
param environment string

param tags object = {}

var skuMap = {
  dev: {
    name: 'B_Standard_B1ms'
    tier: 'Burstable'
    storageSizeGB: 32
  }
  staging: {
    name: 'GP_Standard_D2s_v3'
    tier: 'GeneralPurpose'
    storageSizeGB: 64
  }
  prod: {
    name: 'GP_Standard_D4s_v3'
    tier: 'GeneralPurpose'
    storageSizeGB: 128
  }
}

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: 'psql-${namePrefix}'
  location: location
  sku: {
    name: skuMap[environment].name
    tier: skuMap[environment].tier
  }
  properties: {
    version: '16'
    administratorLogin: adminUsername
    administratorLoginPassword: adminPassword
    storage: {
      storageSizeGB: skuMap[environment].storageSizeGB
    }
    highAvailability: {
      mode: environment == 'prod' ? 'ZoneRedundant' : 'Disabled'
    }
    backup: {
      backupRetentionDays: environment == 'prod' ? 35 : 7
      geoRedundantBackup: environment == 'prod' ? 'Enabled' : 'Disabled'
    }
  }
  tags: tags
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  parent: server
  name: databaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource firewallAllowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-12-01-preview' = {
  parent: server
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

output fqdn string = server.properties.fullyQualifiedDomainName
output serverName string = server.name
```

---

## Module: Key Vault

### modules/keyvault.bicep

```bicep
param namePrefix string
param location string
param tags object = {}

@allowed(['dev', 'staging', 'prod'])
param environment string

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-${namePrefix}'
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enablePurgeProtection: environment == 'prod'
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
  }
  tags: tags
}

output vaultUri string = kv.properties.vaultUri
output vaultId string = kv.id
output name string = kv.name
```

---

## Module: Networking

### modules/networking.bicep

```bicep
param namePrefix string
param location string
param addressSpace string = '10.0.0.0/16'
param tags object = {}

resource vnet 'Microsoft.Network/virtualNetworks@2024-01-01' = {
  name: 'vnet-${namePrefix}'
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [addressSpace]
    }
    subnets: [
      {
        name: 'snet-app'
        properties: {
          addressPrefix: cidrSubnet(addressSpace, 24, 1)
        }
      }
      {
        name: 'snet-db'
        properties: {
          addressPrefix: cidrSubnet(addressSpace, 24, 2)
          delegations: [
            {
              name: 'postgresql'
              properties: {
                serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers'
              }
            }
          ]
        }
      }
    ]
  }
  tags: tags
}

output vnetId string = vnet.id
output appSubnetId string = vnet.properties.subnets[0].id
output dbSubnetId string = vnet.properties.subnets[1].id
```

---

## Module: Monitoring

### modules/monitoring.bicep

```bicep
param namePrefix string
param location string
param tags object = {}

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${namePrefix}'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
  tags: tags
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${namePrefix}'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
  tags: tags
}

output logAnalyticsId string = logAnalytics.id
output appInsightsKey string = appInsights.properties.InstrumentationKey
output appInsightsConnectionString string = appInsights.properties.ConnectionString
```
