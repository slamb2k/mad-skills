# Build Pipeline

`/build`'s self-evaluating, autonomous-by-default procedure — the only mode
(REQ-008); there is no separate interactive build mode. SKILL.md only
dispatches to this file per stage (REQ-002, REQ-015). The entire run happens
inside the git worktree `/build`'s find-or-create pre-flight resumed or created
for this spec (`references/autonomous-worktree-lifecycle.md`) — every file-tool
call uses absolute paths rooted at that worktree, matching `stage-prompts.md`'s
absolute-path rule.

The one invariant carried through every stage below: each subagent report
MUST capture rationale ("why"), not just outcome ("what"), mirroring the
existing `EXPLORE_REPORT`/`ARCH_REPORT` reasoning fields (GUD-005). The PR
report (REQ-030) is assembled from these rationale fields — smaller context,
not shallower reasoning.

---

## Find-or-create (REQ-002–REQ-006)

`/build`'s first pre-flight action, before any stage — this replaces the old
git-native worktree-refusal check. `/build` now finds or creates its own
worktree/branch/draft-PR for the spec: resume a valid existing one, stop on a
lock/PR conflict (REQ-003), or create fresh (commit-before-worktree, REQ-004;
push + draft PR, REQ-005). The canonical flow lives in
`references/autonomous-worktree-lifecycle.md`'s "Creation — find-or-create"
section; SKILL.md's Pre-flight carries the operational summary. This file does
not restate it.

The one refusal that survives is the missing **spec file** (REQ-001, AC-011),
not a missing worktree: invoked with no resolvable `specs/*.md` argument,
`/build` refuses immediately — no partial work, no attempt to route around it —
and prints exactly:

```
❌ /build refused — no spec file.

   /build only ever runs against a real spec file; it never builds from a
   bare prompt. That guarantees every autonomous build traces back to a
   reviewable spec.

   Fix: run `/speccy {ticket}` first (with or without --auto) to create the
   spec, then re-run `/build {spec path}`.
```

---

## Per-decision self-evaluation (REQ-010, REQ-011)

After the single front-load checkpoint (REQ-007), every ambiguity is resolved
without a mid-build interview (REQ-008). Whenever implementation surfaces a
genuine ambiguity, run this check, in order:

1. **Covered by the spec's Assumption Authorization list?** → resolve per
   that authorization, silently; report the resolution in the PR.
2. **Not covered** → decide, record a new Assumption Authorization entry in the
   spec, and keep going (GUD-002 — every such decision is reported, same
   discipline as authorized-assumption reporting).

The former middle step — "touches a risk-keyword/architectural-surface marker →
interview at the next checkpoint" — is removed (REQ-008). Risk-keyword and
architectural-surface markers still drive review-depth dispatch (Stage 5), but
they no longer trigger a mid-build interview; the decision is made, recorded,
and left visible for normal PR review. `autonomy_ready` is no longer a
precondition or a weighting signal on this decision.

---

## Draft PR (REQ-005)

The draft PR is opened by find-or-create in pre-flight, not at Stage 4 — it is
now the **only** creation path, not a backstop for an upstream bundle. Both the
mechanics (`create-pr.sh --draft`, its flags, idempotent reuse, and the
placeholder body updated as the run progresses) and the timing (before the first
substantive implementation work) are described in
`references/autonomous-worktree-lifecycle.md`'s "Creation — find-or-create"
section (REQ-005). Capture the returned `pr_url`; every evidence artifact from
here on posts against it. `/ship --auto`'s merge stage calls the same
idempotent script on the same branch and reuses this PR.

---

## Model tiering (REQ-013 (autonomous-execution-mode.md))

Implementation subagents (Stage 4 and every fix-loop subagent) run on
**Sonnet** — mechanical edits against a fully-specified spec don't need a
higher tier. Explore, architect, review, and verify keep whatever tier best
fits their judgment requirements — unchanged from interactive defaults, NOT
forced to Sonnet. Recorded in `architecture-notes.md`'s Agent Type Selection
table.

**Resolved interaction (Stage 4 + Superpowers deferral):** the Skill tool
`/build` uses to invoke `superpowers:executing-plans` /
`superpowers:subagent-driven-development` (see
`references/superpowers-deferral.md`) has no model-override parameter, so
REQ-013's Sonnet mandate cannot be forced through that invocation. Resolution:
Stage 4 never defers to Superpowers, even when detected and
`--no-superpowers` is not set — it always runs the standalone Sonnet path
below, so REQ-013 stays enforceable on the one path that's actually possible
to enforce it on.

---

## Architect stage — roadmap reference (REQ-014 (autonomous-execution-mode.md))

The architect subagent MUST read and explicitly reference the spec's
roadmap/what's-next section when choosing an approach, so the design fits the
project's stated direction rather than only the immediate change. Its
`ARCH_REPORT` MUST record *why* the chosen approach fits (or deliberately
departs from) that roadmap — this reasoning flows into the PR's Summary.

---

## Parallel implementation — cross-file consistency check

Whenever Stage 4 dispatches more than one implementer subagent concurrently
(a `parallel_group` from ARCH_REPORT), each isolated-context agent can touch
shared identifiers — spec REQ/AC number citations, cross-file references,
renamed section headings, shared terminology — without seeing what sibling
agents changed. This is a distinct risk from the git-level races that
motivate `subagent-driven-development`'s parallel-dispatch ban (Stage 4 never
commits during implementation, see Model tiering above) — it's semantic
drift between isolated agents, not a git conflict.

**Trigger:** after each parallel group completes, before dispatching any
group that `depends_on` it (or before proceeding to Stage 5, if none
remain), dispatch ONE lightweight subagent to check whether shared
identifiers introduced or touched by this group's files still agree with
what sibling files — in this group or already-completed groups — assume.
Concretely: REQ/AC citations, renamed section headings still referenced
elsewhere, terminology introduced in one file used inconsistently in
another.

**On drift found:** report it immediately and dispatch a targeted fix before
continuing — do not wait for Stage 5. This is deliberately NOT a full review
(no spec-compliance or code-quality judgment, just cross-file agreement) —
Stage 5 still does the substantive review; this check only closes the gap
isolated-context parallel dispatch is actually prone to.

**On no drift:** proceed silently. This adds one subagent dispatch per
parallel group, not per task, keeping cost far below a per-task review loop.

**Skip when:** the group has only one implementer — no isolation gap to
check.

---

## Review-depth dispatch (REQ-015, GUD-002)

After implementation, before dispatching review, select depth using the
threshold table in `references/autonomous-review-thresholds.md` (repo root):
compute the changed-file set (`git diff --name-only` against the branch base),
then apply the file-count-plus-risk-keyword-path rule to pick **Standard** or
**Deep**. The rule is an OR — either >10 files or any risk-keyword path forces
Deep.

The ORCHESTRATOR (this `/build` thread) then invokes the native
`/code-review` and `/security-review` commands directly via the Skill tool —
the same pattern `/build` already uses to invoke `/ship` at Stage 9 and
`/prime` in setup. These native commands run their own internal multi-agent
orchestration, so REQ-032's isolation intent is satisfied without a bridging
mechanism. Pass the selected depth as their effort/scope input.

---

## Fix loop (REQ-016, REQ-021)

For each finding-set surfaced by review:

1. Dispatch a Sonnet fix subagent with the findings.
2. Re-run the relevant native review command on the result.
3. If findings remain, repeat — **max 2 attempts per finding-set** (matching
   `/ship`'s existing CI-fix retry cap).

After 2 consecutive failed fix→re-review cycles on the same finding-set, treat
it as **stuck** (§2 Definitions) — do NOT attempt a 3rd fix. Decide and record
per the per-decision self-evaluation (REQ-008): record the stuck finding-set as
a new Assumption Authorization entry in the spec (what was attempted, why it's
being left) and continue; it stays visible for normal PR review. No mid-build
interview is raised.

---

## Verify against Definition of Done (REQ-017, REQ-020)

The ORCHESTRATOR invokes the native `/verify` command (same direct-invoke
pattern). `/verify` MUST check the implementation against the spec's
`## Definition of Done` checklist **item by item** — not a general "looks
done" judgment. Each checklist item is either verified-via-evidence or
outstanding.

The Definition of Done is the completion signal (REQ-020): the run is finished
when *every* checklist item is checked, NOT when it merely stops finding more
work to do.

---

## Long-run guardrails — `/goal` + `/loop`, with manual fallback (GUD-001)

Wrap the implement→review→verify cycle so it can run unattended while staying
bounded. Preferred mechanism (when available):

- Run `/goal` with a completion condition: *"every Definition-of-Done item is
  verified via /verify output visible in the transcript, or {iterations} loop
  cycles have elapsed."* `/goal`'s evaluator is a fast model reading transcript
  content after each turn — it cannot run commands or read a clock.
- Pair with `/loop` (auto mode) so tool calls run unattended, one
  implement→review→verify cycle per iteration.

Because the `/goal` evaluator can't read a clock, the orchestrator MUST print
elapsed wall-clock time at the top of each cycle so the 4h default cap
(`BUILD_AUTO_WALLCLOCK`) can be enforced as a hard stop when noticed. Token
budget (`--budget`, default 5,000,000) has no native primitive — track it as
an explicit counter in build's own run state (a plain integer the orchestrator
increments per subagent dispatch; NOT the Workflow tool's budget object, which
is a different execution context). Exhausting the budget halts new subagent
dispatch and reports what's done vs outstanding.

**Manual-loop fallback** (when `/loop`/`/goal` aren't available): run a plain
bounded loop in the orchestrator — repeat implement→review→verify until every
Definition-of-Done item is checked OR the iteration cap (`--iterations`,
default 20) is hit OR the wall-clock cap is hit OR the budget counter is
exhausted. Identical caps to the `/goal` path — GUD-001 is a SHOULD, so the
fallback is a first-class path, not a degraded one.

Hitting ANY cap forces stop-and-report (AC-003): print exactly which
Definition-of-Done items are done vs outstanding. Never silently continue past
a cap.

---

## Evidence capture (REQ-022, REQ-023, GUD-003)

After `/verify` passes, run a dedicated evidence-capture stage:

1. Start the app's dev server **inside the run's own worktree** on a
   dynamically allocated port — get it from `scripts/free-port.sh` (bind-to-0,
   never a fixed default; concurrency safety per AC-006).
2. Drive the spec's acceptance-criteria flows via Claude in Chrome or
   Playwright, checking both **functional correctness** and **visual/aesthetic
   consistency** with the existing app.
3. Capture evidence following the degradation chain, best tier first:
   **video → animated GIF → annotated screenshot sequence → text-only
   explanation.**

ALWAYS state the tier actually achieved explicitly in the PR — never silently
downgrade (AC-005). If the dev server can't start (no runnable dev server, or
neither Claude in Chrome nor Playwright available), degrade straight to
text-only and say so plainly, e.g. *"evidence capture fell back to text-only —
no runnable dev server found; manual verification recommended before merge."*

**GUD-003 (design-now, not exercised at single-run implementation time):**
evidence capture is the most resource-hungry stage, so under future concurrent
-runs contention it SHOULD queue rather than fail outright. Only single-run is
exercised now — mark the queue behavior as a designed-for-later hook.

---

## Checkpointing — automatic `/ferry` (GUD-004)

At major stage boundaries, the orchestrator automatically invokes `/ferry` to
write a waybill and checkpoint context — always automatic, since `/build` has
no other mode to offer a conditional prompt in. With no human present to judge
"is context large enough to warrant this," automatic is the safer default
(AC-009 (autonomous-execution-mode.md)). Wired at two concrete trigger points:

- **speccy → build:** `skills/speccy/SKILL.md`'s Output & Handoff section
  invokes `/ferry` before handing off to `/build`.
- **build → ship:** `skills/build/SKILL.md`'s Stage 9 invokes `/ferry`
  before dispatching `/ship`.

---

## PR report assembly (feeds REQ-030)

Because every stage report above carries rationale, not just outcome
(GUD-005), the orchestrator can populate the PR body directly from them:
Summary (architect reasoning), Risks (review + architect risks), How It Was
Validated (verify results + evidence tier), Further Testing Needed (any
outstanding/degraded items), Assumptions Made (the spec's assumption-
authorization list plus whatever `/build` actually decided). `/ship --auto`
consumes this — see `skills/ship/` for the full-autopilot merge and report
format.
