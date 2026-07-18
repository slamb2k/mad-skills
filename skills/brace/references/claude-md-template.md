# CLAUDE.md Template

Template for the generated project CLAUDE.md. The Phase 4 agent substitutes
`{VARIABLE}` placeholders and writes to the project root.

`{UNIVERSAL_PRINCIPLES}` is populated with universal behavioral rules
(currently: Question & Assumption Accountability and Commit Discipline)
when install_level is "project" AND those sections are not already present
in `~/.claude/CLAUDE.md`. Left empty when install_level is "global"
(principles are in the global config instead) or when the sections would
be redundant with existing global content. Redundancy is checked
section-by-section — each section that already exists in global is
skipped individually rather than dropping the whole substitution.

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

Claude Code's built-in auto-memory persists curated facts across sessions with
no plugin required — see `~/.claude/projects/<project>/memory/MEMORY.md`.

For the methodology layer (plan → build → finish), install the **superpowers**
plugin:
```
claude plugin install superpowers
```

mad-skills defers its overlapping `/speccy`, `/build`, and `/ship` stages to
superpowers when it is present, and falls back to its own standalone pipeline
when it is absent.

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

## Worktree Discipline

- **Relative paths don't follow a Bash `cd`** — Read/Write/Edit tools
  resolve relative paths against the session's own working directory, not
  wherever a worktree checkout or `cd` left the shell; use absolute paths
  once inside a worktree
- **Never reuse an existing worktree for an unrelated task** — a leftover
  worktree from a different feature is not a safe place to start new work
- **Don't leave worktrees dangling once a branch is finished** — clean up
  through whichever tool created the worktree once its branch is merged or
  abandoned

These rules prevent file-tool paths from silently resolving against the
wrong tree.

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
