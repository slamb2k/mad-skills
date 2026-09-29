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

# ticket clarity: an allowed action verb at/near the start — the first three
# non-blank lines, ignoring markdown heading/list/quote markers, a ticket-key
# prefix (ABC-12:), and a leading "Please". Inflections name the same action
# ("Adds", "Fixed", "Removing").
VERBS='(add(s|ed|ing)?|fix(es|ed|ing)?|remov(e|es|ed|ing)|renam(e|es|ed|ing)|updat(e|es|ed|ing)|deprecat(e|es|ed|ing)|document(s|ed|ing)?|extend(s|ed|ing)?)'
OPENING=$(grep -v '^[[:space:]]*$' "$TICKET" | head -n 3 \
  | sed -E 's/^[[:space:]]*([#>*-]+[[:space:]]*)*//; s/^[A-Za-z]+-[0-9]+[:.]?[[:space:]]*//; s/^[Pp]lease[[:space:]]+//')
grep -Eiq "^${VERBS}\\b" <<<"$OPENING"; VERB=$?

# ticket clarity: no hedge/uncertainty language (whole words, outside code
# spans — "remove the `maybe()` helper" is not hedging)
PROSE=$(sed -E 's/`[^`]*`//g' "$TICKET")
grep -Eiq '(\bmaybe\b|\bperhaps\b|explore options for|not sure|\bTBD\b|some kind of)' <<<"$PROSE"; HEDGE_FOUND=$?
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
