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
