---
title: MAD Skills Repository Architecture
category: ai_docs
status: active
created: 2025-11-16
last_updated: 2025-11-21
tags: [architecture, repository-structure, plugins, skills]
---

# MAD Skills Repository Architecture

## Overview

This document explains the architecture of the mad-skills repository for Claude Code. This repository is both a Claude Code plugin marketplace AND a collection of skill source code.

## Repository Purpose

**Dual Purpose:**
1. **Plugin Marketplace** - Distributes three distinct plugin categories via `.claude-plugin/marketplace.json`
2. **Skill Source Repository** - Contains the source code, scripts, and documentation for all skills

## Three-Plugin Architecture

The repository is organized into three plugins, each serving a different purpose:

### 1. debug-skills
**Purpose:** Context-optimized alternatives to verbose MCP debugging tools

**Skills:**
- **Play-Tight** (Browser Automation) - Replaces Playwright MCP Server with compact JSON responses

**Architecture Pattern:**
- Filtered scripts (Node.js) that return compact JSON
- Subagent definitions for complex investigations
- 225x more context-efficient than traditional MCP servers

### 2. design-skills
**Purpose:** Professional UI/UX design workflows

**Skills:**
- **Pixel Pusher** (UI/UX Design System) - Systematic design thinking workflow

**Architecture Pattern:**
- Pure workflow skills (no executable scripts)
- Reference templates for structured outputs
- Multi-stage design process

### 3. dev-flow
**Purpose:** Development process optimization tools

**Skills:**
- **Cyberarian** (Document Lifecycle Management) - Structured documentation organization
- **Start Right** (Repository Scaffolding) - Production-ready repository initialization
- **Carbon** (Context-Efficient Git/Graphite Workflows) - Automatic delegation for verbose git operations

**Architecture Patterns:**
- **Cyberarian**: Python automation scripts, YAML frontmatter, category-based organization
- **Start Right**: Python automation scripts for git/GitHub setup, workflow generation, branch protection
- **Carbon**: SessionStart hooks, automatic delegation patterns, context isolation (225x efficiency)

## Repository Structure

```
mad-skills/
├── .claude-plugin/
│   └── marketplace.json        # Defines all three plugins and their skills
├── play-tight/                  # debug-skills: Browser automation
│   ├── SKILL.md
│   ├── scripts/                # Node.js scripts with compact output
│   ├── agents/                 # Subagent definitions
│   └── references/
├── pixel-pusher/               # design-skills: UI/UX workflows
│   ├── SKILL.md
│   ├── assets/                 # Templates (JSON, etc.)
│   └── references/             # Best practices, guidelines
├── cyberarian/                 # dev-flow: Doc management
│   ├── SKILL.md
│   ├── scripts/                # Python automation
│   ├── assets/                 # Document templates
│   └── references/             # Schemas, criteria
├── start-right/                # dev-flow: Repository scaffolding
│   ├── SKILL.md
│   ├── scripts/                # Python automation for git/GitHub
│   └── references/             # Project types, release strategies
├── carbon/                     # dev-flow: Context-efficient Git/Graphite
│   ├── SKILL.md
│   ├── install.sh              # Installation script
│   ├── hooks/                  # SessionStart hook
│   ├── agents/                 # Custom agent template
│   ├── references/             # Documentation, examples
│   └── test/                   # Verification scripts
├── docs/                       # Repository documentation (managed by Cyberarian)
└── [README.md, CLAUDE.md, etc.]
```

## Skill Directory Conventions

Every skill follows this structure:

```
skill-name/
├── SKILL.md                    # Required: Skill definition with frontmatter
├── scripts/                    # Optional: Executable automation scripts
├── agents/                     # Optional: Subagent definitions
├── assets/                     # Optional: Templates, static resources
└── references/                 # Optional: Best practices, examples
```

## Key Files

### .claude-plugin/marketplace.json
**Purpose:** Defines the plugin marketplace structure

**Structure:**
```json
{
  "name": "mad-skills",
  "version": "1.2.0",
  "plugins": [
    {
      "name": "debug-skills",
      "skills": ["./play-tight"]
    },
    {
      "name": "design-skills",
      "skills": ["./pixel-pusher"]
    },
    {
      "name": "dev-flow",
      "skills": ["./cyberarian", "./start-right", "./carbon"]
    }
  ]
}
```

### SKILL.md (in each skill directory)
**Purpose:** Defines the skill behavior and usage

**Required frontmatter:**
```yaml
---
name: skill-name
description: What the skill does and when to use it
---
```

### README.md (repository root)
**Purpose:** User-facing documentation
- Overview of all skills
- Installation instructions
- Architecture explanations

### CLAUDE.md (repository root)
**Purpose:** Guidance for Claude Code when working IN this repository
- Current status of all skills
- Development workflows
- Testing procedures

## Installation Flow

**User perspective:**
```bash
/plugin marketplace add slamb2k/mad-skills
/plugin install debug-skills@slamb2k/mad-skills
```

**What happens:**
1. Claude Code reads `.claude-plugin/marketplace.json`
2. Shows user the three available plugins
3. User selects which plugin(s) to install
4. Skills from selected plugin(s) are copied to `~/.claude/plugins/mad-skills/`
5. Skills become available for use in Claude Code

## Design Principles

### Debug Skills
1. Never return raw data - always structured JSON
2. Truncate everything to prevent context flooding
3. Use subagent isolation for complex tasks
4. Target < 500 bytes per response

### Design Skills
1. Systematic multi-stage workflows
2. Progressive disclosure with reference templates
3. Professional standards (WCAG, responsive design)
4. Iterative refinement loops

### Dev Flow Skills
1. Metadata-driven automation
2. Structured organization with clear conventions
3. Automatic maintenance (indexing, archiving)
4. Python scripts for cross-platform compatibility

## Adding New Skills

See `docs/templates/new-skill-template.md` for a template.

**Steps:**
1. Create skill directory at repository root
2. Add SKILL.md with proper frontmatter
3. Add scripts/assets/references as needed
4. Add skill to appropriate plugin in marketplace.json
5. Update README.md and CLAUDE.md
6. Update validation workflow

## References

- [Repository README](../../README.md)
- [CLAUDE.md](../../CLAUDE.md) - Development guidance
- [marketplace.json](../../.claude-plugin/marketplace.json) - Plugin definitions
