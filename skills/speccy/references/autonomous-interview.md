# Speccy Autonomous Interview (`--auto`)

The `--auto`-mode procedure for `/speccy`, dispatched from SKILL.md (REQ-002 —
no inline branching lives in SKILL.md). Reuses the interactive interview
wholesale; the only differences are worktree-first setup (REQ-003), a
completeness gate (REQ-009), and a subagent-run spec write (REQ-033). Where
this file says "as interactive speccy," follow SKILL.md's existing stages
unchanged.

---

## Stage 0: Worktree (first action, before anything else)

Worktree creation is the literal first action — it happens before anything
else, full stop. Nothing in Stage 1 (not context gathering, not the Pre-Spec
Location Check, not the Pre-Spec Branch Check) runs before it.

Create the worktree and branch as `/speccy --auto`'s **literal first action**,
before Stage 1 context gathering — earlier than the Pre-Spec Location Check
and Pre-Spec Branch Check, both of which still run afterward inside the new
worktree. Use the mechanism and sentinel-file steps defined in
`references/autonomous-worktree-lifecycle.md` (repo root; harness
`EnterWorktree`, or the Superpowers `using-git-worktrees` fallback) — do not
re-describe or reinvent that mechanism here. All subsequent file-tool calls use absolute paths rooted
at the new worktree.

**This is a performed action, not a plan.** Before writing or saying anything
else — before the invocation banner, before Stage 1 — actually call the
worktree-creation mechanism and confirm it succeeded, e.g.:

```
$ EnterWorktree feat/{slug}          # or: git worktree add ../feat-{slug} -b feat/{slug}
  → worktree ready at <path>, sentinel .mad-skills-auto written
```

Then continue. If asked "what was the first action," the correct answer is
the completed result above ("created the worktree at `<path>`"), not a
description of the mechanism.

---

## Stage 1–2: Context & Interview (as interactive speccy)

Run Stage 1 (Context Gathering) and Stage 2 (Interview Rounds) exactly as the
interactive flow in SKILL.md, including Superpowers deferral when detected. The
interview runs **for real** — same AskUserQuestion round style, same 4-per-round
limit, same recommendations. `--auto` does **not** infer a spec from a one-line
ticket with zero interview; that is explicitly out of scope (spec §1). The
only thing `--auto` changes is that the interview must additionally surface, for
every ambiguity it raises, a resolution — decided now, or explicitly delegated
to `/build` (recorded in the Assumption Authorization list, Stage 3).

---

## Stage 3: Completeness gate + spec write (in a subagent, REQ-033)

On a full pass — every gate item below satisfied — the written spec's
frontmatter literally contains:
```yaml
autonomy_ready: true
```
On any gate item failing, that line reads `autonomy_ready: false` instead,
and the spec is written anyway — the gate never blocks spec creation.

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

## Stage 4: First commit (REQ-006)

Once the subagent returns and the spec exists, commit the spec file inside the
worktree as the branch's **first commit** — pass or fail on the gate (REQ-010
writes it either way). Use a conventional-commit message, e.g.
`docs(specs): add {slug} spec (autonomy_ready: {true|false})`. Update the
`.mad-skills-auto` sentinel's `stage:` line to `speccy` per
`references/autonomous-worktree-lifecycle.md` (repo root).

---

## Output & Handoff

Report as the interactive flow does (Speccy · Report box), then add one line
stating `autonomy_ready` and, if `false`, which gate items failed and that
`/build --auto` will refuse this spec (REQ-011) while interactive `/build`
will not. Write the pending-build marker as usual. Do NOT invoke `/build`
yourself — the handoff artifact is the committed spec.
