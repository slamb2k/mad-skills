# /logbook loop — autonomous ledger sweep

Work through the open follow-ups, fix every item that needs **no human
interaction**, ship the fixes, and finish with the (up to) 5 items that most
need the user. This is the one `/logbook` action that changes code; it is an
explicit opt-in, so it never asks for per-item permission — but it also never
guesses at a decision that belongs to the user.

Set `_R="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/marketplaces/slamb2k}"`.

## 1. Pre-flight

- **Clean tree required.** If `git status --porcelain` shows anything, stop and
  say so — the sweep must not mix its commits with the user's uncommitted work.
- **Start current.** Run `/sync`, then create a branch
  `chore/logbook-loop-<YYYY-MM-DD>` off the default branch (suffix `-2`, `-3` if
  it exists).
- Read project context the way `/prime` does (AGENTS.md / CLAUDE.md, test and
  lint commands) so fixes follow the repo's conventions.

## 2. Triage (every pass)

List the hot ledger (`node "$_R/hooks/session-guard.cjs" logbook-list`) and put
each open item in exactly one bucket, recording a one-line reason:

**🔧 Auto** — all of these hold:
- concrete and bounded: the item says what is wrong and the fix is clear from
  the item plus the code;
- verifiable locally: tests, lint, or a script can prove it (add a test if none
  covers it);
- changes only this repository.

**🙋 Needs you** — any of these holds:
- a product, policy, or design decision (most *ideas*, many *open questions*);
- credentials, API keys, paid services, or a live external system (cloud org,
  eval runs that need a key, another team);
- a change to the user's machine or global config outside the repo;
- the item itself says to wait ("revisit only if…", "after X ships");
- too large for a sweep — it needs a spec (`/speccy`) first.

When in doubt, it is **Needs you**. Lifecycle steps (`lifecycle-next`) are never
auto-run — every lifecycle transition is user-chosen — so they only ever appear
in the final report.

Items can be partly stale — re-check the claim against the current code first;
an item that is already fixed is resolved with a note, not re-fixed.

## 3. Fix

For each **Auto** item, smallest first:

1. Implement the fix, matching surrounding style; add or update tests.
2. Run the project's test suite and linters. Independent items may be
   delegated to parallel `general-purpose` subagents (one per item, disjoint
   files); verify their claims yourself before resolving.
3. **Green** → `node "$_R/hooks/session-guard.cjs" logbook-resolve "<title substring>"`
   and note what changed. **Red, or it turns out to need a decision** → revert
   that item's changes, move it to **Needs you** with the reason, and keep going.

Never resolve an item that was not verified. Never dismiss items — dismissal is
the user's call.

## 4. Loop

Re-run triage after each pass: fixes can surface new follow-ups or unblock
others. Stop when a pass resolves nothing new, or after **3 passes** or **10
resolved items** (whichever comes first) — the cap keeps one sweep reviewable as
a single PR. Anything left over waits for the next `/logbook loop`.

## 5. Ship

- **Something resolved** → invoke `/ship --next-up-by-caller` to commit (the
  ledger changes ride the same PR), open the PR, watch CI, and merge per
  `/ship`'s normal flow.
- **Nothing resolved** → delete the empty branch, return to the default branch,
  and say so plainly.

## 6. Final report — the last output

First a short summary box (resolved items with their PR, items reclassified to
Needs you, items deferred by the cap). Then render the ranked report as the
very last output, using the format, bands, and rules in
`skills/ship/references/next-up.md` (plugin root) with these differences:

- Title it `🙋  N E E D S   Y O U  ·  top {k}` and cap it at **5**.
- Candidates are the **Needs you** items plus lifecycle steps (and, if `/ship`
  failed, that failure as item 1, 🚨 NOW).
- For each, the `▶` line names what the user must provide or decide (e.g.
  "decide: allow one CI re-run for flakes?", "set ANTHROPIC_API_KEY then
  `npm run eval`"), not just a command.
- Rank by importance as in Next Up: blocking/risky first, then things that
  unblock other items, then decisions, then ideas.

If nothing needs the user, render the frame with
`  ✅  Nothing needs you — the logbook is clear of actionable items.`
