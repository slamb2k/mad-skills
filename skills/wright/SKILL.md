---
name: wright
description: Update Claude Code marketplace plugins from inside a session — all of them, or one by fuzzy name. Use when the user wants to update plugins, refresh a plugin, or asks how to update mad-skills / superpowers / a specific plugin without the interactive picker.
argument-hint: <plugin-name>, --dry-run (both optional)
allowed-tools: Bash
---

# Wright - Plugin Updater

When this skill is invoked, IMMEDIATELY output the banner below before doing anything else.
Pick ONE tagline at random — vary your choice each time.
CRITICAL: Reproduce the banner EXACTLY character-for-character. The first line of the art has 4 leading spaces (a U+2800 blank + 3 spaces) — you MUST preserve them.

```
{tagline}

⠀   ██╗██╗    ██╗██████╗ ██╗ ██████╗ ██╗  ██╗████████╗
   ██╔╝██║    ██║██╔══██╗██║██╔════╝ ██║  ██║╚══██╔══╝
  ██╔╝ ██║ █╗ ██║██████╔╝██║██║  ███╗███████║   ██║
 ██╔╝  ██║███╗██║██╔══██╗██║██║   ██║██╔══██║   ██║
██╔╝   ╚███╔███╔╝██║  ██║██║╚██████╔╝██║  ██║   ██║
╚═╝     ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝ ╚═════╝ ╚═╝  ╚═╝   ╚═╝
```

Taglines:
- 🔧 Tightening every bolt in the toolbox...
- 🛠️ The wright is in — fixing up your plugins!
- ⚙️ Refitting the fleet, one plugin at a time...
- 🪚 A little maintenance never hurt anybody!
- 🧰 Checking the workshop for stale tools...
- 🔩 Bringing everything up to spec!
- 🏗️ Overhaul in progress...
- 📐 Measure twice, update once!

---

## Output Formatting

After the banner, display parsed input:
```
┌─ Input ────────────────────────────────────────
│  Target:   {plugin name or "all installed"}
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

Status icons: ✅ done · ❌ failed · ⚠️ degraded · ⏳ working · ⏭️ skipped

---

Update installed Claude Code plugins by orchestrating the `claude plugin`
CLI — the CLI does the real work (refreshing marketplace sources, including
the GCS-backed official one, resolving versions, populating the cache); this
skill adds only what the CLI itself lacks on its own: updating everything in
one call, and targeting one plugin by fuzzy name instead of its exact
`plugin@marketplace` id.

## Argument

Parse the optional argument and flag from the request:
- *(empty)* — target every installed plugin
- `<name>` — fuzzy-matched against installed plugins (e.g. `super` → `superpowers`)
- `--dry-run` — resolve targets and print what would run, without executing
  anything. The CLI has no check/preview mode of its own, so this can only
  list targets and their current versions, not the versions available.

## Pre-flight

| Dependency | Type | Check | Required | Resolution | Detail |
|-----------|------|-------|----------|------------|--------|
| claude | cli | `claude --version` | yes | stop | This skill runs inside a Claude Code session — if the CLI itself isn't on PATH something is very wrong; stop and report |
| python3 | cli | `python3 --version` | yes | url | Install from https://www.python.org/downloads/ — the engine script is Python (reuses `difflib` for fuzzy name matching rather than reimplementing it) |

For each row, in order:
1. Run the Check command
2. If found: continue silently
3. If missing: apply Resolution strategy
   - **stop**: notify user with Detail, halt execution
   - **url**: notify user with Detail (install link), halt execution
4. After all checks: summarize what's available

## Flow

Engine: `skills/wright/scripts/update-plugins.py`. Runs the updates by
default; `--dry-run` previews only. Run via Bash, resolving the skill root
the same way every other skill in this plugin does:

```bash
for SKILL_ROOT in \
  "${CLAUDE_PLUGIN_ROOT:-}" \
  "$HOME/.claude/plugins/marketplaces/slamb2k" \
  "$(dirname "$(readlink -f "$0")")/.."
do
  [ -f "$SKILL_ROOT/skills/wright/scripts/update-plugins.py" ] && break
done

python3 "$SKILL_ROOT/skills/wright/scripts/update-plugins.py" [<query>] [--dry-run]
```

1. **Update (default).** Runs `claude plugin marketplace update` (every
   marketplace, or just the one marketplace for a single fuzzy-matched
   target), then `claude plugin update <id>` per target, and reports a
   `PLUGIN / BEFORE / AFTER` table by diffing `claude plugin list` before and
   after. The final line is
   `WRIGHT_RESULT applied=true updated=<n> names=<comma-separated>`.
2. **Preview (`--dry-run`).** Resolves and lists the targets and their
   current versions without touching anything, ending with
   `WRIGHT_RESULT applied=false targets=<n>`.
3. **No installed plugins:** the script exits non-zero with
   `no installed plugins found` on stderr — relay that directly.
4. **Unmatched query:** the script only matches an exact base name or a
   substring (unique, or narrowed by closeness among genuine substring
   candidates) — it deliberately has no catch-all fuzzy fallback across the
   whole install list, because that tier used to match clearly-unrelated
   queries (e.g. `nonexistent-xyz` → `context7`) often enough to be worse
   than admitting no match. On a miss it exits non-zero with
   `no installed plugin matches '<query>' — installed: <comma-separated
   names>` on stderr. **Use that list yourself**: if the intended plugin is
   reasonably inferable from context (a near-miss spelling, a name you
   recognize from the conversation), say which one you picked and why, then
   re-run with the exact name; if it's genuinely ambiguous, ask the user
   rather than guessing.

Fuzzy matching (exact base name → unique/closest-among-candidates substring)
is the entire reason this is Python rather than bash: reusing `difflib`
beats hand-rolling string-distance matching in shell.
`ponytail: no dry-run version-delta preview — the CLI has no check mode, so
--dry-run can only show current versions, not what's available. Upgrade path:
none needed unless the claude CLI itself grows a preview mode to build on.`

**Restart to apply.** The CLI updates the install on disk, but this running
session keeps the old code until it restarts — tell the user to restart the
session (or their client) so the new versions actually load, naming what
changed from the `names=` list.

## Notes

- Superpowers and the other `claude-plugins-official` plugins are covered
  the same way as any other plugin here: `claude plugin marketplace update`
  refreshes the GCS-backed manifest their marketplace lives in.
- Fuzzy match is exact-base → unique-substring → closest; an ambiguous or
  absent query stops with a clear message rather than guessing wrong.
- No script-level unit tests: the engine's only real logic (the `pick()`
  fuzzy matcher) is a thin wrapper over `difflib`, and everything else shells
  out to the live `claude` CLI — mocking that subprocess boundary is a
  bigger lift than the script itself. `tests/evals.json` covers the
  skill-level behavior instead.

## Report to User

```
┌─ Wright · Report ──────────────────────────────
│
│  ✅ Update complete
│
│  🔧 Target:   {plugin name or "all installed"}
│
│  📊 Plugin                 Before        After
│     {name}                 {version}     {arrow} {version}
│
│  ⚡ {n} updated — restart your session to apply {names}
│     (or: "All already current. Nothing to restart.")
│
└─────────────────────────────────────────────────
```

If `--dry-run`, replace the report with the script's target list and note
that nothing was executed — no report box needed for a preview.
