#!/usr/bin/env bash
# session-guard.sh — Claude Code SessionStart hook
# Validates Git repo, CLAUDE.md existence/freshness, Task List ID config,
# and checks for staleness.
#
# All user-facing questions instruct Claude to use the AskUserQuestion tool.
#
# Install globally in ~/.claude/settings.json:
#   "command": "\"$HOME\"/.claude/hooks/session-guard.sh"
#
# Or per-project in .claude/settings.json:
#   "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/session-guard.sh"
#
# TIMING NOTE: SessionStart hook output is silently injected and only surfaces
# on the user's first prompt. Pair with session-guard-prompt.sh on
# UserPromptSubmit for immediate feedback (see companion hook).

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
PENDING_DIR="${TMPDIR:-/tmp}/claude-session-guard"

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
EARLY_CONTEXT_PARTS=()
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
# Dedup: prevent double-firing if configured at both global and project level
# ---------------------------------------------------------------------------
mkdir -p "$PENDING_DIR"
GUARD_KEY=$(echo "$PROJECT_DIR" | md5sum 2>/dev/null | cut -d' ' -f1 || echo "default")
LOCK_FILE="$PENDING_DIR/$GUARD_KEY.lock"

if [[ -f "$LOCK_FILE" ]]; then
  LOCK_AGE=$(( NOW - $(file_mtime "$LOCK_FILE") ))
  if (( LOCK_AGE < 5 )); then
    jq -n '{}'
    exit 0
  fi
fi
touch "$LOCK_FILE"

# ---------------------------------------------------------------------------
# 0) Git repository check
# ---------------------------------------------------------------------------
GIT_ROOT=""

if command -v git &>/dev/null; then
  GIT_ROOT=$(git -C "$PROJECT_DIR" rev-parse --show-toplevel 2>/dev/null) || true

  if [[ -z "$GIT_ROOT" ]]; then
    EARLY_CONTEXT_PARTS+=("[SESSION GUARD] ⚠️  This directory is NOT tracked by Git.")
    EARLY_CONTEXT_PARTS+=("")
    EARLY_CONTEXT_PARTS+=("Use AskUserQuestion to prompt:")
    EARLY_CONTEXT_PARTS+=("  Question: \"This directory isn't inside a Git repository. What would you like to do?\"")
    EARLY_CONTEXT_PARTS+=("  Type: single_select")
    EARLY_CONTEXT_PARTS+=("  Options:")
    EARLY_CONTEXT_PARTS+=("    1. \"Initialise Git\" — run \`git init\` and suggest creating .gitignore")
    EARLY_CONTEXT_PARTS+=("    2. \"Skip\" — continue without version control")
    EARLY_CONTEXT_PARTS+=("")

  elif [[ "$GIT_ROOT" != "$PROJECT_DIR" ]]; then
    DEPTH=0
    CHECK_DIR="$PROJECT_DIR"
    while [[ "$CHECK_DIR" != "$GIT_ROOT" && "$CHECK_DIR" != "/" ]]; do
      CHECK_DIR=$(dirname "$CHECK_DIR")
      DEPTH=$((DEPTH + 1))
    done

    MONOREPO_SIGNALS=()

    if [[ -f "$GIT_ROOT/package.json" ]] && command -v jq &>/dev/null; then
      jq -e '.workspaces // empty' "$GIT_ROOT/package.json" &>/dev/null && \
        MONOREPO_SIGNALS+=("package.json has 'workspaces' field")
    fi
    [[ -f "$GIT_ROOT/pnpm-workspace.yaml" ]] && MONOREPO_SIGNALS+=("pnpm-workspace.yaml exists")
    [[ -f "$GIT_ROOT/lerna.json" ]]          && MONOREPO_SIGNALS+=("lerna.json exists")
    [[ -f "$GIT_ROOT/nx.json" ]]             && MONOREPO_SIGNALS+=("nx.json exists")
    [[ -f "$GIT_ROOT/turbo.json" ]]          && MONOREPO_SIGNALS+=("turbo.json exists")
    [[ -f "$GIT_ROOT/rush.json" ]]           && MONOREPO_SIGNALS+=("rush.json exists")

    for d in packages apps services libs modules projects; do
      [[ -d "$GIT_ROOT/$d" ]] && MONOREPO_SIGNALS+=("'$d/' directory exists at git root")
    done

    PKG_COUNT=$(find "$GIT_ROOT" -maxdepth 3 -name "package.json" -not -path "*/node_modules/*" 2>/dev/null | wc -l | tr -d ' ')
    (( PKG_COUNT > 2 )) && MONOREPO_SIGNALS+=("${PKG_COUNT} package.json files found")

    CLAUDE_MD_COUNT=$(find "$GIT_ROOT" -maxdepth 3 -name "CLAUDE.md" 2>/dev/null | wc -l | tr -d ' ')
    (( CLAUDE_MD_COUNT > 1 )) && MONOREPO_SIGNALS+=("${CLAUDE_MD_COUNT} CLAUDE.md files found (per-package setup)")

    RELATIVE_PATH="${PROJECT_DIR#"$GIT_ROOT/"}"

    if (( ${#MONOREPO_SIGNALS[@]} >= 2 )); then
      EARLY_CONTEXT_PARTS+=("[SESSION GUARD] ℹ️  Git root is ${DEPTH} level(s) above CWD.")
      EARLY_CONTEXT_PARTS+=("  Git root:    $GIT_ROOT")
      EARLY_CONTEXT_PARTS+=("  Working dir: $PROJECT_DIR")
      EARLY_CONTEXT_PARTS+=("  Monorepo signals: ${MONOREPO_SIGNALS[*]}")
      EARLY_CONTEXT_PARTS+=("")
      EARLY_CONTEXT_PARTS+=("Use AskUserQuestion (low priority, don't block):")
      EARLY_CONTEXT_PARTS+=("  Question: \"Git root is at \`$GIT_ROOT\` (monorepo). Working in \`${RELATIVE_PATH}\`. Correct context?\"")
      EARLY_CONTEXT_PARTS+=("  Type: single_select")
      EARLY_CONTEXT_PARTS+=("  Options:")
      EARLY_CONTEXT_PARTS+=("    1. \"Yes, correct package\"")
      EARLY_CONTEXT_PARTS+=("    2. \"No, switch to repo root\"")
      EARLY_CONTEXT_PARTS+=("")

    else
      GIT_ROOT_FILE_COUNT=$(find "$GIT_ROOT" -maxdepth 1 -not -name '.*' 2>/dev/null | wc -l | tr -d ' ')

      EARLY_CONTEXT_PARTS+=("[SESSION GUARD] ⚠️  Git root is ${DEPTH} level(s) above CWD — does NOT look like a monorepo.")
      EARLY_CONTEXT_PARTS+=("  Git root:    $GIT_ROOT (${GIT_ROOT_FILE_COUNT} files)")
      EARLY_CONTEXT_PARTS+=("  Working dir: $PROJECT_DIR")
      if (( ${#MONOREPO_SIGNALS[@]} > 0 )); then
        EARLY_CONTEXT_PARTS+=("  Weak signals: ${MONOREPO_SIGNALS[*]}")
      fi
      EARLY_CONTEXT_PARTS+=("")
      EARLY_CONTEXT_PARTS+=("Use AskUserQuestion to resolve:")
      EARLY_CONTEXT_PARTS+=("  Question: \"Git root is at \`$GIT_ROOT\` (${DEPTH} levels up), which doesn't look like a monorepo. May have been created accidentally.\"")
      EARLY_CONTEXT_PARTS+=("  Type: single_select")
      EARLY_CONTEXT_PARTS+=("  Options:")
      EARLY_CONTEXT_PARTS+=("    1. \"It's correct\" — continue normally")
      EARLY_CONTEXT_PARTS+=("    2. \"Initialise here instead\" — run \`git init\` here (warn ancestor .git still exists)")
      EARLY_CONTEXT_PARTS+=("    3. \"Investigate\" — list git root contents and recent commits")
      EARLY_CONTEXT_PARTS+=("")
    fi
  fi
fi

# ---------------------------------------------------------------------------
# 1) CLAUDE.md existence check
# ---------------------------------------------------------------------------
if [[ ! -f "$CLAUDE_MD" ]]; then
  EARLY_CONTEXT_PARTS+=("[SESSION GUARD] ⚠️  No CLAUDE.md found in project root.")
  EARLY_CONTEXT_PARTS+=("")
  EARLY_CONTEXT_PARTS+=("Use AskUserQuestion to prompt:")
  EARLY_CONTEXT_PARTS+=("  Question: \"No CLAUDE.md found. Want me to set up this project for Claude Code?\"")
  EARLY_CONTEXT_PARTS+=("  Type: single_select")
  EARLY_CONTEXT_PARTS+=("  Options:")
  EARLY_CONTEXT_PARTS+=("    1. \"Initialise\" — run \`/init\` to scaffold CLAUDE.md")
  EARLY_CONTEXT_PARTS+=("    2. \"Skip\" — continue without one")
  EARLY_CONTEXT_PARTS+=("")

  # Emit and write pending flag, then exit early
  CONTEXT=$(printf '%s\n' "${EARLY_CONTEXT_PARTS[@]}")
  jq -n --arg ctx "$CONTEXT" '{
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: $ctx
    }
  }'
  PENDING_FILE="$PENDING_DIR/$GUARD_KEY.pending"
  echo "$CONTEXT" > "$PENDING_FILE"
  exit 0
fi

# ---------------------------------------------------------------------------
# 2) Task List ID check
# ---------------------------------------------------------------------------
TASK_LIST_CONFIGURED=false
SETTINGS_FILE="$PROJECT_DIR/.claude/settings.json"

[[ -n "${CLAUDE_CODE_TASK_LIST_ID:-}" ]] && TASK_LIST_CONFIGURED=true

if [[ "$TASK_LIST_CONFIGURED" == false ]] && command -v jq &>/dev/null; then
  for CFG_FILE in "$SETTINGS_FILE" "$HOME/.claude/settings.json"; do
    if [[ -f "$CFG_FILE" ]]; then
      TASK_ID=$(jq -r '.env.CLAUDE_CODE_TASK_LIST_ID // empty' "$CFG_FILE" 2>/dev/null) || true
      if [[ -n "$TASK_ID" ]]; then
        TASK_LIST_CONFIGURED=true
        break
      fi
    fi
  done
fi

if [[ "$TASK_LIST_CONFIGURED" == false && -n "$GIT_ROOT" ]]; then
  COMMIT_COUNT=$(git -C "$PROJECT_DIR" rev-list --count HEAD 2>/dev/null) || COMMIT_COUNT=0
  FILE_COUNT=$(git -C "$PROJECT_DIR" ls-files 2>/dev/null | wc -l | tr -d ' ') || FILE_COUNT=0

  if (( COMMIT_COUNT > 20 || FILE_COUNT > 30 )); then
    REPO_NAME=$(basename "$GIT_ROOT")
    EARLY_CONTEXT_PARTS+=("[SESSION GUARD] ℹ️  No persistent Task List ID configured.")
    EARLY_CONTEXT_PARTS+=("  Project: ${COMMIT_COUNT} commits, ${FILE_COUNT} tracked files.")
    EARLY_CONTEXT_PARTS+=("")
    EARLY_CONTEXT_PARTS+=("Use AskUserQuestion (low priority, don't block):")
    EARLY_CONTEXT_PARTS+=("  Question: \"No persistent Task List ID configured. For a project this size, tasks won't survive across sessions. Add one?\"")
    EARLY_CONTEXT_PARTS+=("  Type: single_select")
    EARLY_CONTEXT_PARTS+=("  Options:")
    EARLY_CONTEXT_PARTS+=("    1. \"Yes\" — add {\"env\": {\"CLAUDE_CODE_TASK_LIST_ID\": \"${REPO_NAME}\"}} to .claude/settings.json")
    EARLY_CONTEXT_PARTS+=("    2. \"Skip\" — continue without persistent tasks")
    EARLY_CONTEXT_PARTS+=("")
  fi
fi

# ---------------------------------------------------------------------------
# 3) Staleness evaluation
# ---------------------------------------------------------------------------
CLAUDE_MD_MTIME=$(file_mtime "$CLAUDE_MD")
CLAUDE_MD_AGE_DAYS=$(( (NOW - CLAUDE_MD_MTIME) / 86400 ))

# --- Age-based --------------------------------------------------------------
if (( CLAUDE_MD_AGE_DAYS > 14 )); then
  add_staleness "CLAUDE.md last modified ${CLAUDE_MD_AGE_DAYS} days ago" 2
elif (( CLAUDE_MD_AGE_DAYS > 7 )); then
  add_staleness "CLAUDE.md last modified ${CLAUDE_MD_AGE_DAYS} days ago" 1
fi

# --- Directory structure drift ----------------------------------------------
if command -v tree &>/dev/null; then
  CURRENT_TREE=$(tree -L 2 -d -I 'node_modules|.git|__pycache__|.venv|venv|dist|build|.next|.nuxt|coverage|.claude' --noreport "$PROJECT_DIR" 2>/dev/null) || true
  if [[ -n "$CURRENT_TREE" ]]; then
    TREE_DIRS=$(echo "$CURRENT_TREE" | tail -n +2 \
      | sed 's/[│├└─┬┤┼┐┘┌┏┗┓┛]//g; s/[|`]//g; s/--*//g' \
      | sed 's/^[[:space:]]*//' | { grep -v '^$' || true; } | sort -u)
    MISSING_DIRS=()
    while IFS= read -r dir; do
      [[ -z "$dir" ]] && continue
      grep -qi "$dir" "$CLAUDE_MD" 2>/dev/null || MISSING_DIRS+=("$dir")
    done <<< "$TREE_DIRS"
    if (( ${#MISSING_DIRS[@]} > 2 )); then
      add_staleness "Directories not in CLAUDE.md: ${MISSING_DIRS[*]}" 2
    elif (( ${#MISSING_DIRS[@]} > 0 )); then
      add_staleness "Directories not in CLAUDE.md: ${MISSING_DIRS[*]}" 1
    fi
  fi
fi

# --- package.json drift -----------------------------------------------------
if [[ -f "$PROJECT_DIR/package.json" ]]; then
  PKG_MTIME=$(file_mtime "$PROJECT_DIR/package.json")

  if (( PKG_MTIME > CLAUDE_MD_MTIME )); then
    PKG_DELTA=$(( (PKG_MTIME - CLAUDE_MD_MTIME) / 86400 ))
    add_staleness "package.json modified ${PKG_DELTA} day(s) after CLAUDE.md" 1
  fi

  if command -v jq &>/dev/null; then
    DEP_COUNT=$(jq '[(.dependencies // {} | length), (.devDependencies // {} | length)] | add' "$PROJECT_DIR/package.json" 2>/dev/null) || DEP_COUNT="0"
    DOCUMENTED_COUNT=$(grep -oiP '\d+\s*(dependencies|deps)' "$CLAUDE_MD" 2>/dev/null | head -1 | grep -oP '\d+') || true
    if [[ -n "$DOCUMENTED_COUNT" && -n "$DEP_COUNT" ]]; then
      DRIFT=$(( DEP_COUNT - DOCUMENTED_COUNT ))
      DRIFT_ABS=${DRIFT#-}
      if (( DRIFT_ABS > 5 )); then
        add_staleness "Dep count drift: CLAUDE.md ~${DOCUMENTED_COUNT}, actual ${DEP_COUNT} (Δ${DRIFT})" 2
      elif (( DRIFT_ABS > 0 )); then
        add_staleness "Dep count drift: CLAUDE.md ~${DOCUMENTED_COUNT}, actual ${DEP_COUNT}" 1
      fi
    fi

    KEY_DEPS=$(jq -r '(.dependencies // {}) | keys[]' "$PROJECT_DIR/package.json" 2>/dev/null) || true
    UNDOCUMENTED=()
    while IFS= read -r dep; do
      [[ -z "$dep" ]] && continue
      grep -qi "$dep" "$CLAUDE_MD" 2>/dev/null || UNDOCUMENTED+=("$dep")
    done <<< "$KEY_DEPS"
    if (( ${#UNDOCUMENTED[@]} > 5 )); then
      add_staleness "${#UNDOCUMENTED[@]} production deps not in CLAUDE.md (e.g. ${UNDOCUMENTED[*]:0:5})" 2
    fi
  fi
fi

# --- Python dependency drift ------------------------------------------------
for PYFILE in "$PROJECT_DIR/pyproject.toml" "$PROJECT_DIR/requirements.txt" "$PROJECT_DIR/setup.py"; do
  if [[ -f "$PYFILE" ]]; then
    PY_MTIME=$(file_mtime "$PYFILE")
    (( PY_MTIME > CLAUDE_MD_MTIME )) && add_staleness "$(basename "$PYFILE") modified after CLAUDE.md" 1
  fi
done

# --- Key config files -------------------------------------------------------
for CFG in "$PROJECT_DIR/tsconfig.json" \
           "$PROJECT_DIR/.env.example" \
           "$PROJECT_DIR/docker-compose.yml" \
           "$PROJECT_DIR/Dockerfile" \
           "$PROJECT_DIR/Makefile" \
           "$PROJECT_DIR/Cargo.toml" \
           "$PROJECT_DIR/go.mod"; do
  if [[ -f "$CFG" ]]; then
    CFG_MTIME=$(file_mtime "$CFG")
    (( CFG_MTIME > CLAUDE_MD_MTIME )) && add_staleness "$(basename "$CFG") modified after CLAUDE.md" 1
  fi
done

# --- Git-based checks -------------------------------------------------------
if command -v git &>/dev/null && [[ -n "$GIT_ROOT" ]]; then
  CLAUDE_MD_DATE=$(date -d "@$CLAUDE_MD_MTIME" --iso-8601=seconds 2>/dev/null) \
    || CLAUDE_MD_DATE=$(date -r "$CLAUDE_MD_MTIME" +%Y-%m-%dT%H:%M:%S 2>/dev/null) \
    || CLAUDE_MD_DATE=""

  if [[ -n "$CLAUDE_MD_DATE" ]]; then
    COMMITS_SINCE=$(git -C "$PROJECT_DIR" rev-list --count --since="$CLAUDE_MD_DATE" HEAD 2>/dev/null) || COMMITS_SINCE="0"
    if (( COMMITS_SINCE > 50 )); then
      add_staleness "${COMMITS_SINCE} commits since CLAUDE.md updated" 2
    elif (( COMMITS_SINCE > 20 )); then
      add_staleness "${COMMITS_SINCE} commits since CLAUDE.md updated" 1
    fi

    CHANGED_FILES=$(git -C "$PROJECT_DIR" diff --name-only --diff-filter=AD HEAD~20..HEAD 2>/dev/null | head -20) || true
    NEW_TOP_LEVEL=$(echo "$CHANGED_FILES" | { grep -v '/' || true; } | { grep -v '^\.' || true; } | sort -u)
    if [[ -n "$NEW_TOP_LEVEL" ]]; then
      NEW_COUNT=$(echo "$NEW_TOP_LEVEL" | wc -l | tr -d ' ')
      (( NEW_COUNT > 3 )) && add_staleness "${NEW_COUNT} top-level files added/removed recently" 1
    fi
  fi
fi

# --- Lock file drift --------------------------------------------------------
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
      break
    fi
  fi
done

# ---------------------------------------------------------------------------
# 4) Produce output
# ---------------------------------------------------------------------------
OUTPUT_PARTS=()

# --- Welcome banner ---------------------------------------------------------
SKILL_COUNT=$(find "$PROJECT_DIR/skills" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l | tr -d ' ') || SKILL_COUNT=0
if (( SKILL_COUNT > 0 )); then
  OUTPUT_PARTS+=("[MAD SKILLS] Active — ${SKILL_COUNT} skills loaded")
fi

for part in "${EARLY_CONTEXT_PARTS[@]+"${EARLY_CONTEXT_PARTS[@]}"}"; do
  OUTPUT_PARTS+=("$part")
done

OUTPUT_PARTS+=("[SESSION GUARD] ✅ CLAUDE.md found in: $PROJECT_DIR")

if (( STALENESS_SCORE >= STALENESS_THRESHOLD )); then
  OUTPUT_PARTS+=("")
  OUTPUT_PARTS+=("[SESSION GUARD] ⚠️  CLAUDE.md appears STALE (score: ${STALENESS_SCORE}/${STALENESS_THRESHOLD})")
  OUTPUT_PARTS+=("")
  OUTPUT_PARTS+=("Signals:")
  for sig in "${STALENESS_SIGNALS[@]}"; do
    OUTPUT_PARTS+=("  $sig")
  done
  OUTPUT_PARTS+=("")
  OUTPUT_PARTS+=("Use AskUserQuestion to prompt:")
  OUTPUT_PARTS+=("  Question: \"CLAUDE.md appears out of date (${#STALENESS_SIGNALS[@]} signals detected). What would you like to do?\"")
  OUTPUT_PARTS+=("  Type: single_select")
  OUTPUT_PARTS+=("  Options:")
  OUTPUT_PARTS+=("    1. \"Update it\" — review project structure, deps, recent changes and update CLAUDE.md (preserve user-written notes)")
  OUTPUT_PARTS+=("    2. \"Show signals\" — list what's drifted before deciding")
  OUTPUT_PARTS+=("    3. \"Skip\" — continue with current CLAUDE.md")
  OUTPUT_PARTS+=("")
elif (( ${#STALENESS_SIGNALS[@]} > 0 )); then
  OUTPUT_PARTS+=("")
  OUTPUT_PARTS+=("[SESSION GUARD] ℹ️  Minor drift (score: ${STALENESS_SCORE}/${STALENESS_THRESHOLD}) — not flagging:")
  for sig in "${STALENESS_SIGNALS[@]}"; do
    OUTPUT_PARTS+=("  $sig")
  done
fi

CONTEXT=$(printf '%s\n' "${OUTPUT_PARTS[@]}")

jq -n --arg ctx "$CONTEXT" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: $ctx
  }
}'

# ---------------------------------------------------------------------------
# 5) Write pending flag for UserPromptSubmit companion hook
# ---------------------------------------------------------------------------
PENDING_FILE="$PENDING_DIR/$GUARD_KEY.pending"
echo "$CONTEXT" > "$PENDING_FILE"

exit 0
