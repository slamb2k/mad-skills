#!/usr/bin/env bash
# session-guard.sh — Claude Code SessionStart hook
# Validates Git repo, CLAUDE.md existence/freshness, and checks for staleness.
#
# Install: Add to ~/.claude/settings.json or .claude/settings.json:
# {
#   "hooks": {
#     "SessionStart": [
#       {
#         "hooks": [
#           {
#             "type": "command",
#             "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/session-guard.sh"
#           }
#         ]
#       }
#     ]
#   }
# }

# NOTE: We intentionally avoid `set -e` here. Many commands (grep, git, find,
# jq, stat) return non-zero for perfectly normal reasons (no matches, not a
# repo, missing files). Letting them fail gracefully is simpler and more
# reliable than wrapping every line in `|| true`.
set -uo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
CLAUDE_MD="$PROJECT_DIR/CLAUDE.md"
NOW=$(date +%s)
STALENESS_THRESHOLD=3   # Accumulated score >= this triggers user prompt

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
EARLY_CONTEXT_PARTS=()  # Git/CLAUDE.md warnings (emitted before staleness)
STALENESS_SIGNALS=()
STALENESS_SCORE=0

add_staleness() {
  local msg="$1"
  local weight="${2:-1}"
  STALENESS_SIGNALS+=("⚠ $msg")
  STALENESS_SCORE=$((STALENESS_SCORE + weight))
}

# Portable stat wrapper: returns mtime as epoch seconds
file_mtime() {
  stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null || echo "$NOW"
}

# ---------------------------------------------------------------------------
# 0) Git repository check
# ---------------------------------------------------------------------------
GIT_ROOT=""

if command -v git &>/dev/null; then
  GIT_ROOT=$(git -C "$PROJECT_DIR" rev-parse --show-toplevel 2>/dev/null) || true

  if [[ -z "$GIT_ROOT" ]]; then
    # ---- Not inside any git repository ----------------------------------
    EARLY_CONTEXT_PARTS+=("[SESSION GUARD] ⚠️  This directory is NOT tracked by Git.")
    EARLY_CONTEXT_PARTS+=("")
    EARLY_CONTEXT_PARTS+=("Please ask the user:")
    EARLY_CONTEXT_PARTS+=("")
    EARLY_CONTEXT_PARTS+=("\"This directory isn't inside a Git repository. Would you like me to:")
    EARLY_CONTEXT_PARTS+=("")
    EARLY_CONTEXT_PARTS+=("1. **Initialise Git** — I'll run \`git init\` to start tracking this project")
    EARLY_CONTEXT_PARTS+=("2. **Skip** — Continue without version control")
    EARLY_CONTEXT_PARTS+=("")
    EARLY_CONTEXT_PARTS+=("What would you prefer?\"")
    EARLY_CONTEXT_PARTS+=("")
    EARLY_CONTEXT_PARTS+=("If the user chooses to initialise, run \`git init\` in the project directory, then suggest creating a .gitignore if one doesn't exist.")
    EARLY_CONTEXT_PARTS+=("If the user chooses to skip, continue normally.")
    EARLY_CONTEXT_PARTS+=("")

  elif [[ "$GIT_ROOT" != "$PROJECT_DIR" ]]; then
    # ---- Git root is an ancestor folder ---------------------------------
    DEPTH=0
    CHECK_DIR="$PROJECT_DIR"
    while [[ "$CHECK_DIR" != "$GIT_ROOT" && "$CHECK_DIR" != "/" ]]; do
      CHECK_DIR=$(dirname "$CHECK_DIR")
      DEPTH=$((DEPTH + 1))
    done

    # Gather monorepo signals at the git root
    MONOREPO_SIGNALS=()

    # Workspace configs
    if [[ -f "$GIT_ROOT/package.json" ]] && command -v jq &>/dev/null; then
      if jq -e '.workspaces // empty' "$GIT_ROOT/package.json" &>/dev/null; then
        MONOREPO_SIGNALS+=("package.json has 'workspaces' field")
      fi
    fi
    [[ -f "$GIT_ROOT/pnpm-workspace.yaml" ]] && MONOREPO_SIGNALS+=("pnpm-workspace.yaml exists")
    [[ -f "$GIT_ROOT/lerna.json" ]]          && MONOREPO_SIGNALS+=("lerna.json exists")
    [[ -f "$GIT_ROOT/nx.json" ]]             && MONOREPO_SIGNALS+=("nx.json exists")
    [[ -f "$GIT_ROOT/turbo.json" ]]          && MONOREPO_SIGNALS+=("turbo.json exists")
    [[ -f "$GIT_ROOT/rush.json" ]]           && MONOREPO_SIGNALS+=("rush.json exists")

    # Common monorepo directory patterns
    for d in packages apps services libs modules projects; do
      [[ -d "$GIT_ROOT/$d" ]] && MONOREPO_SIGNALS+=("'$d/' directory exists at git root")
    done

    # Multiple package.json files (strong monorepo indicator)
    PKG_COUNT=$(find "$GIT_ROOT" -maxdepth 3 -name "package.json" -not -path "*/node_modules/*" 2>/dev/null | wc -l | tr -d ' ')
    (( PKG_COUNT > 2 )) && MONOREPO_SIGNALS+=("${PKG_COUNT} package.json files found within the repo")

    # Multiple CLAUDE.md files (intentional per-package setup)
    CLAUDE_MD_COUNT=$(find "$GIT_ROOT" -maxdepth 3 -name "CLAUDE.md" 2>/dev/null | wc -l | tr -d ' ')
    (( CLAUDE_MD_COUNT > 1 )) && MONOREPO_SIGNALS+=("${CLAUDE_MD_COUNT} CLAUDE.md files found (suggests per-package setup)")

    RELATIVE_PATH="${PROJECT_DIR#"$GIT_ROOT/"}"

    if (( ${#MONOREPO_SIGNALS[@]} >= 2 )); then
      # ---- Likely a legitimate monorepo ---------------------------------
      EARLY_CONTEXT_PARTS+=("[SESSION GUARD] ℹ️  Git root is ${DEPTH} level(s) above the current directory.")
      EARLY_CONTEXT_PARTS+=("  Git root:    $GIT_ROOT")
      EARLY_CONTEXT_PARTS+=("  Working dir: $PROJECT_DIR")
      EARLY_CONTEXT_PARTS+=("")
      EARLY_CONTEXT_PARTS+=("This appears to be a **monorepo** based on these signals:")
      for sig in "${MONOREPO_SIGNALS[@]}"; do
        EARLY_CONTEXT_PARTS+=("  • $sig")
      done
      EARLY_CONTEXT_PARTS+=("")
      EARLY_CONTEXT_PARTS+=("Briefly let the user know:")
      EARLY_CONTEXT_PARTS+=("")
      EARLY_CONTEXT_PARTS+=("\"I notice the Git repository root is at \`$GIT_ROOT\`, which looks like a monorepo. I'm working in the \`${RELATIVE_PATH}\` package. Just confirming — is this the right context, or did you mean to open Claude Code at the repo root?\"")
      EARLY_CONTEXT_PARTS+=("")
      EARLY_CONTEXT_PARTS+=("This is a low-priority confirmation — don't block on it. Continue with the session regardless.")
      EARLY_CONTEXT_PARTS+=("")

    else
      # ---- Ancestor may be incorrectly initialised ----------------------
      GIT_ROOT_FILE_COUNT=$(find "$GIT_ROOT" -maxdepth 1 -not -name '.*' 2>/dev/null | wc -l | tr -d ' ')

      EARLY_CONTEXT_PARTS+=("[SESSION GUARD] ⚠️  Git root is ${DEPTH} level(s) above the current directory and does NOT look like a monorepo.")
      EARLY_CONTEXT_PARTS+=("  Git root:    $GIT_ROOT")
      EARLY_CONTEXT_PARTS+=("  Working dir: $PROJECT_DIR")
      EARLY_CONTEXT_PARTS+=("  Files at git root: ~${GIT_ROOT_FILE_COUNT}")
      EARLY_CONTEXT_PARTS+=("")

      if (( ${#MONOREPO_SIGNALS[@]} > 0 )); then
        EARLY_CONTEXT_PARTS+=("Weak signals found (not enough for monorepo classification):")
        for sig in "${MONOREPO_SIGNALS[@]}"; do
          EARLY_CONTEXT_PARTS+=("  • $sig")
        done
        EARLY_CONTEXT_PARTS+=("")
      fi

      EARLY_CONTEXT_PARTS+=("This may indicate that an ancestor directory was accidentally initialised with \`git init\`.")
      EARLY_CONTEXT_PARTS+=("")
      EARLY_CONTEXT_PARTS+=("Please ask the user:")
      EARLY_CONTEXT_PARTS+=("")
      EARLY_CONTEXT_PARTS+=("\"I notice the Git repository root is at \`$GIT_ROOT\`, which is ${DEPTH} level(s) above your current working directory. This doesn't look like a monorepo setup, so the Git repo at that level may have been created accidentally.")
      EARLY_CONTEXT_PARTS+=("")
      EARLY_CONTEXT_PARTS+=("A few options:")
      EARLY_CONTEXT_PARTS+=("1. **It's correct** — The repo root at \`$GIT_ROOT\` is intentional, carry on")
      EARLY_CONTEXT_PARTS+=("2. **Initialise here instead** — I'll run \`git init\` in this directory to create a separate repo")
      EARLY_CONTEXT_PARTS+=("3. **Investigate** — I'll look at the git root structure to help you decide")
      EARLY_CONTEXT_PARTS+=("")
      EARLY_CONTEXT_PARTS+=("What would you prefer?\"")
      EARLY_CONTEXT_PARTS+=("")
      EARLY_CONTEXT_PARTS+=("If 'correct': continue normally.")
      EARLY_CONTEXT_PARTS+=("If 'initialise here': run \`git init\` in the project directory. Warn the user that the ancestor .git will still exist and they may want to remove it later.")
      EARLY_CONTEXT_PARTS+=("If 'investigate': list the git root contents and recent commits to help the user understand what's tracked.")
      EARLY_CONTEXT_PARTS+=("")
    fi
  fi
  # else: GIT_ROOT == PROJECT_DIR — all good, no action needed
fi

# ---------------------------------------------------------------------------
# 1) CLAUDE.md existence check
# ---------------------------------------------------------------------------
if [[ ! -f "$CLAUDE_MD" ]]; then
  EARLY_CONTEXT_PARTS+=("[SESSION GUARD] No CLAUDE.md was found in the project root.")
  EARLY_CONTEXT_PARTS+=("")
  EARLY_CONTEXT_PARTS+=("This directory has not been initialised for Claude Code. Please ask the user:")
  EARLY_CONTEXT_PARTS+=("")
  EARLY_CONTEXT_PARTS+=("\"I notice this directory doesn't have a CLAUDE.md file, so it isn't set up as a Claude Code project yet. Would you like me to:")
  EARLY_CONTEXT_PARTS+=("")
  EARLY_CONTEXT_PARTS+=("1. **Initialise it** — I'll run \`/init\` to scaffold a CLAUDE.md with project context")
  EARLY_CONTEXT_PARTS+=("2. **Skip for now** — Continue without one (you may lose project-specific context)")
  EARLY_CONTEXT_PARTS+=("")
  EARLY_CONTEXT_PARTS+=("What would you prefer?\"")
  EARLY_CONTEXT_PARTS+=("")
  EARLY_CONTEXT_PARTS+=("If the user chooses to initialise, run the /init slash command.")
  EARLY_CONTEXT_PARTS+=("If the user chooses to skip, continue normally.")

  # Emit everything collected (git warnings + CLAUDE.md missing) and exit
  CONTEXT=$(printf '%s\n' "${EARLY_CONTEXT_PARTS[@]}")
  jq -n --arg ctx "$CONTEXT" '{
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: $ctx
    }
  }'
  exit 0
fi

# ---------------------------------------------------------------------------
# 2) Staleness evaluation
# ---------------------------------------------------------------------------
CLAUDE_MD_MTIME=$(file_mtime "$CLAUDE_MD")
CLAUDE_MD_AGE_DAYS=$(( (NOW - CLAUDE_MD_MTIME) / 86400 ))
CLAUDE_MD_CONTENT=$(cat "$CLAUDE_MD")

# --- 3a) Age-based check ---------------------------------------------------
if (( CLAUDE_MD_AGE_DAYS > 14 )); then
  add_staleness "CLAUDE.md was last modified ${CLAUDE_MD_AGE_DAYS} days ago" 2
elif (( CLAUDE_MD_AGE_DAYS > 7 )); then
  add_staleness "CLAUDE.md was last modified ${CLAUDE_MD_AGE_DAYS} days ago" 1
fi

# --- 3b) Directory structure drift ------------------------------------------
if command -v tree &>/dev/null; then
  CURRENT_TREE=$(tree -L 2 -d -I 'node_modules|.git|__pycache__|.venv|venv|dist|build|.next|.nuxt|coverage|.claude' --noreport "$PROJECT_DIR" 2>/dev/null) || true
  if [[ -n "$CURRENT_TREE" ]]; then
    # Strip box-drawing characters, pipes, dashes, whitespace to get clean dir names
    TREE_DIRS=$(echo "$CURRENT_TREE" | tail -n +2 \
      | sed 's/[│├└─┬┤┼┐┘┌┏┗┓┛]//g; s/[|`]//g; s/--*//g' \
      | sed 's/^[[:space:]]*//' | { grep -v '^$' || true; } | sort -u)
    MISSING_DIRS=()
    while IFS= read -r dir; do
      [[ -z "$dir" ]] && continue
      if ! grep -qi "$dir" "$CLAUDE_MD" 2>/dev/null; then
        MISSING_DIRS+=("$dir")
      fi
    done <<< "$TREE_DIRS"
    if (( ${#MISSING_DIRS[@]} > 2 )); then
      add_staleness "Directories not mentioned in CLAUDE.md: ${MISSING_DIRS[*]}" 2
    elif (( ${#MISSING_DIRS[@]} > 0 )); then
      add_staleness "Directories not mentioned in CLAUDE.md: ${MISSING_DIRS[*]}" 1
    fi
  fi
fi

# --- 3c) package.json dependency drift --------------------------------------
if [[ -f "$PROJECT_DIR/package.json" ]]; then
  PKG_MTIME=$(file_mtime "$PROJECT_DIR/package.json")

  # Check if package.json is newer than CLAUDE.md
  if (( PKG_MTIME > CLAUDE_MD_MTIME )); then
    PKG_DELTA=$(( (PKG_MTIME - CLAUDE_MD_MTIME) / 86400 ))
    add_staleness "package.json was modified ${PKG_DELTA} day(s) after CLAUDE.md" 1
  fi

  # Count dependencies vs what's documented
  if command -v jq &>/dev/null; then
    DEP_COUNT=$(jq '[(.dependencies // {} | length), (.devDependencies // {} | length)] | add' "$PROJECT_DIR/package.json" 2>/dev/null) || DEP_COUNT="0"
    # Look for numbers near "dependenc" in CLAUDE.md (e.g. "23 dependencies")
    DOCUMENTED_COUNT=$(grep -oiP '\d+\s*(dependencies|deps)' "$CLAUDE_MD" 2>/dev/null | head -1 | grep -oP '\d+') || true
    if [[ -n "$DOCUMENTED_COUNT" && -n "$DEP_COUNT" ]]; then
      DRIFT=$(( DEP_COUNT - DOCUMENTED_COUNT ))
      DRIFT_ABS=${DRIFT#-}
      if (( DRIFT_ABS > 5 )); then
        add_staleness "Dependency count drifted: CLAUDE.md says ~${DOCUMENTED_COUNT}, actual is ${DEP_COUNT} (Δ${DRIFT})" 2
      elif (( DRIFT_ABS > 0 )); then
        add_staleness "Dependency count drifted slightly: CLAUDE.md says ~${DOCUMENTED_COUNT}, actual is ${DEP_COUNT}" 1
      fi
    fi

    # Check for key dependencies not documented
    KEY_DEPS=$(jq -r '(.dependencies // {}) | keys[]' "$PROJECT_DIR/package.json" 2>/dev/null) || true
    UNDOCUMENTED_KEY_DEPS=()
    while IFS= read -r dep; do
      [[ -z "$dep" ]] && continue
      if ! grep -qi "$dep" "$CLAUDE_MD" 2>/dev/null; then
        UNDOCUMENTED_KEY_DEPS+=("$dep")
      fi
    done <<< "$KEY_DEPS"
    if (( ${#UNDOCUMENTED_KEY_DEPS[@]} > 5 )); then
      SAMPLE="${UNDOCUMENTED_KEY_DEPS[*]:0:5}"
      add_staleness "Multiple production deps not in CLAUDE.md (${#UNDOCUMENTED_KEY_DEPS[@]} total, e.g. ${SAMPLE})" 2
    fi
  fi
fi

# --- 3d) pyproject.toml / requirements.txt drift ----------------------------
for PYFILE in "$PROJECT_DIR/pyproject.toml" "$PROJECT_DIR/requirements.txt" "$PROJECT_DIR/setup.py"; do
  if [[ -f "$PYFILE" ]]; then
    PY_MTIME=$(file_mtime "$PYFILE")
    if (( PY_MTIME > CLAUDE_MD_MTIME )); then
      add_staleness "$(basename "$PYFILE") was modified after CLAUDE.md" 1
    fi
  fi
done

# --- 3e) Key config files newer than CLAUDE.md ------------------------------
for CFG in "$PROJECT_DIR/tsconfig.json" \
           "$PROJECT_DIR/.env.example" \
           "$PROJECT_DIR/docker-compose.yml" \
           "$PROJECT_DIR/Dockerfile" \
           "$PROJECT_DIR/Makefile" \
           "$PROJECT_DIR/Cargo.toml" \
           "$PROJECT_DIR/go.mod"; do
  if [[ -f "$CFG" ]]; then
    CFG_MTIME=$(file_mtime "$CFG")
    if (( CFG_MTIME > CLAUDE_MD_MTIME )); then
      add_staleness "$(basename "$CFG") modified after CLAUDE.md" 1
    fi
  fi
done

# --- 3f) Git-based checks ---------------------------------------------------
if command -v git &>/dev/null && [[ -n "$GIT_ROOT" ]]; then
  # Convert CLAUDE.md mtime to ISO date for git
  CLAUDE_MD_DATE=$(date -d "@$CLAUDE_MD_MTIME" --iso-8601=seconds 2>/dev/null) \
    || CLAUDE_MD_DATE=$(date -r "$CLAUDE_MD_MTIME" +%Y-%m-%dT%H:%M:%S 2>/dev/null) \
    || CLAUDE_MD_DATE=""

  if [[ -n "$CLAUDE_MD_DATE" ]]; then
    COMMITS_SINCE=$(git -C "$PROJECT_DIR" rev-list --count --since="$CLAUDE_MD_DATE" HEAD 2>/dev/null) || COMMITS_SINCE="0"
    if (( COMMITS_SINCE > 50 )); then
      add_staleness "${COMMITS_SINCE} commits since CLAUDE.md was last updated" 2
    elif (( COMMITS_SINCE > 20 )); then
      add_staleness "${COMMITS_SINCE} commits since CLAUDE.md was last updated" 1
    fi

    # Check for structural file additions/deletions
    CHANGED_FILES=$(git -C "$PROJECT_DIR" diff --name-only --diff-filter=AD HEAD~20..HEAD 2>/dev/null | head -20) || true
    NEW_TOP_LEVEL=$(echo "$CHANGED_FILES" | { grep -v '/' || true; } | { grep -v '^\.' || true; } | sort -u)
    if [[ -n "$NEW_TOP_LEVEL" ]]; then
      NEW_COUNT=$(echo "$NEW_TOP_LEVEL" | wc -l | tr -d ' ')
      if (( NEW_COUNT > 3 )); then
        add_staleness "Multiple top-level files added/removed since last update (${NEW_COUNT} files)" 1
      fi
    fi
  fi
fi

# --- 3g) Lock file drift (structural indicator) -----------------------------
for LOCK in "$PROJECT_DIR/package-lock.json" \
            "$PROJECT_DIR/yarn.lock" \
            "$PROJECT_DIR/pnpm-lock.yaml" \
            "$PROJECT_DIR/Cargo.lock" \
            "$PROJECT_DIR/poetry.lock"; do
  if [[ -f "$LOCK" ]]; then
    LOCK_MTIME=$(file_mtime "$LOCK")
    LOCK_DELTA=$(( (LOCK_MTIME - CLAUDE_MD_MTIME) / 86400 ))
    if (( LOCK_DELTA > 7 )); then
      add_staleness "$(basename "$LOCK") is ${LOCK_DELTA} days newer than CLAUDE.md" 1
      break  # Only flag once for lock files
    fi
  fi
done

# ---------------------------------------------------------------------------
# 4) Produce output
# ---------------------------------------------------------------------------
OUTPUT_PARTS=()

# Include any git warnings collected earlier (monorepo / suspect ancestor)
for part in "${EARLY_CONTEXT_PARTS[@]+"${EARLY_CONTEXT_PARTS[@]}"}"; do
  OUTPUT_PARTS+=("$part")
done

# Confirm CLAUDE.md found
OUTPUT_PARTS+=("[SESSION GUARD] ✅ CLAUDE.md found in: $PROJECT_DIR")

if (( STALENESS_SCORE >= STALENESS_THRESHOLD )); then
  OUTPUT_PARTS+=("")
  OUTPUT_PARTS+=("[SESSION GUARD] ⚠️  CLAUDE.md appears to be STALE (staleness score: ${STALENESS_SCORE}/${STALENESS_THRESHOLD} threshold)")
  OUTPUT_PARTS+=("")
  OUTPUT_PARTS+=("Staleness signals detected:")
  for sig in "${STALENESS_SIGNALS[@]}"; do
    OUTPUT_PARTS+=("  $sig")
  done
  OUTPUT_PARTS+=("")
  OUTPUT_PARTS+=("Please inform the user with something like:")
  OUTPUT_PARTS+=("")
  OUTPUT_PARTS+=("\"I've detected that your CLAUDE.md may be out of date based on these signals:")
  for sig in "${STALENESS_SIGNALS[@]}"; do
    OUTPUT_PARTS+=("- ${sig#⚠ }")
  done
  OUTPUT_PARTS+=("")
  OUTPUT_PARTS+=("Would you like me to review and update CLAUDE.md to reflect the current state of the project?\"")
  OUTPUT_PARTS+=("")
  OUTPUT_PARTS+=("If the user agrees, read the current CLAUDE.md, analyse the project structure, dependencies, and recent changes, then update CLAUDE.md accordingly. Preserve any user-written notes or conventions that are still accurate.")
elif (( ${#STALENESS_SIGNALS[@]} > 0 )); then
  OUTPUT_PARTS+=("")
  OUTPUT_PARTS+=("[SESSION GUARD] ℹ️  Minor drift detected (score: ${STALENESS_SCORE}/${STALENESS_THRESHOLD} threshold) — not flagging to user:")
  for sig in "${STALENESS_SIGNALS[@]}"; do
    OUTPUT_PARTS+=("  $sig")
  done
fi

# Join and emit
CONTEXT=$(printf '%s\n' "${OUTPUT_PARTS[@]}")

jq -n --arg ctx "$CONTEXT" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: $ctx
  }
}'

exit 0
