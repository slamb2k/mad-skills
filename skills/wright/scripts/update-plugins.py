#!/usr/bin/env python3
"""Update Claude Code plugins by orchestrating the `claude plugin` CLI.

The CLI already does the real work — refreshing marketplace sources (including
the GCS-backed official marketplace, so superpowers et al. are covered),
resolving versions, populating the cache. This wrapper adds only what the CLI
lacks: update-all-at-once, and update-one-by-fuzzy-name.

  claude plugin marketplace update [name]   refresh sources (all, or one)
  claude plugin update <plugin>             update a plugin (restart to apply)
  claude plugin list                        installed plugins + versions

No dry-run exists in the CLI, so a preview can't predict the new version — it
only resolves the targets. Default runs the updates and reports before -> after
by diffing `plugin list`; --dry-run resolves targets and prints what would run,
without touching anything.
"""
from __future__ import annotations

import argparse
import difflib
import re
import subprocess
import sys

RESULT_MARKER = "WRIGHT_RESULT"


def claude(*args: str) -> tuple[int, str]:
    p = subprocess.run(["claude", "plugin", *args], capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr


def installed() -> dict[str, str]:
    """Map plugin@marketplace id -> version, from `claude plugin list`."""
    rc, out = claude("list")
    if rc != 0:
        print(out, file=sys.stderr)
        raise SystemExit(1)
    ids: dict[str, str] = {}
    current: str | None = None
    for line in out.splitlines():
        m = re.search(r"❯\s*(\S+)", line)
        if m:
            current = m.group(1)
            continue
        v = re.search(r"Version:\s*(\S+)", line)
        if v and current:
            ids[current] = v.group(1)
            current = None
    return ids


def pick(ids: list[str], query: str) -> str | None:
    """Match a query to one plugin id: exact base, then unique/closest substring.

    No catch-all fuzzy fallback across the whole install list — that tier
    matched clearly-unrelated queries (e.g. "nonexistent-xyz" -> "context7")
    often enough to be worse than just saying "no match" and letting the
    caller (the LLM driving this skill) reason about the full plugin list
    with actual context, instead of a bare string-distance guess.
    """
    bases = {i.split("@", 1)[0]: i for i in ids}
    q = query.lower()
    for base, full in bases.items():
        if base.lower() == q:
            return full
    subs = [full for base, full in bases.items() if q in base.lower()]
    if len(subs) == 1:
        return subs[0]
    if subs:  # ambiguous substring — narrow by closeness among genuine candidates only
        close = difflib.get_close_matches(q, [s.split("@")[0] for s in subs], n=1, cutoff=0)
        return next((s for s in subs if s.split("@")[0] == close[0]), subs[0]) if close else subs[0]
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description="Update Claude Code plugins via the CLI.")
    ap.add_argument("query", nargs="?", help="fuzzy plugin name; omit to target all")
    ap.add_argument("--dry-run", action="store_true", help="resolve targets and print what would run, without executing")
    args = ap.parse_args()

    before = installed()
    if not before:
        print("no installed plugins found", file=sys.stderr)
        return 1

    if args.query:
        target = pick(list(before), args.query)
        if not target:
            names = ", ".join(sorted(b.split("@")[0] for b in before))
            print(f"no installed plugin matches '{args.query}' — installed: {names}", file=sys.stderr)
            return 1
        targets = [target]
        marketplaces = [target.split("@", 1)[1]]
    else:
        targets = sorted(before)
        marketplaces = []  # empty => refresh every marketplace in one call

    if args.dry_run:
        print(f"Would refresh {'marketplace ' + marketplaces[0] if marketplaces else 'all marketplaces'} "
              f"and update {len(targets)} plugin(s):")
        for t in targets:
            print(f"  {t.split('@')[0]:<22} {before[t]}  → (latest)")
        print("\nRun without --dry-run to execute. A restart applies updated plugins.")
        print(f"{RESULT_MARKER} applied=false targets={len(targets)}")
        return 0

    # Refresh sources first so "latest" is actually latest.
    print("Refreshing marketplace sources…")
    rc, out = claude("marketplace", "update", *marketplaces)
    if rc != 0:
        print(out, file=sys.stderr)
        print("marketplace refresh failed — not updating plugins", file=sys.stderr)
        return 1

    for t in targets:
        rc, out = claude("update", t)
        tail = out.strip().splitlines()[-1] if out.strip() else ""
        print(f"  {t.split('@')[0]:<22} {tail[:80]}")

    after = installed()
    changed = [(t, before[t], after.get(t, "?")) for t in targets if before.get(t) != after.get(t)]

    print(f"\n{'PLUGIN':<24}{'BEFORE':<14}AFTER")
    print("-" * 52)
    for t in targets:
        b, a = before[t], after.get(t, "?")
        mark = "↑" if b != a else "="
        print(f"{t.split('@')[0]:<24}{b:<14}{mark} {a}")
    print(f"\n{len(changed)} updated. Restart to apply."
          if changed else "\nAll already current. Nothing to restart.")
    print(f"{RESULT_MARKER} applied=true updated={len(changed)} "
          f"names={','.join(sorted(t.split('@')[0] for t, _, _ in changed))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
