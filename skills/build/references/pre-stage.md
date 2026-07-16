# Pre-Stage Setup

Everything `/build` resolves **before Stage 1**: turn the argument into a plan,
verify the branch is safe to build on, and decide where to run.

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

## Execution Mode

`/build` runs every heavy stage in subagents, so the primary conversation stays
compact *during* the build. The one thing subagents can't fix is a context
window that's **already** large when you invoke `/build` — the orchestrator
(this thread) still reads reports and runs the review/ship loop on top of
whatever came before. For that, a clean start beats a clean middle.

So there is exactly one execution-mode decision, and subagents are always on
underneath either choice:

- **Run here now** — orchestrate the build in this session, stages in subagents.
- **Hand off to a clean session** — ferry the state across (write a waybill),
  arm the resume signal, and let a fresh session run the *same* `/build` with its
  own subagents.

These are mutually exclusive — one stops here, one continues here. Do **not**
offer a "clear? yes/no" toggle on top of run-now; the hand-off mode *replaces*
the run-now decision.

**Resolve the mode:**

1. If `--no-handoff` → run here now. Skip to Stage 1.
2. If `--handoff` → hand off (only if the `ferry` skill exists; else warn it's
   unavailable and run here now).
3. If the `ferry` skill is **not** installed (pre-flight) → run here now
   silently. No question.
4. Otherwise, decide whether to *offer* the hand-off at all. Only offer it when a
   clean start would actually help **and** the plan can survive the reset:
   - **Context already large** — this session has had substantial prior work
     before `/build` (long conversation, many file reads, a prior task), so the
     orchestrator would start bloated. A fresh `/build` invocation in an empty
     session does not need this — just run here now.
   - **Plan is self-contained** — PLAN is a spec file or a complete written plan
     that a waybill can capture losslessly. If the plan leans on nuance from
     *this* conversation (decisions made live, things looked at together), the
     waybill is lossy — prefer run-here-now so that context isn't thrown away.

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
gathered so far, then invoke the `ferry` skill. The waybill's
"next steps" MUST be a single resume action: re-run this exact build in the
fresh session, e.g. `/build {original PLAN argument}` (plus any active flags,
minus `--handoff`). Include the resolved plan content and PROJECT_CONFIG so the
fresh session doesn't re-derive them. The `ferry` skill arms the one-shot
signal and tells the user to `/clear`. **Stop here** — do not run Stage 1; the
fresh session does.

**If running here now:** continue to Stage 1 unchanged.
