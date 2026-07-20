# Build Pipeline

`/build`'s self-evaluating, autonomous-by-default procedure — the only mode
(REQ-008); there is no separate interactive build mode. SKILL.md only
dispatches to this file per stage (REQ-002, REQ-015). The entire run happens
inside the git worktree `/speccy` already created (REQ-001, either mode) —
every file-tool call uses absolute paths rooted at that worktree, matching
`stage-prompts.md`'s absolute-path rule.

The one invariant carried through every stage below: each subagent report
MUST capture rationale ("why"), not just outcome ("what"), mirroring the
existing `EXPLORE_REPORT`/`ARCH_REPORT` reasoning fields (GUD-005). The PR
report (REQ-030) is assembled from these rationale fields — smaller context,
not shallower reasoning.

---

## Worktree refusal (REQ-009)

Runs in pre-flight, before any stage — this replaces the old `autonomy_ready`
hard gate as `/build`'s actual precondition check. `/build` MUST NOT create
its own worktree under any circumstance; it only ever operates inside one
`/speccy` already created (`references/autonomous-worktree-lifecycle.md`).

Detection is pure git-native, not the `.mad-skills-auto` sentinel (that
sentinel only marks `--auto` runs; REQ-001 means an interactive `/speccy` run
also produces a worktree `/build` must recognize) — compare
`git rev-parse --git-common-dir` against `git rev-parse --git-dir`:

```
GIT_DIR=$(git rev-parse --git-dir)
GIT_COMMON_DIR=$(git rev-parse --git-common-dir)
```

They differ inside a linked worktree and match inside a main working copy.
`/build` proceeds when they differ; when they match, it refuses immediately
— no partial work, no attempt to create a worktree itself — and prints
exactly (AC-004 pattern):

```
❌ /build refused — no worktree found.

   /build only ever runs inside a worktree /speccy already created; it
   never bootstraps its own. That guarantees every autonomous build traces
   back to a reviewable spec, not a bare prompt.

   Fix: run `/speccy {ticket}` first (with or without --auto) to create the
   worktree and spec, then re-run `/build` from inside it.
```

---

## Per-decision self-evaluation (REQ-010, REQ-011)

Whenever implementation surfaces a genuine ambiguity, run this three-step
check, in order:

1. **Covered by the spec's Assumption Authorization list?** → resolve per
   that authorization, silently; report the resolution in the PR.
2. **Not covered — does it touch a risk-keyword path
   (`references/autonomous-review-thresholds.md`) or an architectural-surface
   marker (`references/autonomous-architecture-surface-markers.md`)?**
   → interview, deferred to the next checkpoint (see the mid-build question
   mechanism below).
3. **Not covered, not risky** → decide, record a new Assumption Authorization
   entry in the spec, and keep going.

`autonomy_ready` is no longer a hard precondition (superseding the gate this
section replaces) — it's now a weighting signal on the boundary between
"interview" (step 2) and "decide" (step 3) for genuinely borderline cases:
`autonomy_ready: true` nudges a borderline ambiguity toward step 3; `false`
or absent nudges it toward step 2. It never overrides a clear-cut case — an
ambiguity that plainly touches a risk-keyword path or architectural-surface
marker still gets interviewed even on a `true` spec, and a plainly low-risk
ambiguity still gets decided even on a `false`/absent one.

---

## Early draft PR (REQ-014 (unified-autonomous-build.md))

Open the PR as a draft at or before the first substantive implementation
work (Stage 4), so every checkpoint interview and evidence artifact from
here on has somewhere to attach. The spec file is already the branch's
first commit (`/speccy`'s existing behavior) by the time `/build` starts, so
there's always something to open a PR against.

Call `skills/ship/scripts/create-pr.sh` directly:

```
skills/ship/scripts/create-pr.sh <PLATFORM> "<TITLE>" <BODY_FILE> <SOURCE_BRANCH> \
  --draft [--target-branch=<BRANCH>] [--remote=<NAME>] \
  [--azdo-mode=cli|rest --azdo-org-url=<URL> --azdo-project=<NAME> --azdo-project-url-safe=<NAME>]
```

- `PLATFORM`, the AzDO flags, `--target-branch`, and `--remote` reuse the
  same platform detection the orchestrator resolves for `/ship` — don't
  re-detect.
- `BODY_FILE` at this stage holds a minimal placeholder body (title, spec
  link); the full Summary/Risks/Validation report (REQ-030) isn't assembled
  until Stage 9 — checkpoint interviews and evidence steps update the PR as
  the run progresses.
- Idempotent: the script checks for an existing open PR on `SOURCE_BRANCH`
  first and reuses it (`reused=true` in its `PR_REPORT_BEGIN`/`END` output)
  rather than erroring. This matters because `/ship --auto`'s Stage 9 calls
  the same script again on the same branch — it reuses this draft PR
  instead of creating a second one.
- Capture the returned `pr_url`: every checkpoint-interview comment and
  evidence artifact from here on posts against it.

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
it as **stuck** (§2 Definitions) and escalate via the mid-build question
mechanism below (REQ-021) — do NOT attempt a 3rd fix.

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

## Mid-build question mechanism — checkpoint timing & channel delivery (REQ-012, REQ-013, REQ-024–REQ-028)

Triggered only when the per-decision self-evaluation above (REQ-010) lands on
step 2 (interview), or when a finding-set goes stuck (REQ-021).

**Checkpoint-only timing (REQ-012):** ambiguity may be *detected* the moment
implementation hits it, but the question itself is only ever surfaced at a
defined checkpoint — immediately after handoff (before implementation
begins), at code-review, or at verify. Never mid-implementation. In the
meantime, continue any other independent work that doesn't depend on the
answer (REQ-024) rather than blocking the whole run on one open question.

**Channel-adaptive delivery (REQ-013 (unified-autonomous-build.md)):**

- **Live interactive session watching** → ask directly via `AskUserQuestion`
  with an explicit recommendation. The answer is available synchronously, so
  no PR round-trip is needed.
- **Headless / unattended** → the existing PR-comment mechanism:
  1. **Compose a rich artifact (REQ-025):** multiple well-communicated
     options, pros/cons for each, an explicit recommendation, and supporting
     visuals via the same evidence-capture tooling where relevant — never an
     open-ended "what do you think?"
  2. **Post as a comment on the draft PR (REQ-026)** already open for this
     work (per Early draft PR, above), capturing the returned `comment_url`.
  3. **Notify (REQ-027)** per `references/autonomous-notification-payload.md`
     (repo root)'s channel-agnostic schema, with `channel: "pr-comment-only"`
     — no delivery beyond the comment already posted.
  4. **Pause or continue (REQ-028):** keep working remaining independent
     items, or pause if nothing independent remains, until the PR-comment
     reply is picked up by a follow-up pass or the original session if still
     live.

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
consumes this — see `skills/ship/` for the PR-gated stop and report format.
