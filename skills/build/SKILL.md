---
name: build
description: Context-isolated feature development pipeline. Takes a detailed design/plan as argument and executes the full feature-dev lifecycle (explore, question, architect, implement, review, ship) inside subagents so the primary conversation stays compact. Use when you have a well-defined plan and want autonomous execution with minimal context window consumption.
argument-hint: <plan text or spec file path> [--skip-questions] [--skip-review] [--no-ship] [--parallel-impl]
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, TaskCreate, TaskUpdate, TaskGet, TaskList
---

# Build - Context-Isolated Feature Development

When this skill is invoked, IMMEDIATELY output the banner below before doing anything else.
Pick ONE tagline at random — vary your choice each time.
CRITICAL: Reproduce the banner EXACTLY character-for-character. The first line of the art has 4 leading spaces — you MUST preserve them.

```
{tagline}

⠀   ██╗██████╗ ██╗   ██╗██╗██╗     ██████╗
   ██╔╝██╔══██╗██║   ██║██║██║     ██╔══██╗
  ██╔╝ ██████╔╝██║   ██║██║██║     ██║  ██║
 ██╔╝  ██╔══██╗██║   ██║██║██║     ██║  ██║
██╔╝   ██████╔╝╚██████╔╝██║███████╗██████╔╝
╚═╝    ╚═════╝  ╚═════╝ ╚═╝╚══════╝╚═════╝
```

Taglines:
- ⚙️ Compiling hopes and dreams...
- 🏗️ Bob the Builder has entered the chat!
- 🤖 Assembling the Voltron of code!
- 🏭 Feature factory: ONLINE
- ☕ Hold my coffee, I'm building!
- 📦 Some assembly required...
- 🧱 Bricks, mortar, and semicolons!
- 🏎️ Let's see what this baby can do!

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

Execute a detailed design/plan through the full feature-dev lifecycle with
maximum context isolation. Every heavy stage runs in a subagent so the primary
conversation only accumulates structured reports.

Stage prompts: `references/stage-prompts.md`
Report budgets: `references/report-contracts.md`
Agent selection: `references/architecture-notes.md`
Project detection: `references/project-detection.md`

## Flags

Parse optional flags from the request:
- `--skip-questions`: Skip Stage 2 (clarifying questions)
- `--skip-review`: Skip Stage 5 (code review)
- `--no-ship`: Stop after Stage 8 docs update
- `--parallel-impl`: Split implementation into parallel agents when independent
- `--no-superpowers`: Force the standalone pipeline even when Superpowers is installed
- `--handoff`: Skip the execution-mode question and hand off to a clean session
- `--no-handoff`: Skip the execution-mode question and run here now

---

## Pre-flight

Before starting, check all dependencies in this table:

| Dependency | Type | Check | Required | Resolution | Detail |
|-----------|------|-------|----------|------------|--------|
| ship | skill | `ls .claude/skills/ship/SKILL.md ~/.claude/skills/ship/SKILL.md ~/.claude/plugins/marketplaces/slamb2k/skills/ship/SKILL.md 2>/dev/null` | yes | stop | Install with: npx skills add slamb2k/mad-skills --skill ship |
| prime | skill | `ls .claude/skills/prime/SKILL.md ~/.claude/skills/prime/SKILL.md ~/.claude/plugins/marketplaces/slamb2k/skills/prime/SKILL.md 2>/dev/null` | no | fallback | Context loading; falls back to manual CLAUDE.md/goals scan |
| feature-dev:code-explorer | agent | — | no | fallback | Uses general-purpose agent |
| feature-dev:code-architect | agent | — | no | fallback | Uses general-purpose agent |
| feature-dev:code-reviewer | agent | — | no | fallback | Uses general-purpose agent |
| superpowers | plugin | on-disk glob via scripts/lib/superpowers.js | no | fallback | Routes Stage 4 impl core to superpowers:executing-plans / subagent-driven-development when present; see references/superpowers-deferral.md |
| handover | skill | `ls .claude/skills/handover/SKILL.md ~/.claude/skills/handover/SKILL.md 2>/dev/null` | no | fallback | Powers the "hand off to a clean session" execution mode; if absent, that option is not offered |

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

1. Capture **PLAN** (the user's argument) and **FLAGS**
2. **Clear pending-build marker** — if a marker was left by `/speccy`, clear it:
   ```bash
   PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/marketplaces/slamb2k}"
   node -e "require('$PLUGIN_ROOT/hooks/lib/state.cjs').clearPendingBuild(process.cwd())"
   ```
3. **Load project context** — invoke `/prime` to load domain-specific context
   (CLAUDE.md, specs, memory). If /prime is unavailable, fall back to
   manually scanning CLAUDE.md and specs/ directory.
4. Detect project type using `references/project-detection.md` to populate
   **PROJECT_CONFIG** (language, test_runner, test_setup)
5. **Create task list** — ALWAYS create tasks upfront for all stages using
   `TaskCreate`. This provides visible progress tracking throughout the build:
   - Task: "Stage 1: Explore codebase"
   - Task: "Stage 2: Clarifying questions" (if not `--skip-questions`)
   - Task: "Stage 3: Architecture design"
   - Task: "Stage 4: Implementation"
   - Task: "Stage 5: Code review" (if not `--skip-review`)
   - Task: "Stage 7: Verify"
   - Task: "Stage 9: Ship" (if not `--no-ship`)
   Mark each task `in_progress` when starting and `completed` when done.
6. Check for outstanding items from previous work:
   - Query persistent tasks via `TaskList` for incomplete items
   - Search CLAUDE.md for a "Known Issues" or "Open Questions" section
   - Search memory (if available) for recent unresolved items
7. If outstanding items found, present via AskUserQuestion:
   ```
   "Found {count} outstanding items from previous work:"
   {numbered list with summary of each}
   "Address any of these before starting the build?"
   ```
   Options:
   - **"Yes, let me choose which ones"** → present each; options:
     "Incorporate into this build" / "Skip for now" / "Explain more"
     Items marked "incorporate" get appended to the PLAN as additional
     requirements for Stage 1 to explore.
   - **"No, proceed with the build"** → continue normally
---

## Plan Resolution

Before Stage 1, resolve the PLAN argument into content:

1. **File detection** — If the argument contains `/` or ends with
   `.md`, `.yaml`, `.json`, or `.txt`, treat it as a file path:
   - Try reading the path as-is
   - If not found, try `specs/{arg}`
   - If found, use file content as PLAN
   - If not found at any location, treat the original argument as free-form text
2. **Free-form text** — If not a file path (or file not found), use the argument
   verbatim as PLAN
3. **Display** — In the Input box, show the resolved source:
   - File: `Plan: {file path} ({line count} lines)`
   - Text: `Plan: inline ({word count} words)`

## Pre-Build Branch Check

Before starting Stage 1, verify the working tree is suitable for building:

1. **Detect current branch and default branch:**
   ```bash
   CURRENT=$(git branch --show-current)
   DEFAULT_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
   DEFAULT_BRANCH="${DEFAULT_BRANCH:-main}"
   git fetch origin "$DEFAULT_BRANCH" --quiet 2>/dev/null
   ```

2. **If on a feature branch** (not `main`/`master`/default):
   ```bash
   BEHIND=$(git rev-list --count HEAD..origin/"$DEFAULT_BRANCH" 2>/dev/null || echo 0)
   ```
   If `BEHIND > 0`, warn the user via `AskUserQuestion`:
   ```
   "You're on branch '{CURRENT}' which is {BEHIND} commits behind {DEFAULT_BRANCH}.
   Starting a new feature here risks divergent branches and complex rebases."
   ```
   Options:
   - "Switch to main first (Recommended)" — run `/sync`, then create a new branch
   - "Continue on this branch" — proceed (user accepts the risk)
   - "Cancel" — stop

3. **If on the default branch** and not up to date:
   ```bash
   LOCAL=$(git rev-parse "$DEFAULT_BRANCH")
   REMOTE=$(git rev-parse "origin/$DEFAULT_BRANCH")
   ```
   If `LOCAL != REMOTE`, run `/sync` automatically before proceeding.

---

## Execution Mode

`/build` runs every heavy stage in subagents, so the primary conversation stays
compact *during* the build. The one thing subagents can't fix is a context
window that's **already** large when you invoke `/build` — the orchestrator
(this thread) still reads reports and runs the review/ship loop on top of
whatever came before. For that, a clean start beats a clean middle.

So there is exactly one execution-mode decision, and subagents are always on
underneath either choice:

- **Run here now** — orchestrate the build in this session, stages in subagents.
- **Hand off to a clean session** — write a handover, arm the resume signal, and
  let a fresh session run the *same* `/build` with its own subagents.

These are mutually exclusive — one stops here, one continues here. Do **not**
offer a "clear? yes/no" toggle on top of run-now; the handover mode *replaces*
the run-now decision.

**Resolve the mode:**

1. If `--no-handoff` → run here now. Skip to Stage 1.
2. If `--handoff` → hand off (only if the handover skill exists; else warn it's
   unavailable and run here now).
3. If the handover skill is **not** installed (pre-flight) → run here now
   silently. No question.
4. Otherwise, decide whether to *offer* the hand-off at all. Only offer it when a
   clean start would actually help **and** the plan can survive the reset:
   - **Context already large** — this session has had substantial prior work
     before `/build` (long conversation, many file reads, a prior task), so the
     orchestrator would start bloated. A fresh `/build` invocation in an empty
     session does not need this — just run here now.
   - **Plan is self-contained** — PLAN is a spec file or a complete written plan
     that a handover doc can capture losslessly. If the plan leans on nuance from
     *this* conversation (decisions made live, things looked at together), a
     handover is lossy — prefer run-here-now so that context isn't thrown away.

   If **both** hold, ask via `AskUserQuestion`:
   ```
   "This session already carries significant context. Hand this build off to a
   clean session, or run it here now?"
   ```
   Options:
   - **"Run here now (Recommended)"** — orchestrate in this session (subagents underneath).
   - **"Hand off to a clean session"** — reset context, resume the build fresh.

   If either condition fails, don't ask — run here now.

**If handing off:** capture the resolved PLAN and any Stage-2 clarifications
gathered so far, then invoke the `handover` skill. The handover document's
"next steps" MUST be a single resume action: re-run this exact build in the
fresh session, e.g. `/build {original PLAN argument}` (plus any active flags,
minus `--handoff`). Include the resolved plan content and PROJECT_CONFIG so the
fresh session doesn't re-derive them. The handover skill arms the one-shot
signal and tells the user to `/clear`. **Stop here** — do not run Stage 1; the
fresh session does.

**If running here now:** continue to Stage 1 unchanged.

---

## Stage 1: Explore

Launch **feature-dev:code-explorer** (fallback: general-purpose):

```
Task(
  subagent_type: "feature-dev:code-explorer",
  description: "Explore codebase for build plan",
  prompt: <read from references/stage-prompts.md#stage-1>
)
```

Substitute `{PLAN}` into the prompt.
Parse EXPLORE_REPORT. Extract `questions` for Stage 2.

---

## Stage 2: Clarifying Questions

**Skip if `--skip-questions` or no questions found.**

Runs on the **primary thread** (requires user interaction).

1. Review EXPLORE_REPORT `questions` and `potential_issues`
2. Present questions to user via AskUserQuestion
3. Store answers as CLARIFICATIONS

---

## Stage 3: Architecture Design

Launch **feature-dev:code-architect** (fallback: general-purpose):

```
Task(
  subagent_type: "feature-dev:code-architect",
  description: "Design implementation architecture",
  prompt: <read from references/stage-prompts.md#stage-3>
)
```

Substitute `{PLAN}`, `{EXPLORE_REPORT}`, `{CLARIFICATIONS}`.
Parse ARCH_REPORT. Present `approach_summary` to user for confirmation.

If rejected, incorporate feedback and re-run.

---

## Stage 4: Implementation

**Superpowers deferral (soft dependency):** When Superpowers is detected (per the
pre-flight check) and `--no-superpowers` is not set, announce
`⚡ Superpowers detected — deferring plan/implement core to superpowers:executing-plans`
and route the plan-execution/implementation core through
`superpowers:executing-plans` / `superpowers:subagent-driven-development` instead
of the general-purpose subagents below. Stage 1 (explore), Stage 5 (3× review),
and Stage 7 (verify) remain unchanged either way. When Superpowers is absent or
`--no-superpowers` is set, run the standalone implementation below unchanged.
See `references/superpowers-deferral.md`.

If ARCH_REPORT identifies independent `parallel_groups`, launch **multiple
general-purpose subagents in parallel** — one per group. Do NOT wait for
`--parallel-impl` flag; parallel execution is the **default** when the
architecture supports it. The flag is retained only as an explicit override.

If the architecture has no independent groups, launch **one general-purpose
subagent**:

```
Task(
  subagent_type: "general-purpose",
  description: "Implement plan",
  prompt: <read from references/stage-prompts.md#stage-4>
)
```

Substitute `{PLAN}`, `{ARCH_REPORT}`, conventions, `{PROJECT_CONFIG.test_runner}`.
Parse IMPL_REPORT(s). If any failed, assess retry or abort.

---

## Stage 5: Code Review

**Skip if `--skip-review`.**

Launch **3 feature-dev:code-reviewer subagents in parallel** (fallback: general-purpose):

1. Simplicity & DRY
2. Bugs & Correctness
3. Conventions & Integration

Prompts in `references/stage-prompts.md#stage-5`.

Consolidate reports. Present **only critical and high severity findings**.
Ask: "Fix these now, or proceed as-is?"

---

## Stage 6: Fix Review Findings

**Only if Stage 5 found issues AND user wants them fixed.**

Launch **general-purpose subagent**:

```
Task(
  subagent_type: "general-purpose",
  description: "Fix review findings",
  prompt: <read from references/stage-prompts.md#stage-6>
)
```

---

## Stage 7: Verify

Launch **Bash subagent** (haiku):

```
Task(
  subagent_type: "Bash",
  model: "haiku",
  description: "Run verification tests",
  prompt: <read from references/stage-prompts.md#stage-7>
)
```

Substitute `{PROJECT_CONFIG.test_runner}` and `{PROJECT_CONFIG.test_setup}`.

If tests fail:
- First failure: launch general-purpose agent to fix, retry
- Second failure: report to user and stop

---

## Stage 8: Update Progress Documentation

**Skip if EXPLORE_REPORT has no `source_docs`.**

Launch **general-purpose subagent**:

```
Task(
  subagent_type: "general-purpose",
  description: "Update progress documentation",
  prompt: <read from references/stage-prompts.md#stage-8>
)
```

**If `--no-ship`: Stop here and present final summary.**

---

## Stage 9: Ship

Invoke the `/ship` skill:

```
/ship {approach_summary from ARCH_REPORT}. Files: {files from IMPL_REPORT}
```

---

## Stage 10: Debrief

**Always runs** on the primary thread (requires user interaction).

1. Scan all stage reports for unresolved items:
   - EXPLORE_REPORT: `potential_issues` not addressed by implementation
   - ARCH_REPORT: `risks` with deferred mitigations
   - REVIEW_REPORT: `medium`/`low` findings not fixed in Stage 6
   - TEST_REPORT: warnings, skipped tests, flaky results
   - DOCS_REPORT: `docs_skipped` items
   - IMPL_REPORT: `issues_encountered` that were worked around

2. Compile into DEBRIEF_ITEMS (see `references/stage-prompts.md#stage-10`).
   Categorise each as: unresolved_risk, deferred_fix, open_question,
   assumption, or tech_debt.

3. **If no items found, skip to Final Report.**

4. Present numbered summary via AskUserQuestion grouped by category.
   Each item shows: `[category] summary (effort)`.

   Options:
   - **"Fix now"** → create a task list of resolution activities for
     each item; present for user confirmation, then work through them
   - **"Create tasks for future sessions"** → use `TaskCreate` for each
     item as a persistent task, with category as prefix and suggested
     action as description
   - **"Note and continue"** → acknowledge items without formal tracking;
     log to memory (if exists) or as source file comments. No further action.
   - **"Let me choose per item"** → present each individually with full
     description, evidence, and impact. Options per item:
     "Fix now" / "Create task" / "Explain more" / "Note and continue".
     "Explain more" reads source files cited in evidence, provides
     expanded context, then re-presents the item for decision.

5. After resolution, include debrief summary in the Final Report.

---

## Final Report

```
┌─ Build · Report ───────────────────────────────
│
│  ✅ Build complete
│
│  📋 Plan:      {first line of plan}
│  🏗️ Approach:  {approach_summary}
│
│  📝 Changes
│     Files modified:  {count}
│     Files created:   {count}
│     Tests:           {passed}/{total} ✅
│     Docs updated:    {count or "none"}
│
│  🔍 Review
│     Findings addressed: {count fixed} / {count found}
│
│  📊 Debrief: {count resolved} / {count surfaced}
│     {list of created tasks}
│
│  🔗 Links
│     PR:  {pr_url}
│     CI:  {merge_commit}
│
│  ⚡ Next steps
│     {debrief items or "none — all clear"}
│
└─────────────────────────────────────────────────
```

If any stage failed, report the failure point and what was accomplished.

### Pipeline Summary

When `/build` was invoked as part of a chained pipeline (e.g., from `/speccy`),
emit a concise **Pipeline Summary** after the Final Report. This gives an
at-a-glance view of the entire end-to-end process:

```
┌─ Pipeline Summary ─────────────────────────────
│
│  {icon} Spec       {spec file or "inline plan"}
│  {icon} Explore    {files identified count}
│  {icon} Questions  {answered or "skipped"}
│  {icon} Architect  {approach one-liner}
│  {icon} Implement  {files changed summary}
│  {icon} Review     {findings summary}
│  {icon} Verify     {test result}
│  {icon} Ship       {PR link} → {merge commit}
│
└─────────────────────────────────────────────────
```

Use ✅ for completed stages, ⏭️ for skipped, ❌ for failed.

**Always emit this summary** — even when `/build` was invoked directly (not
from `/speccy`). It serves as a compact status line for any multi-stage build,
regardless of how it was triggered.

---

## Rollback

If implementation succeeds but later stages fail:
- Tests fail: fix agent attempts repair, then reports to user
- Review critical: user decides fix or proceed
- Ship fails: code is still committed locally; user can manually push
- Never silently revert completed implementation work
