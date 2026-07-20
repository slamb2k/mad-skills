# Build Autonomous Pipeline (`--auto`)

The `--auto` procedure for `/build`. SKILL.md only dispatches to this file
per stage (REQ-002); all autonomous-specific logic lives here. The entire
`--auto` run happens inside the git worktree `/speccy --auto` already created
(REQ-004) — every file-tool call uses absolute paths rooted at that worktree,
matching `stage-prompts.md`'s absolute-path rule.

The one invariant carried through every stage below: each subagent report
MUST capture rationale ("why"), not just outcome ("what"), mirroring the
existing `EXPLORE_REPORT`/`ARCH_REPORT` reasoning fields (GUD-005). The PR
report (REQ-030) is assembled from these rationale fields — smaller context,
not shallower reasoning.

---

## Gate check — `autonomy_ready` (AC-001)

Runs in pre-flight, before any stage. Read the target spec's frontmatter via
`scripts/lib/frontmatter.js` and require `autonomy_ready: true`.

```
_R="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/marketplaces/slamb2k}"
node --input-type=module -e "
  import { parseFrontmatter } from '$_R/scripts/lib/frontmatter.js';
  import { readFileSync } from 'node:fs';
  const fm = parseFrontmatter(readFileSync(process.argv[1], 'utf8')) || {};
  process.stdout.write(String(fm.autonomy_ready === 'true'));
" "<spec-path>"
```

On `false` or absent, STOP immediately (do not implement anything, do not
fall back to interactive mode silently). Print exactly:

```
❌ /build --auto refused — spec is not autonomy-ready.

   {spec-path} has autonomy_ready: {false | (absent)}.

   The completeness gate requires all of: outcome, architecture/approach,
   non-goals, a literal Definition of Done checklist, a roadmap/what's-next
   section, risks, and an assumption-authorization entry per unresolved
   ambiguity. Missing from this spec:
     • {each missing gate item, one per line}

   Fix: run `/speccy --auto` to complete the interview and set
   autonomy_ready: true, or run plain `/build {spec-path}` interactively.
```

Determine the missing items by scanning the spec body for the required
sections (`## Definition of Done`, roadmap/what's-next, `## Assumption
Authorization`, non-goals, risks). List whichever are absent.

---

## Model tiering (REQ-013)

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
in `--auto` mode, Stage 4 does NOT defer to Superpowers, even when detected
and `--no-superpowers` is not set — it always runs the standalone Sonnet path
below, so REQ-013 stays enforceable on the one path that's actually possible
to enforce it on.

---

## Architect stage — roadmap reference (REQ-014)

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

The ORCHESTRATOR (this `/build --auto` thread) then invokes the native
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
it as **stuck** (§2 Definitions) and escalate via the headless question
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

## Headless mid-build question mechanism (REQ-024–REQ-028)

Used only when explore surfaces a decision outside the spec's assumption-
authorization list, or when a finding-set goes stuck (REQ-021).

1. **Continue independent work first (REQ-024):** don't block the entire run
   on one open question — proceed with any other Definition-of-Done items that
   don't depend on the answer.
2. **Compose a rich artifact (REQ-025):** multiple well-communicated options,
   pros/cons for each, an explicit recommendation, and supporting visuals via
   the same evidence-capture tooling where relevant. Never an open-ended "what
   do you think?"
3. **Post as a comment on the (draft) PR (REQ-026)** already open for this
   work, capturing the returned `comment_url`.
4. **Notify (REQ-027)** per `references/autonomous-notification-payload.md`
   (repo root)'s channel-agnostic schema:
   - Live interactive session → `channel: "push"`, sent via the
     `PushNotification` tool.
   - Headless / unattended → `channel: "pr-comment-only"`, no delivery beyond
     the comment already posted.
5. **Pause or continue (REQ-028):** keep working remaining independent items,
   or pause if nothing independent remains, until the PR-comment reply is
   picked up by a follow-up `--auto` pass or the original session if still
   live.

---

## Checkpointing — automatic `/ferry` (GUD-004)

At major stage boundaries, the orchestrator automatically invokes `/ferry` to
write a waybill and checkpoint context — automatic in `--auto` mode, unlike
interactive mode's conditional offer. With no human present to judge "is
context large enough to warrant this," automatic is the safer default
(AC-009). Wired at two concrete trigger points:

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
