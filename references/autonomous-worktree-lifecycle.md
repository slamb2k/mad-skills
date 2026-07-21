# Autonomous Worktree Lifecycle Contract

Shared worktree-lifecycle rule for `speccy`, `build`, and `ship`
(REQ-003–REQ-007, plus REQ-001/REQ-009 from
`specs/unified-autonomous-build.md`, which generalize creation to both
`--auto` and interactive modes and decouple `/build`'s worktree check from
the `--auto`-only sentinel). `specs/bundled-approval-handoff.md` further
amends REQ-001: worktree/branch creation is no longer `/speccy`'s literal
first action — it moves into a post-approval handoff bundle (see Creation,
below). mad-skills does not invent its own worktree creation or teardown
mechanism — this file only defines *when* creation happens and how the
resulting worktree is marked, reusing the mechanisms already established by
`specs/worktree-discipline-guardrails.md`.

## Creation — the handoff bundle (bundled-approval-handoff.md REQ-002)

`/speccy` (both `--auto` and interactive) runs its entire interview/inference
flow in the plain invoking working directory and creates **no git state at
all** — no worktree, no branch, no commit, no PR — until the spec is approved
(REQ-001). At the **approval moment** — the user confirms the Decision Summary
(interactive) or zero-interview inference completes and passes its checks
(`--auto`) — `/speccy` runs the **handoff bundle**: one ordered eight-step
sequence that always runs together, every time, immediately before the
stop-and-marker handoff to `/build`. The property that matters is not *when*
each step happens individually but that they always happen together at the
moment the spec becomes stable.

The eight steps, in order:

1. **Freeze** — compute a SHA-256 content hash over the finalized spec body
   *below* the frontmatter block (the frontmatter carries the hash field
   itself, so it is excluded from the input). Use `sha256sum` (fallback
   `shasum -a 256`) and record it in frontmatter as `content_hash:
   sha256:<hex>` (bundled-approval-handoff.md REQ-005) — proof of exactly what was approved.
2. **Sync base** — actively fetch and pull the remote default branch so the
   feature branches off current main. Reuse `/sync`'s stash-restore behavior
   for any dirty working tree, and surface any stash activity in the bundle
   report. This replaces the old advisory-only branch-staleness warning.
3. **Create worktree + branch together** — one operation, using whichever
   mechanism below is available, in order. For `--auto` runs, drop the
   `.mad-skills-auto` sentinel file at the worktree root as part of this same
   step (see Sentinel file, below). If the branch slug collides with an
   existing branch, suffix `-2`, `-3`, … as needed and report the final name.
4. **Materialize the spec** inside the worktree with the new frontmatter
   fields (bundled-approval-handoff.md REQ-005): `content_hash`, `branch`, `worktree_path`. There is no
   `pr_url` field — the PR is always resolved live from `branch` via the same
   lookup `create-pr.sh` performs (bundled-approval-handoff.md REQ-006).
5. **Commit** the spec as the branch's first commit.
6. **Push** the feature branch.
7. **Draft PR** — `bash skills/ship/scripts/create-pr.sh --draft` (idempotent;
   reuses an existing open PR rather than erroring). **Best-effort**
   (bundled-approval-handoff.md REQ-004):
   on failure (missing `gh`/`az`, network, auth), report the failure with the
   exact `create-pr.sh` retry command, then still proceed to step 8. A missing
   PR never blocks the handoff.
8. **Marker + stop** — write the pending-build marker, display
   `/build {spec path}`, stop. Identical to today's handoff; no same-turn
   auto-invoke of `/build` (bundled-approval-handoff.md CON-001).

**Mechanism for step 3** — use whichever is available, in this order, exactly
as `specs/worktree-discipline-guardrails.md` already establishes for the rest
of mad-skills:

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
scope" verbatim — this spec amends *when* worktree creation happens, not *how*
worktrees are created.

**Blocking semantics (bundled-approval-handoff.md REQ-003).** Steps 1–6 are **blocking**: if any fails,
stop the bundle, report exactly which step failed, and leave all
already-succeeded state in place for inspection. Do **not** write the
pending-build marker on a step-1–6 failure. Step 7 **degrades**
(bundled-approval-handoff.md REQ-004) —
its failure is reported with the retry command but never blocks the handoff.
Only steps 1–6 succeeding earns the marker written in step 8.

## Why speccy, not build (rationale)

The pending-build marker `/speccy` writes (see
`references/superpowers-deferral.md`) is keyed by `process.cwd()`. If `/speccy`
approved on the primary checkout and `/build` later created a separate
worktree, the marker would not transfer without new handoff plumbing. Running
the bundle at the approval moment keeps worktree creation on the `/speccy`
side, makes the spec file the branch's literal first commit (bundle step 5),
and brings push + draft PR forward so the PR exists before `/build` starts —
closing the gap where `/build`'s own mid-build questions needed a PR that only
`/build` would otherwise create. Bundling at approval also never creates git
state for specs that don't survive the interview (an abandoned interview
leaves nothing to clean up), while still guaranteeing `/build` always finds a
worktree, because the bundle always runs before the marker.

## Persistence (REQ-004)

The same worktree persists through `/build --auto` and `/ship --auto` for
that unit of work. Neither stage creates a new worktree — both operate
inside the worktree `/speccy --auto` already created, using absolute paths
rooted at that worktree for every file-tool call (per the existing
absolute-path rule in `skills/build/references/stage-prompts.md` and the
advisory note in `references/superpowers-deferral.md`).

Interactive (non-`--auto`) `/speccy` also creates a worktree — at the approval
moment, via the same handoff bundle (see Creation, above) — so the old REQ-005
prohibition no longer applies. `/build` and
`/ship` do not need to know which mode created the worktree they're
operating in; both simply require one to already exist (see `/build`'s
refusal check, below).

## First commit

The spec file is committed as the branch's first commit by bundle step 5 at
the approval moment — pass or fail on the completeness gate (see Creation,
above) — making the spec the self-documenting root of the PR history.

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
`.mad-skills-auto`, at the worktree root, as part of the same bundle step 3
that creates the worktree (see Creation, above). Its presence marks a worktree
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
