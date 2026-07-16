---
name: followups
description: Review and manage the project's Follow-ups Ledger — the durable, committed backlog of ideas, deferred fixes, open questions, risks, and tech debt captured at the end of /build and /ship cycles so they survive /clear. Lists open items grouped by category, runs assisted cleanup, and resolves, dismisses, or adds items. Use when you want to see or act on captured follow-ups. Triggers: "follow-ups", "/followups", "show the backlog", "what did we defer", "follow-up ledger", "review follow-ups".
argument-hint: [review | resolve <n> | dismiss <n> | add <text>]
allowed-tools: Bash, AskUserQuestion
---

# Followups - The Follow-ups Ledger

When this skill is invoked, IMMEDIATELY output the banner below before doing anything else.
Pick ONE tagline at random — vary your choice each time.
CRITICAL: Reproduce the banner EXACTLY character-for-character. The first line of the art has 4 leading spaces (a U+2800 blank + 3 spaces) — you MUST preserve them.

```
{tagline}

⠀   ██╗███████╗ ██████╗ ██╗     ██╗      ██████╗ ██╗    ██╗██╗   ██╗██████╗ ███████╗
   ██╔╝██╔════╝██╔═══██╗██║     ██║     ██╔═══██╗██║    ██║██║   ██║██╔══██╗██╔════╝
  ██╔╝ █████╗  ██║   ██║██║     ██║     ██║   ██║██║ █╗ ██║██║   ██║██████╔╝███████╗
 ██╔╝  ██╔══╝  ██║   ██║██║     ██║     ██║   ██║██║███╗██║██║   ██║██╔═══╝ ╚════██║
██╔╝   ██║     ╚██████╔╝███████╗███████╗╚██████╔╝╚███╔███╔╝╚██████╔╝██║     ███████║
╚═╝    ╚═╝      ╚═════╝ ╚══════╝╚══════╝ ╚═════╝  ╚══╝╚══╝  ╚═════╝ ╚═╝     ╚══════╝
```

Taglines:
- 📌 Nothing gets lost to a /clear!
- 🗂️ Your backlog, remembered.
- 💡 The good ideas you didn't want to forget!
- 🧹 Tidying the follow-up ledger...
- 📋 What did we say we'd come back to?
- ♻️ Capture, remind, resolve — repeat!

---

## Output Formatting

After the banner, show parsed input:
```
┌─ Input ────────────────────────────────────────
│  Action:   {list | review | resolve | dismiss | add}
│  Arg:      {value or "none"}
└────────────────────────────────────────────────
```

Status icons: ✅ done · ⏭️ skipped · ⚠️ degraded

---

## What this does

The Follow-ups Ledger is a committed `FOLLOWUPS.md` at the repo root: the durable
backlog of ideas, deferred fixes, open questions, risks, and tech debt that
`/build` and `/ship` capture at debrief so they **survive `/clear`**. This skill
is the pull surface — list, clean up, and act on those items.

It is the subjective, idea-oriented sibling of `/next`: `/next` computes what the
project objectively needs next; `/followups` remembers what *you said you wanted
to do*. `/next` only cross-references this ledger (one line); the items live here.

All ledger operations go through `hooks/lib/followups.cjs` via `session-guard.cjs`
subcommands — a single source of truth. Every operation degrades to a no-op on a
malformed file (a bad hand-edit never blocks you).

## Pre-flight

| Dependency | Type | Check | Required | Resolution | Detail |
|-----------|------|-------|----------|------------|--------|
| session-guard | skill | `ls "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/marketplaces/slamb2k}/hooks/session-guard.cjs"` | yes | stop | Ships with the mad-skills plugin; reinstall if missing |
| git | cli | `git --version` | no | fallback | Linked-item auto-resolve (pr#/commit) and stale detection degrade without git (CON-002) |

## Parse the argument

The argument selects the action (default is **list** when empty):

- *(empty)* → **list**
- `review` → **review** (assisted cleanup)
- `resolve <n>` → **resolve** item n
- `dismiss <n>` → **dismiss** item n
- `add <text>` → **add** a manual item

Set `_R` once for every command below:
```bash
_R="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/marketplaces/slamb2k}"
```

## Actions

### list (default)

```bash
node "$_R/hooks/session-guard.cjs" followups-list
```
Prints a `FOLLOWUPS_LIST_BEGIN` … `FOLLOWUPS_LIST_END` block: category headings
(`## Ideas`, etc.) and numbered items `N. {title} — {source} ({date}) [{link}]`.
`FOLLOWUPS_LIST_EMPTY` means the ledger is empty — say the backlog is clear and
stop (no box).

Render the parsed items in a box:
```
┌─ Followups · Open Ledger ──────────────────────
│
│  Ideas
│   1. {title}   {source} · {date}
│  Deferred fixes
│   2. {title}   {source} · {date}  🔗 {link}
│
│  {N} open · resolve <n> · dismiss <n> · review · add <text>
│
└─────────────────────────────────────────────────
```
The numbers are stable selectors — `resolve <n>` / `dismiss <n>` use exactly the
numbers shown here.

### review (assisted cleanup)

```bash
node "$_R/hooks/session-guard.cjs" followups-review
```
This runs **two tracks**:
1. **Deterministic** — linked items whose link is satisfied (`task#` completed,
   `spec:` built/removed, `rec:` satisfied, `pr#`/`commit:` merged) are
   auto-resolved **silently**. If any were, the command prints
   `FOLLOWUPS_AUTORESOLVED [...]` — mention them as already handled.
2. **Assisted** — free-text items that look done or stale are printed in a
   `FOLLOWUPS_REVIEW_BEGIN` … `FOLLOWUPS_REVIEW_END` block as
   `N. {title} — {reason}`. `FOLLOWUPS_REVIEW_EMPTY` means nothing to review.

For the assisted candidates, **you MUST get user confirmation before resolving
anything** (REQ-032: never silently drop a free-text idea). Present them via
`AskUserQuestion` — one multi-select of the candidate items, plus a "keep all"
escape. For each item the user confirms, run:
```bash
node "$_R/hooks/session-guard.cjs" followups-resolve <n>
```
Anything the user does not confirm stays open.

**Task-linked items (task#):** `followups-review` runs as a plain Node process
and cannot see the harness task state, so it does not auto-resolve `task#` links.
After running it, scan the `followups-list` output for items annotated
`[task#<id>]`; for each, call `TaskGet <id>` — if the task is `completed`,
resolve that item silently (it's the deterministic track, no confirmation
needed): `node "$_R/hooks/session-guard.cjs" followups-resolve <n>`.

### resolve / dismiss

```bash
node "$_R/hooks/session-guard.cjs" followups-resolve <n>   # done
node "$_R/hooks/session-guard.cjs" followups-dismiss <n>   # not done, not wanted
```
Both move the item to the Archive section and drop it from the open list/counts.
Confirm the archived title to the user.

### add

```bash
node "$_R/hooks/session-guard.cjs" followups-add "<text>" --category <ideas|fixes|questions|risks|debt> --link <link>
```
`--category` (default `ideas`) and `--link` are optional. Source is `manual`,
date is today. Confirm the added item.

## Notes

- The ledger is **distinct from tasks**: an item may link to a `task#<id>` (and
  auto-resolve when that task completes), but the ledger is the durable backlog,
  not a task queue. Promote an item to active work with `TaskCreate`; don't
  duplicate.
- Capture is automatic at `/build` and `/ship` debrief — you rarely `add`
  manually. The cold-start hint (`📌 N open follow-ups`) fires on a genuine
  Claude Code launch/reconnect, never on `/clear`.
- `FOLLOWUPS.md` is committed and hand-editable. Keep the `- [ ]` checkbox shape
  and the category headings; the module normalizes the rest on the next write.
