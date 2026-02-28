# Build Instructions

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

---

## Pre-flight

Before starting, check all dependencies in this table:

| Dependency | Type | Check | Required | Resolution | Detail |
|-----------|------|-------|----------|------------|--------|
| ship | skill | `.claude/skills/ship/SKILL.md` | yes | stop | Install with: npx @slamb2k/mad-skills --skill ship |
| feature-dev:code-explorer | agent | — | no | fallback | Uses general-purpose agent |
| feature-dev:code-architect | agent | — | no | fallback | Uses general-purpose agent |
| feature-dev:code-reviewer | agent | — | no | fallback | Uses general-purpose agent |

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
2. Detect project type using `references/project-detection.md` to populate
   **PROJECT_CONFIG** (language, test_runner, test_setup)
3. Check for outstanding questions from previous work:
   - Search CLAUDE.md for a "Known Issues" or "Open Questions" section
   - Search `goals/` for files containing "open_question" or "unresolved"
   - Search memory (if available) for recent items of type "task" or
     "open_question" that are unresolved
   - Check for `DEBRIEF_ITEMS` in any recent build logs
4. If outstanding items found, present via AskUserQuestion:
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
5. Create a task list tracking all stages

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

If `--parallel-impl` and ARCH_REPORT has independent `parallel_groups`,
launch **multiple general-purpose subagents in parallel**.

Otherwise launch **one general-purpose subagent**:

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
   - **"Create goals for future sessions"** → write goal files to `goals/`
     (if GOTCHA structure exists) or append to CLAUDE.md as Known Issues
   - **"Note and continue"** → acknowledge items without formal tracking;
     log to memory (if exists) or as source file comments. No further action.
   - **"Let me choose per item"** → present each individually with full
     description, evidence, and impact. Options per item:
     "Fix now" / "Add to goals" / "Explain more" / "Note and continue".
     "Explain more" reads source files cited in evidence, provides
     expanded context, then re-presents the item for decision.

5. After resolution, include debrief summary in the Final Report.

---

## Final Report

```
Build complete

  Plan:     {first line of PLAN}
  Approach: {approach_summary}

  Files modified: {count}
  Files created:  {count}
  Tests:          {passed}/{total}

  Docs updated: {count or "none"}

  PR: {pr_url} (merged at {merge_commit})

  Key decisions:
  - {decision 1}
  - {decision 2}

  Review findings addressed: {count fixed} / {count found}

  Debrief: {count resolved} / {count surfaced} items addressed
    {list of items created as goals or tasks, if any}
```

If any stage failed, report the failure point and what was accomplished.

---

## Rollback

If implementation succeeds but later stages fail:
- Tests fail: fix agent attempts repair, then reports to user
- Review critical: user decides fix or proceed
- Ship fails: code is still committed locally; user can manually push
- Never silently revert completed implementation work
