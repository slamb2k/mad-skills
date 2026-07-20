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
- `--auto`: Autonomous end-to-end run against an `autonomy_ready: true` spec, no
  interactive interruption — dispatch only, see `references/autonomous-pipeline.md`.
  Caps (flag/env/default, any hit forces stop-and-report): `--iterations`/`BUILD_AUTO_ITERATIONS`/20, `--budget`/`BUILD_AUTO_BUDGET`/5M, wall-clock/`BUILD_AUTO_WALLCLOCK`/4h.

---

## Pre-flight

Before starting, check all dependencies in this table:

| Dependency | Type | Check | Required | Resolution | Detail |
|-----------|------|-------|----------|------------|--------|
| ship | skill | `ls .claude/skills/ship/SKILL.md ~/.claude/skills/ship/SKILL.md ~/.claude/plugins/marketplaces/slamb2k/skills/ship/SKILL.md 2>/dev/null` | yes | stop | Install with: npx skills add slamb2k/mad-skills --skill ship |
| prime | skill | `ls .claude/skills/prime/SKILL.md ~/.claude/skills/prime/SKILL.md ~/.claude/plugins/marketplaces/slamb2k/skills/prime/SKILL.md 2>/dev/null` | no | fallback | Context loading; falls back to manual CLAUDE.md/goals scan |
| feature-dev | plugin | on-disk glob via scripts/lib/feature-dev.js | no | fallback | Detected on disk → try feature-dev:code-explorer / code-architect / code-reviewer first, general-purpose agent as fallback if the subagent_type isn't actually registered |
| superpowers | plugin | on-disk glob via scripts/lib/superpowers.js | no | fallback | Routes Stage 4 impl core to superpowers:executing-plans / subagent-driven-development when present; see references/superpowers-deferral.md |
| ferry | skill | `ls .claude/skills/ferry/SKILL.md ~/.claude/skills/ferry/SKILL.md ~/.claude/plugins/marketplaces/slamb2k/skills/ferry/SKILL.md 2>/dev/null` | no | fallback | Powers the "hand off to a clean session" execution mode; ships with mad-skills, so normally present |

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

**If `--auto`:** verify `autonomy_ready: true` (`scripts/lib/frontmatter.js`) — on
failure STOP naming the missing gate items (AC-001, format in `references/autonomous-pipeline.md`), never fall back silently.

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

## Pre-Stage Setup

Before Stage 1, resolve the plan, check the branch, and pick the execution
mode — see `references/pre-stage.md` for the full procedure:

1. **Plan Resolution** — turn the PLAN argument into content (file path vs
   free-form text; display the resolved source in the Input box).
2. **Pre-Build Location Check** — run the shared root-mismatch check from
   `references/location-check.md`; warns via a blocking `AskUserQuestion` if
   Bash's cwd toplevel doesn't match the session's declared working
   directory, otherwise passes silently.
3. **Pre-Build Branch Check** — warn if on a stale feature branch; auto-`/sync`
   if on an out-of-date default branch.
4. **Execution Mode** — run here now (default) vs hand off to a clean session
   via `ferry` (only offered when context is already large *and* the plan is
   self-contained; `--handoff`/`--no-handoff` force it). Subagents are always on
   underneath either choice.

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

**If `--auto`:** SKIPPED by default (REQ-012, ambiguity resolved via the
assumption-authorization list) — `references/autonomous-pipeline.md`'s headless mechanism covers the rare uncovered decision.

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

**If `--auto`:** implementation subagents MUST use Sonnet (REQ-013, other
stages keep interactive-default tiers) and this stage never defers to
Superpowers — see `references/autonomous-pipeline.md`'s Model tiering section.

**Superpowers deferral (soft dependency, interactive mode only):** When Superpowers is detected (per the
pre-flight check) and `--no-superpowers` is not set, announce
`⚡ Superpowers detected — deferring plan/implement core to superpowers:executing-plans`
and route the plan-execution/implementation core through
`superpowers:executing-plans` / `superpowers:subagent-driven-development` instead
of the general-purpose subagents below. Stage 1 (explore), Stage 5 (3× review),
and Stage 7 (verify) remain unchanged either way. When Superpowers is absent or
`--no-superpowers` is set, run the standalone implementation below unchanged.
See `references/superpowers-deferral.md`.

**Skipping the deferral without `--no-superpowers`:** Superpowers'
`subagent-driven-development` skill hard-requires explicit user consent (and
prefers a fresh worktree) before implementing on the current branch;
mad-skills' own convention is to implement directly on the current branch and
let Stage 9 (`/ship`) handle branching, PR, and merge afterward. Those two
conventions conflict. When ARCH_REPORT describes a fully-specified, mechanical,
low-risk change (1-2 files, no design judgment needed — the same signal
`subagent-driven-development` itself uses for its cheapest model tier), that
conflict is license to skip the deferral for this Stage 4 only and run the
standalone implementation below even though Superpowers is detected. Announce
it in one line (`⚡ Superpowers detected but skipping deferral for Stage 4 —
<reason>`) so the choice is visible, not silent. Anything with real
multi-file integration concerns or genuine design ambiguity still defers as
normal — this is a narrow carve-out, not a general opt-out.

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

**If `--auto`:** skip the standard Stage 5–8 flow below — dispatch review-depth
selection, `/code-review` + `/security-review`, the fix loop, `/verify`,
evidence capture, and `/loop`/`/goal` guardrails per `references/autonomous-pipeline.md`.

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

Launch **general-purpose** subagent (bash) (haiku):

```
Task(
  subagent_type: "general-purpose",
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

**If `--auto`:** invoke `/ferry` to checkpoint before proceeding (GUD-004, `references/autonomous-pipeline.md`).

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

4. **Auto-capture into the Follow-ups Ledger (REQ-010 — always, not skippable).**
   Every surfaced item goes into the committed `LOGBOOK.md` so it survives
   `/clear`. This is frictionless by design — the old "note it and forget it"
   evaporation is the exact failure being fixed; capture is not gated on a
   choice. The ledger dedupes on entry, so re-surfaced items don't pile up.

   Build a JSON array (map each item's category to a ledger category —
   `unresolved_risk`/`deferred_fix`/`open_question`/`assumption`/`tech_debt` are
   accepted verbatim) and capture it:
   ```bash
   _R="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/marketplaces/slamb2k}"
   node "$_R/hooks/session-guard.cjs" logbook-capture \
     '[{"title":"…","category":"deferred_fix","source":"/build debrief"}, …]'
   ```
   Note any `evicted:[…]` in the output — mention evictions to the user (never
   silent, GUD-002).

5. **Display the existing open ledger (REQ-044)** alongside the new items, so the
   user reviews the whole backlog at the checkpoint where they're most likely to
   act:
   ```bash
   node "$_R/hooks/session-guard.cjs" logbook-list
   ```

6. Present numbered summary via AskUserQuestion grouped by category.
   Each item shows: `[category] summary (effort)`. All items are already captured
   in the ledger; this choice is about what to do *now*:

   Options:
   - **"Fix now"** → create a task list of resolution activities for
     each item; present for user confirmation, then work through them. When
     fixed, resolve the matching ledger item:
     `node "$_R/hooks/session-guard.cjs" logbook-resolve <n>`.
   - **"Create tasks for future sessions"** → use `TaskCreate` for each
     item as a persistent task, with category as prefix and suggested
     action as description. For each, **link the ledger item to the task**
     (REQ-012) so it auto-resolves when the task completes — re-capture that
     item with a link (dedupe attaches it to the existing entry):
     `node "$_R/hooks/session-guard.cjs" logbook-capture '[{"title":"<same title>","source":"/build debrief","link":"task#<id>"}]'`.
   - **"Leave in the ledger"** → items stay captured in `LOGBOOK.md`; resurface
     later via `/logbook`. No further action now (nothing is lost).
   - **"Let me choose per item"** → present each individually with full
     description, evidence, and impact. Options per item:
     "Fix now" / "Create task" / "Explain more" / "Leave in the ledger".
     "Explain more" reads source files cited in evidence, provides
     expanded context, then re-presents the item for decision.

7. After resolution, include debrief summary in the Final Report.

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
