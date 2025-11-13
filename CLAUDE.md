# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

**MAD Skills** (MCP Alternative Development Skills) is a repository containing context-efficient Claude Code skills that replace verbose MCP servers with smart querying and context isolation.

This repository serves multiple purposes:
- Development environment for context-efficient skills
- Distribution point for packaged skills (in `dist/`)
- Documentation and examples of the context-efficiency pattern
- Template for building similar skills (Tempo telemetry, Kubernetes, etc.)

## Current Status

**Available Skills:**
- **Playtight** (Browser Automation) - ✅ Complete, packaged at `dist/playtight.zip`
- **Pixel Pusher** (UI/UX Design System) - ✅ Complete, workflow skill (no packaging needed)

**In Development:**
- **Grafana Tempo Telemetry Skill** - 🚧 Planned

## Project Structure

```
mad-skills/
├── README.md                          # Repository overview, usage, design principles
├── CLAUDE.md                          # This file - guidance for Claude Code
├── CHANGELOG.md                       # Release history
├── LICENSE                            # MIT License
├── VERSION                            # Semantic version
├── marketplace.json                   # Plugin marketplace metadata
├── SKILLS-CATALOG.md                  # Complete skills catalog
├── .gitignore                         # Git ignore patterns
├── dist/
│   └── playtight.zip                 # Packaged Playtight skill (ready for distribution)
├── scripts/
│   └── build-skills.sh               # Build script for packaging
├── .github/
│   └── workflows/
│       ├── build-and-validate.yml    # CI validation workflow
│       └── release.yml               # Automated release workflow
├── plugins/mad-skills/skills/
│   ├── playtight/                    # Playtight skill source
│   ├── SKILL.md                      # Complete skill reference
│   ├── scripts/                      # Executable Playwright scripts
│   │   ├── check-element.js          # Element verification
│   │   ├── get-text.js               # Text extraction with truncation
│   │   ├── take-screenshot.js        # Screenshot capture
│   │   ├── navigate-and-extract.js   # Structured data extraction
│   │   └── package.json              # npm dependencies
│   ├── assets/
│   │   └── browser-investigator-subagent.md  # Subagent definition
│   └── references/
│       └── patterns.md               # Common usage patterns
│   └── pixel-pusher/                 # Pixel Pusher skill source
│   ├── SKILL.md                      # Complete skill reference
│   ├── assets/
│   │   └── design-system-template.json  # Design system template
│   └── references/
│       ├── accessibility-guidelines.md  # WCAG compliance
│       ├── design-best-practices.md     # Professional design principles
│       ├── design-system-layers.md      # Component breakdown
│       ├── persona-template.md          # User persona structure
│       ├── style-guide-template.md      # Visual reference
│       └── user-flow-template.md        # User journey mapping
└── docs/
    └── examples/
        ├── skills-summary.md         # Overview of context-efficiency pattern
        └── tempo-skill-installation.md  # Tempo skill (planned)
```

## Development Commands

### Playtight Script Setup
```bash
cd plugins/mad-skills/skills/playtight/scripts/
npm install
npm run install-browsers  # Installs Chromium
```

### Testing Playtight Scripts
```bash
# From repository root
node plugins/mad-skills/skills/playtight/scripts/check-element.js https://example.com h1
node plugins/mad-skills/skills/playtight/scripts/get-text.js https://example.com "#content"
node plugins/mad-skills/skills/playtight/scripts/take-screenshot.js https://example.com test.png

# Or cd to scripts directory first
cd plugins/mad-skills/skills/playtight/scripts/
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

### Core Scripts (located in `plugins/mad-skills/skills/playtight/scripts/`)

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

**Location:** `plugins/mad-skills/skills/playtight/assets/browser-investigator-subagent.md`

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
**No scripts or packaging** - Pure workflow guidance skill

Pixel Pusher is a comprehensive UI/UX design skill that guides Claude through systematic design thinking. Unlike script-based skills, this is a **workflow skill** that provides structured guidance for creating professional web interfaces.

### Key Characteristics

- **No executable scripts** - Pure SKILL.md guidance
- **No packaging needed** - Users copy the skill directory directly
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

### Installation

Since this is a workflow skill with no scripts:

```bash
# Copy directly to skills directory
cp -r pixel-pusher ~/.claude/skills/user/

# No dependencies to install
# No build process needed
```

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

## Packaging and Distribution

### Creating Distribution Packages

The packaged skill is available at `dist/playtight.zip`. To rebuild or create new skill packages:

1. Ensure skill directory structure is correct
2. Package with appropriate tool (zip, tar, etc.)
3. Place in `dist/` directory
4. Update documentation with correct path

### Distribution Paths
- **Packaged Playtight skill:** `dist/playtight.zip`
- **Source directory:** `plugins/mad-skills/skills/playtight/`
- **Installation target:** `~/.claude/skills/user/playtight/`

## End User Installation

For users installing Playtight:

```bash
# Download playtight.zip from dist/ directory
# Upload to Claude Code or extract to your skills directory

# Manual installation:
unzip dist/playtight.zip -d ~/.claude/skills/user/

# Install dependencies:
cd ~/.claude/skills/user/playtight/scripts/
npm install
npm run install-browsers
```

Once installed, Claude Code automatically invokes Playtight when performing browser automation tasks:
- "Check if the login button exists on example.com"
- "Extract the title from this webpage"
- "Use browser-investigator subagent to find all form fields"

## Key Documentation References

### Repository Documentation
- `README.md` - Repository overview, design principles, and comparison with MCP
- `CHANGELOG.md` - Release history and version notes
- `SKILLS-CATALOG.md` - Complete catalog of available skills
- `marketplace.json` - Plugin marketplace metadata
- `LICENSE` - MIT License

### Playtight Skill (Browser Automation)
- `dist/playtight.zip` - Packaged skill ready for distribution
- `plugins/mad-skills/skills/playtight/SKILL.md` - Complete Playtight skill reference
- `plugins/mad-skills/skills/playtight/references/patterns.md` - Common usage patterns
- `plugins/mad-skills/skills/playtight/assets/browser-investigator-subagent.md` - Subagent definition

### Pixel Pusher Skill (UI/UX Design)
- `plugins/mad-skills/skills/pixel-pusher/SKILL.md` - Complete Pixel Pusher skill reference
- `plugins/mad-skills/skills/pixel-pusher/assets/design-system-template.json` - Design system template
- `plugins/mad-skills/skills/pixel-pusher/references/accessibility-guidelines.md` - WCAG compliance
- `plugins/mad-skills/skills/pixel-pusher/references/design-best-practices.md` - Professional design principles
- `plugins/mad-skills/skills/pixel-pusher/references/design-system-layers.md` - Component breakdown

## Working with This Repository

### Adding New Skills

When adding new skills to this repository (e.g., Tempo telemetry):

1. Create skill directory at repository root (e.g., `tempo/`)
2. Follow the three-layer architecture pattern
3. Include:
   - `SKILL.md` - Complete skill reference
   - `scripts/` - Filtered scripts with compact JSON output
   - `assets/` - Subagent definitions
   - `references/` - Usage patterns and examples
4. Package skill to `dist/{skillname}.zip`
5. Update this CLAUDE.md with new skill details
6. Update README.md with skill overview

### Testing Changes

To test modifications to Playtight scripts:

1. Make changes to the script file in `plugins/mad-skills/skills/playtight/scripts/`
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
