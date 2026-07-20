# Autonomous Ship Report Contract

`/ship --auto`'s completion behavior (REQ-029, REQ-030). Read by `/ship`'s
Stage 5 dispatch when `--auto` is set, in place of the merge stage. This
file governs `--auto` mode only — interactive `/ship`'s merge/auto-merge
behavior is unchanged (CON-003).

## The stop point (REQ-029)

In `--auto` mode `/ship`'s job ends at **"PR opened," full stop.** Do not
merge, and do not gate individual commits on any finer-grained risk tier —
the single "always stop at an open PR" rule is the entire risk boundary. CI
watch and the auto-fix loop still run exactly as in interactive mode
(REQ-031, bounded at 2 attempts); they just never lead into a merge.

The worktree created by `/speccy --auto` **remains alive** after this point.
Cleanup is not `/ship`'s job — the worktree persists until the PR merges or
closes and is torn down later via `/sync`'s PR-state-based cleanup
(REQ-007), not here.

## The report IS the PR description (REQ-030)

There is **no separate report file.** The PR description body already
authored during `/build --auto` (accumulated from the stage reports and the
draft PR built up across build) is the report. `/ship --auto` ensures the PR
body contains these sections:

- **Summary** — what was built and why.
- **Risks** — what could go wrong, what to watch on review.
- **How It Was Validated** — `/verify` results against the spec's
  definition-of-done checklist, plus CI status.
- **Further Testing Needed** — anything not covered by automated validation
  that a human should exercise before merge.
- **Assumptions Made** — sourced from speccy's assumption-authorization
  list *plus* whatever `/build --auto` actually decided along the way. Pull
  these from the accumulated stage reports / PR draft already built during
  build; do not re-derive them.

Any answer, demonstration, or report about this stage — including "what
sections must the PR contain" — is incomplete unless it reproduces the actual
Markdown body below, with real content substituted in. Naming the five
section titles is not the report; the rendered body **is** the report. This
is the literal string passed to `gh pr create --body`/`az repos pr create
--description`, worked example with realistic content:

```markdown
## Summary
Adds rate limiting to the /api/upload endpoint (max 10 req/min per API key)
to stop the abuse pattern reported in issue #482.

## Risks
Existing high-volume integrations may start seeing 429s. The limit is
config-driven (`config/rate-limits.yml`) so it can be raised without a
redeploy if a legitimate customer trips it.

## How It Was Validated
`/verify` ran the definition-of-done checklist: unit tests for the limiter
(12/12 passing), an integration test hitting the endpoint 15x/min and
asserting a 429 on request 11+, and a manual curl loop against the local dev
server. CI is green (lint, test, build).

## Further Testing Needed
Load testing under production-like concurrency was not run — recommend a
staging soak test before this reaches customers with the highest upload
volume.

## Assumptions Made
Per-API-key (not per-IP) limiting was chosen per the spec's assumption
authorization list, since keys are already required on this endpoint.
```

### Evidence (per `references/autonomous-worktree-lifecycle.md` (repo root) + build's evidence chain)

The evidence artifacts captured during `/build --auto`'s evidence-capture
stage (video → GIF → screenshots → text, whichever tier was achieved) MUST
be embedded or linked inline in the PR body. State the achieved tier
explicitly — never silently downgrade. If evidence capture fell back to
text-only (e.g. no runnable dev server), say so and why.

## What `/ship --auto` prints when it finishes

The final message `/ship --auto` gives the user is not "the PR body contains
the required sections" and not a link alone — it is the open-PR confirmation
**followed by the PR body text itself, pasted in full**, exactly as it was
sent to `gh pr create --body` / `az repos pr create --description`. A user
reading the final `/ship --auto` output sees the five `##` headers with their
real, filled-in content directly in front of them, the same way the worked
example above is written out in full rather than summarized.

## Self-verification — what must be true when this stage completes

- [ ] **AC-002**: The open PR's description contains Summary, Risks, How It
  Was Validated, Further Testing Needed, and Assumptions Made sections, with
  evidence embedded or linked.
- [ ] **AC-008**: When `/build --auto` completed and CI/review passed
  cleanly, the PR remains **open (not merged)** and the worktree remains
  alive until the PR is merged or closed.
