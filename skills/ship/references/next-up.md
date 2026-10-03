# Next Up — ranked closing report

The **Next Up** report is the last thing a `/ship` run prints, on **every**
ending path: merged, `--pr-only`, Superpowers "keep" or "PR" options, and
failure. Nothing — no lifecycle offer, no ledger listing, no sign-off line —
may follow it. Callers that pass `--next-up-by-caller` (`/build`,
`/logbook loop`) render it themselves as *their* final output instead, using
this same contract, so the user still sees exactly one, and it is still last.

## 1. Gather (read-only, all sources, every run)

Collect candidates from every source below. A source that is missing or
errors is skipped silently — never block the report on one.

| Tag | Source | How |
|-----|--------|-----|
| `this ship` | Outcome of this run | Failure reason, CI fixes applied, skipped stages, anything left unmerged |
| `conversation` | This session | Plans the user stated, things deferred or "later", open questions not yet answered, promises made in earlier replies |
| `AGENTS.md` / `CLAUDE.md` | Project instructions | "Known Issues", "Open Questions", "TODO", roadmap sections |
| `memory` | `~/.claude/projects/<project-slug>/memory/MEMORY.md` and the files it links | Project-type and feedback memories describing ongoing work or constraints |
| `tasks` | `TaskList` | Pending / in-progress tasks |
| `logbook #n` | `node "$_R/hooks/session-guard.cjs" logbook-list` | Open follow-ups (keep the ledger number for the tag) |
| `lifecycle` | `node "$_R/hooks/session-guard.cjs" lifecycle-next` | Lifecycle steps and a pending `/build <spec>` handoff (printed first) |
| `github` | `gh pr list --author @me --state open` and `gh issue list --assignee @me --state open` (GitHub only, `gh` present; AzDO equivalents when `PLATFORM=azdo`) | Your other open PRs (review/CI) and assigned issues |

`_R` is the plugin root: `_R="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/marketplaces/slamb2k}"`.

## 2. Merge and rank

1. **Dedupe** — the same work surfaced by several sources becomes one item;
   keep every source tag (e.g. `logbook #11 · conversation`).
2. **Drop** anything this ship just completed or resolved.
3. **Rank** by importance, most important first, using this order of tiers,
   then by how many sources agree, then by age (older first):

| Band | Meaning | Examples |
|------|---------|----------|
| 🚨 **NOW** | Broken, blocking, or unsafe | This ship failed; CI red on main; security risk; data-loss risk; a merged change that needs a restart/update to take effect |
| ⏩ **NEXT** | Unblocks other work or was explicitly promised | Pending `/build <spec>`; another open PR waiting on you; something the user said they want next; deferred fixes |
| 🕐 **SOON** | Real but not urgent | Open questions needing a decision; unverified work (evals not run); lifecycle steps |
| 💤 **LATER** | Nice to have | Ideas, tech debt, cleanups |

4. **Cap at 10.** Fewer is fine. **Never fabricate** an item to fill the list,
   and never include vague filler ("keep improving tests").

## 3. Render — last output, hard to miss, never colour-dependent

Each item: band icon **and** band word, rank, a short imperative title, one
line of *why*, the source tag(s), and — when there is one — the exact command
to run. Importance must never be conveyed by colour alone: the four icons
differ in shape (🚨 ⏩ 🕐 💤) and every item repeats its band in words, so the
report reads the same for colour-blind users and in monochrome terminals.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🧭  N E X T   U P  ·  ranked, most important first
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  🚨 NOW    1. {title}
              {why it matters}  ·  {source tags}
              ▶ {command}

  ⏩ NEXT   2. {title}
              {why}  ·  {source tags}
              ▶ {command}

  🕐 SOON   3. …
  💤 LATER  4. …

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🚨 NOW · ⏩ NEXT · 🕐 SOON · 💤 LATER      {k} of {total found}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

- Print it as plain response text (not inside a code fence) so the emoji
  render; keep the heavy `━` rules so it stands out in scrollback.
- Never use colour-only markers (🔴🟠🟡🟢, coloured text) to signal importance.
- Omit the `▶` line when there is no concrete command.
- `{total found}` counts deduped candidates before the cap, so the user can
  tell when more exist (`/logbook` shows the rest).
- **Empty** — still render the frame (the report is always last) with a single
  line: `  ✅  Nothing queued — all sources are clear.`
- **After a failure** — item 1 is always 🚨 NOW: resolving that failure (the
  failure reason and the recovery command, e.g. `/sync` or re-running `/ship`).
  Do not imply the PR will merge on its own.
