# Cargo document template

Fill every section that applies. Drop sections that genuinely don't (e.g. no open
questions). Lead with what unblocks action; a fresh session should be able to make
its **next move within the first minute** of reading this.

Write concretely. "Fix the bug in the parser" is useless; "`parseImportFile()` in
`src/import.js:42` throws on empty `days` — needs a guard before the `Object.entries`
loop" is cargo worth carrying. Prefer absolute or repo-relative file paths with line numbers.

---

```markdown
# Cargo — <short task title>

**Date:** <YYYY-MM-DD HH:MM>  ·  **Branch:** <git branch>  ·  **Repo:** <path>

## TL;DR
One or two sentences: what we're doing and what the very next action is.

## Goal / definition of done
The north star. What does "finished" look like? Include acceptance criteria or
the user's original ask in their words if it matters.

## Current status
What's done and working (verified vs assumed — say which). What's the state of the
tree right now. If something is half-built, say exactly how far it got.

## Next steps
Ordered, concrete, actionable. The first item should be immediately doable.
1. ...
2. ...

## Key files & entry points
The map. Where the relevant code lives and what each piece does.
- `path/to/file.ext:line` — what it is / why it matters
- ...

## Key decisions & rationale
Choices already made that the next session must respect, and *why* — so it doesn't
unknowingly relitigate or contradict them.
- Decided X because Y. Alternative Z was rejected because ...

## Gotchas, dead ends & landmines
Things that wasted time or will bite again. Approaches already tried that DON'T
work (so the next session doesn't repeat them). Environment quirks, flaky steps,
ordering constraints.
- Tried A → failed because B. Don't retry without addressing B.
- Watch out for ...

## How to build / test / run
Exact commands. The next session shouldn't have to rediscover these.
- Build: `...`
- Test: `...`
- Run / verify: `...`

## Open questions & assumptions
Unresolved decisions awaiting the user, and assumptions made that might be wrong.
Flag anything the user still needs to answer.
- [ ] Question: ... (suggested default: ...)
- Assumption: ... (if wrong, then ...)

## Git state
- Branch: <branch>  (tracking <remote/branch> or "local-only")
- Uncommitted changes: <summary of `git status --short`, or "clean">
- Recent commits:
  ```
  <git log --oneline -8>
  ```

## Context the next session can't infer
Anything important that isn't in the code, git history, or CLAUDE.md — the stuff
living only in this conversation. External constraints, user preferences expressed
mid-session, credentials/access notes (reference, don't paste secrets), URLs,
ticket numbers, people involved.
```

---

## Filling guidance

- **Verified vs assumed:** if you ran the test and it passed, say "verified". If you
  think it works but didn't check, say "assumed — not yet run". A fresh session has
  no way to tell otherwise and false confidence is expensive.
- **Link, don't paste:** point to files and line ranges rather than dumping large
  code blocks. The next session can read them on demand; bloating the cargo just
  refills the context window you're trying to clear.
- **Keep it skimmable:** headers, short bullets, code spans for paths/commands. A
  wall of prose defeats the purpose.
