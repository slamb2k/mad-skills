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
- [x] After fixing eval-harness truncation (max_tokens 8192→eval-16384) and a concision-priority prompt nudge, 3 cases still fail consistently NOT due to truncation: build lifecycle-stages, ship pr-lifecycle, brace project-scaffold. Each asks for an entire multi-stage flow narrated in one non-agentic completion; the model exhausts its narrative budget on early-stage roleplay and never reaches the later stages the assertion checks. Fix likely requires redesigning these 3 prompts to ask targeted single-stage questions, mirroring the reliably-passing *-superpowers-present/absent and *-location-mismatch pattern. — /build debrief (task #35 follow-up work) (2026-07-18) <!-- link:task#44 resolved:2026-07-18 -->
- [x] Several pre-existing eval cases (speccy-invocation-banner, ship pr-lifecycle, build lifecycle-stages, brace project-scaffold, *-superpowers-present) fail intermittently due to output truncation or model-generation variance — confirmed unrelated to this PR via baseline comparison, but unresolved. — /build debrief (worktree-discipline-guardrails) (2026-07-18) <!-- link:task#35 resolved:2026-07-18 -->
