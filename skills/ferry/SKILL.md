---
name: ferry
description: Ferry a session's live state across a context reset — persist a waybill document and signal the next fresh session to resume from it. Use when the user types /ferry, says they want to hand off, checkpoint, wrap up, clear context, or start fresh while preserving state, or asks to carry work into a new session with clean optimised context. Captures everything a brand-new session needs — task, status, next steps, key files, decisions, gotchas, git state — writes it to disk as waybill.md, arms a one-shot signal, and tells the user to /clear so the next session auto-loads it.
argument-hint: repo, tmp, commit (optional target; default repo)
allowed-tools: Bash, Read, Write
---

# Ferry - Clean-Context Session Handoff

When this skill is invoked, IMMEDIATELY output the banner below before doing anything else.
Pick ONE tagline at random — vary your choice each time.
CRITICAL: Reproduce the banner EXACTLY character-for-character, preserving all leading spaces.

```
{tagline}

███████╗███████╗██████╗ ██████╗ ██╗   ██╗
██╔════╝██╔════╝██╔══██╗██╔══██╗╚██╗ ██╔╝
█████╗  █████╗  ██████╔╝██████╔╝ ╚████╔╝
██╔══╝  ██╔══╝  ██╔══██╗██╔══██╗  ╚██╔╝
██║     ███████╗██║  ██║██║  ██║   ██║
╚═╝     ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝
```

Taglines:
- 📋 Filing the waybill for the crossing...
- 🧳 All aboard — carrying the context across!
- 🤝 Passing the waybill to a fresh crew!
- 📋 Waybill stamped, casting off to a clean session!
- 🌊 Ferrying the thread over calm water!
- 🛟 Nobody's work goes overboard on my watch!
- 🌅 New session on the far shore, same voyage!

---

## What this does

Ferry the live state of this session across a context reset: capture it into a
**waybill document** (`waybill.md`), arm a one-shot signal, and hand the user off to
a clean session that will automatically resume from the waybill. The point is to
**reset the context window without losing the thread** — the next session starts
lean but fully briefed.

Long sessions accumulate noise: dead ends, superseded plans, stale file reads. A
fresh session is faster and sharper, but naively starting over loses hard-won
context. `/ferry` distills only what the *next* session needs, persists it, and
signals that session to pick it up — once. It will not re-read old waybill on
unrelated future sessions, because the signal is consumed on first read.

## Usage

```
/ferry            # default: waybill.md in repo root, kept OUT of git
/ferry repo       # same as default (explicit)
/ferry tmp        # write under /tmp — never touches the repo at all
/ferry commit     # write docs/ferry/waybill-<timestamp>.md, meant to be committed
```

Read the argument from what the user typed. If none given, use `repo`.

## Pre-flight

Before starting, check dependencies:

| Dependency | Type | Check | Required | Resolution | Detail |
|-----------|------|-------|----------|------------|--------|
| git | cli | `git rev-parse --show-toplevel` | no | fallback | Not in a git repo → use cwd for `repo` mode; skip `.git/info/exclude` step |
| jq | cli | `command -v jq` | no | fallback | Signal loader falls back to sed + raw-stdout injection; no behavior change |

Resolve the plugin root once for the signal command:

```bash
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/marketplaces/slamb2k}"
```

## What to do

Work through these steps in order. Don't skip the verification at the end.

### 1. Resolve the target path

First get the repo root and a timestamp:

```bash
git rev-parse --show-toplevel 2>/dev/null   # repo root, or empty if not a git repo
date +%Y-%m-%d-%H%M
```

Then pick the path based on the argument:

- **`repo`** (default): `<repo_root>/waybill.md`. If not inside a git repo, use the
  current working directory instead. After writing, keep it out of version control
  by appending `waybill.md` to `<repo_root>/.git/info/exclude` if it's a git repo
  and not already listed there. This is a *local* ignore — it never modifies the
  tracked `.gitignore`, so it won't show up in anyone else's checkout or your diffs.
- **`tmp`**: `/tmp/claude-ferry/<key>/waybill.md` where `<key>` is
  `printf '%s' "$(pwd)" | cksum | cut -d' ' -f1`. Create the directory first.
  Nothing is written inside the repo.
- **`commit`**: `<repo_root>/docs/ferry/waybill-<timestamp>.md`. Create the
  `docs/ferry/` directory if needed. Do **not** ignore it — this variant exists
  precisely so the waybill lands in git history as a durable checkpoint. Mention to
  the user that they'll want to commit it.

### 2. Write the waybill document

This is the core of the skill — the document quality determines whether the next
session is productive or lost. Follow the structure in
`references/waybill-template.md`. Read that file now if you haven't.

Fill it from the **actual conversation and repo state**, not generic boilerplate.
Be concrete: real file paths, real function names, real commands, real decisions.
Write for a competent engineer who has *zero* memory of this session — every
assumption in your head right now is invisible to them unless you write it down.

Gather git state to embed in the document:

```bash
git -C <repo_root> branch --show-current
git -C <repo_root> status --short
git -C <repo_root> log --oneline -8
```

Optimise for *their* context budget: include what unblocks action, link to files
rather than pasting large code, and cut the narrative of how you got here unless a
dead end is a genuine landmine worth a warning.

### 3. Arm the one-shot signal

After the document is written, run (using the `PLUGIN_ROOT` resolved in pre-flight):

```bash
bash "$PLUGIN_ROOT/skills/ferry/scripts/ferry.sh" signal "<absolute_path_to_waybill>"
```

This drops a signal keyed to the current project directory. The next session's
`SessionStart` hook — shipped with this plugin in `hooks/hooks.json` — detects it,
injects the waybill as context, and deletes the signal so it fires exactly once.
Use the **absolute** path.

### 4. Hand off to a fresh session

Tell the user plainly that the waybill is ready and they should start the fresh
session themselves. You **cannot** trigger `/clear` programmatically — it is a
user-only command — so the final step is theirs. Say something like:

> Waybill written to `<path>` and the next session is armed. Type **`/clear`**
> (or **`/new`**) now — the fresh session will automatically load this waybill and
> pick up where we left off. Nothing else gets auto-loaded; the signal is consumed
> on first read.

Keep this final message short. The work is done; don't bury the one action they
need to take.

## Important constraints

- **`/clear` is the user's to type.** No skill, hook, or command can clear the
  context window automatically. Always end by asking them to do it.
- **The signal is one-shot and project-scoped.** It's keyed to the working
  directory and deleted on first read, so waybill never leaks into unrelated
  sessions. A `waybill.md` left sitting in a repo is inert unless re-armed.
- **Don't pollute git by default.** Only the `commit` variant is meant to be
  tracked. `repo` mode relies on `.git/info/exclude`; `tmp` mode stays entirely
  outside the repo.
- **If `/ferry` is run again later**, overwrite the existing document and
  re-arm the signal — the latest state wins.
