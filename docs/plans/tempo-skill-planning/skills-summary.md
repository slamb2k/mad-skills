---
title: Context-Efficient Automation Skills - Summary
category: plans
status: draft
created: 2024-11-12
last_updated: 2025-11-16
tags: [tempo-telemetry, playtight, planning, architecture]
---

# Context-Efficient Automation Skills - Summary

Both skills follow the same pattern to solve context window pollution from verbose tool responses.

## The Pattern

### Problem
Tools like MCP servers return massive, verbose responses:
- **Playwright MCP**: 50KB+ HTML accessibility trees per interaction
- **Tempo MCP**: 5MB+ trace payloads with thousands of spans

Result: Context window exhausted after 2-3 queries.

### Solution Architecture

**Three-Layer Approach:**

1. **Filtered Scripts** (First Line of Defense)
   - Replace MCP with controlled API/CLI scripts
   - Scripts return compact JSON summaries
   - Built-in filtering to prevent irrelevant data retrieval

2. **Direct Execution** (Simple Tasks)
   - Use scripts directly for focused, single-step queries
   - Parent agent receives compact responses
   - Good for known targets with specific filters

3. **Subagent Isolation** (Complex Tasks)
   - Specialized subagent handles multi-step investigations
   - Makes 5-10+ script calls internally
   - Absorbs all verbose responses in isolated context
   - Returns concise summary (< 500 tokens) to parent

## Browser Automation Skill

**Replaces**: Playwright MCP
**Use Cases**: Web automation, element verification, data extraction

### Scripts Provided
- `check-element.js` - Verify elements exist (returns compact JSON)
- `get-text.js` - Extract text (auto-truncated to 2000 chars)
- `take-screenshot.js` - Capture screenshots
- `navigate-and-extract.js` - Structured data extraction

### Subagent: browser-investigator
Handles complex element discovery and page exploration.

### Context Efficiency
- **Without**: 3 Playwright MCP calls = 75KB = ~18,000 tokens
- **With Scripts**: 3 calls = ~450 tokens
- **With Subagent**: Parent receives ~80 tokens
- **Improvement**: 225x more efficient

### Example Use
```bash
# Direct script
node scripts/check-element.js https://github.com/user/repo "#pr-status"

# Subagent isolation
"Use browser-investigator subagent to find all form elements on login page"
```

## Tempo Telemetry Skill

**Replaces**: Tempo MCP Server
**Use Cases**: Distributed tracing, error investigation, performance analysis

### Scripts Provided
- `search-traces.js` - Search with aggressive filters
- `get-trace.js` - Get trace summary (compact by default)
- `query-services.js` - Discover services/operations
- `analyze-errors.js` - Error pattern analysis

### Subagent: telemetry-investigator
Handles complex root cause analysis and multi-step trace investigations.

### Context Efficiency
- **Without**: 1 Tempo MCP call = 5MB = ~120,000 tokens
- **With Scripts**: 1 call = ~800 tokens
- **With Subagent**: Parent receives ~150 tokens
- **Improvement**: 800x more efficient

### Example Use
```bash
# Direct script with filters
node scripts/search-traces.js '{"service":"api-gateway","minDuration":"500ms","limit":10}'

# Subagent isolation
"Use telemetry-investigator subagent to investigate checkout-service errors"
```

## Configuration

### Browser Automation
No configuration needed - scripts work out of the box.

### Tempo Telemetry
Requires Tempo endpoint configuration:

```json
{
  "url": "http://your-tempo:3200",
  "headers": {"X-Scope-OrgID": "tenant-id"}
}
```

## When to Use Each Approach

### Use Direct Scripts When:
- Single, focused query
- Known targets/filters
- Quick checks
- Parent context has room
- Results are naturally compact

### Use Subagent Isolation When:
- Multi-step investigation needed
- Complex exploration required
- Multiple iterations to narrow down
- Parent context is precious
- Need root cause analysis

## Common Patterns

### Browser Automation

**Direct:**
```bash
# Check specific element
node scripts/check-element.js https://example.com "#login-button"
```

**Subagent:**
```
"Use browser-investigator subagent to locate all input fields in the registration form"
```

### Tempo Telemetry

**Direct:**
```bash
# Quick error check
node scripts/analyze-errors.js 30 checkout-service
```

**Subagent:**
```
"Use telemetry-investigator subagent to find why payment-service is slow"
```

## Integration with DevOps Workflows

### Han-Solo Git Workflow

**Browser Automation:**
```bash
# Verify PR status on GitHub
"Use browser-investigator subagent to check CI status on PR #123"
# Returns: {"ci_passing": true, "ready_to_merge": true}
```

**Tempo Telemetry:**
```bash
# Check deployment health
"Use telemetry-investigator subagent to verify no errors in api-gateway since deployment"
# Returns: {"status": "healthy", "error_count": 0}
```

### Automated Monitoring

**Browser Automation:**
```bash
# Monitor dashboard status
node scripts/navigate-and-extract.js "https://ci.company.com" '{
  "checks": {"build_passing": ".status-success"}
}'
```

**Tempo Telemetry:**
```bash
# Monitor error rates
node scripts/analyze-errors.js 15 critical-service
# Alert if totalErrors > threshold
```

## Key Benefits

### Context Preservation
- Parent agent context stays clean
- Can handle 100+ queries vs 2-3 with MCP
- Enables longer investigation sessions
- Better reasoning with available context

### Actionable Results
- Scripts return summaries, not raw data
- Subagents provide insights, not dumps
- Parent receives recommendations and next steps
- Focus on what matters for decision-making

### Controlled Data Retrieval
- Aggressive filtering prevents irrelevant data
- Only request what's needed
- Time-bound queries (never unlimited)
- Service/tag filtering reduces noise

### Scalable Investigation
- Subagents can make 10+ queries internally
- Parent unaware of exploration overhead
- Complex analysis possible without context pollution
- Multi-service investigations stay manageable

## File Structure

### Browser Automation Skill
```
browser-automation/
├── SKILL.md
├── scripts/
│   ├── check-element.js
│   ├── get-text.js
│   ├── take-screenshot.js
│   ├── navigate-and-extract.js
│   └── package.json
├── assets/
│   └── browser-investigator-subagent.md
└── references/
    └── patterns.md
```

### Tempo Telemetry Skill
```
tempo-telemetry/
├── SKILL.md
├── scripts/
│   ├── search-traces.js
│   ├── get-trace.js
│   ├── query-services.js
│   ├── analyze-errors.js
│   └── package.json
├── assets/
│   ├── telemetry-investigator-subagent.md
│   └── tempo-config-template.json
└── references/
    └── query-patterns.md
```

## Quick Start

### 1. Install Both Skills
Upload .skill files to Claude Code

### 2. Configure Tempo
```bash
cp tempo-config-template.json .tempo-config.json
# Edit with your Tempo URL
```

### 3. Setup Subagents
```bash
cp browser-investigator-subagent.md .claude/agents/
cp telemetry-investigator-subagent.md .claude/agents/
```

### 4. Test Scripts
```bash
# Browser
node scripts/check-element.js https://example.com h1

# Tempo (requires config)
node scripts/query-services.js
```

### 5. Try Subagents
```
"Use browser-investigator subagent to find the login button on example.com"
"Use telemetry-investigator subagent to check for recent errors"
```

## Comparison Table

| Aspect | Playwright MCP | Browser Scripts | Tempo MCP | Tempo Scripts |
|--------|---------------|-----------------|-----------|---------------|
| Response Size | 50KB+ | <500 bytes | 5MB+ | <1KB |
| Context Used | ~18,000 tokens | ~150 tokens | ~120,000 tokens | ~800 tokens |
| Filtering | None | Built-in | None | Aggressive |
| Subagent Support | No | Yes | No | Yes |
| Configuration | None | None | Via MCP | .tempo-config.json |
| Efficiency | Baseline | 120x | Baseline | 150x |
| With Subagent | N/A | 225x | N/A | 800x |

## Design Philosophy

Both skills follow the same design principles:

1. **Compact by Default**: Scripts return summaries, not raw data
2. **Filter Aggressively**: Prevent irrelevant data retrieval
3. **Subagent Isolation**: Complex work happens in isolated context
4. **Actionable Insights**: Focus on what user needs to know
5. **Context Efficiency**: Maximize queries per context window
6. **DevOps Ready**: Built for automation and workflows

## Future Enhancements

Potential additions following the same pattern:

- **Kubernetes Skill**: Replace verbose kubectl outputs with summaries
- **Database Skill**: Query large tables with result compaction
- **Log Analysis Skill**: Parse large log files with pattern extraction
- **API Testing Skill**: Make many HTTP requests, return summaries

All would use: Filtered scripts + Subagent isolation + Compact responses

## Resources

- [Browser Automation Installation Guide](./INSTALLATION_GUIDE.md)
- [Tempo Telemetry Installation Guide](./TEMPO_INSTALLATION_GUIDE.md)
- Browser patterns: `browser-automation/references/patterns.md`
- Tempo patterns: `tempo-telemetry/references/query-patterns.md`

## Support

Both skills are designed to be self-contained and well-documented. Refer to:
- SKILL.md in each skill for comprehensive usage
- Subagent .md files for investigation patterns
- References/ for common scenarios
- Installation guides for setup help
