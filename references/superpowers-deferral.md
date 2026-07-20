# Superpowers Deferral Contract

Shared deferral behavior for `speccy`, `build`, and `ship`. Superpowers is a
soft/recommended dependency (runtime-detected, like graphify) — never required.
When it is absent, every skill runs its standalone pipeline unchanged.
Exception: `build`'s Stage 4 (plan/implement core) never defers, present or
not — see the Per-skill deferral map below.

## Detection

Detection is a bounded on-disk anchor check via `scripts/lib/superpowers.js`
(anchor file: `using-superpowers/SKILL.md`). Run it from a SKILL.md pre-flight
step with an ESM-safe dynamic import. `LIB` resolves to the plugin's
`scripts/lib` directory using the same `CLAUDE_PLUGIN_ROOT` fallback the other
skills use, so it works for plugin installs and degrades gracefully otherwise:

```bash
LIB="${CLAUDE_PLUGIN_ROOT:-$HOME/.claude/plugins/marketplaces/slamb2k}/scripts/lib"
SP=$(node -e "import('$LIB/superpowers.js').then(m=>process.stdout.write(m.detectSuperpowers().installed?'1':'0')).catch(()=>process.stdout.write('0'))")
```

`SP` is `1` when Superpowers is detected, `0` otherwise. If the helper is not
present at runtime (e.g. a single-skill install), the `.catch` yields `0` so the
skill safely runs its standalone pipeline. Passing `--no-superpowers`
short-circuits `SP` to `0` before this check runs.

## Announcement format

When deferring, print exactly one line (GUD-002):

```
⚡ Superpowers detected — deferring {stage} to superpowers:{skill}
```

## `--no-superpowers` flag

Parsed alongside each skill's existing flags. Forces the standalone pipeline even
when Superpowers is installed. Treat it as setting `SP=0` for the whole run.

## Absent-fallback rule (REQ-007)

When Superpowers is not installed (or `--no-superpowers` is set), the skill runs
its current standalone pipeline with byte-for-byte identical user-facing output.
No announcement is printed — the deferral logic is purely additive.

## Per-skill deferral map

| Skill / stage | Defers to (when present) | Retained by mad-skills |
|---|---|---|
| `speccy` requirements interview | `superpowers:brainstorming` | writes `specs/*.md` + pending-build marker |
| `build` plan/implement core | *never — see Exception below* | explore, 3× code-review, verify, ship gate, **and Stage 4 implementation itself** |
| `ship` final integration | `superpowers:finishing-a-development-branch` | sync, branch, commit, PR, CI-poll, auto-fix |
| `prime` graphify awareness | — (hint only) | context summary |

**Exception — `build` Stage 4 never defers:** unlike the rows above, `build`'s
plan/implement core does not defer to Superpowers even when detected and
`--no-superpowers` is not set. The Skill tool used for the deferral has no
model-override parameter, so REQ-013 (autonomous-execution-mode.md)'s
Sonnet-tiering mandate for
implementation subagents can't be enforced through that path. See
`skills/build/references/autonomous-pipeline.md`'s Model tiering section
(Resolved interaction) for the full rationale. `speccy` and `ship` are
unaffected.

## Absolute-path note (REQ-012)

Relative Read/Write/Edit paths do not follow a Bash `cd`. When deferring the
implementation core to `superpowers:executing-plans` /
`superpowers:subagent-driven-development`, whoever orchestrates that
deferral should ensure implementer subagents use absolute paths rooted at
the correct worktree for every file-tool call once inside a worktree. (Given
the `build` exception above, this currently applies to no live deferral path;
retained in case a future skill/stage defers the implementation core.)

This is advisory-only context, not an enforcement mechanism. mad-skills does
not modify the `superpowers` plugin and does not own Superpowers' own
implementer-prompt templates (CON-002) — this note cannot be verified or
enforced by mad-skills itself.
