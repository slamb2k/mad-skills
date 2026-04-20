# Global Preferences & Universal Principles

Template appended to `~/.claude/CLAUDE.md` by brace when the user
selects "global" install level. When the user selects "project" level,
this file is not used — instead, the universal principles are written
to the project CLAUDE.md (with a redundancy check against global).
The Phase 4 agent inserts this content before the "## Current Skills"
section.

---

BEGIN TEMPLATE

## Global Preferences

These defaults apply to all projects. Override in a project-level CLAUDE.md.

### Tooling
- **Python**: Use `uv` for virtual environments and dependency management
- **JavaScript/TypeScript**: Use `bun` over `node`/`npm`/`yarn`
- **Git**: Use conventional commits with scope — `feat(scope): message`

### Code Quality
- Prefer editing existing files over creating new ones
- Do not create documentation files (README, CHANGELOG) unless asked
- Do not add comments, docstrings, or type annotations to code you didn't change
- Prefer simple, readable code over clever abstractions

### Security
- Never commit `.env`, credentials, or API keys
- Check `git diff --staged` for secrets before committing

### Python
- Use `pathlib` over `os.path`
- Use f-strings over `.format()` or `%`
- Type hints on function signatures, not internal variables

### Testing
- Always run tests after making changes unless told to skip

## Universal Operating Principles

### Question & Assumption Accountability
- When making an assumption, state it explicitly and record it
- When a question can't be answered immediately, log it as an open item
- When deferring a fix or skipping an edge case, document why
- At the end of each task, review all assumptions and open questions
- Never close a task with unacknowledged open questions
- Present unresolved items to the user with context and suggested actions

### Communication
- When stuck, explain what's missing — don't guess or invent capabilities
- When a workflow fails mid-execution, preserve intermediate outputs
- Verify output format before chaining into another tool or step

## Commit Discipline

Reinforces Claude Code's built-in "only commit when explicitly asked" rule.
Restated here because LLMs drift on implicit system-prompt rules under
long-session pressure.

- **Do not commit, push, create PRs, or merge unless the user explicitly
  asks.** A feature request ("can you add X") is an edit request, not a
  ship request. Make the edits, run validate/lint/tests, then stop and
  ask before any `git commit`, `git push`, `gh pr create`, or merge
  operation.
- **Skill invocation is the explicit authorization.** `/ship`, `/build`,
  `/commit`, and similar skills constitute consent to commit as part of
  their defined flow. Running their **component scripts** manually
  (`merge.sh`, `ci-watch.sh`, `sync.sh`) is **not** — those are skill
  internals, not a substitute for the skill.
- **When shipping is warranted, invoke the skill.** Don't run individual
  scripts to emulate `/ship` — the skill sequences stages correctly and
  catches the errors piecemeal execution reintroduces.

END TEMPLATE
