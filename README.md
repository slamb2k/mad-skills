# MAD Skills

Context-efficient Claude Code skills for debugging and design workflows.

## Overview

This repository contains two categories of Claude Code skills:

### Debug Skills
Context-optimized alternatives to verbose MCP (Model Context Protocol) servers. Instead of flooding context with 50KB+ responses, these debugging tools use:

- **Filtered scripts** that return compact JSON summaries (< 500 bytes)
- **Subagent patterns** for context isolation during complex investigations
- **Smart querying** to retrieve only relevant data

This approach enables 100+ queries per session instead of exhausting context after just 2-3 operations with traditional MCP servers.

### Design Skills
Professional UI/UX design workflows that guide systematic design thinking, from requirements gathering through final deliverables.

## Current Skills

### Debug Skills

Context-optimized alternatives to verbose MCP debugging tools.

#### Playtight - Browser Automation

**Version:** 1.0.0
**Status:** ✅ Available
**Plugin:** debug-skills

**Replaces:** Playwright MCP Server
**Context Efficiency:** 225x more efficient
**Typical Response Size:** < 500 bytes vs 50KB+ with MCP

A context-efficient browser automation skill that replaces the Playwright MCP server. Instead of returning 50KB+ HTML accessibility trees per interaction, Playtight provides compact script responses and automatic browser detection.

**Features:**
- ✅ Element verification (`check-element.js`)
- ✅ Text extraction with auto-truncation (`get-text.js`)
- ✅ Screenshot capture (`take-screenshot.js`)
- ✅ Structured data extraction (`navigate-and-extract.js`)
- ✅ Browser investigator subagent for complex tasks
- ✅ Automatic browser installation detection

**Quick Start:**
```bash
# In Claude Code, simply ask:
"Check if the login button exists on example.com"
"Extract the title from example.com"
"Use browser-investigator subagent to find all form fields on example.com/login"
```

**Documentation:**
- [Skill Reference](playtight/SKILL.md)
- [Usage Patterns](playtight/references/patterns.md)
- [Subagent Guide](playtight/assets/browser-investigator-subagent.md)

### Design Skills

Professional UI/UX design workflows and design system tools.

#### Pixel Pusher - UI/UX Design System

**Version:** 1.1.0
**Status:** ✅ Available
**Plugin:** design-skills
**Type:** Workflow/Design Skill

A comprehensive UI/UX design skill that transforms vague requirements into polished web interfaces through systematic design thinking and iterative refinement. Pure workflow skill with no dependencies - available immediately after plugin installation.

**Features:**
- ✅ Multi-stage design process (discovery, design system, mockup, refinement, delivery)
- ✅ Design system extraction from screenshots/URLs
- ✅ HTML mockup generation with consistent design tokens
- ✅ Multiple mockup variations for comparison
- ✅ Comprehensive reference templates (personas, user flows, style guides)
- ✅ WCAG 2.1 Level AA accessibility compliance
- ✅ Responsive design (mobile-first approach)

**Quick Start:**
```
# In Claude Code, simply describe what you want:
"Design a landing page for my SaaS product"
"Create a modern dashboard interface"
"Build a design system from this screenshot" [attach image]

# The skill guides you through:
1. Requirements gathering
2. Design system creation
3. Multiple mockup variations
4. Iterative refinement
5. Final deliverables
```

**Use Cases:**
- Landing page design
- Web application interfaces
- Dashboard designs
- Design system creation
- UI mockup generation
- Design inspiration analysis

**Documentation:**
- [Skill Reference](pixel-pusher/SKILL.md)
- [Design System Layers](pixel-pusher/references/design-system-layers.md)
- [Accessibility Guidelines](pixel-pusher/references/accessibility-guidelines.md)
- [Design Best Practices](pixel-pusher/references/design-best-practices.md)
- [Persona Template](pixel-pusher/references/persona-template.md)
- [User Flow Template](pixel-pusher/references/user-flow-template.md)
- [Style Guide Template](pixel-pusher/references/style-guide-template.md)

## Coming Soon

### Grafana Tempo Telemetry (Debug Skills)

**Status:** 🚧 In Development
**Plugin:** debug-skills
**Estimated Release:** TBD

**Replaces:** Grafana Tempo MCP Server
**Estimated Efficiency:** 800x more efficient
**Planned Response Size:** < 500 bytes vs 5MB+ with MCP

A context-efficient telemetry investigation skill that replaces the Tempo MCP server. Instead of returning 5MB+ trace payloads with thousands of spans, this skill will provide aggressively filtered trace queries and subagent isolation for root cause analysis.

**Planned Features:**
- Trace search with filters
- Compact trace summaries
- Service discovery
- Error pattern analysis
- Telemetry investigator subagent

## Debug Skills Architecture

### The Problem with Traditional MCP Servers

MCP debugging tools have significant context window issues:

**Playwright MCP Issues:**
- Returns 50KB+ HTML accessibility trees per interaction
- Floods context with verbose DOM structures and JavaScript
- Multiple queries exhaust context window after just 2-3 operations
- No built-in filtering means massive irrelevant data consumption

**Tempo MCP Issues:**
- Returns 5MB+ trace payloads per query
- Floods context with thousands of spans
- No built-in filtering = irrelevant data
- Multiple queries = context window exhaustion

### The Solution: Three-Layer Architecture

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
├── CHANGELOG.md                       # Release history
├── LICENSE                            # MIT License
├── VERSION                            # Semantic version
├── .gitignore
├── .claude-plugin/
│   └── marketplace.json               # Plugin marketplace metadata
├── .github/
│   └── workflows/
│       └── validate.yml               # Validation workflow
├── playtight/                         # Browser automation skill
│   ├── SKILL.md                       # Complete skill reference
│   ├── scripts/                       # Executable Playwright scripts
│   │   ├── check-element.js
│   │   ├── get-text.js
│   │   ├── take-screenshot.js
│   │   ├── navigate-and-extract.js
│   │   └── package.json
│   ├── assets/
│   │   └── browser-investigator-subagent.md
│   └── references/
│       └── patterns.md
└── pixel-pusher/                      # UI/UX design skill
    ├── SKILL.md                       # Complete skill reference
    ├── assets/
    │   └── design-system-template.json
    └── references/
        ├── accessibility-guidelines.md
        ├── design-best-practices.md
        ├── design-system-layers.md
        ├── persona-template.md
        ├── style-guide-template.md
        └── user-flow-template.md
```

## Installation

### Claude Code

Register the marketplace:
```
/plugin marketplace add slamb2k/mad-skills
```

Then browse and select plugins (choose `debug-skills`, `design-skills`, or both), or install directly:
```
/plugin install debug-skills@slamb2k/mad-skills
/plugin install design-skills@slamb2k/mad-skills
```

**Note:** Playtight (browser automation) will automatically detect and offer to install required browsers when first used. No manual setup needed!

## Design Principles

### Debug Skills Principles

When building or modifying debug skills (script-based tools):

1. **Never Return Raw Data** - Always return structured JSON with specific fields
2. **Truncate Everything** - Text: 100-2000 chars, errors: 100 chars
3. **Keep Responses Compact** - Target < 500 bytes per script response
4. **Filter at Source** - Extract only essential data in the script
5. **Use Subagent for Verbosity** - Complex exploration happens in isolated context
6. **Headless by Default** - All scripts use headless mode for performance
7. **Timeout Protection** - Reasonable timeouts to avoid hangs

### Design Skills Principles

When building or modifying design skills (workflow-based tools):

1. **Systematic Process** - Guide users through structured workflows
2. **Progressive Disclosure** - Use reference templates loaded only when needed
3. **Professional Standards** - Follow industry best practices (WCAG, responsive design, etc.)
4. **Iterative Refinement** - Support multiple variations and feedback loops

## Documentation

### Skills Documentation
- [Playtight Skill Reference](playtight/SKILL.md) - Complete Playtight documentation
- [Playtight Usage Patterns](playtight/references/patterns.md) - Common usage patterns
- [Pixel Pusher Skill Reference](pixel-pusher/SKILL.md) - Complete Pixel Pusher documentation
- [Design System Layers](pixel-pusher/references/design-system-layers.md) - Component breakdown
- [Accessibility Guidelines](pixel-pusher/references/accessibility-guidelines.md) - WCAG compliance

### Repository Documentation
- [CHANGELOG.md](CHANGELOG.md) - Release history and version notes
- [CLAUDE.md](CLAUDE.md) - Guidance for Claude Code when working in this repo

## Contributing

This repository demonstrates patterns for building Claude Code skills in two categories:

**For Debug Skills (MCP alternatives):**
1. Follow the three-layer architecture (filtered scripts, direct execution, subagent isolation)
2. Ensure all scripts return compact JSON summaries
3. Include subagent definitions for complex tasks
4. Document usage patterns and examples

**For Design Skills (workflow-based):**
1. Create structured SKILL.md with clear multi-stage processes
2. Provide reference templates for common patterns
3. Include examples and use cases
4. Document best practices

When adding new skills, place them in the appropriate plugin (debug-skills or design-skills) in `.claude-plugin/marketplace.json`.

## License

MIT License - See [LICENSE](LICENSE) file for details

## Related

- [Claude Code Skills Documentation](https://claude.ai/code)
- [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)

