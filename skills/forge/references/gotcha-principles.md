# GOTCHA Framework Principles

Embedded into the project CLAUDE.md during forge.

---

## The GOTCHA Framework

A 6-layer architecture for agentic systems that separates concerns between
probabilistic reasoning (LLM) and deterministic execution (tools).

**GOT** (The Engine):
- **Goals** (`goals/`) — Task-specific instructions. Each goal defines:
  objective, inputs, which tools to use, expected outputs, edge cases.
  Only modified with explicit permission.
- **Orchestration** — The AI manager (you). Reads goals, decides which tools
  to use, applies args, references context, handles errors, delegates work.
  Never executes work directly — delegates intelligently.
- **Tools** (`tools/`) — Python scripts organised by workflow. Each has one
  job: API calls, data processing, file operations, database work. Fast,
  documented, testable, deterministic. All tools listed in `tools/manifest.md`.

**CHA** (The Context):
- **Context** (`context/`) — Static reference material: tone rules, writing
  samples, ICP descriptions, case studies. Shapes quality/style, not process.
- **Hard Prompts** (`hardprompts/`) — Reusable text templates for LLM
  sub-tasks: outline-to-post, rewrite-in-voice, summarize-transcript.
- **Args** (`args/`) — YAML/JSON files controlling behaviour: themes,
  frameworks, modes, lengths, schedules, model choices. Changing args changes
  behaviour without editing goals or tools.

## How to Operate

### 1. Check for existing goals first
Before starting a task, check `goals/manifest.md`. If a goal exists, follow
it — goals define the full process for common tasks.

### 2. Check for existing tools
Before writing new code, read `tools/manifest.md`. If a tool exists, use it.
If you create a new tool, you **must** add it to the manifest.

### 3. When tools fail, fix and document
- Read the error and stack trace carefully
- Update the tool to handle the issue
- Add what you learned to the goal
- If a goal gets too long, split into primary goal + technical reference

### 4. Treat goals as living documentation
- Update only when better approaches or API constraints emerge
- Never modify/create goals without explicit permission

### 5. Communicate clearly when stuck
If you cannot complete a task with existing tools and goals:
- Explain what is missing
- Explain what you need
- Do not guess or invent capabilities

### 6. Guardrails
- Always check `tools/manifest.md` before writing a new script
- Verify tool output format before chaining into another tool
- Do not assume APIs support batch operations — check first
- When a workflow fails mid-execution, preserve intermediate outputs
- Read the full goal before starting a task — do not skim

## Memory

For persistent memory across sessions, use the **claude-mem** plugin
(`claude plugin install claude-mem`). It automatically captures context
via lifecycle hooks and provides MCP tools for search, timeline, and
observation management. Claude Code's built-in auto memory handles
curated facts (`~/.claude/projects/<project>/memory/MEMORY.md`).

## Question & Assumption Accountability

Nothing gets silently dropped. Every open question, assumption, and deferred
decision must be explicitly recorded and revisited.

### During work:
- When you make an assumption, **state it explicitly** and record it
- When a question cannot be answered immediately, log it as an open item
- When you defer a fix or skip an edge case, document why and what triggers it

### At the end of each task:
- Review all assumptions made — were they validated?
- Review all open questions — were they answered?
- Review all deferred items — are they tracked for follow-up?
- Present unresolved items to the user with context and suggested actions

### Persistence:
- Unresolved items go to `goals/` as documented follow-ups, to CLAUDE.md
  as "Known Issues", or to memory for future session awareness
- Never close a task with unacknowledged open questions
- At the start of new work, check for outstanding items from previous sessions

### Why this matters:
90% accuracy per step means ~59% accuracy over 5 steps. Silent assumptions
compound. Explicit tracking breaks the chain — each assumption is either
validated or flagged before it can propagate.

## The Continuous Improvement Loop

Every failure strengthens the system:
1. Identify what broke and why
2. Fix the tool script
3. Test until it works reliably
4. Update the goal with new knowledge
5. Next time — automatic success

## Deliverables vs Scratch

- **Deliverables**: outputs needed by the user (processed data, reports, etc.)
- **Scratch work**: temp files (raw scrapes, CSVs, research). Always disposable.
- Never store important data in `.tmp/`
