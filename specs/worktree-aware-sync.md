---
title: Worktree-Aware /sync — Safe Post-Ship Sync and Cleanup from a Linked Worktree
version: 1.0
date_created: 2026-07-21
last_updated: 2026-07-21
tags: [tool, process, fix]
---

# Introduction

`/sync` is unsafe when run from a linked git worktree — the situation every
`/speccy` → `/build` → `/ship` feature now ends in, since the
bundled-approval handoff creates a dedicated worktree per feature. This spec
fixes the underlying hazard and makes `/sync` the natural "I just shipped,
put everything back" command: sync main in the primary checkout, remove the
finished worktree and its branch, and return the session to the primary
checkout.

# 1. Purpose & Scope

**Purpose:** make `/sync` correct and useful when invoked from a linked
worktree, without changing its behavior in a normal single-checkout repo
(beyond one bugfix), and without requiring any changes to `/ship`'s existing
post-merge `/sync` invocation.

**In scope:** `skills/sync/scripts/sync.sh`, `skills/sync/SKILL.md`,
colocated tests, eval case updates.

**Out of scope:** `/ship` changes (none needed); multi-worktree batch
cleanup beyond what the existing gone/merged branch cleanup already does;
Windows-native (non-WSL) paths; changes to `/speccy`'s worktree creation.

# 2. Definitions

| Term | Definition |
|---|---|
| **Primary checkout** | The main working tree of the repository: the first entry of `git worktree list --porcelain`. |
| **Linked worktree** | A secondary working tree created via `git worktree add`; detected by `git rev-parse --git-dir` ≠ `git rev-parse --git-common-dir`. |
| **Worktree mode** | sync.sh's behavior when invoked from a linked worktree. |
| **Finished branch** | The calling worktree's branch when it is merged into the freshly updated default branch, or its upstream is marked `gone`. |
| **Session return** | Moving the Claude Code session's working directory back to the primary checkout after the worktree it was in is removed. |

# 3. Requirements, Constraints & Guidelines

- **REQ-001 — Checkout-failure bugfix (all modes).** The exit code of
  `git checkout "$DEFAULT_BRANCH"` (currently `sync.sh:76`, ignored) must be
  checked. On failure: restore stash if one was created, set
  `status=failed` with a clear error naming the checkout failure, and exit —
  never proceed to `git pull` on whatever branch is still checked out.
- **REQ-002 — Auto-detection.** At step 1, detect worktree mode via
  `git rev-parse --git-dir` vs `--git-common-dir`. No new flag is required
  to activate it; existing flags (`--no-stash`, `--no-rebase`,
  `--no-cleanup`) keep their meanings.
- **REQ-003 — Primary-side main sync.** In worktree mode, never check out
  the default branch in the worktree. Resolve the primary checkout path and
  update main there: `git -C "$PRIMARY" pull --ff-only "$REMOTE"
  "$DEFAULT_BRANCH"`. Preconditions checked first; if the primary has
  uncommitted changes or a different branch checked out, skip the pull,
  record `main_sync=skipped (<reason>)`, and continue — never stash or
  mutate the primary implicitly.
- **REQ-004 — Finished-branch cleanup.** After the primary-side fetch/pull,
  if the calling worktree's branch is a finished branch: `cd "$PRIMARY"`
  BEFORE any removal, then `git worktree remove <worktree-path>`, then
  delete the local branch (reusing the existing deletion logic /
  `prepare_branch_for_delete` at `sync.sh:143-195` rather than duplicating
  it). `--no-cleanup` skips this entirely.
- **REQ-005 — Dirty worktree refusal.** If the calling worktree has
  uncommitted changes, do not stash-and-destroy: keep the worktree and
  branch, still perform REQ-003, and report
  `worktree_removed=skipped (dirty)`. (`--no-stash` semantics are
  irrelevant to removal — removal is refused on dirty regardless.)
- **REQ-006 — Unfinished branch behavior.** If the branch is not finished
  (e.g. `/ship --pr-only`, or PR still open), keep the worktree and apply
  today's behavior scoped to the worktree: stash, rebase (or merge with
  `--no-rebase`) the branch onto the updated default, pop stash. Conflict
  handling unchanged (abort, `EXIT_CODE=2`, branch untouched).
- **REQ-007 — Report fields.** The `SYNC_REPORT` block gains, in worktree
  mode: `worktree_mode=true`, `primary_path=<abs path>`,
  `worktree_removed=<path | skipped (<reason>) | none>`, and
  `main_sync=<updated | already up to date | skipped (<reason>)>`. Field
  order stays stable; non-worktree runs emit `worktree_mode=false` only
  (no other new fields), keeping existing consumers unaffected.
- **REQ-008 — Session return (SKILL.md).** After running the script,
  when the report shows `worktree_removed=<path>`, the skill returns the
  session to `primary_path`: native `ExitWorktree` when the session entered
  via `EnterWorktree` and the tool is available, otherwise `cd
  "$primary_path"` as the next Bash call's working directory. The skill
  must do this before any subsequent git commands, since the session's cwd
  no longer exists.
- **REQ-009 — Existing cleanup unchanged.** The gone/merged branch sweep
  (steps 5–6) still runs in worktree mode, executed from the primary
  checkout, and already handles other stale worktrees via
  `prepare_branch_for_delete`.
- **CON-001** — Bash + git only; no new dependencies. Node is used only for
  the colocated tests, matching repo convention.
- **CON-002** — Detached HEAD remains a hard, clean failure in both modes
  (current behavior at `sync.sh:53-58`).
- **CON-003** — The script never deletes the primary checkout, never
  removes a worktree it is currently `cd`'d into, and never force-deletes
  (`git worktree remove --force` / `git branch -D`) anything.
- **GUD-001** — Reuse existing helpers; the diff should read as "one new
  mode branch + one bugfix", not a rewrite.

# 4. Interfaces & Data Contracts

Extended `SYNC_REPORT` (worktree-mode example):

```text
SYNC_REPORT_START
status=success
default_branch=main
main_updated_to=3df82bd - fix: harden merge scripts
current_branch=main
worktree_mode=true
primary_path=/home/user/repos/myproject
worktree_removed=/home/user/repos/worktrees/csv-export
main_sync=updated
stash_created=false
rebase_status=n/a
branches_cleaned=feature/csv-export
skipped=
errors=
SYNC_REPORT_END
```

Exit codes unchanged: `0` success, `1` hard failure, `2` completed with
conflicts/skips. A refused (dirty) worktree removal is a skip, not a
failure: exit `2`.

# 5. Acceptance Criteria

- **AC-001**: Given a normal repo where `git checkout main` fails (e.g.
  main checked out elsewhere), when sync.sh runs, then it exits `1` with a
  checkout error, restores any auto-stash, and no `git pull` ran on the
  feature branch.
- **AC-002**: Given a linked worktree on a merged branch and a clean
  primary on main, when sync.sh runs, then main is pulled in the primary,
  the worktree is removed, the branch is deleted, and the report contains
  `worktree_mode=true`, `primary_path`, `worktree_removed=<path>`.
- **AC-003**: Given a linked worktree whose branch's upstream is `gone`
  (post squash-merge + remote deletion), the same cleanup as AC-002 occurs.
- **AC-004**: Given a dirty linked worktree, when sync.sh runs, then main
  still syncs, the worktree and branch survive, exit code is `2`, and the
  report shows `worktree_removed=skipped (dirty)`.
- **AC-005**: Given a linked worktree on an unmerged branch, when sync.sh
  runs, then the worktree is kept and the branch is rebased onto the
  updated default (or merged under `--no-rebase`), matching current
  single-checkout behavior.
- **AC-006**: Given a primary checkout that is dirty or not on the default
  branch, when sync.sh runs from a worktree, then no primary mutation
  occurs and the report shows `main_sync=skipped (<reason>)`.
- **AC-007**: Given `--no-cleanup`, when run from a worktree on a merged
  branch, then main syncs but the worktree and branch are untouched.
- **AC-008**: Given a non-worktree run, the report differs from today only
  by `worktree_mode=false` and the AC-001 bugfix.
- **AC-009**: After a worktree removal, the skill's next git command runs
  from `primary_path` (session return happened first).

# 6. Test Automation Strategy

- **Colocated fixture tests** (`skills/sync/scripts/sync.test.js`, node
  `--test`, folded into `npm run test:unit` per repo convention): each test
  builds a temp origin (bare) + clone + linked worktree, then asserts
  AC-001…AC-008 by parsing the SYNC_REPORT block and inspecting git state.
  Merged, gone, dirty, unmerged, dirty-primary, and `--no-cleanup` cases
  each get one test.
- **Eval case** (`skills/sync/tests/evals.json`): assert the SKILL.md
  instructs session return to `primary_path` after a removal (AC-009 is
  behavioral/interactive — eval-asserted, not unit-tested).
- **No CI changes** — existing `npm test` covers all of it.

# 7. Rationale & Context

- The bundled-approval handoff made worktrees the default feature
  workspace, so `/ship` → `/sync` now routinely happens *inside* one; the
  ignored checkout failure at `sync.sh:76` turns that into a wrong-branch
  pull/rebase today. The bugfix (REQ-001) stands alone even if worktree
  mode were rejected.
- `git -C "$PRIMARY"` over `cd`-ing for the pull keeps the script's cwd
  stable until the one moment it must move (before removal), minimizing
  dead-cwd surface.
- Refusing dirty removal (REQ-005) over stashing: a dirty worktree after a
  merge means something unexpected happened; destroying the workspace that
  holds the evidence is the wrong default.
- Session return lives in SKILL.md, not the script, because a child
  process cannot change the session's working directory — the same split
  the design discussion settled on.

# 8. Dependencies & External Integrations

- **INF-001**: git ≥ 2.31 (worktree list --porcelain, rev-parse
  --git-common-dir) — already assumed repo-wide.
- **PLT-001**: bash, Node ≥ 18 (tests only).
- No external systems; `/ship` consumes `/sync` unchanged.

# 9. Examples & Edge Cases

- **Happy post-ship path:** `/ship` squash-merges from worktree → `/sync`
  → main pulled in primary, worktree gone, branch gone, session back in
  primary, report AC-002-shaped.
- **`--pr-only` ship:** branch unmerged → AC-005 path; a later `/sync`
  after the PR merges takes the AC-003 path.
- **Primary mid-work:** user has uncommitted changes in the primary →
  AC-006; worktree cleanup still proceeds if the branch is finished
  (cleanup needs no primary mutation beyond cd).
- **Worktree path already pruned externally:** `git worktree remove` fails
  because the directory is gone → run `git worktree prune`, treat as
  removed, report normally.
- **Branch checked out in a second linked worktree:** deletion defers to
  `prepare_branch_for_delete`'s existing skip/remove logic — no new code.
- **Squash-merge detection:** `git branch --merged` misses squashed
  branches; the `gone` upstream check (AC-003) is the finished signal in
  that case — both checks run, either qualifies.

# 10. Validation Criteria

1. `npm run validate && npm run lint && npm run test:unit` green with the
   new fixture tests.
2. Manual end-to-end in a scratch repo: full `/speccy`-style worktree →
   commit → merge → `/sync` run, verifying AC-002 and AC-009 live.
3. Non-worktree regression: `/sync` output in a plain checkout is
   byte-identical to current except `worktree_mode=false` (AC-008).

# 11. Related Specifications / Further Reading

- `specs/bundled-approval-handoff.md` — why features now live in worktrees
- `references/autonomous-worktree-lifecycle.md` — worktree creation side
- `specs/orchestrator-ready-mad-skills.md` — orchestrated mode never runs
  merge/cleanup (not dispatched), so this change is standalone-mode only
- `skills/ship/SKILL.md` — invokes `/sync` post-merge, unchanged
