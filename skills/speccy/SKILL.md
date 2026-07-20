---
name: speccy
description: Deep-dive interview skill for creating comprehensive specifications. Reviews existing code and docs, then interviews the user through multiple rounds of targeted questions covering technical implementation, UI/UX, concerns, and tradeoffs. Produces a structured spec in specs/. Use when starting a new feature, system, or major change that needs a spec.
argument-hint: Goal, feature, or high-level description to specify
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion, Skill
---

# Speccy - Interview-Driven Specification Builder

When this skill is invoked, IMMEDIATELY output the banner below before doing anything else.
Pick ONE tagline at random — vary your choice each time.
CRITICAL: Reproduce the banner EXACTLY character-for-character. The first line of the art has 4 leading spaces — you MUST preserve them.

```
{tagline}

⠀   ██╗███████╗██████╗ ███████╗ ██████╗ ██████╗██╗   ██╗
   ██╔╝██╔════╝██╔══██╗██╔════╝██╔════╝██╔════╝╚██╗ ██╔╝
  ██╔╝ ███████╗██████╔╝█████╗  ██║     ██║      ╚████╔╝
 ██╔╝  ╚════██║██╔═══╝ ██╔══╝  ██║     ██║       ╚██╔╝
██╔╝   ███████║██║     ███████╗╚██████╗╚██████╗   ██║
╚═╝    ╚══════╝╚═╝     ╚══════╝ ╚═════╝ ╚═════╝   ╚═╝
```

Taglines:
- 🔍 Tell me everything...
- 🧠 Let's think this through!
- 📋 Spec it before you wreck it!
- 🎤 Interview mode: ACTIVATED
- 💡 Great specs start with great questions!
- 🏗️ Measure twice, code once!
- 📝 No assumption left behind!
- 🎯 Precision engineering starts here!

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

Stage/phase headers: `━━ {N} · {Name} ━━━━━━━━━━━━━━━━━━━━━━━━━`

Status icons: ✅ done · ❌ failed · ⚠️ degraded · ⏳ working · ⏭️ skipped

---

Interview the user through multiple rounds of targeted questions to build
a comprehensive specification, then write it directly using the spec template
in `references/spec-template.md`.

Interview prompts and question guidelines: `references/interview-guide.md`
Spec template and writing guidelines: `references/spec-template.md`

## Flags

Parse optional flags from the request:
- `--no-superpowers`: Force the standalone interview even when Superpowers is installed
- `--auto`: Run autonomously — after the worktree/branch is created (unconditional in both modes, see Stage 1), run the interview and completeness-gated spec write via `references/autonomous-interview.md`. Dispatch only; see Stage 1 and Stage 3 below.

## Pre-flight

Before starting, check all dependencies in this table:

| Dependency | Type | Check | Required | Resolution | Detail |
|-----------|------|-------|----------|------------|--------|
| prime | skill | `ls .claude/skills/prime/SKILL.md ~/.claude/skills/prime/SKILL.md ~/.claude/plugins/marketplaces/slamb2k/skills/prime/SKILL.md 2>/dev/null` | no | fallback | Context loading; falls back to manual project scan |
| superpowers | plugin | on-disk glob via scripts/lib/superpowers.js | no | fallback | Defers Stage 2 interview to superpowers:brainstorming when present; see references/superpowers-deferral.md |

For each row, in order:
1. Test file existence (check both paths for symlinked skills)
2. If found: continue silently
3. If missing: apply Resolution strategy
4. After all checks: proceed to context gathering

---

## Stage 1: Context Gathering

**Worktree creation (REQ-001):** before any context gathering — including the checks below — create the worktree/branch per `references/autonomous-worktree-lifecycle.md` (repo root; worktree creation is `/speccy`'s literal first action in **both** `--auto` and interactive modes). This supersedes the old REQ-005, which prohibited worktree creation in interactive mode.

**If `--auto`:** after worktree creation, read `skills/speccy/references/autonomous-interview.md` and follow it for the rest of this skill instead of the interactive flow below.

### Pre-Spec Location Check

Before gathering context, run the shared root-mismatch check from
`references/location-check.md` (`{caller}` = "before Stage 1: Context
Gathering"). This is independent of the Pre-Spec Branch Check below.

### Pre-Spec Branch Check

Before gathering context, check if the user is on a stale branch:

```bash
CURRENT=$(git branch --show-current)
if [ "$CURRENT" != "main" ] && [ "$CURRENT" != "master" ]; then
  git fetch origin main --quiet 2>/dev/null
  BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
  if [ "$BEHIND" -gt 5 ]; then
    echo "⚠️ Branch '$CURRENT' is $BEHIND commits behind main."
    echo "   Consider running /sync before building from this spec."
  fi
fi
```

This is advisory only (specs don't modify code) — do not block, continue
regardless of the result.

Before asking any questions, build a thorough understanding of the project:

1. **Capture GOAL** — the user's argument describing what needs to be specified
2. **Load project context** — invoke `/prime` to load domain-specific context
   (CLAUDE.md, specs, memory). If /prime is unavailable, fall back to
   the manual scan below.
3. **Scan the project** (skip items already loaded by /prime):
   - Read `CLAUDE.md` if present (project conventions, structure, domain)
   - Scan `specs/` directory for existing specifications
   - Scan existing design docs for context
   - Read relevant source code that relates to the GOAL
   - Check memory for prior decisions or open questions related to the GOAL
3. **Identify knowledge gaps** — what must you learn from the user to write
   a complete, unambiguous specification?

Group gaps into interview categories:
- **Architecture & Technical Design** — stack, patterns, data flow, integrations
- **Requirements & Scope** — what's in, what's out, must-haves vs nice-to-haves
- **UI & UX** — user flows, interaction patterns, accessibility, responsive
- **Security & Auth** — authentication, authorization, data protection
- **Infrastructure & Deployment** — hosting, CI/CD, environments, IaC
- **Data & Storage** — schemas, persistence, migrations, caching
- **Testing & Quality** — test strategy, coverage, acceptance criteria
- **Concerns & Tradeoffs** — known risks, alternatives considered, constraints

---

## Stage 2: Interview Rounds

Conduct multiple rounds of questions using `AskUserQuestion`. Continue until
all knowledge gaps are resolved.

**Superpowers deferral (soft dependency):** When Superpowers is detected (per the
pre-flight check) and the `--no-superpowers` flag is not set, announce
`⚡ Superpowers detected — deferring requirements interview to superpowers:brainstorming`
and use `superpowers:brainstorming` for requirements/gap exploration in place of
(or ahead of) the multi-round interview below. In ALL cases — deferred or
standalone — speccy still writes `specs/{slug}.md` and the pending-build marker
(see `references/superpowers-deferral.md`). When Superpowers is absent or
`--no-superpowers` is set, run the standalone interview unchanged.

### Question Rules

1. **4 questions per round maximum** (AskUserQuestion limit)
2. **Non-obvious questions only** — don't ask things you can determine from
   reading the code or docs. The user's time is valuable.
3. **Recommendations** — where you have an informed opinion based on the
   codebase, project conventions, or industry best practice, mark one option
   as recommended by listing it first and appending `(Recommended)` to its label.
   At least one question per round should have a recommendation where possible.
4. **Concise options** — 2-4 options per question, each with a clear
   description of implications and tradeoffs
5. **Progressive depth** — start with high-level architecture and scope,
   then drill into implementation details in later rounds
6. **Build on answers** — use previous round answers to inform next questions.
   Don't re-ask decided topics.
7. **Track decisions** — maintain a running list of all decisions made.
   Present this list at the start of each round so the user can see progress.

### Round Structure

Each round follows this pattern:

1. **Progress update** — brief summary of decisions made so far (after round 1)
2. **Category label** — which interview category this round covers
3. **Questions** — 3-4 targeted questions via AskUserQuestion
4. **Evaluate** — after answers, determine if more questions are needed

### Completion Criteria

Stop interviewing when ALL of the following are true:
- All identified knowledge gaps have been addressed
- No answer has raised new unresolved questions
- You have enough information to write every section of the spec template
- The user has confirmed scope boundaries (what's in and what's out)

When complete, briefly present a **Decision Summary** — a numbered list of
all decisions made across all rounds — and confirm with the user before
proceeding to spec generation.

---

## Stage 3: Generate Specification

**If `--auto`:** this stage runs in a subagent (REQ-033) and the completeness gate decides `autonomy_ready` — see `references/autonomous-interview.md`.

**Interactive mode (REQ-007):** before writing the spec, self-review it against
the same completeness gate — criteria in `references/autonomous-interview.md`'s
Stage 3. Set the `autonomy_ready` frontmatter field to `true` when every gate
item passes, `false` otherwise; the gate is no longer `--auto`-exclusive.

Once the interview is complete and decisions are confirmed:

1. **Create `specs/` directory** if it doesn't exist:
   ```
   mkdir -p specs
   ```

2. **Read the spec template** from `references/spec-template.md`

3. **Generate the spec** by filling the template with:
   - The original GOAL as the introduction and purpose
   - All decisions from the interview rounds, mapped to the appropriate sections
   - Code/architecture context discovered in Stage 1
   - Acceptance criteria derived from requirements decisions
   - Test strategy aligned with the project's existing patterns

4. **Write the spec file** to `specs/{name}.md` where `{name}` is a
   kebab-case slug derived from the GOAL (e.g., `specs/user-auth.md`,
   `specs/payment-integration.md`). Use the Write tool directly.

5. The `specs/` directory is the standard location — `/build` and `/prime`
   both scan it automatically.

---

## Output & Handoff

**If `--auto`:** invoke `/ferry` to checkpoint before handing off to `/build`
(GUD-004) — see `skills/build/references/autonomous-pipeline.md`'s
Checkpointing section.

After the spec is created, report to the user:

```
┌─ Speccy · Report ──────────────────────────────
│
│  ✅ Spec complete
│
│  📄 File:       {spec file path}
│  📋 Sections:   {count}
│  💬 Rounds:     {interview rounds conducted}
│  ❓ Questions:  {total questions asked}
│
│  📝 Key decisions
│     • {decision 1}
│     • {decision 2}
│     • {decision 3}
│
│  🔗 Links
│     Spec: {spec file path}
│
│  ⚡ Next steps
│     1. Review the spec: {path}
│     2. Run `/build {spec path}` to implement (reads the file automatically)
│
└─────────────────────────────────────────────────
```

Then write a **pending-build marker** so the next session knows about this spec:

```bash
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/marketplaces/slamb2k}"
node -e "require('$PLUGIN_ROOT/hooks/lib/state.cjs').savePendingBuild(process.cwd(), '{spec file path}')"
```

This marker is picked up by the session-guard hook on the next session start
(including after `/clear`), which surfaces the build command automatically.

Then display the build command:

```
⚡ To implement, run: /build {spec file path}
   (You can /clear first — the spec is saved and the next session will remind you)
```

The spec file persists on disk, so the user can `/clear` the conversation
to free context before running `/build`. This is the recommended flow for
large specs — clearing context gives `/build` maximum working room.

**IMPORTANT:** After generating the spec, STOP. Do NOT enter plan mode,
do NOT start implementing directly, do NOT invoke `/build` yourself, and
do NOT offer to execute the plan. The spec file is the handoff artifact —
the user controls when and how to invoke `/build`.
