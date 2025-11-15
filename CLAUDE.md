# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

**MAD Skills** is a repository containing Claude Code skills organized into two plugins:

1. **debug-skills** - Context-optimized alternatives to verbose MCP debugging tools
2. **design-skills** - Professional UI/UX design workflows

This repository serves multiple purposes:
- Claude Code plugin marketplace containing two distinct skill categories
- Documentation and examples of context-efficient debugging patterns
- Template for creating similar skills

## Current Status

**Debug Skills (debug-skills plugin):**
- **Playtight** (Browser Automation) - ✅ Complete - Replaces Playwright MCP Server

**Design Skills (design-skills plugin):**
- **Pixel Pusher** (UI/UX Design System) - ✅ Complete - Workflow-based design tool

**In Development:**
- **Grafana Tempo Telemetry Skill** - 🚧 Planned (debug-skills plugin)

## Project Structure

```
mad-skills/
├── README.md                          # Repository overview, usage, design principles
├── CLAUDE.md                          # This file - guidance for Claude Code
├── CHANGELOG.md                       # Release history
├── LICENSE                            # MIT License
├── VERSION                            # Semantic version
├── .gitignore                         # Git ignore patterns
├── .claude-plugin/
│   └── marketplace.json               # Plugin marketplace metadata
├── .github/
│   └── workflows/
│       └── validate.yml               # Validation workflow
├── playtight/                         # Playtight skill source
│   ├── SKILL.md                       # Complete skill reference
│   ├── scripts/                       # Executable Playwright scripts
│   │   ├── check-element.js           # Element verification
│   │   ├── get-text.js                # Text extraction with truncation
│   │   ├── take-screenshot.js         # Screenshot capture
│   │   ├── navigate-and-extract.js    # Structured data extraction
│   │   └── package.json               # npm dependencies
│   ├── assets/
│   │   └── browser-investigator-subagent.md  # Subagent definition
│   └── references/
│       └── patterns.md                # Common usage patterns
└── pixel-pusher/                      # Pixel Pusher skill source
    ├── SKILL.md                       # Complete skill reference
    ├── assets/
    │   └── design-system-template.json  # Design system template
    └── references/
        ├── accessibility-guidelines.md  # WCAG compliance
        ├── design-best-practices.md     # Professional design principles
        ├── design-system-layers.md      # Component breakdown
        ├── persona-template.md          # User persona structure
        ├── style-guide-template.md      # Visual reference
        └── user-flow-template.md        # User journey mapping
```

## Development Commands

### Playtight Script Setup
```bash
cd playtight/scripts/
npm install
npm run install-browsers  # Installs Chromium
```

### Testing Playtight Scripts
```bash
# From repository root
node playtight/scripts/check-element.js https://example.com h1
node playtight/scripts/get-text.js https://example.com "#content"
node playtight/scripts/take-screenshot.js https://example.com test.png

# Or cd to scripts directory first
cd playtight/scripts/
node check-element.js https://example.com h1
node get-text.js https://example.com "#main-content"
node take-screenshot.js https://example.com test.png
node navigate-and-extract.js "https://example.com" '{"selectors": {"title": "h1"}}'
```

### No Build Process
This repository has no build, lint, or test commands. Scripts are standalone Node.js programs that run directly via `node`.

## Architecture: The Three-Layer Pattern

All skills in this repository follow the same architecture:

### 1. Filtered Scripts (bash/nodejs)
- Direct API/CLI access with controlled output
- All scripts return structured JSON, never raw data
- Built-in truncation and size limits
- Aggressive filtering to prevent irrelevant data retrieval

### 2. Direct Execution (Simple Tasks)
- Use scripts directly for single-step operations
- Parent agent receives compact responses
- Good for known selectors/filters and focused checks

### 3. Subagent Isolation (Complex Tasks)
- Specialized subagent handles multi-step exploration
- Makes 5-10+ script calls internally
- Absorbs all verbose responses in isolated context
- Returns concise summary (< 500 tokens) to parent

## Playtight Skill Details

### Core Scripts (located in `playtight/scripts/`)

**check-element.js** - Check if element exists and get properties
```bash
node check-element.js <url> <selector>
# Returns: {found: bool, tagName, text, visible, enabled, attributes}
```
- Text limited to 100 chars
- Only essential attributes extracted (id, class, type, href, value)
- 30s timeout for page load

**get-text.js** - Extract text content
```bash
node get-text.js <url> [selector]
# Returns: {found: bool, text, length, truncated}
```
- Auto-truncates to 2000 chars to prevent context flooding
- Extracts only visible text (excludes hidden, script, style tags)
- Selector optional - defaults to entire page body

**take-screenshot.js** - Capture screenshot
```bash
node take-screenshot.js <url> <output-path> [selector]
# Returns: {success: bool, path, url, selector}
```
- Full page or specific element
- Keeps response compact by saving to disk

**navigate-and-extract.js** - Structured data extraction
```bash
node navigate-and-extract.js <url> '<config-json>'
# Config: {waitFor, selectors, counts, checks}
# Returns: {success: bool, url, data}
```
- `waitFor`: Selector to wait for before extracting
- `selectors`: Map of name->selector for text extraction (200 char limit per field)
- `counts`: Map of name->selector for element counting
- `checks`: Map of name->selector for visibility checks

### Browser Investigator Subagent

**Location:** `playtight/assets/browser-investigator-subagent.md`

**Purpose:** Execute complex multi-step browser investigations while isolating verbose responses from parent agent.

**When to use:**
- Multiple exploration steps needed
- Unknown selectors requiring discovery
- Complex element hierarchy navigation
- Parent context must stay clean
- Need comprehensive page analysis

**When to use direct scripts:**
- Single, focused query
- Known selectors
- Quick checks
- Parent context has room

**Return formats:**
- Element location: `{type, selector, element_type, verification, attempts}`
- Data extraction: `{type, extracted_data, data_points, confidence}`
- Verification: `{type, status, checks_completed, issues, screenshot_path}`
- Status check: `{type, url, status, summary}`

## Pixel Pusher Skill Details

### Overview

**Type:** Workflow/Design Skill

Pixel Pusher is a comprehensive UI/UX design skill that guides Claude through systematic design thinking. Unlike script-based skills like Playtight, this is a **workflow skill** that provides structured guidance for creating professional web interfaces.

### Key Characteristics

- **No executable scripts** - Pure SKILL.md guidance with reference templates
- **Reference-heavy** - Multiple template files for different design aspects
- **Multi-stage process** - Structured workflow from discovery to delivery

### Usage Pattern

When users request design work, Claude will:
1. Invoke pixel-pusher skill automatically
2. Follow the multi-stage design process
3. Use reference templates for structured outputs
4. Guide users through iterative refinement

### Reference Templates (in `pixel-pusher/references/`)

- `design-system-template.json` - Structured design system format
- `accessibility-guidelines.md` - WCAG 2.1 Level AA compliance
- `design-best-practices.md` - Professional design principles
- `design-system-layers.md` - Component breakdown and patterns
- `persona-template.md` - User persona structure
- `user-flow-template.md` - User journey mapping
- `style-guide-template.md` - Visual reference documentation

### Example Usage

```
User: "Design a landing page for my SaaS product"

Claude invokes pixel-pusher skill and:
1. Asks discovery questions (purpose, audience, inspiration)
2. Requests reference designs/screenshots
3. Extracts design system from references
4. Generates 2-3 mockup variations as HTML files
5. Iterates based on feedback
6. Delivers final design + documentation
```

## Critical Design Principles

When modifying or extending skills in this repository:

1. **Never Return Raw Data** - Always return structured JSON with specific fields
2. **Truncate Everything** - Text: 100-2000 chars, errors: 100 chars
3. **Keep Responses Compact** - Target < 500 bytes per script response
4. **Filter at Source** - Extract only essential data in the script
5. **Use Subagent for Verbosity** - Complex exploration happens in isolated context
6. **Headless by Default** - All scripts use headless mode for performance
7. **Timeout Protection** - Reasonable timeouts to avoid hangs

## Context Efficiency: The Core Value Proposition

### Traditional MCP Approach (Playwright)
```
Query: "Find login form"
Response: [30KB HTML tree] = 7,200 tokens
Result: Context exhausted after 2-3 queries
```

### MAD Skills Direct Scripts
```
Query: "Find login form"
Response: {found: true, ...} = 150 tokens
Result: Can make 100+ queries before context issues
```

### MAD Skills Subagent Pattern
```
Parent Query: "Find login form"
Subagent: 10 script calls = 1,500 tokens (isolated)
Parent Receives: {type: "element_location", ...} = 80 tokens
Result: 225x more efficient than MCP
```

## Key Documentation References

### Repository Documentation
- `README.md` - Repository overview, design principles, catalog, and comparison with MCP
- `CHANGELOG.md` - Release history and version notes
- `.claude-plugin/marketplace.json` - Plugin marketplace metadata
- `LICENSE` - MIT License

### Playtight Skill (Browser Automation)
- `playtight/SKILL.md` - Complete Playtight skill reference
- `playtight/references/patterns.md` - Common usage patterns
- `playtight/assets/browser-investigator-subagent.md` - Subagent definition

### Pixel Pusher Skill (UI/UX Design)
- `pixel-pusher/SKILL.md` - Complete Pixel Pusher skill reference
- `pixel-pusher/assets/design-system-template.json` - Design system template
- `pixel-pusher/references/accessibility-guidelines.md` - WCAG compliance
- `pixel-pusher/references/design-best-practices.md` - Professional design principles
- `pixel-pusher/references/design-system-layers.md` - Component breakdown

## Working with This Repository

### Adding New Skills

When adding new skills to this repository:

**For Debug Skills (MCP alternatives like Tempo telemetry):**

1. Create skill directory at repository root (e.g., `tempo/`)
2. Follow the three-layer architecture pattern (filtered scripts, direct execution, subagent)
3. Include:
   - `SKILL.md` - Complete skill reference
   - `scripts/` - Filtered scripts with compact JSON output
   - `assets/` - Subagent definitions
   - `references/` - Usage patterns and examples
4. Add skill to `debug-skills` plugin in `.claude-plugin/marketplace.json`
5. Update this CLAUDE.md with new skill details
6. Update README.md with skill overview

**For Design Skills (workflow-based tools):**

1. Create skill directory at repository root
2. Include:
   - `SKILL.md` - Structured workflow guide
   - `assets/` - Templates and examples
   - `references/` - Best practices and guidelines
3. Add skill to `design-skills` plugin in `.claude-plugin/marketplace.json`
4. Update this CLAUDE.md and README.md with skill details

### Testing Changes

To test modifications to Playtight scripts:

1. Make changes to the script file in `playtight/scripts/`
2. Run directly with node (no build step required)
3. Verify output is compact JSON
4. Ensure text truncation limits are respected
5. Test both direct execution and subagent patterns

### Subagent Development

Subagent definitions are stored in `{skill}/assets/` directories.

To test a subagent during development:
1. Copy to `.claude/agents/` in your test project
2. Ensure scripts are accessible from the test project
3. Test with complex multi-step automation tasks
4. Verify parent receives concise summaries (< 500 tokens)
