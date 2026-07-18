# Follow-ups

<!-- Managed by MAD Skills /logbook. Hand-edits are preserved; keep the
     `- [ ]` checkbox shape and category headings. -->

## Ideas
- [ ] Consider a dedicated debugging skill (e.g. /diagnose) mirroring /build's subagent-isolated pipeline but scoped to root-causing a reported bug rather than implementing a plan — reproduce/hypothesize/verify/fix/reverify stages, deferring to superpowers:systematic-debugging when present, same deferral pattern /build already uses for implementation — unfurl project session debugging a Flow-mode drill-through bug (2026-07-18)
- [ ] Ready-to-run prompt drafted: add /build+/speccy pre-flight worktree-location checks, an absolute-path rule for worktree-entering subagents, and a Worktree Discipline CLAUDE.md section + brace retrofit-injection — see .tmp/worktree-discipline-prompt.md — unfurl project session, incident-driven (2026-07-18)
- [ ] Ready-to-run prompt drafted: add Verification Discipline + Known Gotchas CLAUDE.md sections and an Agent Workflow subsection to brace, plus a secret-scan lefthook command to rig — see .tmp/verification-discipline-prompt.md — unfurl project session, incident-driven (2026-07-18)

## Deferred fixes
- [ ] /ship's Azure DevOps merge path fails on the first attempt whenever the target repo has a minimum-reviewer branch policy, discovered only via a failed merge error rather than checked upfront — proactively run az repos policy list (or REST equivalent) before attempting merge and surface the approval requirement to the user ahead of time — unfurl project session, hit twice across separate /ship runs (2026-07-18)

## Open questions

## Risks

## Tech debt

## Archive
- [x] rec: link resolves only skill-marker names — couple to lifecycle.evaluate for drift-based rec ids like rig-refresh — /build debrief #89 (2026-07-16) <!-- resolved:2026-07-17 -->
- [x] task# auto-resolution is injected-only in tests — add an integration test that drives the /logbook review TaskGet path — /build debrief #89 (2026-07-16) <!-- resolved:2026-07-17 -->
- [x] ADO release-target detection: /dock is suppressed for ADO repos because release-target regexes are GitHub-shaped — parse azure-pipelines deploy YAML so ADO repos can still be offered a release pipeline — /logbook ADO fix (2026-07-16) <!-- resolved:2026-07-17 -->
- [x] spec: link auto-resolves immediately if the path never existed — guard on once-existed — /build debrief #89 (2026-07-16) <!-- resolved:2026-07-17 -->
- [x] build/ship SKILL.md exceed the 500-line soft lint warning — move the follow-ups capture wiring to references/ — /build debrief #89 (2026-07-16) <!-- resolved:2026-07-16 -->
