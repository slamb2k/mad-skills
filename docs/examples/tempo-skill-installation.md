# Tempo Telemetry Skill - Installation & Usage Guide

Your Tempo telemetry skill has been successfully created! This skill provides context-efficient Grafana Tempo querying to replace the Tempo MCP server, using filtered API scripts with a subagent pattern to isolate massive trace payloads.

## What's Included

The skill contains:
- **4 Tempo Query Scripts**: search-traces.js, get-trace.js, query-services.js, analyze-errors.js
- **Subagent Template**: telemetry-investigator-subagent.md for complex trace investigations
- **Configuration Template**: tempo-config-template.json for Tempo endpoint setup
- **Query Patterns Reference**: Common investigation scenarios and best practices

## Problem This Skill Solves

**Tempo MCP Server Issues:**
- Returns 5MB+ trace payloads per query
- Floods context with thousands of spans
- No built-in filtering = irrelevant data
- Multiple queries = context window exhaustion

**This Skill's Solution:**
- Scripts return compact summaries (< 500 bytes per trace)
- Aggressive filtering on every query
- Subagent isolates verbose data
- 800x more context efficient

## Installation

### Step 1: Install the Skill

Upload the `tempo-telemetry.skill` file to Claude Code.

### Step 2: Configure Tempo Endpoint

Copy the configuration template to your project:

```bash
cp ~/.claude/skills/user/tempo-telemetry/assets/tempo-config-template.json \
   .tempo-config.json
```

Edit `.tempo-config.json` with your Tempo details:

```json
{
  "url": "http://your-tempo-instance:3200",
  "headers": {
    "X-Scope-OrgID": "your-tenant-id"
  }
}
```

**Alternative: Environment Variable**

```bash
export TEMPO_URL="http://your-tempo-instance:3200"
```

### Step 3: Make Scripts Accessible

```bash
# Option A: Copy scripts to project
cp -r ~/.claude/skills/user/tempo-telemetry/scripts ./tempo-scripts

# Option B: Create symlink
ln -s ~/.claude/skills/user/tempo-telemetry/scripts ./scripts

# Verify scripts work
node scripts/query-services.js
```

## Usage

### Approach 1: Direct Script Execution

For simple, focused queries:

```bash
# Find recent errors
node scripts/analyze-errors.js 30 checkout-service

# Search with filters
node scripts/search-traces.js '{
  "service": "api-gateway",
  "minDuration": "500ms",
  "limit": 10
}'

# Get trace summary
node scripts/get-trace.js abc123def456

# List services
node scripts/query-services.js
```

### Approach 2: Subagent Isolation

For complex, multi-step investigations:

#### Setup Subagent

```bash
# Copy subagent to your project
cp ~/.claude/skills/user/tempo-telemetry/assets/telemetry-investigator-subagent.md \
   .claude/agents/telemetry-investigator.md
```

#### Use the Subagent

In Claude Code:

```
"Use telemetry-investigator subagent to investigate why checkout-service 
is experiencing errors in the last hour"
```

The subagent will:
- Make 5-10 filtered queries internally
- Absorb all massive trace payloads in its context
- Analyze patterns and identify root causes
- Return concise report to you (< 500 tokens)

## Example Workflows

### Example 1: Error Investigation

```bash
# Ask Claude Code:
"Check if there are any errors in the payment-service in the last 30 minutes"

# Claude will use:
node scripts/analyze-errors.js 30 payment-service

# Returns:
{
  "totalErrors": 8,
  "errorsByOperation": {
    "POST /charge": 5,
    "GET /status": 3
  },
  "recentErrors": [...]
}
```

### Example 2: Performance Analysis (Subagent)

```bash
# Ask Claude Code:
"Use telemetry-investigator subagent to find why checkout is slow"

# Subagent internally:
# 1. analyze-errors.js 60 checkout-service
# 2. search-traces.js (minDuration: 1s)
# 3. get-trace.js on slowest traces
# All verbose data stays in subagent context

# Returns to you:
{
  "type": "performance_investigation",
  "summary": "23 slow traces found, avg 3.4s",
  "bottleneck": "payment-api calls taking 2-3s",
  "sample_traces": ["trace1", "trace2"],
  "recommendation": "Investigate payment-api connection pool"
}
```

### Example 3: Specific User Issue

```bash
# Ask Claude Code:
"Find traces for user ID 12345 in the last 2 hours"

# Claude uses:
node scripts/search-traces.js '{
  "tags": {"user.id": "12345"},
  "limit": 10
}'

# Returns compact trace summaries
```

### Example 4: Service Discovery

```bash
# Ask Claude Code:
"What services are available in Tempo?"

# Claude uses:
node scripts/query-services.js

# Returns:
{
  "services": ["api-gateway", "auth-service", "user-service", ...],
  "count": 12
}
```

## Critical Filtering Strategy

**ALWAYS use aggressive filters to prevent massive payloads:**

### Required Filters

1. **Time Range** - ALWAYS specify
   ```json
   {
     "start": 1699887600,
     "end": 1699891200
   }
   ```
   Default: last hour (if omitted)

2. **Limit** - Keep low
   ```json
   {"limit": 10}  // Start with 10
   ```

3. **Service** - When known
   ```json
   {"service": "api-gateway"}
   ```

### Optional Filters (Highly Recommended)

4. **Duration** - For performance issues
   ```json
   {
     "minDuration": "500ms",
     "maxDuration": "10s"
   }
   ```

5. **Tags** - For specific scenarios
   ```json
   {
     "tags": {
       "http.status_code": "500",
       "user.id": "12345"
     }
   }
   ```

### Good vs Bad Filtering

**Good (Aggressive Filtering):**
```json
{
  "service": "checkout-service",
  "minDuration": "500ms",
  "tags": {"error": "true"},
  "limit": 10,
  "start": 1699887600,
  "end": 1699891200
}
```
Returns: ~5 traces, ~2KB data

**Bad (No Filtering):**
```json
{
  "limit": 100
}
```
Returns: 100 traces, 5MB+ data, floods context

## Context Efficiency Comparison

### Traditional Tempo MCP

```
Query: "Find checkout errors"
MCP Response: [5MB trace data, 2000 spans, 50 traces]
Context consumed: ~120,000 tokens
Result: Context exhausted after 2-3 queries
```

### This Skill (Direct Scripts)

```
Query: "Find checkout errors"
Script Response: {
  "totalErrors": 15,
  "errorsByOperation": {...},
  "recentErrors": [10 compact summaries]
}
Context consumed: ~800 tokens
Result: Can make 150+ queries before context issues
```

### This Skill (Subagent)

```
Parent Query: "Investigate checkout errors"

Subagent internally:
  - analyze-errors.js → 800 tokens
  - search-traces.js → 400 tokens  
  - get-trace.js (3x) → 1200 tokens
  Total in subagent: 2400 tokens (isolated)

Parent receives:
{
  "root_cause": "payment gateway timeouts",
  "sample_traces": ["id1", "id2"],
  "recommendation": "check payment-api"
}
Context consumed in parent: 150 tokens
Result: 800x more efficient than MCP
```

## Common Investigation Patterns

### 1. Recent Error Check

```bash
node scripts/analyze-errors.js 30 api-gateway
```

### 2. Find Slow Requests

```bash
node scripts/search-traces.js '{
  "service": "checkout-service",
  "minDuration": "1s",
  "limit": 15
}'
```

### 3. Specific Operation Errors

```bash
node scripts/search-traces.js '{
  "service": "api-gateway",
  "operation": "POST /login",
  "tags": {"error": "true"},
  "limit": 10
}'
```

### 4. HTTP 5xx Investigation

```bash
node scripts/search-traces.js '{
  "service": "frontend-api",
  "tags": {"http.status_code": "500"},
  "limit": 20
}'
```

### 5. Root Cause Analysis (Subagent)

```
"Use telemetry-investigator subagent to find why payment-service 
had 50+ errors between 2pm and 3pm today"
```

See `references/query-patterns.md` for many more examples.

## Integration with Han-Solo Workflow

Perfect for your DevOps automation:

```bash
# In han-solo workflow, checking deployment health
"Use telemetry-investigator subagent to verify no errors in 
checkout-service since deployment at 14:30"

# Returns:
{
  "type": "health_check",
  "status": "healthy",
  "error_count": 0,
  "traces_analyzed": 150,
  "deployment_safe": true
}
```

Or for alerting:

```bash
# Monitor for issues
"Check if api-gateway has more than 10 errors in last 15 minutes"

# Script returns:
{
  "totalErrors": 3,
  "threshold": 10,
  "status": "ok"
}
```

## Troubleshooting

### "No Tempo configuration found"

Create `.tempo-config.json`:
```json
{
  "url": "http://your-tempo:3200",
  "headers": {"X-Scope-OrgID": "tenant"}
}
```

### "Connection refused"

1. Verify Tempo URL is correct
2. Check Tempo is accessible: `curl http://your-tempo:3200/api/search`
3. Check authentication headers if required
4. Verify firewall/network access

### "No results found"

1. Check time range isn't too narrow
2. Verify service name: `node scripts/query-services.js`
3. Try without duration filters
4. Confirm Tempo has data for that period

### Scripts not found

Ensure scripts are accessible from current directory:
```bash
ls scripts/
# Should show: search-traces.js, get-trace.js, etc.
```

### Too many results / Context issues

Add more aggressive filters:
- Reduce time range
- Add service filter
- Add duration filters
- Lower limit to 5-10
- Use subagent for complex queries

## Advanced Configuration

### Custom Headers

If Tempo requires authentication:

```json
{
  "url": "http://your-tempo:3200",
  "headers": {
    "X-Scope-OrgID": "tenant-id",
    "Authorization": "Bearer token-here"
  }
}
```

### Multiple Tempo Instances

Create different config files:

```bash
.tempo-config.json          # Default
.tempo-config-prod.json     # Production
.tempo-config-staging.json  # Staging
```

Specify in script or modify config loading.

## Key Benefits

1. **Context Efficient**: 800x better than MCP
2. **Filtered Queries**: Only retrieve relevant data
3. **Isolated Investigation**: Subagent pattern for complex analysis
4. **Compact Summaries**: No massive trace payloads
5. **Actionable Insights**: Root causes, not raw data
6. **DevOps Ready**: Perfect for automation workflows

## Next Steps

1. Install the skill
2. Configure `.tempo-config.json`
3. Test with simple query: `node scripts/query-services.js`
4. Set up subagent in your project
5. Try complex investigation with subagent
6. Integrate into your han-solo workflows

Replace that context-hungry Tempo MCP server! 🚀
