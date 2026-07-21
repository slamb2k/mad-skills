# Speccy Autonomous Interview (`--auto`)

The `--auto`-mode procedure for `/speccy`, dispatched from SKILL.md (REQ-002 —
no inline branching lives in SKILL.md). Before any interview happens, `--auto`
first runs a deterministic Eligibility Gate; a full pass skips the interview
entirely via Zero-Interview Inference (Stage A). On any single eligibility
check failing, `--auto` falls back to the interactive interview wholesale —
the only differences from plain interactive `/speccy` in that fallback path
are a completeness gate (REQ-009) and a subagent-run spec write (REQ-033).
The post-approval handoff bundle runs identically for both modes. Where this
file says "as interactive speccy," follow SKILL.md's existing stages
unchanged.

---

## Stage 0: No git state before approval (bundled-approval-handoff.md REQ-001)

`/speccy --auto` creates **no worktree, branch, commit, or PR** until the spec
is approved (AC-001). The entire `--auto` flow — the Eligibility Gate,
Zero-Interview Inference (Stage A), and the fallback interview (Stages 1–3) —
runs in the plain invoking working directory. This supersedes the former
"worktree first" model (`unified-autonomous-build.md` REQ-001), per
`specs/bundled-approval-handoff.md`.

The **approval moment** for `--auto` is when zero-interview inference completes
and passes its checks (Stage A), or when the fallback interview's Decision
Summary is confirmed (Stage 3). All git state is created at that moment by the
handoff bundle — see the **Post-approval handoff bundle** section below, which
is where the former "worktree first" step now lives.

---

## Eligibility Gate (`--auto` only, REQ-002)

Runs before any interview stage, in the plain working directory (no git state
yet) — only when `--auto` was passed. Interactive (non-`--auto`) `/speccy`
never runs this gate; it goes straight to SKILL.md's existing interview flow.

A ticket is eligible for zero-interview inference only if **all four** of
the following dimensions pass:

1. **Estimated scope** — a keyword/glob exploration of the ticket text
   against the codebase finds ≤3 plausibly-touched files.
2. **Risk-keyword paths** — none of the matched files fall on the
   risk-keyword-path list in `references/autonomous-review-thresholds.md`
   (repo root) — LLM-judged against that table, not duplicated here.
3. **Architectural surface** — none of the matched files are a public/
   exported interface, a schema/migration file, or shared cross-cutting
   state module, per `references/autonomous-architecture-surface-markers.md`
   (repo root) — LLM-judged against that table, not duplicated here.
4. **Ticket clarity** — three mechanically-checkable sub-checks, all of
   which must pass: an allowed action verb at/near the start (add, fix,
   remove, rename, update, deprecate, document, extend); no hedge/
   uncertainty language (maybe, perhaps, "explore options for", "not sure",
   TBD, "some kind of"); the same exploration step resolves ≥1 concrete
   file/symbol match.

### Procedure

1. Run a keyword/glob exploration of the ticket text against the codebase
   (narrower version of Stage 1's Context Gathering) to find plausibly-
   touched files and resolve concrete file/symbol matches.
2. Run the mechanical half of the gate:
   ```
   bash skills/speccy/scripts/spec-eligibility-check.sh <ticket-file> <matched-file-count> <symbol-match-count>
   ```
   This covers dimension 1 (scope) and the three sub-checks of dimension 4
   (ticket clarity). It always exits 0 and prints a pass/fail report per
   item — treat any ❌ line as a failed dimension.
3. Judge dimensions 2 and 3 directly against the two reference tables above
   — no script covers these; combine your own reading of the matched files
   with the tables' categories.
4. Eligibility requires a full pass of all four dimensions. On any single
   failure, stop here and fall through to Stage 1–2 below (fallback) — do
   not partially apply zero-interview inference.

---

## Stage A: Zero-Interview Inference (on full eligibility pass, REQ-003–REQ-005)

Dispatch a single subagent to generate the spec from the ticket text, the
exploration matches, and codebase conventions — no interview rounds occur.

### Subagent prompt

```
Write a specification by inference from the ticket below. No interview
occurred, so every substantive decision you make must become an Assumption
Authorization entry (REQ-004).

## Ticket
{TICKET_TEXT}

## Exploration matches
{MATCHED_FILES_AND_SYMBOLS}

## Eligibility checks passed
{GATE_RESULTS}

## Your tasks

1. Read skills/speccy/references/spec-template-small.md and fill every
   section, informed by the matched files' existing conventions.
2. For every substantive choice you make that the ticket didn't specify
   (naming, exact approach, edge-case handling, etc.), add an Assumption
   Authorization entry: what's unresolved → what you decided → what the PR
   must report about it (REQ-004).
3. Fill the Autonomous Inference Assessment section with which of the four
   eligibility checks passed and why the ticket qualified (REQ-005).
4. Write the spec to specs/{slug}.md with the Write tool. Set
   `autonomy_ready: true` — zero-interview inference only reaches this stage
   after a full eligibility-gate pass.

## Output Format
SPEC_REPORT:
- spec_path: specs/{slug}.md
- autonomy_ready: true
- eligibility_checks: {the four dimensions and why each passed}
- key_decisions: {3-5 bullets}
- assumption_count: {count}
```

The orchestrator keeps only the subagent's returned report, not raw file
output (REQ-032, same discipline as Stage 3). No completeness-gate
self-review runs on this path — the small template is `autonomy_ready: true`
by construction via the eligibility gate plus REQ-004/005's assumption-
authorization process, not the completeness gate Stage 3 uses. Skip straight
to the post-approval handoff bundle.

---

## Stage 1–2: Context & Interview (fallback — on eligibility failure, REQ-006)

Reached whenever the Eligibility Gate above fails any single check (REQ-006)
— the fallback is silent and graceful, never an error or a "rejected"
message. Run Stage 1 (Context Gathering) and Stage 2 (Interview Rounds)
exactly as the interactive flow in SKILL.md, including Superpowers deferral
when detected. The interview runs **for real** — same AskUserQuestion round
style, same 4-per-round limit, same recommendations. Zero-interview
inference (Stage A) only ever applies to a ticket that passes the
eligibility gate in full; once any single dimension fails, `--auto` falls
back to this real interview — never a partial or forced inference. The only
thing `--auto` changes is that the interview must additionally surface, for
every ambiguity it raises, a resolution — decided now, or explicitly
delegated to `/build` (recorded in the Assumption Authorization list,
Stage 3).

---

## Stage 3: Completeness gate + spec write (fallback, REQ-033)

On a full pass — every gate item below satisfied — the written spec's
frontmatter literally contains:
```yaml
autonomy_ready: true
```
On any gate item failing, that line reads `autonomy_ready: false` instead,
and the spec is written anyway — the gate never blocks spec creation.

This same completeness gate is no longer exclusive to `--auto`: interactive
(non-`--auto`) `/speccy` applies the identical gate criteria in its own
Stage 3 self-review, and when its interview answers satisfy every item below,
its spec's frontmatter is also `autonomy_ready: true` (REQ-007) — even
though `--auto` was never passed.

Dispatch a single general-purpose subagent to write the spec. The orchestrator
passes it the GOAL, the confirmed decisions from Stage 2, the Stage 1 context
summary, and the two contract paths below. The orchestrator keeps only the
subagent's returned report, not raw file output (REQ-032).

### Subagent prompt

```
Write a specification from the interview decisions below, then self-review it
against the completeness gate and set the autonomy_ready frontmatter field.

## GOAL
{GOAL}

## Confirmed decisions
{DECISION_SUMMARY}

## Context
{STAGE_1_CONTEXT}

## Your tasks

1. Read skills/speccy/references/spec-template.md. Fill every applicable
   section, PLUS the three --auto-only sections (REQ-008):
   - `## Definition of Done` — a literal `- [ ]` checklist of checkable,
     testable statements. This is /build --auto's completion signal, so each
     item must be objectively verifiable, not prose.
   - `## Assumption Authorization` — one entry per ambiguity the interview
     surfaced but did not resolve outright, each mapping: what's unresolved →
     what /build may decide alone → what the PR must report about it.
   - A roadmap / what's-next section (fold into `## 11. Related
     Specifications / Further Reading` or a dedicated `## Roadmap` heading) so
     /build --auto's architect stage has forward context to reference.

2. Self-review against the completeness gate (below). Combine your own
   judgment with the structural check script:
   `bash skills/speccy/scripts/spec-completeness-check.sh specs/{slug}.md`
   (run it after a first draft; the script covers structure, you cover
   substance).

3. Set the `autonomy_ready` frontmatter field:
   - `true` — ONLY if every gate item passes (full pass).
   - `false` — if any gate item fails. Write the spec anyway (REQ-010); never
     block spec creation. A false spec is still usable by interactive /build.

4. Write the spec to specs/{slug}.md with the Write tool.

## Completeness gate (spec §2 Definitions)
A full pass requires ALL of:
  - Outcome: what the change achieves is stated unambiguously.
  - Architecture / approach: how it will be built is described.
  - Non-goals: what is explicitly out of scope is listed.
  - Definition of Done: literal `- [ ]` checklist present, every item checkable.
  - Roadmap context: forward/what's-next context present.
  - Risks: known risks/tradeoffs stated.
  - Ambiguities: at least one resolution (decided-now OR delegated-to-build via
    Assumption Authorization) for every ambiguity the interview identified.
No zero-interview inference: if the decisions are too thin to satisfy a gate
item, that item FAILS — do not invent content to force a pass.

## Output Format
SPEC_REPORT:
- spec_path: specs/{slug}.md
- autonomy_ready: true | false
- gate: {per-item pass/fail — outcome, architecture, non-goals,
    definition-of-done, roadmap, risks, ambiguities}
- gate_failures: {items that failed and why, or "none"}
- sections_written: {count}
- key_decisions: {3-5 bullets}
```

---

## Post-approval handoff bundle (bundled-approval-handoff.md REQ-002)

Once the subagent returns (from Stage A's zero-interview inference or the
fallback Stage 3) and the spec exists, the approval moment is reached. Run the
**handoff bundle** — the canonical ordered eight-step sequence defined in
`references/autonomous-worktree-lifecycle.md` (repo root), "Creation — the
handoff bundle" section. That section is the single source of truth for the
step order, blocking semantics (steps 1–6 block; step 7 degrades), the three
new frontmatter fields (`content_hash`, `branch`, `worktree_path`), and
branch-collision suffixing — do **not** restate the steps here.

For this `--auto` path specifically:
- The spec written by Stage A / Stage 3 is materialized inside the bundle's
  worktree (bundle step 4) and committed as the branch's **first commit**
  (bundle step 5) — pass or fail on the gate (REQ-010 writes it either way;
  Stage A's spec is always `autonomy_ready: true`). Use a conventional-commit
  message, e.g. `docs(specs): add {slug} spec (autonomy_ready: {true|false})`.
- The `.mad-skills-auto` sentinel is dropped at bundle step 3 with its
  `stage:` line set to `speccy`.

---

## Output & Handoff

Report as the interactive flow does (Speccy · Report box), then add one line
stating which path ran — zero-interview inference (Stage A) or fallback
interview (Stage 1–3) — and the resulting `autonomy_ready` value. If
`false`, name which gate items failed and note that `/build --auto` will
refuse this spec (REQ-011) while interactive `/build` will not. The
pending-build marker's timing follows the bundle's blocking semantics (see the
canonical bundle in `references/autonomous-worktree-lifecycle.md`): the marker
is written only in the degraded-PR or full-success paths; a degraded PR reports
the exact `bash skills/ship/scripts/create-pr.sh --draft` retry command. Do NOT
invoke `/build` yourself — the handoff artifact is the committed spec.
