# Autonomous Worktree Lifecycle Contract

Shared worktree-lifecycle rule for `speccy`, `build`, and `ship`
(REQ-003–REQ-007, plus REQ-001/REQ-009 from
`specs/unified-autonomous-build.md`, which generalize creation to both
`--auto` and interactive modes and decouple `/build`'s worktree check from
the `--auto`-only sentinel). mad-skills does not invent its own worktree
creation or teardown mechanism — this file only defines *when* creation
happens and how the resulting worktree is marked, reusing the mechanisms
already established by `specs/worktree-discipline-guardrails.md`.

## Creation (REQ-003, generalized by REQ-001)

`/speccy` creates the worktree and branch as its **first action**, before
Stage 1 (Context Gathering) begins, in **both `--auto` and interactive
modes** — earlier than the existing Pre-Spec Branch Check and
`references/location-check.md` check, both of which still run afterward as
normal. This supersedes the original REQ-005, which prohibited worktree
creation in interactive mode; REQ-001 (`specs/unified-autonomous-build.md`)
removes that split so every `/speccy` run, not just `--auto` ones,
establishes a worktree for the downstream `/build` and `/ship` stages to
operate in.

Use whichever of these two mechanisms is available, in this order, exactly
as `specs/worktree-discipline-guardrails.md` already establishes for the
rest of mad-skills:

1. **Harness native tools** — `EnterWorktree` (creates under
   `.claude/worktrees/` and explicitly switches the session's own working
   directory when used).
2. **Superpowers fallback** — `using-git-worktrees`, if the harness tools
   are unavailable and Superpowers is installed (raw `git worktree add` +
   Bash `cd` under `.worktrees/`/`worktrees/`, per that skill's own
   convention).

mad-skills does not call `git worktree add`/`remove` directly and does not
prescribe a path convention beyond what the chosen mechanism already uses
(CON-001). This mirrors `specs/worktree-discipline-guardrails.md` §"Out of
scope" verbatim — this spec extends *when* worktree creation happens for
`--auto`, not *how* worktrees are created.

## Why speccy, not build (REQ-003 rationale)

The pending-build marker `/speccy` writes today (see
`references/superpowers-deferral.md`) is keyed by `process.cwd()`. If
`/speccy --auto` ran on the primary checkout and `/build --auto` later
created a separate worktree, the marker would not transfer without new
handoff plumbing. Creating the worktree at speccy time also makes the spec
file the literal first commit on the branch (REQ-006), and establishes a
single "every `--auto` stage runs inside a worktree, no exceptions" rule —
important once no human is present to remember why one stage was
special-cased.

## Persistence (REQ-004)

The same worktree persists through `/build --auto` and `/ship --auto` for
that unit of work. Neither stage creates a new worktree — both operate
inside the worktree `/speccy --auto` already created, using absolute paths
rooted at that worktree for every file-tool call (per the existing
absolute-path rule in `skills/build/references/stage-prompts.md` and the
advisory note in `references/superpowers-deferral.md`).

Interactive (non-`--auto`) `/speccy` now creates a worktree too (REQ-001,
above) — the old REQ-005 prohibition no longer applies. `/build` and
`/ship` do not need to know which mode created the worktree they're
operating in; both simply require one to already exist (see `/build`'s
refusal check, below).

## First commit (REQ-006)

Once `/speccy --auto`'s completeness gate passes and the spec is written
with `autonomy_ready: true`, the spec file MUST be committed inside the
worktree as the branch's first commit — before any implementation work
begins. This makes the spec the self-documenting root of the PR history.

## `/build`'s worktree-refusal check (REQ-009)

`/build` MUST NOT create its own worktree under any circumstance. Invoked
without an existing worktree, it MUST refuse immediately, directing the
user to run `/speccy` first — the same fail-fast, do-no-partial-work shape
as the original `autonomy_ready`-missing check, but for a missing worktree
instead.

This check MUST use pure git-native worktree detection, not the
`.mad-skills-auto` sentinel (below) — the sentinel is written only by
`--auto` runs, but REQ-001 means an interactive `/speccy` run also produces
a worktree `/build` must recognize as valid. Compare
`git rev-parse --git-common-dir` against `git rev-parse --git-dir`: they
differ when run inside a linked worktree and are identical inside a main
working copy. `/build` treats "they differ" as "a worktree exists" and
proceeds; "they match" as "no worktree" and refuses.

## Sentinel file: `.mad-skills-auto`

`/speccy --auto`'s worktree-creation step drops a sentinel file,
`.mad-skills-auto`, at the worktree root, as part of the same first action
that creates the worktree (before Stage 1). Its presence marks a worktree
as belonging to an autonomous `--auto` run, distinguishing it from a
worktree created manually or by interactive mad-skills usage.

**Format**: plain text, one `key: value` pair per line —

```
spec: specs/{slug}.md
created: {ISO-8601 timestamp}
stage: speccy
mode: auto
```

- `spec` — repo-relative path to the spec file this run is building.
- `created` — when the sentinel was written.
- `stage` — the `--auto` stage that last touched the worktree
  (`speccy` → `build` → `ship`), updated in place as the run progresses,
  so a later stage or a cleanup consumer can tell how far the run got.
- `mode` — `auto` or `interactive`; inert for this build, no consumer reads
  it yet. Documented now for future parity once interactive runs also
  write the sentinel.

**Consumer**: `/sync`'s cleanup extension (implemented separately, not by
this file) reads `.mad-skills-auto` to identify autonomous-run worktrees
and applies PR-state-based cleanup once the associated PR merges or closes
(REQ-007), mirroring `superpowers:finishing-a-development-branch`'s
provenance-based cleanup. This file defines the sentinel's existence and
format only — it does not implement the consumer.

## Teardown (REQ-007)

The worktree persists until the PR opened by `/ship --auto` merges or
closes. Teardown itself remains owned by whichever mechanism created the
worktree (`ExitWorktree` for native/`.claude/worktrees/`,
`finishing-a-development-branch` for Superpowers-created
`.worktrees/`/`worktrees/`), triggered by PR state via the `.mad-skills-auto`
sentinel rather than an explicit user choice mid-run. mad-skills does not
take on worktree lifecycle ownership beyond what
`specs/worktree-discipline-guardrails.md` already establishes (CON-001).
