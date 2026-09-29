# Project Instructions File Contract

Shared contract for every skill and hook that creates, updates, or reads a
project's instructions file. Used by `/brace`, `/rig`, `/prime`, `/build`,
`/speccy`, and the session guard (`hooks/lib/instructions.cjs`).

## Canonical file: AGENTS.md

`AGENTS.md` is the single source of truth for project instructions. It is the
cross-tool standard (Claude Code, Codex, Cursor, Copilot, and others read it),
so every scaffold, injection, and staleness update targets `AGENTS.md`.

`CLAUDE.md` is kept as a pointer so Claude Code loads `AGENTS.md`. Its
content should start with:

```
@AGENTS.md
```

## Resolving the target

```bash
if   [ -f AGENTS.md ]; then TARGET=AGENTS.md
elif [ -f CLAUDE.md ];  then TARGET=CLAUDE.md   # legacy — offer migration first
else                          TARGET=AGENTS.md   # create it, plus the CLAUDE.md pointer
fi
```

Rules:

1. **Both exist** → `TARGET=AGENTS.md`. Never write project content into
   `CLAUDE.md`. If `CLAUDE.md` has content and does not import `AGENTS.md`,
   offer the migration below before continuing. If it imports `AGENTS.md`,
   any notes under the import are intentional Claude-only steering: leave
   them alone and do not offer migration.
2. **Only CLAUDE.md exists** → offer the migration below. If accepted,
   `TARGET=AGENTS.md`. If declined, `TARGET=CLAUDE.md` for this run only and
   say so in the report.
3. **Only AGENTS.md exists** → `TARGET=AGENTS.md`. If `CLAUDE.md` is missing,
   write the pointer (this is safe and needs no confirmation).
4. **Neither exists** → create `AGENTS.md` from the template and write the
   `CLAUDE.md` pointer.

"Imports AGENTS.md" means an `@AGENTS.md` (or `@./AGENTS.md`) import, on its
own line or inline in prose, outside code spans and fenced code blocks. A
markdown link or a sentence that only names `AGENTS.md` does not count: Claude
Code loads nothing from it. "Has content" means any non-blank line that is not
a markdown heading, an HTML comment, or a line carrying that import.

Claude-only notes belong under the import in `CLAUDE.md`, not in `AGENTS.md`,
so other tools never see Claude-specific steering.

## Migration offer

Never move content silently. Ask via AskUserQuestion:

```
Question: "CLAUDE.md contains project instructions. AGENTS.md is the canonical
           file — move CLAUDE.md's content into AGENTS.md?"
Options:
  - "Move it (Recommended)" — merge CLAUDE.md sections into AGENTS.md
    (create AGENTS.md if missing, preserve every section, dedupe headings
    that already exist in AGENTS.md), then replace CLAUDE.md with `@AGENTS.md`
  - "Leave CLAUDE.md as is" — update CLAUDE.md in place this time; keep
    both files unchanged otherwise
```

On "Move it":

1. Read both files. If `AGENTS.md` is missing, the merged file is simply the
   `CLAUDE.md` content.
2. For each `##` section in `CLAUDE.md`: if a section with the same heading
   exists in `AGENTS.md`, keep the `AGENTS.md` version and append any lines
   from `CLAUDE.md` that are not already present. Otherwise append the whole
   section to `AGENTS.md` (before `## Guardrails` if that heading exists).
3. Write `AGENTS.md`.
4. Overwrite `CLAUDE.md` with exactly `@AGENTS.md` and a trailing newline.
5. Report: sections moved, sections merged, and that `CLAUDE.md` is now a
   pointer.

## Reading

Claude Code expands `@path` imports when it loads CLAUDE.md, but a skill
reading the file as text sees only the `@AGENTS.md` line. Readers (`/prime`,
`/build`, `/speccy`) therefore use a plain rule instead of parsing imports:

1. Read `AGENTS.md` if it exists.
2. Also read `CLAUDE.md` if it exists and holds anything beyond an
   `@AGENTS.md` line. This covers a legacy CLAUDE.md and Claude-only notes
   kept under the import.
3. If either file has other `@path` lines, read those files too.

Keep `@` lines out of AGENTS.md itself. Other tools (Codex, opencode, the
AGENTS.md spec) do not expand imports and would see them as plain text.
