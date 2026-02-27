# Build Report Contracts

Maximum line budgets for each stage report in the primary thread.

| Stage | Report | Max Lines | Content |
|-------|--------|-----------|---------|
| 1 | EXPLORE_REPORT | 30 | Files, patterns, conventions, issues, questions |
| 2 | CLARIFICATIONS | 10 | User answers to questions |
| 3 | ARCH_REPORT | 30 | Approach, implementation order, commit plan |
| 4 | IMPL_REPORT | 20 | Status, files changed, test result |
| 5 | REVIEW_REPORT | 15 (x3) | Findings by severity |
| 6 | FIX_REPORT | 10 | Fixes applied, test result |
| 7 | TEST_REPORT | 10 | Pass/fail counts, output tail |
| 8 | DOCS_REPORT | 15 | Updated markers, skipped items |
| 9 | SHIP_REPORT | 15 | PR URL, merge commit (from /ship) |
| 10 | DEBRIEF_ITEMS | 20 | Unresolved items, categories, suggested actions |

**Total primary thread budget: ~180 lines** across all stages.

The primary thread never sees raw file contents, diffs, grep results, or
verbose test output. Each subagent returns only its structured report.
