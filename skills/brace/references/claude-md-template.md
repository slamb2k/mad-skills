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

## Project Structure

```
{PROJECT_NAME}/
├── CLAUDE.md           This file
├── .gitignore          Ignores credentials, data, temp files
├── specs/              Specifications (/speccy output, /build input)
├── context/            Domain knowledge and references
└── .tmp/               Scratch work (gitignored)
```

## Development Workflow

```
/speccy → specs/{name}.md → /build specs/{name}.md → /ship
```

- `/speccy` interviews and writes a structured spec to `specs/`
- `/build` reads the spec, explores, designs, implements, reviews, tests
- `/ship` commits, creates PR, waits for CI, merges

## Memory

For persistent memory across sessions, install the **claude-mem** plugin:
```
claude plugin install claude-mem
```

claude-mem automatically captures context via lifecycle hooks and provides
MCP tools for search, timeline, and observation management. Claude Code's
built-in auto memory (`~/.claude/projects/<project>/memory/MEMORY.md`)
handles curated facts.

{PLUGIN_ROLE_SEPARATION}

{UNIVERSAL_PRINCIPLES}

## Branch Discipline

- **Always sync to main before starting new work** — run `/sync` or
  `git checkout main && git pull` before creating a feature branch
- **Never branch from a feature branch** — always branch from an up-to-date `main`
- **One feature per branch** — don't stack unrelated changes on the same branch
- **After shipping a PR, sync immediately** — checkout main and pull before
  starting the next task
- **If a PR is pending review**, switch to main before starting unrelated work —
  don't build on top of an unmerged branch

These rules prevent divergent branches that require complex rebases with risk
of silent conflict resolution.

## Guardrails

- Verify tool output format before chaining into another tool
- Do not assume APIs support batch operations — check first
- Preserve intermediate outputs when workflows fail mid-execution
- Use persistent tasks (`TaskCreate`/`TaskUpdate`) for cross-session tracking
- Temporary files go in `.tmp/` — never store important data there
- Don't build before designing — rewrites everything
- Don't skip connection validation — hours wasted on broken integrations
- Don't skip data modelling — schema changes cascade into UI rewrites

END TEMPLATE
