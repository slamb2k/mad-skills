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
- `--skip-questions`: Skip Stage 2 (the first checkpoint interview, REQ-012)
- `--skip-review`: Skip Stage 5's native `/code-review` + `/security-review` dispatch
- `--no-ship`: Stop after Stage 8 docs update
- `--parallel-impl`: Split implementation into parallel agents when independent
- `--no-superpowers`: Force the standalone pipeline even when Superpowers is installed
- `--handoff`: Skip the execution-mode question and hand off to a clean session
- `--no-handoff`: Skip the execution-mode question and run here now

Caps (flag/env/default, any hit forces stop-and-report): `--iterations`/`BUILD_AUTO_ITERATIONS`/20, `--budget`/`BUILD_AUTO_BUDGET`/5M, wall-clock/`BUILD_AUTO_WALLCLOCK`/4h — see `references/autonomous-pipeline.md`.

---

## Pre-flight

Before starting, check all dependencies in this table:

| Dependency | Type | Check | Required | Resolution | Detail |
|-----------|------|-------|----------|------------|--------|
| ship | skill | `ls .claude/skills/ship/SKILL.md ~/.claude/skills/ship/SKILL.md ~/.claude/plugins/marketplaces/slamb2k/skills/ship/SKILL.md 2>/dev/null` | yes | stop | Install with: npx skills add slamb2k/mad-skills --skill ship |
| prime | skill | `ls .claude/skills/prime/SKILL.md ~/.claude/skills/prime/SKILL.md ~/.claude/plugins/marketplaces/slamb2k/skills/prime/SKILL.md 2>/dev/null` | no | fallback | Context loading; falls back to manual CLAUDE.md/goals scan |
| feature-dev | plugin | on-disk glob via scripts/lib/feature-dev.js | no | fallback | Detected on disk → try feature-dev:code-explorer / code-architect / code-reviewer first, general-purpose agent as fallback if the subagent_type isn't actually registered |
| superpowers | plugin | on-disk glob via scripts/lib/superpowers.js | no | fallback | Detected for `--no-superpowers` parity with speccy/ship; Stage 4 never defers to it (model-tiering enforceability, see references/autonomous-pipeline.md's Model tiering section) — see references/superpowers-deferral.md |
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

**Worktree refusal (REQ-009):** before anything else, run the check documented
in `references/autonomous-pipeline.md`'s "Worktree refusal" section — `/build`
MUST NOT create its own worktree under any circumstance; it only ever operates
inside one `/speccy` already created. On failure (no worktree found), refuse
immediately with the exact message specified there, directing the user to run
`/speccy` first, and stop — never fall back silently.

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

This is the first of the pipeline's defined interview checkpoints (REQ-012) —
see the mid-build question mechanism in `references/autonomous-pipeline.md`
for how later ambiguities surface at the review/verify checkpoints instead of
here, and for channel-adaptive delivery when no live session is watching.

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

Implementation subagents MUST use Sonnet (REQ-013 (autonomous-execution-mode.md),
other stages keep interactive-default tiers). This stage never defers to
Superpowers, even when Superpowers is detected and `--no-superpowers` is not
set: the Skill tool used to invoke `superpowers:executing-plans` /
`superpowers:subagent-driven-development` has no model-override parameter, so
REQ-013's Sonnet mandate can't be enforced through that path. Stage 4 always
runs the standalone implementation below — see
`references/autonomous-pipeline.md`'s Model tiering section (Resolved
interaction) for the full rationale, and `references/superpowers-deferral.md`
for how this differs from `speccy` and `ship`.

**Early draft PR (REQ-014 (unified-autonomous-build.md), timing-amended by
bundled-approval-handoff.md GUD-001):** before dispatching
the implementation subagent(s) below, open the PR as a draft per
`references/autonomous-pipeline.md`'s "Early draft PR" section — call
`skills/ship/scripts/create-pr.sh --draft` directly (idempotent: reuses any
existing open PR on the branch rather than erroring). Normally this reuses
the draft PR the `/speccy` approval bundle already opened (`reused=true`);
actually creating one here is the degraded backstop path. Capture the returned
`pr_url`; every checkpoint-interview comment and evidence artifact from here
on posts against it.

If ARCH_REPORT identifies independent `parallel_groups`, launch **multiple
general-purpose subagents in parallel** — one per group. Do NOT wait for
`--parallel-impl` flag; parallel execution is the **default** when the
architecture supports it. The flag is retained only as an explicit override.

After each parallel group of 2+ implementers completes, run the cross-file
consistency check in `references/autonomous-pipeline.md`'s "Parallel
implementation — cross-file consistency check" section before dispatching
any group that depends on it, or before Stage 5 if none remain.

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

Dispatch review-depth selection and native review per
`references/autonomous-pipeline.md`'s Review-depth dispatch section (REQ-015,
GUD-002): compute the changed-file set and apply the
file-count-plus-risk-keyword-path rule from
`references/autonomous-review-thresholds.md` to select **Standard** or
**Deep** depth, then invoke the native `/code-review` and `/security-review`
commands directly via the Skill tool, passing the selected depth.

Parse findings into REVIEW_REPORT.

---

## Stage 6: Fix Review Findings

**Only if Stage 5's native review found Critical/Important findings** —
fix-loop mechanics (max 2 fix→re-review attempts per finding-set, then escalate
as stuck) are `references/autonomous-pipeline.md`'s Fix loop section
(REQ-016, REQ-021).

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

Dispatch the native `/verify` command per `references/autonomous-pipeline.md`'s
Verify against Definition of Done section (REQ-017, REQ-020): check the
implementation against the spec's `## Definition of Done` checklist item by
item — each item is either verified-via-evidence or outstanding, never a
general "looks done" judgment. The stage is complete only when every
checklist item is verified.

If items remain outstanding, dispatch a fix subagent and re-verify, subject to
the same fix-loop cap as Stage 6.

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

Invoke `/ferry` to checkpoint before proceeding (GUD-004,
`references/autonomous-pipeline.md`).

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
   accepted verbatim).

   **Breach-time triage first (REQ-006/008).** Before the real capture, preview
   what it would do, against the same items array:
   ```bash
   _R="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/marketplaces/slamb2k}"
   node "$_R/hooks/session-guard.cjs" logbook-capture-preview \
     '[{"title":"…","category":"deferred_fix","source":"/build debrief"}, …]'
   ```
   Parse the `would_relocate` list between `LOGBOOK_CAPTURE_PREVIEW_BEGIN`/`END`.
   If it reads `would_relocate: none`, skip straight to the real capture below —
   no prompt needed.

   If `would_relocate` lists one or more candidates AND this is a live
   interactive session (the same condition that gates step 6's AskUserQuestion
   below, not a headless/`--auto` run), present each candidate to the user via
   `AskUserQuestion` before running the real capture. Options per candidate:
   - **"Resolve now"** → `node "$_R/hooks/session-guard.cjs" logbook-resolve <n>`
     (run `logbook-list` first if you haven't already, and match the
     candidate's title to its current selector `<n>` there — the preview's own
     numbering is relocation order, not the ledger selector).
   - **"Dismiss"** → `node "$_R/hooks/session-guard.cjs" logbook-dismiss <n>`,
     same selector lookup.
   - **"Leave it"** → no action; it relocates when the real capture runs below.

   On a headless/non-interactive run, skip this prompt entirely and go
   straight to the real capture (REQ-007) — same silent-safety-net behavior as
   today.

   Then run the real capture:
   ```bash
   node "$_R/hooks/session-guard.cjs" logbook-capture \
     '[{"title":"…","category":"deferred_fix","source":"/build debrief"}, …]'
   ```
   Note any `relocated:[…]` in the output — mention relocations to the user
   (never silent, GUD-002): those items moved to the archive file
   (`LOGBOOK-ARCHIVE.md`), never dismissed or resolved — still open, still
   addressable via `/logbook archive`.

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
