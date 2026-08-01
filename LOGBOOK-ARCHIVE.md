# Follow-ups Archive

<!-- Managed by MAD Skills /logbook. This file receives overflow relocated
     from LOGBOOK.md — nothing is ever deleted. Still-open items keep their
     `- [ ]` checkbox and a `relocated:<date>` marker (see `/logbook
     archive` and `/logbook restore`); resolved/dismissed history moves
     here once the hot file's recent-history window fills up. Hand-edits are
     preserved; keep the checkbox shape and category headings. -->

## Ideas
- [ ] Consider a dedicated debugging skill (e.g. /diagnose) mirroring /build's subagent-isolated pipeline but scoped to root-causing a reported bug rather than implementing a plan — reproduce/hypothesize/verify/fix/reverify stages, deferring to superpowers:systematic-debugging when present, same deferral pattern /build already uses for implementation — unfurl project session debugging a Flow-mode drill-through bug (2026-07-18) <!-- relocated:2026-08-01 -->

## Deferred fixes

## Open questions
- [ ] Redesign /ship (interactive mode) to stop at open PR by default, with trigger-based post-merge trunk-sync + branch/worktree cleanup, instead of merge-and-wait — user-stated principle during autonomous-execution-mode build, scoped out of that spec (CON-003 limits it to --auto only) — /build clarifying questions (autonomous-execution-mode) (2026-07-19) <!-- relocated:2026-08-01 -->

## Risks

## Tech debt

## Archive
- [x] ci-watch.sh AzDO CLI path: when no CI runs are found but PR policies genuinely exist, CI_BRANCH stays the empty string (only ever set inside the two RUN_COUNT!=0 branches), so the main wait loop calls az pipelines runs list --branch "" with an empty branch filter — behavior unverified, likely returns unrelated runs or none at all — az/gh command audit (2026-07-19) <!-- resolved:2026-07-19 -->
- [x] /ship's Azure DevOps merge path fails on the first attempt whenever the target repo has a minimum-reviewer branch policy, discovered only via a failed merge error rather than checked upfront — proactively run az repos policy list (or REST equivalent) before attempting merge and surface the approval requirement to the user ahead of time — unfurl project session, hit twice across separate /ship runs (2026-07-18) <!-- resolved:2026-07-19 -->
- [x] Ready-to-run prompt drafted: add Verification Discipline + Known Gotchas CLAUDE.md sections and an Agent Workflow subsection to brace, plus a secret-scan lefthook command to rig — see .tmp/verification-discipline-prompt.md — unfurl project session, incident-driven (2026-07-18) <!-- resolved:2026-07-18 -->
- [x] mad-skills'/build pre-flight table lists feature-dev:code-explorer/architect/reviewer with an empty Check column (no bash/file-existence test), unlike superpowers which has a real on-disk glob check (scripts/lib/superpowers.js). Whether a /build run reports feature-dev as found/not-found is just the orchestrating Claude instance's own guess each time, not a deterministic environment fact — demonstrated live: one /build run tonight declared "feature-dev agents not found" in its pre-flight summary, then successfully used feature-dev:code-explorer/architect/reviewer anyway in Stages 1/3/5. feature-dev is a user-scope plugin (should be available every session on a machine that has it installed), so cross-project inconsistency a user reported is more likely this unreliable self-report than a real per-repo difference. Fix: give feature-dev a real detection check (mirror the superpowers on-disk-anchor pattern) instead of leaving Check="—" and trusting the orchestrator's guess. — session observation, worktree-discipline-guardrails follow-up work (2026-07-18) <!-- link:task#42 resolved:2026-07-18 -->
- [x] superpowers:subagent-driven-development's hard no-implement-on-main + worktree requirement conflicts with mad-skills' own branch-on-main-then-ship-branches-later convention. Skipped the Superpowers deferral for /build Stage 4 on this run; decide whether /build's own instructions should codify when to skip the deferral. — /build debrief (worktree-discipline-guardrails) (2026-07-18) <!-- link:task#36 resolved:2026-07-18 -->
- [x] brace's new Worktree Discipline Injection step (REQ-014) always inserts before ## Guardrails rather than literally anchoring immediately-after ## Branch Discipline — functionally equivalent in every state /brace produces, but a literal-text mismatch against the spec's primary clause wording. — /build debrief (worktree-discipline-guardrails) (2026-07-18) <!-- link:task#37 resolved:2026-07-18 -->
- [x] hooks/lib/logbook.cjs's capture()/resolve()/dismiss()/add() are plain writeFileSync calls with no git integration. The ledger's own doc comment says a committed LOGBOOK.md is the single source of truth, but persistence only actually happens whenever some future /ship run happens to bundle the working-tree diff in — between a capture and the next /ship, a captured entry is one git reset --hard/crash/stash mishap away from silent loss. Live example: a capture sat uncommitted 10+ minutes mixed into an unrelated in-progress diff. Needs a design decision (auto-commit vs stale-diff warning vs something else), not just an implementation. — session observation, worktree-discipline-guardrails follow-up work (2026-07-18) <!-- link:task#43 resolved:2026-07-18 -->
