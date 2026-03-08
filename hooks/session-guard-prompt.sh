#!/usr/bin/env bash
# session-guard-prompt.sh — UserPromptSubmit companion hook for session-guard
#
# Checks if session-guard.sh left a pending context file from SessionStart.
# If found, re-emits the context as additionalContext on the first user prompt,
# then deletes the flag file so it only fires once.
#
# This works around the known limitation where SessionStart hook output is
# silently injected and may not surface until after the first prompt is
# already processed (see anthropics/claude-code#10808).
#
# Install globally in ~/.claude/settings.json:
#   "command": "\"$HOME\"/.claude/hooks/session-guard-prompt.sh"
#
# Or per-project in .claude/settings.json:
#   "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/session-guard-prompt.sh"

set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
PENDING_DIR="${TMPDIR:-/tmp}/claude-session-guard"
GUARD_KEY=$(echo "$PROJECT_DIR" | md5sum 2>/dev/null | cut -d' ' -f1 || echo "default")
PENDING_FILE="$PENDING_DIR/$GUARD_KEY.pending"

# No pending file — fast exit
if [[ ! -f "$PENDING_FILE" ]]; then
  jq -n '{}'
  exit 0
fi

CONTEXT=$(cat "$PENDING_FILE")
rm -f "$PENDING_FILE"

# Also clean up the dedup lock from session-guard.sh
rm -f "$PENDING_DIR/$GUARD_KEY.lock"

# Skip re-emit if session-guard found no issues (just the ✅ line, no warnings)
if [[ $(echo "$CONTEXT" | grep -c '⚠️\|ℹ️') -eq 0 ]]; then
  jq -n '{}'
  exit 0
fi

# Output context as plain stdout to avoid the cosmetic "error" label
# that Claude Code renders when additionalContext is in the JSON output.
# Plain stdout is picked up as hook output without the error severity.
cat <<EOF
[SESSION GUARD — FIRST PROMPT REMINDER]
The following was detected at session start. Act on these items NOW using
AskUserQuestion BEFORE proceeding with the user's request.

$CONTEXT
EOF

exit 0
