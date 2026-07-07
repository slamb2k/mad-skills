#!/usr/bin/env bash
# ferry.sh — companion to the `ferry` skill.
#
#   ferry.sh signal <abs_waybill_path> [cwd]
#       Drop a one-shot signal keyed to the current project (cwd) pointing at
#       the waybill document. The next session's SessionStart hook consumes it.
#
#   ferry.sh load
#       SessionStart hook entrypoint. Reads the event JSON on stdin; if a signal
#       exists for this cwd, emits the waybill as additionalContext and deletes
#       the signal (one-shot — a stale waybill.md is never re-injected).
#
# The signal is keyed on the working directory, NOT the session id, because the
# session id changes after /clear. cwd is stable across a clear, so the fresh
# session finds the signal its predecessor left.
set -euo pipefail

SIGNAL_DIR="/tmp/claude-ferry"

_key() {
  # Stable, dependency-free hash of a directory path. cksum is POSIX.
  printf '%s' "$1" | cksum | cut -d' ' -f1
}

cmd="${1:-load}"

case "$cmd" in
  signal)
    waybill_path="${2:?usage: ferry.sh signal <abs_waybill_path> [cwd]}"
    cwd="${3:-$(pwd)}"
    mkdir -p "$SIGNAL_DIR"
    key="$(_key "$cwd")"
    printf '%s\n' "$waybill_path" > "$SIGNAL_DIR/$key.signal"
    printf 'ferry: signal armed for %s -> %s\n' "$cwd" "$waybill_path"
    ;;

  load)
    input="$(cat)"

    if command -v jq >/dev/null 2>&1; then
      cwd="$(printf '%s' "$input" | jq -r '.cwd // empty')"
    else
      cwd="$(printf '%s' "$input" | sed -n 's/.*"cwd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
    fi
    [ -n "$cwd" ] || cwd="$(pwd)"

    key="$(_key "$cwd")"
    signal="$SIGNAL_DIR/$key.signal"
    [ -f "$signal" ] || exit 0          # no waybill pending — silent no-op

    waybill_path="$(head -n1 "$signal")"
    rm -f "$signal"                      # one-shot: consume the signal
    [ -f "$waybill_path" ] || exit 0    # document vanished — nothing to inject

    content="$(cat "$waybill_path")"
    preamble="The previous session left a waybill document at ${waybill_path} and signalled that this session should resume from it. Treat it as your primary context for continuing the work. Read any files it references before acting. This is one-shot: do not seek out or re-read waybill documents in future sessions unless signalled again."

    if command -v jq >/dev/null 2>&1; then
      jq -n --arg pre "$preamble" --arg body "$content" \
        '{hookSpecificOutput:{hookEventName:"SessionStart", additionalContext:($pre + "\n\n---\n\n" + $body)}}'
    else
      # Fallback: SessionStart adds raw stdout to context too.
      printf '%s\n\n---\n\n%s\n' "$preamble" "$content"
    fi
    ;;

  *)
    printf 'ferry.sh: unknown command "%s" (expected: signal | load)\n' "$cmd" >&2
    exit 1
    ;;
esac
