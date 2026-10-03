#!/usr/bin/env bash
# ferry.sh — compatibility shim for the `ferry` skill.
#
# The unified session-handoff store (hooks/lib/handoff.cjs, driven by
# hooks/session-guard.cjs) now owns signalling, injection and cleanup. This
# script only keeps the old entrypoints working:
#
#   ferry.sh signal <abs_waybill_path> [cwd]
#       -> session-guard.cjs handoff-arm --kind waybill --waybill <path> --owned false --dir <cwd>
#       (owned false: a caller using this legacy entrypoint wrote the file
#       itself, so it is never auto-deleted.)
#
#   ferry.sh load
#       -> pipes the SessionStart event JSON on stdin to `session-guard.cjs handoff`.
#
# New code should call session-guard.cjs directly.
set -euo pipefail

GUARD="$(cd "$(dirname "$0")" && pwd)/../../../hooks/session-guard.cjs"

cmd="${1:-load}"

case "$cmd" in
  signal)
    waybill_path="${2:?usage: ferry.sh signal <abs_waybill_path> [cwd]}"
    cwd="${3:-$(pwd)}"
    exec node "$GUARD" handoff-arm --kind waybill --waybill "$waybill_path" --owned false --dir "$cwd"
    ;;

  load)
    exec node "$GUARD" handoff
    ;;

  *)
    printf 'ferry.sh: unknown command "%s" (expected: signal | load)\n' "$cmd" >&2
    exit 1
    ;;
esac
