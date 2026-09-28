# Brace Phase Prompts

Subagent prompts for each phase. The orchestrator reads the relevant section
and substitutes `{VARIABLE}` placeholders before sending to the subagent.

---

## Phase 1: Directory Scan

**Agent:** Bash | **Model:** haiku

```
Scan the current working directory for existing project scaffold structure.

Limit your SCAN_REPORT to 20 lines maximum.

## Checks

1. Check for each scaffold directory:
   specs/ context/ .tmp/

2. Check for each key file:
   AGENTS.md CLAUDE.md .gitignore
   Report whether CLAUDE.md imports AGENTS.md (any line mentions AGENTS.md)
   and whether it has content (any non-blank line that is not a heading, an
   HTML comment, or a line mentioning AGENTS.md). Only "has content, no
   import" is a legacy file to migrate.

3. Check if directory is a git repo:
   [ -d .git ] && echo "git: true" || echo "git: false"

4. Get directory name:
   basename "$(pwd)"

5. Check for legacy ATLAS references:
   atlas_found=false
   for f in AGENTS.md CLAUDE.md; do
     if [ -f "$f" ] && grep -qi "ATLAS" "$f"; then
       atlas_found=true
       break
     fi
   done

6. Check for legacy FORGE references:
   forge_found=false
   for f in AGENTS.md CLAUDE.md; do
     if [ -f "$f" ] && grep -qi "FORGE" "$f"; then
       forge_found=true
       break
     fi
   done

7. Check for legacy GOTCHA/goals structure:
   legacy_gotcha=false
   if [ -d "goals" ] || grep -qs "GOTCHA" AGENTS.md CLAUDE.md; then
     legacy_gotcha=true
   fi

8. Check for legacy memory system:
   legacy_memory=false
   if [ -d "tools/memory" ] || [ -f "memory/MEMORY.md" ]; then
     legacy_memory=true
   fi

## Output Format

SCAN_REPORT:
  directory_name: {name}
  git_initialized: true|false
  existing_dirs: [comma-separated list]
  existing_files: [comma-separated list]
  missing_dirs: [comma-separated list]
  missing_files: [comma-separated list]
  has_claude_md: true|false
  has_gitignore: true|false
  has_atlas: true|false
  has_forge: true|false
  has_legacy_gotcha: true|false
  has_legacy_memory: true|false
```

---

## Phase 4: Scaffold Structure

**Agent:** general-purpose | **Model:** default

```
Create the project scaffold structure in the current directory.

Limit your SCAFFOLD_REPORT to 15 lines maximum.

## Inputs

- ACTION_PLAN: {ACTION_PLAN}
- PROJECT_NAME: {PROJECT_NAME}
- PROJECT_DESCRIPTION: {PROJECT_DESCRIPTION}
- INSTALL_LEVEL: {INSTALL_LEVEL}

## Instructions

Only act on items in the ACTION_PLAN with status "create", "merge", or "upgrade".
Skip items with status "skip" or "not selected".

### For "create" items:

1. Create directories with mkdir -p
2. Create .gitkeep in empty directories (specs/, context/, .tmp/)
3. Write AGENTS.md using the template below, substituting {PROJECT_NAME},
   {PROJECT_DESCRIPTION}, and {UNIVERSAL_PRINCIPLES}
4. Write CLAUDE.md containing exactly `@AGENTS.md` (plus a trailing newline)
   so Claude Code loads AGENTS.md
5. Write .gitignore from the content below

### For "merge" items:

- AGENTS.md: Read existing file. If it does not contain "## Project Structure"
  or "## Development Workflow", append those sections from the template. If it
  does, skip.

### For "migrate" items (CLAUDE.md has content and does not import AGENTS.md):

Only when the ACTION_PLAN carries the user's approval (the primary agent asks
first — see `references/instructions-file.md`). Merge CLAUDE.md sections into
AGENTS.md (create it if missing; keep AGENTS.md's version of any duplicate
heading and append lines not already present), then overwrite CLAUDE.md with
exactly `@AGENTS.md`. Apply "merge" rules to the resulting AGENTS.md. Record
moved and merged section names in SCAFFOLD_REPORT.migrated. Without approval,
treat as "merge" against CLAUDE.md and record `migration_declined: true`.

### For "pointer" items:

Write `@AGENTS.md` to CLAUDE.md. If CLAUDE.md exists and has content, this
is a "migrate" item instead — never overwrite content. If CLAUDE.md already
imports AGENTS.md, there is nothing to do; leave any notes under the import.
- .gitignore: Read existing file. Append any missing entries from the
  template. Do not duplicate existing entries.

### For "upgrade" items (legacy migration):

These files already exist but contain legacy naming (ATLAS, FORGE, or
GOTCHA/BRACE). Replace legacy methodology references with the current
skills-based workflow while preserving all other content.

- **AGENTS.md (or CLAUDE.md when migration was declined):** Replace any
  "Operating Framework: GOTCHA", "Build Methodology: BRACE/ATLAS/FORGE"
  sections with the "Project Structure" and "Development Workflow" sections
  from the template. Remove references to goals/manifest.md and
  goals/build_app.md. Preserve all other sections. If the legacy content
  lives in CLAUDE.md and migration was approved, migrate first, then upgrade
  AGENTS.md.

### For "remove" items (legacy cleanup):

1. Before deleting `memory/MEMORY.md`, check if it contains a "## Key Decisions"
   section. If so, extract that section content into `preserved_content` for the
   SCAFFOLD_REPORT so the user can relocate it.
2. Remove `tools/memory/` — use `git rm -r tools/memory` if tracked, otherwise `rm -rf tools/memory`
3. Remove `memory/` — use `git rm -r memory` if tracked, otherwise `rm -rf memory`
4. Remove `goals/` — use `git rm -r goals` if tracked, otherwise `rm -rf goals`
   (only if empty or contains only manifest.md and build_app.md)

### For "cleanup" items (legacy references):

- **tools/manifest.md:** Remove any rows referencing `memory/` tools
- **.gitignore:** Remove the `memory/*.npy` line and its comment if present
- **AGENTS.md / CLAUDE.md:** Remove references to goals/, GOTCHA, BRACE. Replace any
  `## Memory System` section with:
  ```
  ## Memory
  Claude Code's built-in auto-memory persists curated facts across sessions.
  ```

### Global preferences and universal principles

**If INSTALL_LEVEL is "global":**
- Read ~/.claude/CLAUDE.md
- If it does NOT contain "## Global Preferences", insert the Global
  Preferences Content (below) immediately before "## Current Skills"
- If it already contains "## Global Preferences", skip (idempotent)
- Substitute {UNIVERSAL_PRINCIPLES} in the project AGENTS.md template with
  an empty string (principles are in the global config instead).

**If INSTALL_LEVEL is "project":**
- Do NOT modify ~/.claude/CLAUDE.md.
- Before writing universal principles into the project AGENTS.md, check
  ~/.claude/CLAUDE.md for existing equivalent sections (redundancy guard):
  - If global contains "## Global Preferences" → SKIP that section in
    project AGENTS.md. Add to SCAFFOLD_REPORT.skipped_redundant.
  - If global contains "## Universal Operating Principles" → SKIP that
    section in project AGENTS.md. Add to SCAFFOLD_REPORT.skipped_redundant.
  - If global contains "## Commit Discipline" → SKIP that section in
    project AGENTS.md. Add to SCAFFOLD_REPORT.skipped_redundant.
- For any sections NOT found in global, substitute {UNIVERSAL_PRINCIPLES}
  in the project AGENTS.md template with only the non-redundant sections
  from the Universal Principles Content below.
- If ALL sections are redundant, substitute {UNIVERSAL_PRINCIPLES} with
  an empty string.
- Report each skipped section to the user:
  "⏭️ Skipped {section} in project AGENTS.md — already present in ~/.claude/CLAUDE.md"

### AGENTS.md Template

{AGENTS_MD_TEMPLATE}

### .gitignore Content

{GITIGNORE_CONTENT}

### Global Preferences Content

{GLOBAL_PREFERENCES_CONTENT}

### Universal Principles Content

## Question & Assumption Accountability

Nothing gets silently dropped. Every open question, assumption, and deferred
decision must be explicitly recorded and revisited.

- When you make an assumption, **state it explicitly** and record it
- When a question cannot be answered immediately, log it as an open item
- When you defer a fix or skip an edge case, document why and what triggers it
- At the end of each task, review all assumptions and open questions
- Present unresolved items to the user with context and suggested actions
- Track unresolved items via persistent tasks (`TaskCreate`) or AGENTS.md
  "Known Issues" for future session awareness
- At the start of new work, check for outstanding items from previous sessions
- Never close a task with unacknowledged open questions

## Communication

- When stuck, explain what's missing — don't guess or invent capabilities
- When a workflow fails mid-execution, preserve intermediate outputs
- Verify output format before chaining into another tool or step

## Agent Workflow

- Offload broad codebase exploration, log analysis, and open-ended research
  to subagents rather than doing it inline — it keeps the primary
  conversation's context budget for synthesis and decision-making.
- Before reading a large file in full, consider whether a subagent can
  extract just the relevant section instead of loading the whole thing into
  the primary context.
- Prefer targeted search (grep/glob for a known symbol or pattern) over
  broad exploration when the target is already known; reserve subagents for
  genuinely open-ended searches.

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

## Output Format

SCAFFOLD_REPORT:
  status: success|partial|failed
  created: [list of files/dirs created]
  merged: [list of files merged]
  upgraded: [list of files upgraded]
  removed: [list of legacy items removed]
  cleaned: [list of files cleaned of legacy references]
  preserved_content: [any key decisions extracted from memory/MEMORY.md, or empty]
  skipped: [list of items skipped]
  skipped_redundant: [sections skipped in project AGENTS.md because already in global, or empty]
  migrated: [CLAUDE.md sections moved/merged into AGENTS.md, or empty]
  migration_declined: true|false
  global_updated: true|false|skipped
  errors: [any errors encountered]
```

---

## Phase 5: Verification

**Agent:** Bash | **Model:** haiku

```
Verify the project scaffold was initialised correctly.

Limit your VERIFY_REPORT to 15 lines maximum.

## Checks

1. Verify expected directories exist:
   for d in specs context .tmp; do
     [ -d "$d" ] && echo "dir ok: $d" || echo "dir MISSING: $d"
   done

2. Verify key files exist and are non-empty:
   for f in AGENTS.md CLAUDE.md .gitignore; do
     [ -s "$f" ] && echo "file ok: $f" || echo "file MISSING: $f"
   done

3. Check AGENTS.md contains project structure and CLAUDE.md points at it:
   grep -q "Project Structure" AGENTS.md && echo "agents_md: has structure" || echo "agents_md: no structure"
   grep -q "AGENTS.md" CLAUDE.md && echo "claude_md: pointer" || echo "claude_md: no pointer"

4. Check .gitignore has key entries:
   entries=0
   for pattern in ".env" ".tmp/"; do
     grep -q "$pattern" .gitignore && entries=$((entries+1))
   done
   echo "gitignore entries: $entries/2"

5. If legacy cleanup was performed, verify removal:
   if [ -d "tools/memory" ]; then echo "legacy: tools/memory still exists"; fi
   if [ -d "memory" ]; then echo "legacy: memory/ still exists"; fi

## Output Format

VERIFY_REPORT:
  status: complete|partial|failed
  dirs_verified: {count}/{expected}
  files_verified: {count}/{expected}
  claude_md_valid: true|false
  gitignore_entries: {count}/{expected}
  legacy_cleaned: true|false|not_applicable
  issues: [any problems found]
```
