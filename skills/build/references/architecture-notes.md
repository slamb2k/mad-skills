# Build Architecture Notes

## Context Isolation Strategy

| Technique | Where Applied | Benefit |
|-----------|--------------|---------|
| Subagent delegation | Stages 1, 3-6, 8 | Heavy code I/O stays out of primary |
| Structured reports | All stages | Only 10-30 lines per stage in primary |
| Background tasks | Test runs, CI | Non-blocking; output read on completion |
| Skill chaining | Stage 9 | /ship handles its own subagent tree |
| Haiku for simple work | Git ops, test runs | Minimizes cost on mechanical stages |
| Report contracts | All subagents | Fixed-format summaries, not raw output |

## Agent Type Selection

| Stage | Agent | Fallback | Rationale |
|-------|-------|----------|-----------|
| Explore | feature-dev:code-explorer | general-purpose | Deep codebase analysis |
| Questions | primary thread | — | User interaction required |
| Architect | feature-dev:code-architect | general-purpose | Design work |
| Implement | general-purpose | — | Full file editing capability |
| Review | feature-dev:code-reviewer | general-purpose | Confidence-based filtering |
| Fix | general-purpose | — | Targeted edits |
| Verify | Bash (haiku) | — | Just runs test command |
| Docs | general-purpose | — | Updates progress markers |
| Ship | /ship skill | — | Has own subagent tree |

## Compaction Prevention

The primary thread never sees raw file contents, diffs, grep results, or
test output beyond final summary lines. Each subagent operates in its own
context window and returns only its structured report. This keeps the
primary conversation well under compaction thresholds even for large
multi-file implementations.
