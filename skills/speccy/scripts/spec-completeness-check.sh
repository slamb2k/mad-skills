#!/usr/bin/env bash
# spec-completeness-check.sh — structural half of /speccy --auto's completeness
# gate (REQ-009). Grep-checks that a spec's required --auto sections exist.
# Advisory only: always exits 0 and prints present/missing per item, for the
# semantic self-review in autonomous-interview.md to combine with its judgment.
# The script covers structure; the LLM covers substance.
# Usage: spec-completeness-check.sh <spec-file>
set -uo pipefail

SPEC="${1:?Usage: spec-completeness-check.sh <spec-file>}"

if [ ! -f "$SPEC" ]; then
  echo "❌ spec not found: $SPEC"
  exit 0
fi

check() {
  # check <label> <present 0|1>
  if [ "$2" -eq 0 ]; then
    echo "  ✅ $1"
  else
    echo "  ❌ $1 — missing"
  fi
}

# autonomy_ready frontmatter field present (either value)
grep -Eq '^autonomy_ready:[[:space:]]*(true|false)' "$SPEC"; AR=$?

# Definition of Done heading present
grep -Eq '^##[[:space:]]+Definition of Done' "$SPEC"; DOD_H=$?
# ...with at least one checkbox item
grep -qF -e '- [ ]' "$SPEC"; DOD_ITEM=$?

# Assumption Authorization heading present (conditional — see note below)
grep -Eq '^##[[:space:]]+Assumption Authorization' "$SPEC"; AA=$?

# Roadmap / what's-next context (dedicated heading or Related Specifications)
grep -Eiq '^##.*(Roadmap|What.?s Next|Related Specifications)' "$SPEC"; ROAD=$?

# Risks — a Risks heading, or the standard Rationale/Constraints sections that
# carry risk/tradeoff content in this template
grep -Eiq '^##.*(Risk|Rationale|Constraints)' "$SPEC"; RISK=$?

echo "── Structural completeness check ─────────────────"
echo "  $SPEC"
check "autonomy_ready frontmatter field" "$AR"
check "Definition of Done heading"        "$DOD_H"
check "Definition of Done checklist item" "$DOD_ITEM"
check "Roadmap / what's-next context"     "$ROAD"
check "Risks / rationale content"         "$RISK"
if [ "$AA" -eq 0 ]; then
  echo "  ✅ Assumption Authorization heading"
else
  echo "  ⚠️ Assumption Authorization heading — absent (required only if the"
  echo "     interview left ambiguities delegated to /build; LLM confirms)"
fi
echo "──────────────────────────────────────────────────"

exit 0
