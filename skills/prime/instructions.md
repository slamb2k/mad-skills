# Prime Instructions

Load project context to inform agent decisions. Raw file contents stay in a
subagent — the primary thread only sees a structured PRIME_REPORT.

## Step 1: Parse Arguments

Extract domain hints from the request (comma-separated). Valid domains are
listed in `references/domains.md`. If no domain specified, load core context only.

## Step 2: Load Context via Subagent

Launch a **general-purpose subagent** to read files and build the report:

```
Task(
  subagent_type: "general-purpose",
  description: "Load and summarise project context",
  prompt: <see below>
)
```

### Subagent Prompt

```
Load project context and return a structured summary. Raw file contents must
NOT appear in the report — summarise only.

Limit PRIME_REPORT to 30 lines maximum.

## Core Files (always load)

1. CLAUDE.md — System handbook, operating procedures
2. goals/manifest.md — Phase status, available goals, project roadmap
3. tools/manifest.md — Available tools and their locations

If CLAUDE.md is missing, record as NOT FOUND and continue.

## Domain Files

{For each requested domain, list files from references/domains.md}

For each file:
- If it exists: read and summarise (2-3 lines max per domain)
- If it doesn't exist: record as NOT FOUND and continue

## Output Format

PRIME_REPORT:
- core_files_loaded: {count}/{total}
- missing_files: {list or "none"}
- domains_loaded: {list}
- per_domain_summary:
  - {domain}: {2-3 line summary}
- branch: {current branch from git branch --show-current}
- ready_for: {inferred from loaded context}
```

## Step 3: Present Summary

Parse PRIME_REPORT and present a clean summary to the user:

```
Context loaded:
- Core: {status from core_files_loaded}
- {Domain}: {summary from per_domain_summary}

Current branch: {branch}
Ready to assist with: {ready_for}
```

If CLAUDE.md was missing, warn the user and note that only domain context
was loaded.
