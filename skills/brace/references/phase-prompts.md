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
   specs/ tools/ context/ hardprompts/ args/ .tmp/

2. Check for each key file:
   CLAUDE.md .gitignore tools/manifest.md

3. Check if directory is a git repo:
   [ -d .git ] && echo "git: true" || echo "git: false"

4. Get directory name:
   basename "$(pwd)"

5. Check for legacy ATLAS references:
   atlas_found=false
   for f in CLAUDE.md; do
     if [ -f "$f" ] && grep -qi "ATLAS" "$f"; then
       atlas_found=true
       break
     fi
   done

6. Check for legacy FORGE references:
   forge_found=false
   for f in CLAUDE.md; do
     if [ -f "$f" ] && grep -qi "FORGE" "$f"; then
       forge_found=true
       break
     fi
   done

7. Check for legacy GOTCHA/goals structure:
   legacy_gotcha=false
   if [ -d "goals" ] || ([ -f "CLAUDE.md" ] && grep -q "GOTCHA" CLAUDE.md); then
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
2. Create .gitkeep in empty directories (specs/, context/, hardprompts/, args/, .tmp/)
3. Write CLAUDE.md using the template below, substituting {PROJECT_NAME},
   {PROJECT_DESCRIPTION}, and {UNIVERSAL_PRINCIPLES}
4. Write .gitignore from the content below
5. Write tools/manifest.md from content below

### For "merge" items:

- CLAUDE.md: Read existing file. If it does not contain "## Project Structure"
  or "## Development Workflow", append those sections from the template. If it
  does, skip.
- .gitignore: Read existing file. Append any missing entries from the
  template. Do not duplicate existing entries.

### For "upgrade" items (legacy migration):

These files already exist but contain legacy naming (ATLAS, FORGE, or
GOTCHA/BRACE). Replace legacy methodology references with the current
skills-based workflow while preserving all other content.

- **CLAUDE.md:** Replace any "Operating Framework: GOTCHA", "Build Methodology:
  BRACE/ATLAS/FORGE" sections with the "Project Structure" and "Development
  Workflow" sections from the template. Remove references to goals/manifest.md
  and goals/build_app.md. Preserve all other sections.

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
- **CLAUDE.md:** Remove references to goals/, GOTCHA, BRACE. Replace any
  `## Memory System` section with:
  ```
  ## Memory
  This project uses claude-mem for persistent cross-session memory.
  ```

### Global preferences (conditional)

If INSTALL_LEVEL is "global" or "both":
- Read ~/.claude/CLAUDE.md
- If it does NOT contain "## Global Preferences", insert the Global
  Preferences Content (below) immediately before "## Current Skills"
- If it already contains "## Global Preferences", skip (idempotent)

### {UNIVERSAL_PRINCIPLES} substitution

If INSTALL_LEVEL is "project" or "both", substitute {UNIVERSAL_PRINCIPLES}
in the CLAUDE.md template with the Universal Principles Content below.

If INSTALL_LEVEL is "global", substitute {UNIVERSAL_PRINCIPLES} with an
empty string (principles are in the global config instead).

### CLAUDE.md Template

{CLAUDE_MD_TEMPLATE}

### .gitignore Content

{GITIGNORE_CONTENT}

### tools/manifest.md Content

{TOOLS_MANIFEST}

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
- Track unresolved items via persistent tasks (`TaskCreate`) or CLAUDE.md
  "Known Issues" for future session awareness
- At the start of new work, check for outstanding items from previous sessions
- Never close a task with unacknowledged open questions

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
   for d in specs tools context hardprompts args .tmp; do
     [ -d "$d" ] && echo "dir ok: $d" || echo "dir MISSING: $d"
   done

2. Verify key files exist and are non-empty:
   for f in CLAUDE.md .gitignore tools/manifest.md; do
     [ -s "$f" ] && echo "file ok: $f" || echo "file MISSING: $f"
   done

3. Check CLAUDE.md contains project structure:
   grep -q "Project Structure" CLAUDE.md && echo "claude_md: has structure" || echo "claude_md: no structure"

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
