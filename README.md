# MAD Skills

**M**CP **A**lternative **D**evelopment Skills - Context-efficient Claude Code skills that replace verbose MCP servers with smart querying and context isolation.

## Overview

This repository contains Claude Code skills designed to replace MCP (Model Context Protocol) servers that consume excessive amounts of the context window. Instead of flooding context with verbose tool definitions and broad analysis, these skills use:

- **Filtered scripts** that return compact JSON summaries
- **Subagent patterns** for context isolation during complex investigations
- **Smart querying** to retrieve only relevant data

This approach enables 100+ queries per session instead of exhausting context after just 2-3 operations.

## Current Skills

### Playtight (Browser Automation)

**Replaces:** Playwright MCP Server  
**Status:** ✅ Available

A context-efficient browser automation skill that replaces the Playwright MCP server. Instead of returning 50KB+ HTML accessibility trees per interaction, Playtight provides:

- Compact script responses (< 500 bytes typical)
- Auto-truncated text extraction
- Subagent isolation for complex page exploration
- **225x more context-efficient** than the MCP approach

**Key Features:**
- Element verification (`check-element.js`)
- Text extraction with truncation (`get-text.js`)
- Screenshot capture (`take-screenshot.js`)
- Structured data extraction (`navigate-and-extract.js`)
- Browser investigator subagent for complex tasks

**Documentation:**
- [Skill Reference](playtight/SKILL.md)
- [Usage Patterns](playtight/references/patterns.md)

**Distribution:**
- Packaged skill: `dist/playtight.zip` (ready to upload to Claude Code)

## Coming Soon

### Grafana Tempo Telemetry Skill

**Replaces:** Grafana Tempo MCP Server  
**Status:** 🚧 In Development

A context-efficient telemetry investigation skill that replaces the Tempo MCP server. Instead of returning 5MB+ trace payloads with thousands of spans, this skill will provide:

- Aggressively filtered trace queries
- Compact trace summaries (< 500 bytes per trace)
- Subagent isolation for root cause analysis
- **800x more context-efficient** than the MCP approach

**Planned Features:**
- Trace search with filters (`search-traces.js`)
- Compact trace summaries (`get-trace.js`)
- Service discovery (`query-services.js`)
- Error pattern analysis (`analyze-errors.js`)
- Telemetry investigator subagent for complex investigations

## The Problem

Traditional MCP servers have significant context window issues:

### Playwright MCP Issues
- Returns 50KB+ HTML accessibility trees per interaction
- Floods context with verbose DOM structures and JavaScript
- Multiple queries exhaust context window after just 2-3 operations
- No built-in filtering means massive irrelevant data consumption

### Tempo MCP Issues
- Returns 5MB+ trace payloads per query
- Floods context with thousands of spans
- No built-in filtering = irrelevant data
- Multiple queries = context window exhaustion

## The Solution

### Three-Layer Architecture

1. **Filtered Scripts** (bash/nodejs)
   - Direct API/CLI access with controlled output
   - All scripts return structured JSON, never raw data
   - Built-in truncation and size limits
   - Aggressive filtering to prevent irrelevant data retrieval

2. **Direct Execution** (Simple Tasks)
   - Use scripts directly for single-step operations
   - Parent agent receives compact responses
   - Good for known selectors/filters and focused checks

3. **Subagent Isolation** (Complex Tasks)
   - Specialized subagent handles multi-step exploration
   - Makes 5-10+ script calls internally
   - Absorbs all verbose responses in isolated context
   - Returns concise summary (< 500 tokens) to parent

### Context Efficiency Comparison

**Traditional MCP:**
```
Query: "Find login form"
Response: [30KB HTML tree] = 7,200 tokens
Result: Context exhausted after 2-3 queries
```

**MAD Skills (Direct Scripts):**
```
Query: "Find login form"
Response: {found: true, ...} = 150 tokens
Result: Can make 100+ queries before context issues
```

**MAD Skills (Subagent):**
```
Parent Query: "Find login form"
Subagent: 10 script calls = 1,500 tokens (isolated)
Parent Receives: {type: "element_location", ...} = 80 tokens
Result: 225x more efficient than MCP
```

## Repository Structure

```
mad-skills/
├── README.md                          # This file
├── CLAUDE.md                          # Guidance for Claude Code
├── .gitignore
├── dist/
│   └── playtight.zip                 # Packaged Playtight skill
├── playtight/                        # Browser automation skill
│   ├── SKILL.md                      # Complete skill reference
│   ├── scripts/                      # Executable Playwright scripts
│   │   ├── check-element.js
│   │   ├── get-text.js
│   │   ├── take-screenshot.js
│   │   ├── navigate-and-extract.js
│   │   └── package.json
│   ├── assets/
│   │   └── browser-investigator-subagent.md
│   └── references/
│       └── patterns.md
```

## Quick Start

### Using Playtight

1. **Install the skill:**
   ```bash
   # Download playtight.zip from dist/
   # Upload to Claude Code or extract to your skills directory
   unzip dist/playtight.zip -d ~/.claude/skills/user/
   ```

2. **Install dependencies:**
   ```bash
   cd ~/.claude/skills/user/playtight/scripts/
   npm install
   npm run install-browsers
   ```

3. **Use in Claude Code:**
   - Direct script: `"Check if the login button exists on example.com"`
   - Subagent: `"Use browser-investigator subagent to find all form fields on example.com/login"`

### Running Scripts Directly

```bash
cd playtight/scripts/
node check-element.js https://example.com h1
node get-text.js https://example.com "#content"
node take-screenshot.js https://example.com screenshot.png
```

## Design Principles

When building or modifying skills in this repository:

1. **Never Return Raw Data** - Always return structured JSON with specific fields
2. **Truncate Everything** - Text: 100-2000 chars, errors: 100 chars
3. **Keep Responses Compact** - Target < 500 bytes per script response
4. **Filter at Source** - Extract only essential data in the script
5. **Use Subagent for Verbosity** - Complex exploration happens in isolated context
6. **Headless by Default** - All scripts use headless mode for performance
7. **Timeout Protection** - Reasonable timeouts to avoid hangs

## Documentation

- [Playtight Skill Reference](playtight/SKILL.md) - Complete Playtight documentation

## Contributing

This repository demonstrates a pattern for building context-efficient Claude Code skills. When adding new skills:

1. Follow the three-layer architecture (filtered scripts, direct execution, subagent isolation)
2. Ensure all scripts return compact JSON summaries
3. Include subagent definitions for complex tasks
4. Document usage patterns and examples
5. Provide installation and setup instructions

## License

[Add your license here]

## Related

- [Claude Code Skills Documentation](https://claude.ai/code)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)

