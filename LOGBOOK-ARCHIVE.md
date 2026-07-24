# Follow-ups Archive

<!-- Managed by MAD Skills /logbook. This file receives overflow relocated
     from LOGBOOK.md — nothing is ever deleted. Still-open items keep their
     `- [ ]` checkbox and a `relocated:<date>` marker (see `/logbook
     archive` and `/logbook restore`); resolved/dismissed history moves
     here once the hot file's recent-history window fills up. Hand-edits are
     preserved; keep the checkbox shape and category headings. -->

## Ideas

## Deferred fixes

## Open questions

## Risks

## Tech debt

## Archive
- [x] hooks/lib/logbook.cjs's capture()/resolve()/dismiss()/add() are plain writeFileSync calls with no git integration. The ledger's own doc comment says a committed LOGBOOK.md is the single source of truth, but persistence only actually happens whenever some future /ship run happens to bundle the working-tree diff in — between a capture and the next /ship, a captured entry is one git reset --hard/crash/stash mishap away from silent loss. Live example: a capture sat uncommitted 10+ minutes mixed into an unrelated in-progress diff. Needs a design decision (auto-commit vs stale-diff warning vs something else), not just an implementation. — session observation, worktree-discipline-guardrails follow-up work (2026-07-18) <!-- link:task#43 resolved:2026-07-18 -->
