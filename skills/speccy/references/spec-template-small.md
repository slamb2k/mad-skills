# Small-Task Specification Template

Use this template instead of `spec-template.md` when `/speccy --auto`'s
eligibility gate passes and zero-interview inference produces the spec.
Fill every section from the ticket text, the exploration matches, and
codebase conventions — no interview rounds occurred, so every substantive
decision must appear as an Assumption Authorization entry.

## File Naming

Save to `specs/{slug}.md` where `{slug}` is a kebab-case name derived from
the ticket, same as the full template.

## Template

```md
---
title: [Concise title]
version: 1.0
date_created: [YYYY-MM-DD]
last_updated: [YYYY-MM-DD]
tags: [...]
autonomy_ready: true
---

# Goal

[The ticket, restated precisely.]

## Autonomous Inference Assessment

- **Eligibility checks passed**: scope ({N} files) / risk-keywords (none
  matched) / architectural-surface (none matched) / clarity (verb present,
  no hedge language, {N} symbol matches)
- **Why this qualified**: [1-2 sentences]

## Approach

[Brief inferred approach — what will change and how, informed by the
matched files' existing conventions.]

## Definition of Done

- [ ] {checkable, testable statement}

## Risks

[Known risks, even though the ticket passed the eligibility gate.]

## Assumption Authorization

- **Ambiguity**: {what wasn't specified in the ticket}
  **Authorized decision**: {what the inference subagent chose}
  **Must report**: {what the PR must say about this decision}
```
