# Worktree Location Check Contract

Shared root-mismatch check for `speccy`, `build`, and `ship`. Detects the
condition that causes a session's file-tool root (Read/Write/Edit) to
silently diverge from Bash's own working directory — most commonly, Bash's
cwd drifting into a leftover worktree while the file-tool root stays pinned
to the session's declared working directory.

## Detection

Run from Bash, once, before the caller's designated stage:

```bash
BASH_TOPLEVEL=$(git rev-parse --show-toplevel 2>/dev/null)
GIT_DIR=$(git rev-parse --git-dir 2>/dev/null)
GIT_COMMON=$(git rev-parse --git-common-dir 2>/dev/null)
# {DECLARED_ROOT} is the session's own declared working directory (known from
# environment context, not derived via bash)
```

Evaluate in this order:

1. **`BASH_TOPLEVEL` is empty** (`git rev-parse` failed — not a git repo, or
   some other resolution failure): no-op. Treat as "no mismatch data
   available" and pass silently. Do not warn.
2. **`BASH_TOPLEVEL` == `{DECLARED_ROOT}`**: pass silently — no warning, no
   output (REQ-006).
3. **`BASH_TOPLEVEL` != `{DECLARED_ROOT}`**: this is a toplevel mismatch.
   Warn via the `AskUserQuestion` below.

The check SHALL NOT attempt a "does this worktree relate to my current
PLAN/branch" relatedness heuristic — the toplevel comparison above is the
complete check (REQ-002, CON-001).

## Linked-worktree context (REQ-003)

If `GIT_DIR` and `GIT_COMMON` are both non-empty and differ, the current cwd
is a linked worktree rather than the primary checkout. When a mismatch is
already firing (step 3 above), append this as context to the warning
message: `(Bash's cwd looks like a linked worktree.)`

This signal is context only. A linked worktree that matches `{DECLARED_ROOT}`
(e.g. a hand-off session resuming inside a worktree it was told is its root)
is not a mismatch and does not warn — only a toplevel mismatch triggers the
warning, never `GIT_DIR != GIT_COMMON` by itself.

## Mismatch prompt

On a toplevel mismatch, block with `AskUserQuestion`:

```
"Your shell's working directory doesn't match this session's file-tool root
({DECLARED_ROOT}) — Bash appears to be inside {BASH_TOPLEVEL} instead. Any
relative Write/Edit path {caller} will resolve against {DECLARED_ROOT}, not
what Bash shows."
```

Options:
- **"Continue using absolute paths rooted at `{DECLARED_ROOT}` (Recommended)"**
  — reorient behaviorally: use absolute paths rooted at `{DECLARED_ROOT}` for
  every subsequent Write/Edit/Read call in the current task. No corrective
  Bash command (e.g. `cd`) is run or suggested as part of this choice —
  `cd` does not affect file-tool path resolution (REQ-005).
- **"This is fine, proceed as-is"** — the user confirms the mismatch is
  intentional (e.g. deliberately dispatching a subagent with a pinned cwd).
- **"Cancel"** — stop and let the user investigate manually.

`{caller}` and `{DECLARED_ROOT}`/`{BASH_TOPLEVEL}` are the only
parameterized values — wording is otherwise identical across all three
callers (GUD-001).

## Per-caller wiring map

| Caller | Insertion point | Existing neighbor | `{caller}` phrase |
|---|---|---|---|
| `/speccy` | First subsection of `## Stage 1: Context Gathering`, before `### Pre-Spec Branch Check` | Pre-Spec Branch Check | `"before Stage 1: Context Gathering"` |
| `/build` | `references/pre-stage.md`, new `## Pre-Build Location Check` subsection, before `## Pre-Build Branch Check` | Pre-Build Branch Check | `"before Stage 1"` |
| `/ship` | New `## Pre-Ship Location Check` section, after `## Pre-flight` (including its AzDO Setup subsection), before `## Stage 1: Sync` | Pre-flight dependency table | `"before syncing"` |

Each caller references this file rather than duplicating the bash snippet or
prompt text inline (REQ-010).

> Note: `/speccy`'s pre-Stage-1 location check is inert until the post-approval
> handoff bundle creates the worktree (`specs/bundled-approval-handoff.md`) —
> during the interview no worktree exists yet, so there is nothing to mismatch.

## Edge cases

- **Detached HEAD / submodule**: `git rev-parse --show-toplevel` still
  resolves correctly for both; no special-casing needed — the comparison is
  purely path-based, not branch-based.
- **Subagent with a deliberately pinned cwd**: this check runs only in the
  primary/orchestrator session before spawning subagents, never inside a
  subagent itself — so a subagent's own pinned cwd never triggers a false
  warning here. Subagent path safety is handled separately by the
  Stage 4 Rules addition (see `skills/build/references/stage-prompts.md`).
- **Not a git repository**: covered by the "`BASH_TOPLEVEL` is empty" no-op
  branch above — mirrors how the existing Branch Check tolerates non-repo
  directories.
