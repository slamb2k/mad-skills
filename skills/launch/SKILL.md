---
name: launch
description: "Run the full OMC idea-to-merged-PR pipeline — cancel + deep-interview + ralplan + autopilot + mad-skills:ship — in a single invocation. Explicit-only; this skill never auto-activates. Only run when the user literally types /launch. Do not invoke on phrases like \"launch this\", \"ship it\", \"full pipeline\", or similar — none of those should trigger this skill."
argument-hint: "<rough idea for the feature>"
allowed-tools: Bash, Read, Skill
disable-model-invocation: true
---

# Launch — Idea → Merged PR, end-to-end

When this skill is invoked, IMMEDIATELY output the banner below before doing anything else.
Pick ONE tagline at random — vary your choice each time.
CRITICAL: Reproduce the banner EXACTLY character-for-character. The first line of the art has 4 leading characters (one invisible braille-blank + 3 spaces) — you MUST preserve them.

```
{tagline}

⠀   ██╗██╗      █████╗ ██╗   ██╗███╗   ██╗ ██████╗██╗  ██╗
   ██╔╝██║     ██╔══██╗██║   ██║████╗  ██║██╔════╝██║  ██║
  ██╔╝ ██║     ███████║██║   ██║██╔██╗ ██║██║     ███████║
 ██╔╝  ██║     ██╔══██║██║   ██║██║╚██╗██║██║     ██╔══██║
██╔╝   ███████╗██║  ██║╚██████╔╝██║ ╚████║╚██████╗██║  ██║
╚═╝    ╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝╚═╝  ╚═╝
```

Taglines:
- 🚀 From idea to orbit!
- 🛫 Cleared for takeoff!
- 🎯 Zero-touch launch inbound!
- 🎆 3, 2, 1… liftoff!
- 🛰️ Launch sequence initiated!
- 🏁 One command, full launch!
- 🤖 Full auto, full send!
- ⚙️ The whole launchpad!

---

## Output Formatting

After the banner, display parsed input:

```
┌─ Input ────────────────────────────────────────
│  {Field}:  {value}
│  Flags:    {parsed flags or "none"}
└────────────────────────────────────────────────
```

Pre-flight results:

```
── Pre-flight ───────────────────────────────────
  ✅ {dep}           {version or "found"}
  ⚠️ {dep}           not found → {fallback detail}
  ❌ {dep}           missing → stopping
──────────────────────────────────────────────────
```

Stage headers: `━━ {N} · {Name} ━━━━━━━━━━━━━━━━━━━━━━━━━`

Status icons: ✅ done · ❌ failed · ⚠️ degraded · ⏳ working · ⏭️ skipped

---

## Purpose

`/launch` is a thin orchestrator over five existing skills. Its job is to run them in order and keep going between them — nothing more. Each inner skill owns its own stage-level concerns (state, hooks, reviewers, regression). Treat this wrapper as dumb: if any inner stage fails, stop and report — do not attempt retry logic here.

The collaboration window is **Stage 2 (deep-interview)**. Everything after is autonomous; any mid-pipeline pauses come from the inner skills surfacing `AskUserQuestion` prompts (e.g. an autopilot Phase 4 reviewer needs a call), not from this wrapper.

## Flags

Parse optional flags from the request:

- `--skip-cancel`: skip the Stage 1 stale-state cleanup (use when you *know* the session is clean)
- `--skip-interview`: skip Stage 2 if a usable spec already exists at `.omc/specs/deep-interview-*.md`
- `--pr-only`: stop after autopilot (Stage 4); don't run ship
- `--no-ship`: alias for `--pr-only`
- `--critic=architect|critic|codex`: forwarded to ralplan for the consensus reviewer

---

## Pre-flight

Before Stage 1, check all dependencies in this table:

| Dependency | Type | Check | Required | Resolution | Detail |
|---|---|---|---|---|---|
| git | cli | `git --version` | yes | stop | Install from https://git-scm.com |
| oh-my-claudecode | plugin | `ls "$HOME/.claude/plugins/cache/omc/oh-my-claudecode"/*/skills/cancel/SKILL.md 2>/dev/null` | yes | stop | OMC plugin not installed. Install via `/plugin add oh-my-claudecode` or follow the OMC installation docs. Without it, deep-interview / ralplan / autopilot / cancel are unavailable. |
| oh-my-claudecode:cancel | skill | `ls "$HOME/.claude/plugins/cache/omc/oh-my-claudecode"/*/skills/cancel/SKILL.md 2>/dev/null` | yes | stop | OMC cancel skill missing — reinstall OMC |
| oh-my-claudecode:deep-interview | skill | `ls "$HOME/.claude/plugins/cache/omc/oh-my-claudecode"/*/skills/deep-interview/SKILL.md 2>/dev/null` | yes | stop | OMC deep-interview skill missing — reinstall OMC |
| oh-my-claudecode:ralplan | skill | `ls "$HOME/.claude/plugins/cache/omc/oh-my-claudecode"/*/skills/ralplan/SKILL.md 2>/dev/null` | yes | stop | OMC ralplan skill missing — reinstall OMC |
| oh-my-claudecode:autopilot | skill | `ls "$HOME/.claude/plugins/cache/omc/oh-my-claudecode"/*/skills/autopilot/SKILL.md 2>/dev/null` | yes | stop | OMC autopilot skill missing — reinstall OMC |
| mad-skills:ship | skill | `ls "$HOME/.claude/plugins/marketplaces/slamb2k/skills/ship/SKILL.md" 2>/dev/null` | yes | stop | mad-skills:ship not installed. Skip with `--pr-only` to stop after autopilot. Install with: `npx skills add slamb2k/mad-skills --skill ship` |

For each row, in order:

1. Skip rows that don't apply (e.g. the `mad-skills:ship` row when `--pr-only` is set — the skill isn't required in that path)
2. Run the Check command
3. If found: continue silently
4. If missing: apply Resolution strategy
   - **stop**: notify user with Detail, halt execution
5. After all checks: summarize what's available and what's degraded

The most important check is the **oh-my-claudecode plugin** — without it, four of the five stages are impossible and the skill must abort. Do not try to proceed with only some OMC skills installed; if the cache directory exists but individual skills are missing, the OMC installation is corrupt and needs reinstalling.

**Additional state check (soft warning, not a blocker):** after the dependency table, run `git status --porcelain` once. If there is any output, warn the user that the working tree has uncommitted changes. `deep-interview` and `ralplan` don't touch source, but `autopilot` will. Let the user decide whether to stash / commit / proceed.

---

## Plan Resolution

Capture the user's argument as the **IDEA** (the rough feature description). This is what deep-interview will use as its starting input.

Display in the Input box as:

```
│  Idea:   {first 80 chars of idea}
│  Flags:  {parsed flags or "none"}
```

---

## Stage 1 · Cancel stale state

Unless `--skip-cancel` was set, invoke the OMC cancel skill to wipe any orphaned state:

```
Skill("oh-my-claudecode:cancel", "--force")
```

**Why force:** `/launch` is meant to be a clean-slate starting point. If previous OMC sessions left orphaned `awaiting_confirmation` entries (this is a known rough edge — e.g. the word "autopilot" in a prompt can trigger autopilot state without user consent), those will pollute later stages. `--force` wipes everything so the downstream stages start from zero.

After the cancel skill returns, confirm no modes are active before proceeding. Emit a short one-line status:

```
  ✅ state cleared — no active OMC modes
```

If cancel reports lingering state it couldn't clear, stop and report. Don't press on.

---

## Stage 2 · Deep-interview (requirements Q&A)

Unless `--skip-interview` was set AND a pre-existing spec is found, invoke:

```
Skill("oh-my-claudecode:deep-interview", "{IDEA}")
```

Let deep-interview run to completion. It will:

- Conduct Socratic Q&A via `AskUserQuestion` — **these pauses surface to the user**, not the wrapper
- Continue until its ambiguity gate passes (≤ 20%)
- Write the final spec to `.omc/specs/deep-interview-{slug}.md`

**If `--skip-interview` was set:**

- Look for any file matching `.omc/specs/deep-interview-*.md`
- If found, use the most recently modified one and note its path in the stage output
- If not found, warn the user and fall back to running deep-interview anyway

When the stage completes, emit:

```
  ✅ spec written to .omc/specs/deep-interview-{slug}.md
```

---

## Stage 3 · Ralplan (plan + consensus review)

Invoke:

```
Skill("oh-my-claudecode:ralplan", "--direct{critic-flag-if-any}")
```

`--direct` tells ralplan to skip its own interview and consume the deep-interview spec directly. If the user passed `--critic=architect|critic|codex`, forward that flag to ralplan.

Ralplan will run Planner → Architect → Critic in sequence, looping until Critic approves. When it completes, the consensus plan lives at `.omc/plans/ralplan-{slug}.md`.

Emit:

```
  ✅ consensus plan at .omc/plans/ralplan-{slug}.md
  ✅ Critic verdict: APPROVED
```

If Critic keeps rejecting past its internal loop budget, ralplan will stop and report. In that case, stop this wrapper too — don't press into autopilot with a rejected plan.

---

## Stage 4 · Autopilot (execution + QA + validation)

Invoke:

```
Skill("oh-my-claudecode:autopilot")
```

No arguments. Autopilot will detect the consensus plan at `.omc/plans/ralplan-{slug}.md` and **skip its own Phase 0 + Phase 1** (expansion + planning), going straight to Phase 2 (Execution). It runs:

- Phase 2: parallel executor agents implement the plan
- Phase 3: QA cycling (up to 5 iterations) — build, lint, test, fix
- Phase 4: multi-perspective validation (Architect + Security-reviewer + Code-reviewer in parallel; all must approve)
- Phase 5: state cleanup

**Critical:** autopilot's output is *verified local code*, not a merged PR. Autopilot's Phase 5 is only state-file cleanup — it does not push, open a PR, watch CI, or merge. Ship is a separate stage.

Emit:

```
  ✅ all phases complete
  ✅ tests pass, build green, validators approved
```

If autopilot's Phase 3 QA cycle repeats the same error 3 times, or Phase 4 validation fails 3 rounds, autopilot stops and reports. In that case stop this wrapper too — a human needs to review.

---

## Stage 5 · Ship (push → PR → merge → sync)

**Skip if `--pr-only` or `--no-ship` was set.**

Invoke:

```
Skill("mad-skills:ship", "{one-line summary of approach from ralplan} — Files: {files from autopilot IMPL_REPORT}")
```

`mad-skills:ship` handles the PR lifecycle:

- Pushes the branch (creates one if needed)
- Creates PR via `gh pr create` (or AzDO equivalent)
- Watches CI — fixes failures in a separate sub-agent up to 2 attempts
- Squash-merges on green
- Syncs local back to default branch

Emit:

```
  ✅ PR #{number} merged ({merge_commit})
  ✅ local synced to {default_branch}
```

If ship's CI watch exhausts its fix attempts, ship stops and displays its own failure banner. In that case, stop — do not attempt additional retry here.

---

## Waiting patterns

Whenever this skill (or its inner invocations) needs to wait on a file or condition, use a polling loop with an explicit deadline — **never** `sleep N && <cmd>`:

```bash
deadline=$((SECONDS + 600))
until [ -s "$path" ] || [ $SECONDS -ge $deadline ]; do sleep 2; done
```

This keeps waits bounded and cache-friendly, and lets the loop exit early when the expected file appears.

---

## Final Report

```
┌─ Launch · Report ──────────────────────────────
│
│  ✅ Launch complete
│
│  💡 Idea:       {first line of idea}
│  📄 Spec:       .omc/specs/deep-interview-{slug}.md
│  🗺️ Plan:       .omc/plans/ralplan-{slug}.md
│
│  📝 Stages
│     1. State cleared             ✅
│     2. Requirements interview    ✅  ({Q&A rounds} rounds)
│     3. Plan + Critic consensus   ✅  ({critic-approval-rounds} rounds)
│     4. Execution + QA + review   ✅  ({QA cycles} QA cycles, {validator} approved)
│     5. PR + merge                ✅  ({pr_url})
│
│  📊 Code
│     Files changed:  {count}
│     Tests:          {passed}/{total}
│
│  🔗 Links
│     PR:    {pr_url}
│     Merge: {merge_commit}
│
│  ⚡ Next
│     {anything surfaced by debrief from autopilot or ship}
│
└─────────────────────────────────────────────────
```

If the run stopped short (`--pr-only`, `--no-ship`, or a stage failure), adjust the stages list accordingly — mark later stages with ⏭️ (skipped) or ❌ (failed) and surface what's left to do manually in the `⚡ Next` section.

### Pipeline Summary (always emit)

```
┌─ Pipeline Summary ─────────────────────────────
│
│  {icon} Cancel         {"no-op" or "cleared N sessions"}
│  {icon} Deep-interview {".omc/specs/... or reused spec"}
│  {icon} Ralplan        {critic verdict}
│  {icon} Autopilot      {"green / N files changed"}
│  {icon} Ship           {pr_url → merge_commit}
│
└─────────────────────────────────────────────────
```

---

## Failure Handling

`/launch` is deliberately dumb about retries. Each inner skill already has its own retry/verification logic — trying to add more at this layer just fights with them. If any stage stops with a failure:

1. Display the failure banner below (not the success report)
2. List which stages completed, which failed, and which were skipped
3. Stop. Do not advance to later stages. Do not invoke `/sync` or any cleanup.

```
┌─ Launch · FAILED ───────────────────────────────
│
│  ❌ Pipeline stopped at Stage {N}: {stage name}
│
│  Reason:           {specific failure reason from the inner skill}
│  Stages completed: {list}
│  Stages skipped:   {list}
│
│  ⚠️  Work may exist locally but is NOT merged.
│     Review the inner skill's output for next steps.
│
└──────────────────────────────────────────────────
```

Rules on failure:

- Do not emit a "Pipeline Summary" with a ✅
- Do not suggest a cancel/sync/retry here — the inner skill that failed owns that
- Do not invoke any recovery skill automatically

---

## Trigger Behaviour

This skill has `disable-model-invocation: true`. That means:

- It will **never** auto-activate on keyword hits, even if the user says things like *"launch this feature"*, *"ship it end to end"*, *"run the full pipeline"*, or mentions any of the inner skill names.
- It runs **only** when the user literally types `/launch` as a slash command.
- Another skill can still invoke it explicitly via `Skill("launch", "...")` if desired.

This is deliberate: the inner skills (especially autopilot) have aggressive keyword triggers of their own, and a wrapper that also auto-triggered would compound the false-positive risk. Keep this file's `disable-model-invocation` flag set.
