# Forge Instructions

Initialize any project directory with the GOTCHA/FORGE framework. Idempotent —
safe to re-run on existing projects. Content templates and subagent prompts
are in `references/`.

**Key principle:** Scan first, present plan, get approval, then act.

Phase prompts: `references/phase-prompts.md`
Scaffold manifest: `references/scaffold-manifest.md`
Report format: `references/report-template.md`

---

## Flags

Parse optional flags from the request:
- `--no-forge` — Skip FORGE build methodology (goals/build_app.md)
- `--force` — Overwrite existing files without prompting

---

## Pre-flight

1. Capture **FLAGS** from the user's request
2. Create a task list tracking all 5 phases

---

## Phase 1: Directory Scan

Launch **Bash** subagent (**haiku**):

```
Task(
  subagent_type: "Bash",
  model: "haiku",
  description: "Scan directory for existing GOTCHA structure",
  prompt: <read from references/phase-prompts.md#phase-1>
)
```

Parse SCAN_REPORT. Extract:
- `directory_name` (used as default project name)
- `existing_dirs` / `missing_dirs`
- `existing_files` / `missing_files`
- `has_claude_md` / `has_gitignore`
- `has_atlas` (legacy ATLAS naming detected)

---

## Phase 1b: ATLAS Upgrade Detection

**Skip if `has_atlas` is false.**

If SCAN_REPORT shows `has_atlas: true`, ask the user via AskUserQuestion:

   Question: "Legacy ATLAS naming detected. Upgrade to FORGE?"
   Options:
   - "Yes, upgrade to FORGE" — Replace ATLAS references with FORGE equivalents
   - "No, leave as-is" — Keep existing ATLAS naming

Store result as `upgrade_atlas: true|false` in USER_CONFIG.

---

## Phase 2: Project Inquiry

**Runs on primary thread** (user interaction required).

1. Derive default project name from SCAN_REPORT `directory_name`
2. Present via AskUserQuestion:

   Question: "What to include in GOTCHA setup?"
   Options:
   - "Full GOTCHA + FORGE (Recommended)"
   - "GOTCHA structure only (no FORGE methodology)"
   - "Cancel"

3. If not cancelled, ask for project description (one sentence) via
   AskUserQuestion with free text.

4. Ask installation level via AskUserQuestion:

   Question: "Where should global preferences and universal principles go?"
   Options:
   - "Both — global + project (Recommended)" → portable AND global coverage
   - "Global (~/.claude/CLAUDE.md) only" → applies to all projects
   - "Project level only" → self-contained, portable

5. Store as USER_CONFIG:
   - project_name: from directory name or user override
   - description: from user input
   - include_forge: true/false (based on selection and `--no-forge`)
   - install_level: "both" | "global" | "project"

**If cancelled, stop here.**

---

## Phase 3: Present Plan & Approve

Build the ACTION_PLAN from SCAN_REPORT + USER_CONFIG + FLAGS.

For each item in `references/scaffold-manifest.md`:
- If component not selected in USER_CONFIG → status: "not selected"
- If item already exists (from SCAN_REPORT) and no `--force` → status: "skip"
- If item exists and `--force` → status: "overwrite"
- If CLAUDE.md exists → status: "merge" (append GOTCHA section)
- If .gitignore exists → status: "merge" (append missing entries)
- Otherwise → status: "create"

If `upgrade_atlas` is true in USER_CONFIG, set status "upgrade" for:
- CLAUDE.md (replaces "merge" or "skip" — upgrade takes priority)
- goals/build_app.md (replaces "skip")
- goals/manifest.md (replaces "skip")

Present plan summary to user via AskUserQuestion:

```
GOTCHA Framework Setup for: {project_name}

Will create:  {list of items with status "create"}
Will merge:   {list of items with status "merge"}
Will upgrade: {list of items with status "upgrade" — ATLAS → FORGE}
Will skip:    {count} existing items
Not selected: {count} items
Global config: {install_level description}

Proceed?
```

Options: "Yes, proceed" / "Cancel"

**If cancelled, stop here.**

---

## Phase 4: Scaffold Structure

Launch **general-purpose** subagent:

```
Task(
  subagent_type: "general-purpose",
  description: "Create GOTCHA framework structure",
  prompt: <read from references/phase-prompts.md#phase-4>
)
```

Before sending the prompt, substitute these variables:
- `{ACTION_PLAN}` — the action plan from Phase 3
- `{PROJECT_NAME}` — from USER_CONFIG
- `{PROJECT_DESCRIPTION}` — from USER_CONFIG
- `{INSTALL_LEVEL}` — from USER_CONFIG ("both", "global", or "project")
- `{CLAUDE_MD_TEMPLATE}` — read from `references/claude-md-template.md`
  (the section between BEGIN TEMPLATE and END TEMPLATE)
- `{GITIGNORE_CONTENT}` — read from `assets/gitignore-template`
- `{GOALS_MANIFEST}` — read from `references/scaffold-manifest.md`
  (the goals/manifest.md content block)
- `{TOOLS_MANIFEST}` — read from `references/scaffold-manifest.md`
  (the tools/manifest.md content block)
- `{FORGE_WORKFLOW}` — read from `references/forge-workflow.md`
  (the section after the header, used for goals/build_app.md)
- `{GLOBAL_PREFERENCES_CONTENT}` — read from `assets/global-preferences-template.md`
  (the section between BEGIN TEMPLATE and END TEMPLATE)

Parse SCAFFOLD_REPORT. If status is "failed", report to user and stop.

---

## Phase 5: Verification & Report

Launch **Bash** subagent (**haiku**):

```
Task(
  subagent_type: "Bash",
  model: "haiku",
  description: "Verify GOTCHA structure",
  prompt: <read from references/phase-prompts.md#phase-5>
)
```

Parse VERIFY_REPORT. Present the final summary using the format in
`references/report-template.md`.

---

## Idempotency Rules

- **Skip** directories and files that already exist (unless `--force`)
- **Merge** CLAUDE.md: append GOTCHA section if file exists but lacks it
- **Merge** .gitignore: append missing entries only
- **Never delete** user content
- **Never overwrite** without `--force` or explicit user approval

---

## Error Handling

Standard escalation pattern:
1. If retryable (permission issue after mkdir): retry once
2. If persistent: report to user with specific error
3. Offer: skip and continue / abort
4. Never silently swallow errors

Common issues:
- Permission denied → report, suggest checking directory permissions
- CLAUDE.md merge conflict → show both versions, let user choose
- Directory is read-only → abort with clear message
