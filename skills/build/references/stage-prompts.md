# Build Stage Prompts

Subagent prompts for each build stage. The orchestrator reads these and
substitutes template variables before launching each subagent.

---

## Stage 1: Explore

**Agent:** feature-dev:code-explorer (fallback: general-purpose)

```
You are exploring a codebase to prepare for implementing a plan.
Read the plan carefully, then explore the codebase to understand
the existing code that will be modified or extended.

Limit EXPLORE_REPORT to 30 lines maximum.

## Plan

{PLAN}

## Your Tasks

1. Read the plan and identify:
   - Which existing files will be modified
   - Which patterns/conventions exist in those files
   - What dependencies and imports are used
   - What test patterns exist for similar code

2. For each area of the plan, explore the relevant code:
   - Use Glob to find files
   - Use Grep to find patterns
   - Use Read to understand implementations
   - Trace through execution paths

3. Identify source documentation — files that define, plan, or track work:
   - Phase plans, design docs, PRDs, manifests, READMEs with progress markers
   - Files with checklists, status tables, task lists, or roadmaps
   - Only include files that contain trackable progress

4. Identify potential issues:
   - Conflicts with existing code
   - Missing dependencies
   - Convention mismatches
   - Edge cases the plan doesn't address

## Output Format

EXPLORE_REPORT:
- files_to_modify: {list with line ranges}
- files_to_create: {list}
- patterns_found:
  - {pattern}: {description}
- conventions:
  - {convention}: {description}
- dependencies: {new imports/packages needed}
- potential_issues:
  - {issue}: {description and resolution}
- questions: {ambiguities in the plan}
- source_docs:
  - path: {file path}
    type: {manifest|phase_plan|design_doc|prd|readme|changelog}
    trackable_items:
      - marker: {exact text of checkbox/status}
        current_value: {current}
        completed_value: {target}
        description: {what it tracks}
```

---

## Stage 3: Architecture Design

**Agent:** feature-dev:code-architect (fallback: general-purpose)

```
Design the implementation architecture for a feature plan.
Use the exploration findings and any user clarifications to produce
a concrete, file-by-file implementation blueprint.

Limit ARCH_REPORT to 30 lines maximum.

## Plan

{PLAN}

## Exploration Findings

{EXPLORE_REPORT}

## User Clarifications

{CLARIFICATIONS or "None — plan is fully specified"}

## Your Tasks

1. Design the implementation approach:
   - Decide what changes go in which files
   - Define the order of changes (dependencies between files)
   - Identify which changes can be parallelized
   - Specify function signatures, class structures, data flows

2. Follow existing codebase conventions from the exploration

3. Plan the commit grouping

## Output Format

ARCH_REPORT:
- approach_summary: {2-3 sentences}
- implementation_order:
  - step: {N}
    files: {list}
    description: {what to do}
    depends_on: {step numbers or "none"}
- parallel_groups: {groups that can run in parallel}
- commit_plan:
  - group: {name}
    files: {list}
    message: {proposed commit message}
- risks:
  - {risk}: {mitigation}
```

---

## Stage 4: Implementation

**Agent:** general-purpose (default model)

```
Implement a feature according to a precise architecture plan.
Follow the plan exactly. Write clean code that follows existing
conventions. Do not add features, comments, or refactoring beyond
what the plan specifies.

Limit IMPL_REPORT to 20 lines maximum.

## Plan

{PLAN}

## Architecture

{ARCH_REPORT}

## Your Implementation Steps

{implementation_order steps assigned to this agent}

## Conventions to Follow

{conventions from EXPLORE_REPORT}

## Rules

- Read each file BEFORE editing it
- Follow existing code style exactly (imports, spacing, naming)
- Do not add docstrings or comments unless the plan specifies them
- Do not refactor adjacent code
- Do not add error handling beyond what the plan specifies
- After all changes, run the project's test command:
  {PROJECT_CONFIG.test_runner}
  Capture the last 20 lines of output.

## Output Format

IMPL_REPORT:
- status: success|partial|failed
- files_modified: {list with brief description}
- files_created: {list}
- test_result: {last 20 lines of test output}
- issues_encountered:
  - {issue}: {what you did about it}
- errors: {any unresolved errors}
```

---

## Stage 5: Code Review

**Agent:** feature-dev:code-reviewer (fallback: general-purpose)
Launch 3 in parallel with different focuses.

### Review Focus: Simplicity & DRY
```
Review the following files for simplicity, DRY violations,
and unnecessary complexity. Files: {FILES}
Focus: code duplication, over-engineering, dead code.
Limit REVIEW_REPORT to 15 lines maximum.

REVIEW_REPORT:
- reviewer_focus: simplicity
- findings:
  - severity: {critical|high|medium|low}
    file: {path}
    line: {number}
    issue: {description}
    fix: {suggested fix}
- summary: {1-2 sentences}
```

### Review Focus: Bugs & Correctness
```
Review the following files for bugs, logic errors, edge cases,
and security issues. Files: {FILES}
Focus: null handling, race conditions, error propagation, input validation.
Limit REVIEW_REPORT to 15 lines maximum.
(Same output format as above with reviewer_focus: bugs)
```

### Review Focus: Conventions & Integration
```
Review the following files for adherence to project conventions
and proper integration with existing code. Files: {FILES}
Conventions: {CONVENTIONS}
Focus: import style, naming, patterns, test coverage.
Limit REVIEW_REPORT to 15 lines maximum.
(Same output format as above with reviewer_focus: conventions)
```

---

## Stage 6: Fix Review Findings

**Agent:** general-purpose (default model)

```
Fix the following code review findings. Read each file before
editing. Make minimal, targeted fixes — do not refactor surrounding code.

Limit FIX_REPORT to 10 lines maximum.

FINDINGS:
{critical and high severity findings from Stage 5}

After fixes, run: {PROJECT_CONFIG.test_runner}

FIX_REPORT:
- status: fixed|partial
- fixes_applied: {list}
- test_result: {last 20 lines}
- remaining_issues: {any unfixed items and why}
```

---

## Stage 7: Verify

**Agent:** Bash (haiku)

```
Run the full test suite and report results.

Limit TEST_REPORT to 10 lines maximum.

Steps:
1. {PROJECT_CONFIG.test_setup} (if any)
2. {PROJECT_CONFIG.test_runner} 2>&1 | tail -30

TEST_REPORT:
- status: all_passed|some_failed
- total: {number}
- passed: {number}
- failed: {number}
- last_30_lines: {output}
```

---

## Stage 8: Update Progress Documentation

**Agent:** general-purpose (default model)

```
Update project documentation to reflect completed work.

Limit DOCS_REPORT to 15 lines maximum.

## What Was Built

{PLAN summary}

## Implementation Summary

{approach_summary from ARCH_REPORT}

## Files Changed

{files from IMPL_REPORT}

## Test Results

{status from TEST_REPORT}

## Source Documents to Update

{source_docs from EXPLORE_REPORT}

## Rules

- ONLY update markers for items actually completed
- Do NOT add new content — only update existing progress markers
- Read each file BEFORE editing
- If a marker cannot be found, skip and report

DOCS_REPORT:
- status: updated|no_updates|partial
- docs_updated:
  - path: {file}
    changes:
      - marker: {what was updated}
        from: {old}
        to: {new}
- docs_skipped:
  - path: {file}
    reason: {why}
```

---

## Stage 10: Debrief — Collect Outstanding Questions

**Agent:** None (runs on primary thread)

This stage collects unresolved items from all previous stages and presents
them to the user via AskUserQuestion.

### Sources of Outstanding Items

Scan all stage reports for unresolved items:

1. **EXPLORE_REPORT** → `potential_issues` not addressed by implementation
2. **ARCH_REPORT** → `risks` with deferred mitigations
3. **REVIEW_REPORT** → `medium` and `low` severity findings not fixed in Stage 6
4. **TEST_REPORT** → warnings, skipped tests, or flaky results
5. **DOCS_REPORT** → `docs_skipped` items
6. **IMPL_REPORT** → `issues_encountered` that were worked around, not solved
7. **Any stage** → questions or assumptions the subagent flagged but moved past

### Compilation Format

```
DEBRIEF_ITEMS:
- id: {N}
  source: {stage name}
  category: {unresolved_risk|deferred_fix|open_question|assumption|tech_debt}
  summary: {one-line summary for the AskUserQuestion list}
  description: {2-3 sentence explanation with relevant context}
  evidence: {specific report field, file, or line that surfaced this}
  impact: {what happens if left unaddressed}
  suggested_action: {specific next step}
  effort: {quick_fix|small_task|needs_investigation}
```

### Presentation

If no items found, skip this stage.

If items exist, present a numbered summary grouped by category via
AskUserQuestion. Each item shows: `[category] summary (effort)`.

```
"Build complete. {count} items surfaced during the process that may
need attention:"

  Unresolved Risks:
    1. [risk] Summary of risk (needs_investigation)
    2. [risk] Summary of risk (small_task)

  Open Questions:
    3. [question] Summary of question (quick_fix)

  Tech Debt:
    4. [tech_debt] Summary of debt (small_task)

"How would you like to handle them?"
```

Options:
- "Fix now"
  → Create a task list of resolution activities. For each item, create
     a concrete task with the suggested_action. Present the task list
     for user confirmation, then work through them.

- "Create goals for future sessions"
  → For each item, write a goal file to goals/ (if GOTCHA structure
     exists) or append to CLAUDE.md as a "Known Issues" section.
     Format: one goal per category grouping, not one per item.

- "Note and continue"
  → Acknowledge items without formal tracking. Log to memory (if memory
     system exists) or as comments in the relevant source files. No
     further action.

- "Let me choose per item"
  → Present each item individually via AskUserQuestion. Show the full
     `description`, `evidence`, and `impact` fields so the user has
     enough context to decide. Options per item:
     "Fix now" / "Add to goals" / "Explain more" / "Note and continue"
     - "Fix now": launch a general-purpose subagent to resolve
     - "Explain more": read the relevant source files/reports cited in
       `evidence`, summarise the context, then re-present the same item
       with the expanded explanation
