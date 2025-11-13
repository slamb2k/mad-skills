# MAD Skills Catalog

Complete catalog of available context-efficient Claude Code skills.

## Available Skills

### Playtight - Browser Automation

**Version:** 1.0.0
**Status:** ✅ Available
**Download:** [playtight.zip](https://github.com/slamb2k/mad-skills/releases/latest/download/playtight.zip)

**Replaces:** Playwright MCP Server
**Context Efficiency:** 225x more efficient
**Typical Response Size:** < 500 bytes vs 50KB+ with MCP

#### Features
- ✅ Element verification (`check-element.js`)
- ✅ Text extraction with auto-truncation (`get-text.js`)
- ✅ Screenshot capture (`take-screenshot.js`)
- ✅ Structured data extraction (`navigate-and-extract.js`)
- ✅ Browser investigator subagent for complex tasks

#### Installation
```bash
# Download and extract
unzip playtight.zip -d ~/.claude/skills/user/

# Install dependencies
cd ~/.claude/skills/user/playtight/scripts/
npm install
npm run install-browsers
```

#### Quick Start
```bash
# Direct script usage
node playtight/scripts/check-element.js https://example.com h1
node playtight/scripts/get-text.js https://example.com "#content"

# Subagent usage (in Claude Code)
"Use browser-investigator subagent to find all form fields on example.com/login"
```

#### Documentation
- [Complete Skill Reference](playtight/SKILL.md)
- [Usage Patterns](playtight/references/patterns.md)
- [Subagent Guide](playtight/assets/browser-investigator-subagent.md)

---

### Pixel Pusher - UI/UX Design System

**Version:** 1.1.0
**Status:** ✅ Available
**Type:** Workflow/Design Skill

**Category:** UI/UX Design
**No Download Required** - Copy skill directory directly

#### Overview

A comprehensive UI/UX design skill that transforms vague requirements into polished web interfaces through systematic design thinking and iterative refinement.

#### Features
- ✅ Multi-stage design process (discovery, design system, mockup, refinement, delivery)
- ✅ Design system extraction from screenshots/URLs
- ✅ HTML mockup generation with consistent design tokens
- ✅ Multiple mockup variations for comparison
- ✅ Comprehensive reference templates (personas, user flows, style guides)
- ✅ WCAG 2.1 Level AA accessibility compliance
- ✅ Responsive design (mobile-first approach)

#### Installation
```bash
# Copy directly to skills directory (no packaging needed)
cp -r pixel-pusher ~/.claude/skills/user/

# No dependencies to install - pure workflow skill
```

#### Quick Start
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

#### Use Cases
- Landing page design
- Web application interfaces
- Dashboard designs
- Design system creation
- UI mockup generation
- Design inspiration analysis

#### Documentation
- [Complete Skill Reference](pixel-pusher/SKILL.md)
- [Design System Layers](pixel-pusher/references/design-system-layers.md)
- [Accessibility Guidelines](pixel-pusher/references/accessibility-guidelines.md)
- [Design Best Practices](pixel-pusher/references/design-best-practices.md)
- [Persona Template](pixel-pusher/references/persona-template.md)
- [User Flow Template](pixel-pusher/references/user-flow-template.md)
- [Style Guide Template](pixel-pusher/references/style-guide-template.md)

---

## Planned Skills

### Grafana Tempo Telemetry

**Status:** 🚧 In Development
**Estimated Release:** TBD

**Replaces:** Grafana Tempo MCP Server
**Estimated Efficiency:** 800x more efficient
**Planned Response Size:** < 500 bytes vs 5MB+ with MCP

#### Planned Features
- Trace search with filters
- Compact trace summaries
- Service discovery
- Error pattern analysis
- Telemetry investigator subagent

---

## Installation Guide

### Prerequisites
- Claude Code installed
- Node.js 18+ (for skills with npm dependencies)
- Git (for cloning repository)

### General Installation Pattern

1. **Download the skill package** from [Releases](https://github.com/slamb2k/mad-skills/releases/latest)

2. **Extract to Claude skills directory:**
   ```bash
   unzip <skill-name>.zip -d ~/.claude/skills/user/
   ```

3. **Install dependencies** (if the skill has a `scripts/package.json`):
   ```bash
   cd ~/.claude/skills/user/<skill-name>/scripts/
   npm install
   ```

4. **Run post-install commands** (check skill documentation for specifics)

5. **Verify installation:**
   - Skills appear automatically in Claude Code
   - No manual activation needed
   - Claude recognizes skill patterns from `SKILL.md`

### Updating Skills

To update to a newer version:

1. **Backup your current installation** (if you made customizations)
2. **Download the new version** from releases
3. **Remove old version:**
   ```bash
   rm -rf ~/.claude/skills/user/<skill-name>
   ```
4. **Follow installation steps** above

---

## Design Philosophy

All MAD Skills follow these principles:

1. **Never Return Raw Data** - Always structured JSON
2. **Truncate Everything** - Text limited to 100-2000 chars
3. **Keep Responses Compact** - Target < 500 bytes per response
4. **Filter at Source** - Extract only essential data
5. **Use Subagent for Verbosity** - Complex exploration in isolated context
6. **Headless by Default** - Performance first
7. **Timeout Protection** - Reasonable limits to avoid hangs

---

## Contributing

Interested in creating your own context-efficient skill?

1. **Study the pattern** - Review existing skills (especially Playtight)
2. **Follow the three-layer architecture:**
   - Filtered scripts (compact JSON output)
   - Direct execution (simple tasks)
   - Subagent isolation (complex tasks)
3. **Submit a PR** with your new skill following the repository structure

See [CLAUDE.md](CLAUDE.md) for detailed contribution guidelines.

---

## Support

- **Issues:** [GitHub Issues](https://github.com/slamb2k/mad-skills/issues)
- **Documentation:** [Repository README](README.md)
- **Discussions:** [GitHub Discussions](https://github.com/slamb2k/mad-skills/discussions)

---

## License

MIT License - See [LICENSE](LICENSE) file for details
