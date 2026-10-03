---
name: ferry
description: Ferry a session's live state across a context reset — persist a waybill document and arm a one-shot handoff so the next fresh session resumes from it. Use when the user types /ferry, says they want to hand off, checkpoint, wrap up, clear context, or start fresh while preserving state, or asks to carry work into a new session with clean optimised context. Captures task, status, next steps, key files, decisions, gotchas and repo state, writes a waybill (outside the repo by default), arms the handoff, and tells the user to /clear. "/ferry clean" lists and removes leftover waybills this skill created.
argument-hint: here, commit, clean [--yes] [--legacy] (optional; default writes outside the repo)
allowed-tools: Bash, Read, Write
---

# Ferry - Clean-Context Session Handoff

When this skill is invoked, IMMEDIATELY output the banner below before doing anything else.
Pick ONE tagline at random — vary your choice each time.
CRITICAL: Reproduce the banner EXACTLY character-for-character, including the diagonal `/` glyph before the name.

```
{tagline}

       /$$ /$$$$$$$$ /$$$$$$$$ /$$$$$$$  /$$$$$$$  /$$     /$$
      /$$/| $$_____/| $$_____/| $$__  $$| $$__  $$|  $$   /$$/
     /$$/ | $$      | $$      | $$  \ $$| $$  \ $$ \  $$ /$$/ 
    /$$/  | $$$$$   | $$$$$   | $$$$$$$/| $$$$$$$/  \  $$$$/  
   /$$/   | $$__/   | $$__/   | $$__  $$| $$__  $$   \  $$/   
  /$$/    | $$      | $$      | $$  \ $$| $$  \ $$    | $$    
 /$$/     | $$      | $$$$$$$$| $$  | $$| $$  | $$    | $$    
|__/      |__/      |________/|__/  |__/|__/  |__/    |__/    
```

Taglines:
- 📋 Filing the waybill for the crossing...
- 🧳 All aboard — carrying the context across!
- 🤝 Passing the waybill to a fresh crew!
- 📋 Waybill stamped, casting off to a clean session!
- 🌊 Ferrying the thread over calm water!
- 🛟 Nobody's work goes overboard on my watch!
- 🌅 New session on the far shore, same voyage!
- ⚓ Old session docked, new one boarding!

---

## What this does

Ferry the live state of this session across a context reset: capture it into a
**waybill document**, arm a one-shot handoff, and hand the user off to a clean
session that will automatically resume from it. The point is to **reset the
context window without losing the thread** — the next session starts lean but
fully briefed.

Long sessions accumulate noise: dead ends, superseded plans, stale file reads. A
fresh session is faster and sharper, but naively starting over loses hard-won
context. `/ferry` distills only what the *next* session needs, persists it, and
arms the handoff — once. The handoff store (`hooks/lib/handoff.cjs`, driven by
`hooks/session-guard.cjs`) injects the waybill at the next session start and
later cleans up the waybill it created.

## Usage

```
/ferry                 # default: waybill written OUTSIDE the repo (nothing litters the tree)
/ferry tmp             # accepted alias for the default
/ferry here            # waybill.md in the repo root, kept out of version control locally
/ferry commit          # docs/ferry/waybill-<timestamp>.md, durable, meant to be committed
/ferry clean           # list waybills ferry created (dry run); then confirm to delete
/ferry clean --yes     # delete them
/ferry clean --legacy  # also report/delete pre-provenance root waybill.md files
```

Read the argument from what the user typed. If none given, use the default.

## Pre-flight

Before starting, check dependencies:

| Dependency | Type | Check | Required | Resolution | Detail |
|-----------|------|-------|----------|------------|--------|
| node | cli | `command -v node` | yes | stop | Runs the `hooks/session-guard.cjs` handoff subcommands |
| git | cli | `git rev-parse --show-toplevel` | no | fallback | Not in a git repo → use cwd for `here` mode; skip the `.git/info/exclude` step |

Resolve the plugin root once and reuse it:

```bash
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/marketplaces/slamb2k}"
GUARD="$PLUGIN_ROOT/hooks/session-guard.cjs"
```

## What to do

If the argument is `clean`, jump to **Clean mode** below. Otherwise work through
these steps in order. Don't skip the verification at the end.

### 1. Resolve the target path

First get the repo root and a timestamp:

```bash
git rev-parse --show-toplevel 2>/dev/null   # repo root, or empty if not a git repo
date +%Y-%m-%d-%H%M
```

- **default** (also `tmp`): run `node "$GUARD" handoff-path` — it prints the absolute
  path (under `~/.claude/session-guard/handoff/`) and creates the parent directory.
  Write the waybill there. Nothing is written inside the repo.
- **`here`**: `<repo_root>/waybill.md` (cwd if not a git repo). After writing, append
  the line `waybill.md # mad-skills:ferry` to `<repo_root>/.git/info/exclude` if it is
  a git repo and that line is not already present. The tag lets cleanup remove
  exactly this line later. This is a *local* ignore — it never touches `.gitignore`.
- **`commit`**: `<repo_root>/docs/ferry/waybill-<timestamp>.md`. Create `docs/ferry/`
  if needed. Do **not** ignore it — this variant exists so the waybill lands in git
  history as a durable checkpoint. Tell the user they will want to commit it.

### 2. Write the waybill document

This is the core of the skill — the document quality determines whether the next
session is productive or lost. Follow the structure in
`references/waybill-template.md`. Read that file now if you haven't.

Fill it from the **actual conversation and repo state**, not generic boilerplate.
Be concrete: real file paths, real function names, real commands, real decisions.
Write for a competent engineer who has *zero* memory of this session — every
assumption in your head right now is invisible to them unless you write it down.

Do **not** hand-write any provenance stamp (`<!-- mad-skills:waybill ... -->`); the
CLI adds it when arming.

Gather repo state to embed in the document:

```bash
git -C <repo_root> branch --show-current
git -C <repo_root> status --short
git -C <repo_root> log --oneline -8
```

Optimise for *their* context budget: include what unblocks action, link to files
rather than pasting large code, and cut the narrative of how you got here unless a
dead end is a genuine landmine worth a warning.

### 3. Arm the handoff

After the document is written, arm it with the **absolute** path. If the waybill's
first next step is a slash command, pass it as `--resume`:

```bash
# default and `here`
node "$GUARD" handoff-arm --kind waybill --waybill "<absolute_path>" [--resume "<first next step, if a slash command>"]

# commit: durable, never auto-deleted
node "$GUARD" handoff-arm --kind waybill --waybill "<absolute_path>" --owned false [--resume "..."]
```

The CLI stamps the provenance line and records a content hash. Do **not** edit the
waybill after arming: an edited waybill is kept rather than auto-cleaned (safe, but
it will linger until you remove it or run `/ferry clean`). If you must change it,
edit first and re-run the arm command.

### 4. Hand off to a fresh session

Tell the user plainly that the waybill is ready and they should start the fresh
session themselves. You **cannot** trigger `/clear` programmatically — it is a
user-only command — so the final step is theirs. Print the absolute waybill path and
say something like:

> Waybill written to `<absolute path>` and the next session is armed. Type **`/clear`**
> (or **`/new`**) now — the fresh session will automatically load it and pick up
> where we left off.

Keep this final message short. The work is done; don't bury the one action they
need to take.

## Clean mode

`/ferry clean [--yes] [--legacy]` removes waybills this skill created.

1. Dry run first, always:
   ```bash
   node "$GUARD" handoff-clean [--legacy]
   ```
   Output lines: `owned <path>`, `legacy <path>`, `deleted <path>`, `kept <path> (edited)`.
2. Show the list to the user. If there is nothing, say so and stop.
3. Ask before deleting. Only after the user agrees (or typed `--yes`), re-run with
   `--yes` (plus `--legacy` only if they asked for it or confirm the legacy files).
4. Report what was deleted and what was kept (edited waybills are never deleted).

Legacy files are root `waybill.md` files from before provenance stamping; they are
only ever deleted with an explicit `--yes --legacy`.

## Important constraints

- **`/clear` is the user's to type.** No skill, hook, or command can clear the
  context window automatically. Always end by asking them to do it.
- **The handoff is one-shot injection and project-scoped.** The arming record lives in
  `~/.claude/session-guard/handoff`, keyed to the repo. The waybill is injected once,
  at the next session start in that working tree; a stale file is never re-injected.
- **Owned waybills clean themselves up.** A waybill created via default, `tmp` or `here`
  is deleted automatically when the session that resumed from it ends (SessionEnd —
  exit or `/clear`), only if it is unedited (provenance id and hash still match). A
  parallel session in the same tree never triggers it; if SessionEnd never fires, a
  later session sweeps it after 24h. Edited waybills are kept.
  The matching `.git/info/exclude` line is removed with it.
- **`commit` mode is never swept.** It is recorded as not owned and stays in history
  until the user removes it.
- **Don't pollute the repo by default.** The default mode writes outside the repo;
  `here` relies on `.git/info/exclude`; only `commit` is meant to be tracked.
- **If `/ferry` is run again later**, the new waybill replaces the previously armed
  one (an unedited old owned waybill is deleted) — the latest state wins.
