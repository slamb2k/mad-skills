# CLAUDE.md Template

Template for the generated project CLAUDE.md. The Phase 4 agent substitutes
`{VARIABLE}` placeholders and writes to the project root.

`{UNIVERSAL_PRINCIPLES}` is populated with the Question & Assumption
Accountability and Communication sections when install_level is "project"
or "both". Left empty when install_level is "global" (principles are in
`~/.claude/CLAUDE.md` instead).

---

BEGIN TEMPLATE

# {PROJECT_NAME}

{PROJECT_DESCRIPTION}

## Operating Framework: GOTCHA

This project uses the **GOTCHA Framework** — a 6-layer architecture for
agentic AI systems. LLMs handle reasoning; deterministic tools handle execution.

**GOT** (The Engine):
- **Goals** (`goals/`) — Process definitions. Check `goals/manifest.md` first.
- **Orchestration** — You (the AI). Read goals, delegate to tools, handle errors.
- **Tools** (`tools/`) — Python scripts. Check `tools/manifest.md` first.

**CHA** (The Context):
- **Context** (`context/`) — Domain knowledge, reference material
- **Hard Prompts** (`hardprompts/`) — Reusable instruction templates
- **Args** (`args/`) — Behaviour settings (YAML/JSON)

### Operating Rules

1. **Check goals first** — Before any task, read `goals/manifest.md`
2. **Check tools first** — Before writing code, read `tools/manifest.md`
3. **Fix and document** — When tools fail, fix them and update the goal
4. **Never modify goals without permission** — Goals are living documentation
5. **Communicate when stuck** — Explain what is missing, do not guess

## Directory Structure

```
{PROJECT_NAME}/
├── CLAUDE.md           This file
├── .gitignore          Ignores credentials, data, temp files
├── goals/              Process definitions
│   ├── manifest.md     Index of all goals
│   └── build_app.md    BRACE build methodology
├── tools/              Deterministic scripts
│   └── manifest.md     Index of all tools
├── context/            Domain knowledge and references
├── hardprompts/        Reusable LLM instruction templates
├── args/               Behaviour settings (YAML/JSON)
└── .tmp/               Scratch work (gitignored)
```

## Memory

For persistent memory across sessions, install the **claude-mem** plugin:
```
claude plugin install claude-mem
```

claude-mem automatically captures context via lifecycle hooks and provides
MCP tools for search, timeline, and observation management. Claude Code's
built-in auto memory (`~/.claude/projects/<project>/memory/MEMORY.md`)
handles curated facts.

## Build Methodology: BRACE

See `goals/build_app.md` for the full workflow:
- **B**rief — Define problem, users, success metrics
- **R**esearch — Data schema, integrations, stack proposal
- **A**rchitect — Design structure, validate all connections
- **C**onstruct — Build DB first, then API, then UI
- **E**valuate — Functional, integration, edge case, acceptance testing

{UNIVERSAL_PRINCIPLES}

## Guardrails

- Always check manifests before creating new goals or tools
- Verify tool output format before chaining into another tool
- Do not assume APIs support batch operations — check first
- Preserve intermediate outputs when workflows fail mid-execution
- Read the full goal before starting — do not skim
- Temporary files go in `.tmp/` — never store important data there

END TEMPLATE
