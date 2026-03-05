---
name: speccy
description: >
  Deep-dive interview skill for creating comprehensive specifications.
  Reviews existing code and docs, then interviews the user through multiple
  rounds of targeted questions covering technical implementation, UI/UX,
  concerns, and tradeoffs. Produces a structured spec via create-specification.
  Use when starting a new feature, system, or major change that needs a spec.
argument-hint: Goal, feature, or high-level description to specify
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion
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

Interview the user through multiple rounds of targeted questions to build
a comprehensive specification. Then hand off to the `create-specification`
skill to produce the final structured spec document.

Interview prompts and question guidelines: `references/interview-guide.md`

## Pre-flight

Before starting, check all dependencies in this table:

| Dependency | Type | Check | Required | Resolution | Detail |
|-----------|------|-------|----------|------------|--------|
| create-specification | skill | `~/.claude/skills/create-specification/SKILL.md` or `~/.agents/skills/create-specification/SKILL.md` | yes | ask | This skill is needed to format the final spec. Install with: `npx skills add slamb2k/mad-skills --skill create-specification` |

For each row, in order:
1. Test file existence (check both paths for symlinked skills)
2. If found: continue silently
3. If missing: apply Resolution strategy
   - **ask**: Notify user the skill is missing, offer to install it. If they
     decline, halt execution — the final spec cannot be produced without it.
4. After all checks: proceed to context gathering

---

## Stage 1: Context Gathering

Before asking any questions, build a thorough understanding of the project:

1. **Capture GOAL** — the user's argument describing what needs to be specified
2. **Scan the project**:
   - Read `CLAUDE.md` if present (project conventions, structure, domain)
   - Read goal/spec manifests: `goals/manifest.md`, `spec/` directory
   - Scan existing specs and design docs for context
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

### Question Rules

1. **4 questions per round maximum** (AskUserQuestion limit)
2. **Non-obvious questions only** — don't ask things you can determine from
   reading the code or docs. The user's time is valuable.
3. **Recommendations** — where you have an informed opinion based on the
   codebase, project conventions, or industry best practice, mark one option
   as recommended by appending `(Recommended)` to its label. At least one
   question per round should have a recommendation where possible.
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

Once the interview is complete and decisions are confirmed:

1. **Invoke the `create-specification` skill** using the Skill tool:
   ```
   Skill(skill: "create-specification")
   ```

2. **Provide the full context** to the skill as input:
   - The original GOAL
   - All decisions from the interview rounds
   - Any relevant code/architecture context discovered in Stage 1
   - The spec purpose should match the GOAL description

3. The `create-specification` skill will handle formatting, naming, and
   saving the spec file according to its own template and conventions.

---

## Output

After the spec is created, report to the user:

```
Spec complete!

  File:       {spec file path}
  Sections:   {count of sections written}
  Decisions:  {count of interview decisions captured}
  Rounds:     {count of interview rounds conducted}
  Questions:  {total questions asked}
```
