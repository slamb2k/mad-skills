# Autonomous Worktree Lifecycle Contract

> **Superseded by `specs/pr-first-autonomous-build.md`** — worktree/branch/draft-PR
> creation has moved out of `/speccy`'s post-approval bundle and into `/build`'s
> own find-or-create pre-flight. This doc now describes only the **find-or-create
> contract** (who creates or resumes a worktree, and how) and **teardown** — it no
> longer describes `/speccy`'s handoff bundle, which no longer exists. `/speccy`
> now only writes the spec file and the pending-build marker.

Shared worktree-lifecycle rule for `build`, `ship`, and `sync`. `/build` owns
find-or-create (creation on a fresh spec, resumption on an interrupted one);
`/ship` and `/sync` own teardown of the resulting worktree once its PR is
finished. mad-skills does not invent its own worktree creation or teardown
mechanism — this file only defines *when* creation/resumption happens and how
the worktree is torn down, reusing the mechanisms already established by
`specs/worktree-discipline-guardrails.md` (CON-001).

## Creation — find-or-create (build-owned)

`/build`'s **first action** against a spec is find-or-create (REQ-002). It
still refuses to run without a real spec file argument (REQ-001) — the
traceability forcing function is unchanged — but the *worktree* is now
`/build`'s to find or create, not a precondition `/speccy` must have satisfied.

The decision flow (REQ-002–REQ-006):

```
spec has valid branch+worktree_path AND worktree exists?
  yes → resume (skip creation)
  no  → branch/worktree exists but locked or has an open PR? (REQ-003)
          yes → stop, report conflict
          no  → create (REQ-004, REQ-005)
```

- **Resume (REQ-002).** Read the spec's frontmatter for `branch`/`worktree_path`.
  If both are present AND a live worktree exists at that path checked out on
  that branch, resume it directly — converge on the front-load checkpoint and
  autonomous loop (REQ-006), no re-creation.
- **Lock/PR-awareness (REQ-003).** If there is no valid existing worktree, but a
  branch matching this spec's derived slug already exists (locally or on the
  remote) with a *locked* worktree, or an *open PR* already exists for that
  branch (`gh pr list` / AzDO equivalent), `/build` MUST NOT create a second,
  competing worktree/branch. It reports the conflict (lock holder, or existing
  PR URL) and stops. This is a **stop condition, not something to route around**
  (CON-002) — it closes the `real-talk` duplicate-PR failure mode.
- **Create, commit-before-worktree (REQ-004).** Otherwise create, in this exact
  order: (1) fetch/sync the default branch; (2) create a new branch pointed at
  current `origin/main` (or the resume-target ref) *in the current working
  directory* — git branches are repo-wide, not worktree-local, so no worktree is
  needed yet; (3) update the spec's frontmatter in place with `branch` and
  `worktree_path`, and content-hash it; (4) commit that updated spec as the new
  branch's **first commit**; (5) **only then** create the worktree, checking out
  the already-populated branch. Because the spec is never written to disk
  uncommitted before the worktree exists, there is no window in which a
  pre-worktree draft can be orphaned in the invoking checkout — the orphaned-draft
  bug class (LOGBOOK.md, 2026-07-22) cannot recur by construction, not by added
  cleanup.
- **Push + draft PR (REQ-005).** After worktree creation, `/build` pushes the
  branch and opens a draft PR — `bash skills/ship/scripts/create-pr.sh --draft`,
  idempotent (reuses any existing open PR rather than erroring). This is now the
  **only** creation path for the PR — it is no longer a backstop for a bundle
  that might have failed upstream.
- **Converge (REQ-006).** Whether resumed or freshly created, `/build` proceeds
  identically from here — both paths meet at the single front-load checkpoint
  and the autonomous loop.

**Mechanism for worktree creation** — use whichever is available, in this order,
exactly as `specs/worktree-discipline-guardrails.md` establishes (CON-001):

1. **Harness native tool** — `EnterWorktree` (creates under `.claude/worktrees/`
   and switches the session's own working directory).
2. **Superpowers fallback** — `using-git-worktrees`, if the harness tool is
   unavailable and Superpowers is installed.

mad-skills does not call `git worktree add`/`remove` directly and does not
prescribe a path convention beyond what the chosen mechanism already uses
(CON-001).

**Refusal that survives is no-spec-file, not no-worktree (REQ-001, AC-011).**
`/build` no longer uses git-native worktree detection
(`git rev-parse --git-common-dir` vs `--git-dir`) to refuse — that check is
gone, replaced by find-or-create. The one refusal that remains is the missing
*spec file*: invoked without a spec argument (or with a path that doesn't
resolve to an existing `specs/*.md`), `/build` refuses immediately, directing
the user to run `/speccy` first — same fail-fast shape as before, just naming
the spec (not the worktree) as the missing precondition.

## Sentinel file: `.mad-skills-auto` (no longer written)

`.mad-skills-auto` is **no longer written** by any skill (REQ-012). `/speccy`
previously dropped it at the worktree root during its `--auto` bundle to mark a
worktree as belonging to an autonomous run; under find-or-create there is no
such propagated git-side autonomy state, since `/build`'s execution is now
uniform regardless of how the spec was produced (REQ-008). The
`--auto`/interactive distinction on `/speccy` still governs *speccy's own*
interview mode, but no longer writes any sentinel or worktree-local `mode: auto`
field.

This is dead-code context, not an active mechanism. `sync.sh` still contains
sentinel-restore logic that reads this file; that code is now unreachable in
practice but is out of scope to remove here — it is simply never exercised,
because nothing writes the sentinel anymore.

## Teardown

A `/build`-originated worktree persists until its PR is **finished**, then is
torn down by `sync.sh`'s existing worktree-mode removal — no new teardown
mechanism is built (REQ-015). Teardown remains owned by whichever mechanism
created the worktree (`ExitWorktree` for native `.claude/worktrees/`,
`finishing-a-development-branch` for Superpowers-created worktrees); mad-skills
does not take on lifecycle ownership beyond `specs/worktree-discipline-guardrails.md`
(CON-001).

A branch is **finished** when `sync.sh` recognizes it as safe to tear down:
merged into the default branch, its upstream gone (squash-merge signature), OR
— new, REQ-014 — its PR is `CLOSED` without being merged. This last clause
closes the gap where an abandoned (closed, not merged) PR's worktree was
previously treated as perpetually unfinished. The exact PR-state check and its
dual-platform (GitHub / AzDO) form live in `skills/sync/scripts/sync.sh`; this
file only records that closed-not-merged now counts as finished. `/ship --auto`'s
post-merge teardown reaches this same `sync.sh` logic on every autopilot run,
identically to interactive `/ship`.

## Why build owns creation now (rationale)

The forcing function's actual value — "every autonomous build traces to a
reviewable spec" — never depended on *where* the git state was created, only on
*whether a spec was required first* (REQ-001 preserves that exactly). Relocating
creation into `/build` makes the same spec **resumable** across interruptions
and sequential phases, and lets commit-before-worktree structurally fix the
orphaned-draft bug rather than patching it after the fact.

Lock/PR-awareness is a **stop condition, not a merge/join**: the `real-talk`
incident's failure was routing *around* a lock into a second branch, producing a
duplicate PR against already-merged work. The fix isn't smarter merging of
concurrent work — it's refusing to start a second, competing line of work at
all, and telling the operator what's already in flight.
