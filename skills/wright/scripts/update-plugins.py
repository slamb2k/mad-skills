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

One bad marketplace never blocks the rest: if the bulk refresh fails, each
needed marketplace is refreshed on its own, plugins from a marketplace that
still fails are skipped, a failed plugin update is recorded and the run goes
on, and the report lists every failure with its reason. Exit code is 0 when
everything succeeded, 2 when the run was partial.
"""
from __future__ import annotations

import argparse
import difflib
import re
import subprocess
import sys

RESULT_MARKER = "WRIGHT_RESULT"
PARTIAL = 2


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


def last_line(out: str) -> str:
    lines = [l.strip() for l in out.strip().splitlines() if l.strip()]
    return lines[-1] if lines else ""


def reason(out: str) -> str:
    """The most informative error line from CLI output (git's 'fatal:' wins)."""
    lines = [l.strip() for l in out.strip().splitlines() if l.strip()]
    for l in lines:
        if l.lower().startswith(("fatal:", "error:")):
            return l
    return lines[-1] if lines else "unknown error"


def refresh(marketplaces: list[str]) -> dict[str, str]:
    """Refresh marketplace sources; return {marketplace: error} for failures.

    Tries one bulk call first; if that fails, refreshes each needed marketplace
    on its own so a single unreachable source only affects its own plugins.
    """
    rc, _ = claude("marketplace", "update", *(marketplaces if len(marketplaces) == 1 else []))
    if rc == 0:
        return {}
    failed: dict[str, str] = {}
    for m in marketplaces:
        rc, out = claude("marketplace", "update", m)
        if rc != 0:
            failed[m] = reason(out)
    return failed


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
    else:
        targets = sorted(before)
    marketplaces = sorted({t.split("@", 1)[1] for t in targets})

    if args.dry_run:
        print(f"Would refresh {'marketplace ' + marketplaces[0] if args.query else 'all marketplaces'} "
              f"and update {len(targets)} plugin(s):")
        for t in targets:
            print(f"  {t.split('@')[0]:<22} {before[t]}  → (latest)")
        print("\nRun without --dry-run to execute. A restart applies updated plugins.")
        print(f"{RESULT_MARKER} applied=false targets={len(targets)}")
        return 0

    # Refresh sources first so "latest" is actually latest.
    print("Refreshing marketplace sources…")
    mp_failed = refresh(marketplaces)
    for m, why in mp_failed.items():
        print(f"  ✗ marketplace {m}: {why}")

    skipped: dict[str, str] = {}
    failed: dict[str, str] = {}
    for t in targets:
        base, mp = t.split("@", 1)
        if mp in mp_failed:
            skipped[t] = f"marketplace {mp} could not be refreshed"
            print(f"  {base:<22} skipped — {skipped[t]}")
            continue
        rc, out = claude("update", t)
        if rc != 0:
            failed[t] = reason(out)
            print(f"  {base:<22} FAILED — {failed[t][:80]}")
        else:
            print(f"  {base:<22} {last_line(out)[:80]}")

    after = installed()
    changed = [t for t in targets if t not in skipped and t not in failed and before.get(t) != after.get(t)]

    w = max([24, *(len(t.split("@")[0]) + 2 for t in targets)])
    print(f"\n{'PLUGIN':<{w}}{'BEFORE':<14}{'AFTER':<14}STATUS")
    print("-" * (w + 42))
    for t in targets:
        b, a = before[t], after.get(t, "?")
        if t in skipped:
            status = "⏭ skipped"
        elif t in failed:
            status = "✗ failed"
        elif t in changed:
            status = "↑ updated"
        else:
            status = "= current"
        print(f"{t.split('@')[0]:<{w}}{b:<14}{a:<14}{status}")

    problems = {**skipped, **failed}
    if problems:
        print(f"\n{len(problems)} not updated:")
        for t, why in problems.items():
            print(f"  {t.split('@')[0]}: {why}")
        for m in mp_failed:
            print(f"  hint: retry with `claude plugin marketplace update {m}`; if git cannot reach the "
                  f"remote, `git -C ~/.claude/plugins/marketplaces/{m} pull --ff-only` then re-run")
    if changed:
        print(f"\n{len(changed)} updated. Restart to apply.")
    else:
        print("\nNothing updated. Nothing to restart." if problems
              else "\nAll already current. Nothing to restart.")
    names = lambda ts: ",".join(sorted(t.split("@")[0] for t in ts))
    print(f"{RESULT_MARKER} applied=true updated={len(changed)} names={names(changed)} "
          f"failed={len(problems)} failed_names={names(problems)} "
          f"marketplaces_failed={','.join(sorted(mp_failed))}")
    return PARTIAL if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
