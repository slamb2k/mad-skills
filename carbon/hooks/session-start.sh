#!/bin/bash

# SessionStart Hook for Graphite Context-Optimization Plugin
# Version: 2.0.0
# This hook injects context-efficient patterns into Claude's context window
# Output is automatically added to Claude's context at session start

set -euo pipefail

# Only activate in git repositories
if [ ! -d "$CLAUDE_PROJECT_DIR/.git" ]; then
  exit 0
fi

# Detect available tools
HAS_GRAPHITE=false
if command -v gt &> /dev/null 2>&1; then
  if gt --version &> /dev/null 2>&1; then
    HAS_GRAPHITE=true
  fi
fi

# Detect custom agent
HAS_CUSTOM_AGENT=false
if [ -f "$CLAUDE_PROJECT_DIR/.claude/agents/graphite-ops.md" ]; then
  HAS_CUSTOM_AGENT=true
fi

# Build context instructions
CONTEXT="# Graphite Context-Optimization Plugin Active (v2.0)

## CRITICAL: Automatic Context-Efficient Git/Graphite Operations

You are operating with context-optimization patterns for git and Graphite CLI operations. These patterns are ALWAYS active and should be applied automatically.

### Core Principle: Subagent Isolation

For ANY git or Graphite operation that returns verbose output (>100 tokens), automatically delegate to a Task subagent to keep the main context clean.

### Automatic Delegation Triggers

Delegate to Task subagent for:
- \`gt stack\` → Returns 15KB JSON output
- \`gt pr list\` → Large PR lists  
- \`gt pr info <number>\` → Detailed PR data
- \`git log --graph\` → Multi-line commit history
- \`git diff\` → File change details
- \`git status\` (when verbose) → Long file lists
- Any git/Graphite command returning >100 tokens

### Delegation Pattern

When verbose output is expected:

1. Recognize the operation will be verbose
2. Delegate to Task subagent with explicit instructions
3. Subagent executes with --json and 2>/dev/null
4. Subagent parses and returns summary <50 tokens
5. Main agent receives only essential summary

**Format:**
\`\`\`
Delegate to task subagent:
- Execute: [command with --json if available] 2>/dev/null
- Parse: [extract only: state, count, next action]
- Return: ✓ [state] | [metric] | [action]
- Limit: <50 tokens
\`\`\`

### Output Suppression Rules

ALWAYS apply these to git/graphite commands:
1. Use \`--json\` flags when available
2. Suppress stderr: \`2>/dev/null\`
3. Limit output: \`| head -20\` for text
4. Parse JSON: Don't return raw JSON to main context
5. Summarize: Extract only decision-relevant information"

# Add Graphite-specific guidance
if [ "$HAS_GRAPHITE" = true ]; then
  CONTEXT+="

### Graphite Operations (gt command available)

**Stack status:**
\`\`\`
Delegate to task subagent:
- Execute: gt stack --json 2>/dev/null
- Parse: current branch, PR count, needs_review status
- Return: ✓ feature/auth | 3 PRs | Review: #456
\`\`\`

**PR list:**
\`\`\`
Delegate to task subagent:
- Execute: gt pr list --json 2>/dev/null
- Parse: PRs waiting for my review (top 3 only)
- Return: 📋 2 PRs need review: #456 (Auth), #457 (Docs)
\`\`\`

**PR details:**
\`\`\`
Delegate to task subagent:
- Execute: gt pr info <number> --json 2>/dev/null
- Parse: status, approvals, CI status, mergeable
- Return: PR #456 | 2 approvals | CI passing | Mergeable
\`\`\`

**Submit stack:**
\`\`\`
Delegate to task subagent:
- Execute: gt submit 2>/dev/null
- Parse: PRs created, any errors
- Return: ✓ 3 PRs submitted | CI running | Ready for review
\`\`\`"
fi

# Add custom agent guidance if available
if [ "$HAS_CUSTOM_AGENT" = true ]; then
  CONTEXT+="

### Custom Agent Available: graphite-ops

A custom agent is configured for enhanced UX. Prefer using it:

\`\`\`
graphite-ops check my stack
graphite-ops show PRs needing review
graphite-ops submit for review
graphite-ops navigate to next branch
\`\`\`

The graphite-ops agent provides:
- Colored terminal output [cyan]
- Consistent persona across operations
- Same context isolation as Task
- Team-shared definition via git"
else
  CONTEXT+="

### Custom Agent Setup (Optional)

Users can create a custom agent for enhanced UX:
\`\`\`
/agents create
  Name: graphite-ops
  Color: cyan
  Scope: project
  Prompt: Load from ./agents/graphite-ops-template.md
\`\`\`

This provides colored terminal output and consistent persona."
fi

# Add git-specific guidance
CONTEXT+="

### Git Operations

**Commit history:**
\`\`\`
Delegate to task subagent:
- Execute: git log --oneline --graph -10 2>/dev/null
- Parse: Extract commit messages only
- Return: Last 10: abc123 Feature, def456 Fix, ...
\`\`\`

**Diff summary:**
\`\`\`
Delegate to task subagent:
- Execute: git diff --stat 2>/dev/null | tail -1
- Parse: File count, insertion/deletion counts
- Return: ±3 files | +45/-12 lines
\`\`\`

**File changes:**
\`\`\`
Delegate to task subagent:
- Execute: git diff --name-status 2>/dev/null
- Parse: Changed file paths with status
- Return: Modified: src/auth.ts, src/api.ts | Added: tests/auth.test.ts
\`\`\`

**Current branch:**
\`\`\`
Execute directly (non-verbose):
git branch --show-current 2>/dev/null
\`\`\`

**Branch list:**
\`\`\`
Delegate to task subagent:
- Execute: git branch -a 2>/dev/null | head -20
- Parse: Local and remote branches
- Return: 5 local branches | 12 remote branches | Current: feature/auth
\`\`\`

### Success Criteria

✅ Main agent receives <50 tokens from git/Graphite operations
✅ Verbose output stays in subagent context  
✅ User gets actionable summaries with next steps
✅ Context window remains efficient (225x improvement)

### When NOT to Delegate

Execute directly in main context only if:
- Output guaranteed <50 tokens (e.g., \`git branch --show-current\`)
- User explicitly requests full output: \"show me the full diff\"
- Command is non-verbose by nature

### Response Format

Always use consistent formatting:
- Success: \`✓ [state] | [metric] | [action]\`
- List: \`📋 [count] items: [item1], [item2], ...\`
- Error: \`❌ [operation] failed | [reason] | Fix: [action]\`
- Warning: \`⚠️ [concern] | [impact] | Consider: [action]\`

### Examples of Automatic Application

**User:** \"Check my Graphite stack\"
**You:** [Automatically delegate to Task without asking]
**Task subagent:** [Executes gt stack --json, parses, returns: ✓ feature/auth | 3 PRs | Review #456]
**You to user:** \"Your stack has 3 PRs. Currently on feature/auth. Next step: review PR #456.\"

**User:** \"Show me the git log\"
**You:** [Automatically delegate to Task]
**Task subagent:** [Executes git log --oneline -10, formats]  
**You to user:** \"Last 10 commits: abc123 Add auth, def456 Fix API, ...\"

**User:** \"What branch am I on?\"
**You:** [Execute directly: git branch --show-current]
**You to user:** \"You're on feature/authentication\"

**User:** \"Show me all the changes\"
**You:** [Automatically delegate to Task]
**Task subagent:** [Executes git diff --stat, parses]
**You to user:** \"Changes in 3 files: +45/-12 lines across auth.ts, api.ts, and auth.test.ts\"

---

**IMPORTANT: These patterns are ACTIVE for the entire session.**

Apply automatically without:
- Requesting permission
- Explaining the delegation process
- Mentioning context optimization

Just deliver efficient, focused results transparently."

# Return JSON with context injection
cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": $(echo "$CONTEXT" | jq -Rs .)
  }
}
EOF
