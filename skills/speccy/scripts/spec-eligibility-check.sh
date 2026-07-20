#!/usr/bin/env bash
# spec-eligibility-check.sh — mechanical half of /speccy --auto's zero-interview
# eligibility gate (REQ-002). Grep-checks the mechanically-checkable eligibility
# dimensions: scope (file count, computed upstream), ticket clarity (verb
# present, no hedge language), and symbol match (computed upstream).
# Advisory only: always exits 0 and prints pass/fail per item, for the LLM
# judgment call in autonomous-interview.md to combine with the risk-keyword-path
# and architectural-surface checks (references/autonomous-review-thresholds.md,
# references/autonomous-architecture-surface-markers.md), which stay LLM-judged.
# The script covers mechanics, the LLM covers substance.
# Usage: spec-eligibility-check.sh <ticket-file> <matched-file-count> <symbol-match-count>
set -uo pipefail

TICKET="${1:?Usage: spec-eligibility-check.sh <ticket-file> <matched-file-count> <symbol-match-count>}"
FILE_COUNT="${2:?Usage: spec-eligibility-check.sh <ticket-file> <matched-file-count> <symbol-match-count>}"
SYMBOL_COUNT="${3:?Usage: spec-eligibility-check.sh <ticket-file> <matched-file-count> <symbol-match-count>}"

if [ ! -f "$TICKET" ]; then
  echo "❌ ticket file not found: $TICKET"
  exit 0
fi

check() {
  # check <label> <pass 0|1>
  if [ "$2" -eq 0 ]; then
    echo "  ✅ $1"
  else
    echo "  ❌ $1 — failed"
  fi
}

# scope: ≤3 plausibly-touched files
[ "$FILE_COUNT" -le 3 ]; SCOPE=$?

# ticket clarity: allowed action verb at/near the start
grep -Eiq '^[[:space:]]*(add|fix|remove|rename|update|deprecate|document|extend)\b' "$TICKET"; VERB=$?

# ticket clarity: no hedge/uncertainty language
grep -Eiq '(maybe|perhaps|explore options for|not sure|TBD|some kind of)' "$TICKET"; HEDGE_FOUND=$?
NO_HEDGE=$([ "$HEDGE_FOUND" -ne 0 ] && echo 0 || echo 1)

# ticket clarity: exploration resolved ≥1 concrete file/symbol match
[ "$SYMBOL_COUNT" -ge 1 ]; SYMBOL=$?

echo "── Mechanical eligibility check ──────────────────"
echo "  $TICKET"
check "scope (≤3 matched files, found $FILE_COUNT)" "$SCOPE"
check "verb_present"                                "$VERB"
check "no_hedge_language"                            "$NO_HEDGE"
check "symbol_match (found $SYMBOL_COUNT)"           "$SYMBOL"
echo "──────────────────────────────────────────────────"

exit 0
