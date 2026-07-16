---
name: next
description: Show every MAD Skills lifecycle step that applies to the current project right now, in stage order, on demand. Surfaces the full "what's next" overview from the lifecycle recommendation engine — brace, rig, dock/hoist, keel, envs, and install-type recs — bypassing the ambient anti-nag suppression since you're explicitly asking. Use when you want to see all recommended next steps at once, not just the single ambient offer. Triggers: "what's next", "next steps", "/next", "show lifecycle steps", "what should I do next".
argument-hint: (no arguments)
allowed-tools: Bash, AskUserQuestion
---

# Next - Lifecycle Overview

When this skill is invoked, IMMEDIATELY output the banner below before doing anything else.
Pick ONE tagline at random — vary your choice each time.
CRITICAL: Reproduce the banner EXACTLY character-for-character. The first line of the art has 4 leading spaces (a U+2800 blank + 3 spaces) — you MUST preserve them.

```
{tagline}

⠀   ██╗███╗   ██╗███████╗██╗  ██╗████████╗
   ██╔╝████╗  ██║██╔════╝╚██╗██╔╝╚══██╔══╝
  ██╔╝ ██╔██╗ ██║█████╗   ╚███╔╝    ██║
 ██╔╝  ██║╚██╗██║██╔══╝   ██╔██╗    ██║
██╔╝   ██║ ╚████║███████╗██╔╝ ██╗   ██║
╚═╝    ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝   ╚═╝
```

Taglines:
- 🧭 Charting the course ahead...
- 🗺️ Here's the road from here!
- 👉 What's next on the lifecycle?
- 📋 Reading the ship's manifest of next steps!
- 🔮 Peering down the lifecycle...
- 🚦 All the green lights, in order!

---

## What this does

Ask the Lifecycle Recommendation Engine for **every** step that applies to the
current project right now — not just the single ambient offer the Session Guard
surfaces. Because you're explicitly asking, this **bypasses the anti-nag
suppression** (active-cycle, cooldown, dismissal watermarks), so you see the
full picture even mid-build or after dismissing something.

It is **read-only** — it never runs a skill or mutates state. It lists the
applicable steps in lifecycle-stage order; acting on any is your choice.

## Pre-flight

Before starting, check dependencies:

| Dependency | Type | Check | Required | Resolution | Detail |
|-----------|------|-------|----------|------------|--------|
| session-guard | skill | `ls "${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/marketplaces/slamb2k}/hooks/session-guard.cjs"` | yes | stop | Ships with the mad-skills plugin; reinstall if missing |
| git | cli | `git --version` | no | fallback | Signature detection degrades to silence without git (CON-003) |

## What to do

### 1. Query the engine

Run the overview subcommand from the repo root:

```bash
_R="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/marketplaces/slamb2k}"
node "$_R/hooks/session-guard.cjs" lifecycle-next
```

It prints a block delimited by `LIFECYCLE_NEXT_BEGIN` … `LIFECYCLE_NEXT_END`.
Each line is one applicable step: `{command} — {why}` (with `[previously
dismissed]` where relevant). The body may be `none` when nothing applies.

### 2. Present the overview

Render the parsed lines in a box for the user:

```
┌─ Next · Lifecycle Overview ────────────────────
│
│  {n} step(s) available for this project:
│
│  1. {command}   {why}
│  2. {command}   {why}
│
└─────────────────────────────────────────────────
```

If the body was `none`, say plainly that the project is fully caught up — no
lifecycle steps apply right now — and stop.

### 2a. Cross-reference the Follow-ups Ledger (REQ-041)

After the lifecycle overview, check the Follow-ups Ledger for open items:

```bash
_R="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/marketplaces/slamb2k}"
node "$_R/hooks/session-guard.cjs" followups-hint
```

If it prints a `📌 N open follow-ups` line, append a **single** cross-reference
line beneath the overview box — do **not** list the items inline (that's
`/followups`' job):

```
  + {N} follow-ups → /followups
```

If it prints nothing (empty ledger), show no cross-reference at all.

### 3. Offer to act (optional)

If one or more steps are listed, ask via `AskUserQuestion` whether to run one
now. Options: each listed command (e.g. *Run /rig*), plus *Not now*. Running a
step just invokes that skill — **never** run one without the user choosing it
(REQ-042: every transition is user-consented).

## Notes

- This surfaces the engine's `all` list (plan step 7 of the lifecycle spec).
  Ambient single-offer behaviour lives in the Session Guard and the skills'
  completion cascade — `/next` is the on-demand pull counterpart.
- Muted recommendations (`lifecycle-mute <rec>`) are intentionally **not** shown
  here; unmute with `node "$_R/hooks/session-guard.cjs" lifecycle-unmute <rec>`.
