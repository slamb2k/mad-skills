---
name: brace
description: 'Initialize any project directory with a standard scaffold for AI-assisted development. Creates specs/ and context/ directories, a project CLAUDE.md with development workflow and guardrails, .gitignore, and branch protection. Idempotent — safe to run on existing projects. Triggers: "init project", "setup brace", "brace", "initialize", "bootstrap", "scaffold".'
argument-hint: "[--force]"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion
---

# Brace - Project Scaffold

When this skill is invoked, IMMEDIATELY output the banner below before doing anything else.
Pick ONE tagline at random — vary your choice each time.
CRITICAL: Reproduce the banner EXACTLY character-for-character. The first line of the art has 4 leading spaces — you MUST preserve them.

```
{tagline}

⠀   ██╗██████╗ ██████╗  █████╗  ██████╗███████╗
   ██╔╝██╔══██╗██╔══██╗██╔══██╗██╔════╝██╔════╝
  ██╔╝ ██████╔╝██████╔╝███████║██║     █████╗
 ██╔╝  ██╔══██╗██╔══██╗██╔══██║██║     ██╔══╝
██╔╝   ██████╔╝██║  ██║██║  ██║╚██████╗███████╗
╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚══════╝
```

Taglines:
- 🏗️ Bracing the structure...
- 💪 Reinforcing before load!
- 🔒 Locking in the framework!
- 🏋️ Preparing for heavy lifting!
- 🧱 Cross-bracing the foundation!
- 🔧 Tightening the load path!
- ✅ Structural integrity confirmed!
- 💥 Brace for impact!

---

## Output Formatting

After the banner, display parsed input:
```
┌─ Input ────────────────────────────────────────
│  {Field}:  {value}
│  Flags:    {parsed flags or "none"}
└────────────────────────────────────────────────
```

Pre-flight results:
```
── Pre-flight ───────────────────────────────────
  ✅ {dep}           {version or "found"}
  ⚠️ {dep}           not found → {fallback detail}
  ❌ {dep}           missing → stopping
──────────────────────────────────────────────────
```

Stage/phase headers: `━━ {N} · {Name} ━━━━━━━━━━━━━━━━━━━━━━━━━`

Status icons: ✅ done · ❌ failed · ⚠️ degraded · ⏳ working · ⏭️ skipped

---

Initialize any project directory with a standard scaffold for AI-assisted
development. Idempotent — safe to re-run on existing projects. Content
templates and subagent prompts are in `references/`.

**Key principle:** Scan first, present plan, get approval, then act.

Phase prompts: `references/phase-prompts.md`
Scaffold manifest: `references/scaffold-manifest.md`
Report format: `references/report-template.md`

---

## Flags

Parse optional flags from the request:
- `--force` — Overwrite existing files without prompting

---

## Pre-flight

Before starting, check all dependencies in this table:

| Dependency | Type | Check | Required | Resolution | Detail |
|-----------|------|-------|----------|------------|--------|
| oh-my-claudecode | plugin | — | no | ask | `claude plugin install oh-my-claudecode` |
| superpowers | plugin | on-disk glob via scripts/lib/superpowers.js | no | ask | `claude plugin install superpowers` |

For each row, in order:
1. Run the Check command (for cli/npm) or test file existence (for agent/skill)
2. If found: continue silently
3. If missing: apply Resolution strategy
   - **stop**: notify user with Detail, halt execution
   - **url**: notify user with Detail (install link), halt execution
   - **install**: notify user, run the command in Detail, continue if successful
   - **ask**: notify user, offer to run command in Detail, continue either way (or halt if required)
   - **fallback**: notify user with Detail, continue with degraded behavior
4. After all checks: summarize what's available and what's degraded

**Plugin detection:** For plugin dependencies (Type = plugin), check
`~/.claude/settings.json` → `enabledPlugins` for a key containing the plugin
name set to `true`.

**Superpowers detection differs:** Superpowers is a soft dependency detected via
the on-disk glob helper `scripts/lib/superpowers.js` (anchor file
`using-superpowers/SKILL.md`), **not** the `enabledPlugins` settings.json check
used for OMC — see `references/superpowers-deferral.md`.

1. Capture **FLAGS** from the user's request

---

## Phase 1: Directory Scan

Launch **general-purpose** subagent (bash) (**haiku**):

```
Task(
  subagent_type: "general-purpose",
  model: "haiku",
  description: "Scan directory for existing scaffold structure",
  prompt: <read from references/phase-prompts.md#phase-1>
)
```

Parse SCAN_REPORT. Extract:
- `directory_name` (used as default project name)
- `existing_dirs` / `missing_dirs`
- `existing_files` / `missing_files`
- `has_claude_md` / `has_gitignore`
- `has_atlas` (legacy ATLAS naming detected)
- `has_forge` (legacy FORGE naming detected)
- `has_legacy_gotcha` (legacy GOTCHA/goals structure detected)
- `has_legacy_memory` (old tools/memory system detected)

---

## Phase 1b: Legacy Upgrade Detection

**Skip if none of `has_atlas`, `has_forge`, `has_legacy_gotcha`, or `has_legacy_memory` is true.**

Build a description of what was found:
- If `has_atlas` or `has_forge`: "Legacy ATLAS/FORGE naming detected"
- If `has_legacy_gotcha`: "Legacy GOTCHA/BRACE framework detected (goals/ directory)"
- If `has_legacy_memory`: "Legacy memory system (tools/memory/, memory/) detected"

Ask the user via AskUserQuestion:

   Question: "Legacy components detected: {description}. Upgrade and clean up?"
   Options:
   - "Yes, upgrade all" — Replace legacy structure and remove old systems
   - "No, leave as-is" — Keep existing structure

Store result as `upgrade_legacy: true|false` in USER_CONFIG.

---

## Phase 2: Project Inquiry

**Runs on primary thread** (user interaction required).

1. Derive default project name from SCAN_REPORT `directory_name`
2. Present via AskUserQuestion:

   Question: "Set up project scaffold?"
   Options:
   - "Full scaffold (Recommended)" — CLAUDE.md, directories, guardrails
   - "Cancel"

3. If not cancelled, ask for project description (one sentence) via
   AskUserQuestion with free text.

4. Ask installation level via AskUserQuestion:

   Question: "Install universal guidance (preferences, principles) at user level?"
   Options:
   - "Yes, install globally (Recommended)" — applies to all projects via `~/.claude/CLAUDE.md`
   - "No, project level only" — self-contained in this project's CLAUDE.md

5. Store as USER_CONFIG:
   - project_name: from directory name or user override
   - description: from user input
   - install_level: "global" | "project"

**If cancelled, stop here.**

---

## Phase 3: Present Plan & Approve

Build the ACTION_PLAN from SCAN_REPORT + USER_CONFIG + FLAGS.

For each item in `references/scaffold-manifest.md`:
- If component not selected in USER_CONFIG → status: "not selected"
- If item already exists (from SCAN_REPORT) and no `--force` → status: "skip"
- If item exists and `--force` → status: "overwrite"
- If CLAUDE.md exists → status: "merge" (append scaffold sections)
- If .gitignore exists → status: "merge" (append missing entries)
- Otherwise → status: "create"

If `upgrade_legacy` is true in USER_CONFIG, set status "upgrade" for:
- CLAUDE.md (replaces "merge" or "skip" — upgrade takes priority)

If `upgrade_legacy` is true AND `has_legacy_gotcha` is true, additionally:
- `goals/` → status: "remove" (only if contains only manifest.md and build_app.md)

If `upgrade_legacy` is true AND `has_legacy_memory` is true, additionally:
- `tools/memory/` → status: "remove"
- `memory/` → status: "remove"
- `tools/manifest.md` → status: "cleanup" (remove memory tool rows)
- `.gitignore` → status: "cleanup" (remove memory/*.npy entry)

Present plan summary to user via AskUserQuestion:

```
Project Scaffold for: {project_name}

Will create:  {list of items with status "create"}
Will merge:   {list of items with status "merge"}
Will upgrade: {list of items with status "upgrade"}
Will remove:  {list of items with status "remove" — legacy cleanup}
Will clean:   {list of items with status "cleanup" — remove legacy references}
Will skip:    {count} existing items
Universal guidance: {install_level description}

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
  description: "Create project scaffold structure",
  prompt: <read from references/phase-prompts.md#phase-4>
)
```

Before sending the prompt, substitute these variables:
- `{ACTION_PLAN}` — the action plan from Phase 3
- `{PROJECT_NAME}` — from USER_CONFIG
- `{PROJECT_DESCRIPTION}` — from USER_CONFIG
- `{INSTALL_LEVEL}` — from USER_CONFIG ("global" or "project")
- `{CLAUDE_MD_TEMPLATE}` — read from `references/claude-md-template.md`
  (the section between BEGIN TEMPLATE and END TEMPLATE)
- `{GITIGNORE_CONTENT}` — read from `assets/gitignore-template`
- `{GLOBAL_PREFERENCES_CONTENT}` — read from `assets/global-preferences-template.md`
  (the section between BEGIN TEMPLATE and END TEMPLATE)

Parse SCAFFOLD_REPORT. If status is "failed", report to user and stop.

### Branch Discipline Injection

When updating an existing project CLAUDE.md (not creating from template):

1. Check if `## Branch Discipline` already exists:
   ```bash
   grep -q "## Branch Discipline" CLAUDE.md
   ```
2. If NOT found, inject the Branch Discipline section before `## Guardrails`:
   - Read the file content
   - Find the line containing `## Guardrails`
   - Insert the Branch Discipline section (from the template) immediately before it
   - If no `## Guardrails` section exists, append the section at the end of the file
3. If already present, skip (idempotent)

### Worktree Discipline Injection

When updating an existing project CLAUDE.md (not creating from template):

1. Check if `## Worktree Discipline` already exists:
   ```bash
   grep -q "## Worktree Discipline" CLAUDE.md
   ```
2. If NOT found, inject the Worktree Discipline section before `## Guardrails`:
   - Read the file content
   - Find the line containing `## Guardrails`
   - Insert the Worktree Discipline section (from the template) immediately before it
   - If no `## Guardrails` section exists, append the section at the end of the file
3. If already present, skip (idempotent)

---

## Phase 5: Verification & Report

Launch **general-purpose** subagent (bash) (**haiku**):

```
Task(
  subagent_type: "general-purpose",
  model: "haiku",
  description: "Verify project scaffold",
  prompt: <read from references/phase-prompts.md#phase-5>
)
```

Parse VERIFY_REPORT. Present the final summary using the format in
`references/report-template.md`.

---

## Phase 6: Branch Protection

**Only if the project is a git repo** (from SCAN_REPORT `git_initialized`).

Detect the default branch and hosting platform (GitHub, Azure DevOps, or
unknown). Platform detection and all CLI/REST commands are in
`references/branch-protection-steps.md`.

### Flow

1. Detect platform from `git remote get-url origin`
2. **GitHub:** Check existing protection via `gh api`. If unprotected, ask via
   AskUserQuestion:
   - "Yes, require PR reviews (team project — Recommended)" — require 1 approval, block force push + deletion
   - "Yes, protect branch without review requirement (solo project)" — block force push + deletion, no reviewer gate so `/ship` squash-merges without `--admin`
   - "Skip" — leave unprotected
3. **Azure DevOps:** Extract org/project from remote URL. Check existing
   policies via `az repos` CLI or REST fallback. If no minimum reviewer
   policy, ask via AskUserQuestion:
   - "Yes, require PR reviews (team project — Recommended)" — 1 approver, creator votes do not count
   - "Yes, PR required, author can self-approve (solo project)" — same approver policy but `creator-vote-counts=true` so the author's own vote satisfies the gate
   - "Skip" — no policy applied
4. **Unknown platform:** Skip and report.

Apply the variant matching the user's choice using the procedures in
`references/branch-protection-steps.md` (see "Apply protection — team
project" vs "Apply protection — solo project" for each platform).

Include result in the final report under a "🔒 Branch protection" section,
labelled with the chosen variant (team / solo / skipped).

---

## Lifecycle Recommendation

After presenting the report, record lifecycle completion and surface the next step:
```bash
_R="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/marketplaces/slamb2k}"
node "$_R/hooks/session-guard.cjs" lifecycle-complete brace
```
If the command prints a `LIFECYCLE_OFFER_BEGIN…END` block, present that offer to
the user via AskUserQuestion as instructed inside the block. If it prints nothing
(or `LIFECYCLE_OFFER_NONE`), do not mention the lifecycle engine.

---

## Idempotency Rules

- **Skip** directories and files that already exist (unless `--force`)
- **Merge** CLAUDE.md: append scaffold sections if file exists but lacks them
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
