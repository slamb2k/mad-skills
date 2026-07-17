---
name: logbook
description: The project's single "what's on deck" surface — one command, two sections. Shows the best-practice lifecycle stages this project should adopt next (computed from repo state, via the recommendation engine) AND the durable backlog of follow-ups (ideas, deferred fixes, open questions, risks, tech debt) captured at /build and /ship so they survive /clear. Lists both, and resolves, dismisses, adds, or reviews follow-ups. Use when you want to see or act on everything outstanding. Triggers: "what's next", "next steps", "/logbook", "what's on deck", "follow-ups", "the backlog", "what did we defer", "lifecycle steps", "what should I do next".
argument-hint: [review | resolve <n> | dismiss <n> | add <text>]
allowed-tools: Bash, AskUserQuestion
---

# Logbook - What's On Deck

When this skill is invoked, IMMEDIATELY output the banner below before doing anything else.
Pick ONE tagline at random — vary your choice each time.
CRITICAL: Reproduce the banner EXACTLY character-for-character. The first line of the art has 4 leading spaces (a U+2800 blank + 3 spaces) — you MUST preserve them.

```
{tagline}

⠀   ██╗██╗      ██████╗  ██████╗ ██████╗  ██████╗  ██████╗ ██╗  ██╗
   ██╔╝██║     ██╔═══██╗██╔════╝ ██╔══██╗██╔═══██╗██╔═══██╗██║ ██╔╝
  ██╔╝ ██║     ██║   ██║██║  ███╗██████╔╝██║   ██║██║   ██║█████╔╝
 ██╔╝  ██║     ██║   ██║██║   ██║██╔══██╗██║   ██║██║   ██║██╔═██╗
██╔╝   ███████╗╚██████╔╝╚██████╔╝██████╔╝╚██████╔╝╚██████╔╝██║  ██╗
╚═╝    ╚══════╝ ╚═════╝  ╚═════╝ ╚═════╝  ╚═════╝  ╚═════╝ ╚═╝  ╚═╝
```

Taglines:
- 🧭 Reading the ship's log...
- 📖 Course and remarks, all in one place.
- ⚓ What's on deck?
- 🗺️ Where you are, and what you noted to circle back to.
- 📋 The captain's running record.
- 🚢 Best-practice heading + your own remarks.

---

## Output Formatting

After the banner, show parsed input:
```
┌─ Input ────────────────────────────────────────
│  Action:   {show | review | resolve | dismiss | add}
│  Arg:      {value or "none"}
└────────────────────────────────────────────────
```

Status icons: ✅ done · ⏭️ skipped · ⚠️ degraded

---

## What this does

`/logbook` is the project's single **"what's on deck"** surface. It answers the
one question — *what should I do on this project?* — that used to be split across
two commands, so you no longer have to guess which to call. It shows two things,
clearly separated because they're genuinely different:

- **🧭 Lifecycle** — best-practice stages this *project* should adopt next
  (brace, rig, dock/hoist, keel, envs…), **computed** fresh from repo state by
  the Lifecycle Recommendation Engine. Prescriptive and stateless. Because you're
  explicitly asking, this **bypasses the ambient anti-nag suppression**
  (active-cycle, cooldown, dismissal watermarks) — you see the full picture.
- **📌 Follow-ups** — what *you* said you'd come back to (ideas, deferred fixes,
  open questions, risks, tech debt), **committed** to `LOGBOOK.md` at the repo root
  and auto-captured at `/build` and `/ship` debrief so they survive `/clear`.
  Personal and durable.

It is **read-only by default** — it never runs a skill or resolves an item
unless you choose to. All operations go through `session-guard.cjs` subcommands
(single source of truth) and degrade to a no-op on a malformed file.

## Pre-flight

| Dependency | Type | Check | Required | Resolution | Detail |
|-----------|------|-------|----------|------------|--------|
| session-guard | skill | `ls "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/marketplaces/slamb2k}/hooks/session-guard.cjs"` | yes | stop | Ships with the mad-skills plugin; reinstall if missing |
| git | cli | `git --version` | no | fallback | Lifecycle signature + linked-item auto-resolve degrade without git (CON-002/CON-003) |

## Parse the argument

The argument selects the action (default is **show** when empty):

- *(empty)* → **show** both sections
- `review` → **review** follow-ups (assisted cleanup)
- `resolve <n>` → **resolve** follow-up n
- `dismiss <n>` → **dismiss** follow-up n
- `add <text>` → **add** a manual follow-up

Set `_R` once for every command below:
```bash
_R="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/marketplaces/slamb2k}"
```

## Actions

### show (default)

Query both surfaces, then render one box:

```bash
node "$_R/hooks/session-guard.cjs" lifecycle-next   # 🧭 lifecycle
node "$_R/hooks/session-guard.cjs" logbook-list          # 📌 follow-ups
```

- `lifecycle-next` prints a `LIFECYCLE_NEXT_BEGIN` … `LIFECYCLE_NEXT_END` block;
  each line is `{command} — {why}` (with `[previously dismissed]` where relevant),
  or `none` when nothing applies.
- `logbook-list` prints a `LOGBOOK_LIST_BEGIN` … `LOGBOOK_LIST_END` block of category
  headings + numbered items `N. {title} — {source} ({date}) [{link}]`, or
  `LOGBOOK_LIST_EMPTY`.

Render both in a single box. **Letter** the lifecycle steps (A, B, C…) and keep
the follow-up **numbers** (1, 2, 3…) so the two act-verbs never collide:

```
┌─ Logbook · What's on deck ─────────────────────
│
│  🧭 Lifecycle — best-practice stages for this project
│     A. {command}   {why}
│     B. {command}   {why}
│
│  📌 Follow-ups — what you said you'd come back to
│     Deferred fixes
│      1. {title}   {source} · {date}
│     Tech debt
│      2. {title}   {source} · {date}  🔗 {link}
│
│  act: resolve <n> · dismiss <n> · add <text> · review · set up <A>
│
└─────────────────────────────────────────────────
```

Empty-state rules (never fabricate):
- Lifecycle `none` → show `✅ fully caught up — no lifecycle steps apply`.
- `LOGBOOK_LIST_EMPTY` → show `— no open follow-ups`.
- **Both** empty → collapse to a single line: `✅ All clear — nothing on deck.`
  and stop (no verbs footer).

### set up \<A> (act on a lifecycle step)

Only when the user picks one (or asks). Running a lifecycle step just invokes
that skill (e.g. *set up A* → invoke `/keel`). **Never** run one without the user
choosing it — every lifecycle transition is user-consented. If you want to
prompt, use `AskUserQuestion` with each listed command plus *Not now*.

### review (assisted follow-up cleanup)

```bash
node "$_R/hooks/session-guard.cjs" logbook-review
```
Two tracks:
1. **Deterministic** — linked follow-ups whose link is satisfied (`task#`,
   `spec:`, `rec:`, `pr#`/`commit:`) auto-resolve **silently**; a
   `LOGBOOK_AUTORESOLVED [...]` line means they were already handled.
2. **Assisted** — free-text items that look done or stale print in a
   `LOGBOOK_REVIEW_BEGIN` … `LOGBOOK_REVIEW_END` block as `N. {title} — {reason}`
   (`LOGBOOK_REVIEW_EMPTY` = nothing to review).

For the assisted candidates you **MUST get user confirmation before resolving
anything** (never silently drop a free-text idea). Present them via
`AskUserQuestion` (multi-select + a "keep all" escape); for each confirmed item
run `logbook-resolve <n>`. Anything not confirmed stays open.

**Task-linked items (`task#`):** `logbook-review` runs as a plain Node process and
can't see harness task state, so it does not auto-resolve `task#` links. After
it, scan the `logbook-list` output for items annotated `[task#<id>]`; for each, call
`TaskGet <id>` — if the task is `completed`, resolve it silently:
`node "$_R/hooks/session-guard.cjs" logbook-resolve <n>`.

### resolve / dismiss

```bash
node "$_R/hooks/session-guard.cjs" logbook-resolve <n>   # done
node "$_R/hooks/session-guard.cjs" logbook-dismiss <n>   # not done, not wanted
```
Both move the follow-up to the Archive section and drop it from the open
list/counts. Confirm the archived title.

### add

```bash
node "$_R/hooks/session-guard.cjs" logbook-add "<text>" --category <ideas|fixes|questions|risks|debt> --link <link>
```
`--category` (default `ideas`) and `--link` are optional. Source is `manual`,
date is today. Confirm the added item.

## Notes

- **Two sections, one glance — on purpose.** Lifecycle is *what a good repo
  does* (computed, prescriptive); follow-ups are *what you said you'd do*
  (committed, personal). Same "what now?" moment, different sources — the split
  is in the output, not in which command you call.
- The follow-ups half is **distinct from tasks**: an item may link to a
  `task#<id>` (and auto-resolve when that task completes), but the logbook is the
  durable backlog, not a task queue. Promote an item to active work with
  `TaskCreate`; don't duplicate.
- **Ambient nudges stay separate from this pull.** The Session Guard still
  surfaces the single causal/drift lifecycle offer mid-work, and a passive
  cold-start hint (`📌 N open follow-ups`) on a genuine launch/reconnect — never
  on `/clear`. `/logbook` is the on-demand, full-picture counterpart.
- `LOGBOOK.md` is committed and hand-editable. Keep the `- [ ]` checkbox shape and
  the category headings; the module normalizes the rest on the next write.
