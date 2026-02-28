# Brace Phase Prompts

Subagent prompts for each phase. The orchestrator reads the relevant section
and substitutes `{VARIABLE}` placeholders before sending to the subagent.

---

## Phase 1: Directory Scan

**Agent:** Bash | **Model:** haiku

```
Scan the current working directory for existing GOTCHA/BRACE framework structure.

Limit your SCAN_REPORT to 20 lines maximum.

## Checks

1. Check for each GOTCHA directory:
   goals/ tools/ context/ hardprompts/ args/ .tmp/

2. Check for each key file:
   CLAUDE.md .gitignore goals/manifest.md goals/build_app.md
   tools/manifest.md

3. Check if directory is a git repo:
   [ -d .git ] && echo "git: true" || echo "git: false"

4. Get directory name:
   basename "$(pwd)"

5. Check for legacy ATLAS references:
   atlas_found=false
   for f in CLAUDE.md goals/build_app.md goals/manifest.md; do
     if [ -f "$f" ] && grep -qi "ATLAS" "$f"; then
       atlas_found=true
       break
     fi
   done

6. Check for legacy FORGE references:
   forge_found=false
   for f in CLAUDE.md goals/build_app.md goals/manifest.md; do
     if [ -f "$f" ] && grep -qi "FORGE" "$f"; then
       forge_found=true
       break
     fi
   done

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
```

---

## Phase 4: Scaffold Structure

**Agent:** general-purpose | **Model:** default

```
Create the GOTCHA/BRACE framework structure in the current directory.

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
2. Create .gitkeep in empty directories (context/, hardprompts/, args/, .tmp/)
3. Write CLAUDE.md using the template below, substituting {PROJECT_NAME},
   {PROJECT_DESCRIPTION}, and {UNIVERSAL_PRINCIPLES}
4. Write .gitignore from the content below
5. Write goals/manifest.md and tools/manifest.md from content below
6. Write goals/build_app.md from the BRACE workflow content below

### For "merge" items:

- CLAUDE.md: Read existing file. If it does not contain "GOTCHA", append
  the GOTCHA section from the template. If it does, skip.
- .gitignore: Read existing file. Append any missing entries from the
  template. Do not duplicate existing entries.

### For "upgrade" items (legacy → BRACE migration):

These files already exist but contain legacy ATLAS or FORGE naming. Replace the
legacy methodology references with BRACE equivalents while preserving all other content.

- **CLAUDE.md:** Replace the "Build Methodology: ATLAS" or "Build Methodology: FORGE"
  section (from that heading through the bullet list) with the BRACE section from
  the template. Also replace "ATLAS build methodology" or "FORGE build methodology"
  with "BRACE build methodology" in the directory tree comment. Preserve all other sections.
- **goals/build_app.md:** Replace the entire file with the BRACE workflow content below.
- **goals/manifest.md:** Replace "ATLAS" or "FORGE" with "BRACE" in the description column.

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

### goals/manifest.md Content

{GOALS_MANIFEST}

### tools/manifest.md Content

{TOOLS_MANIFEST}

### goals/build_app.md Content

{BRACE_WORKFLOW}

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
- Unresolved items go to `goals/` as follow-ups, to CLAUDE.md as "Known Issues",
  or to memory for future session awareness
- At the start of new work, check for outstanding items from previous sessions
- Never close a task with unacknowledged open questions

## Output Format

SCAFFOLD_REPORT:
  status: success|partial|failed
  created: [list of files/dirs created]
  merged: [list of files merged]
  upgraded: [list of files upgraded to BRACE]
  skipped: [list of items skipped]
  global_updated: true|false|skipped
  errors: [any errors encountered]
```

---

## Phase 5: Verification

**Agent:** Bash | **Model:** haiku

```
Verify the GOTCHA framework was initialised correctly.

Limit your VERIFY_REPORT to 15 lines maximum.

## Checks

1. Verify expected directories exist:
   for d in goals tools context hardprompts args .tmp; do
     [ -d "$d" ] && echo "dir ok: $d" || echo "dir MISSING: $d"
   done

2. Verify key files exist and are non-empty:
   for f in CLAUDE.md .gitignore goals/manifest.md tools/manifest.md; do
     [ -s "$f" ] && echo "file ok: $f" || echo "file MISSING: $f"
   done

3. Check CLAUDE.md contains GOTCHA reference:
   grep -q "GOTCHA" CLAUDE.md && echo "claude_md: has GOTCHA" || echo "claude_md: no GOTCHA"

4. Check .gitignore has key entries:
   entries=0
   for pattern in ".env" ".tmp/"; do
     grep -q "$pattern" .gitignore && entries=$((entries+1))
   done
   echo "gitignore entries: $entries/2"

## Output Format

VERIFY_REPORT:
  status: complete|partial|failed
  dirs_verified: {count}/{expected}
  files_verified: {count}/{expected}
  claude_md_has_gotcha: true|false
  gitignore_entries: {count}/{expected}
  issues: [any problems found]
```
