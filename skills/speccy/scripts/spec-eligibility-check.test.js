import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCRIPT = new URL("./spec-eligibility-check.sh", import.meta.url).pathname;

function run(ticketBody, fileCount, symbolCount) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "eligibility-check-"));
  const ticketPath = path.join(tmp, "ticket.md");
  fs.writeFileSync(ticketPath, ticketBody);
  try {
    return execFileSync(SCRIPT, [ticketPath, String(fileCount), String(symbolCount)], {
      encoding: "utf-8",
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const CLEAR_TICKET = "Add a --dry-run flag to the ship script.";
const HEDGE_TICKET = "Maybe explore options for a --dry-run flag, not sure yet.";
const NO_VERB_TICKET = "A --dry-run flag would be nice for the ship script.";

test("pass case: clear ticket, in-scope file count, symbol match reports no failures", () => {
  const out = run(CLEAR_TICKET, 3, 1);
  assert.match(out, /✅ scope \(≤3 matched files, found 3\)/);
  assert.match(out, /✅ verb_present/);
  assert.match(out, /✅ no_hedge_language/);
  assert.match(out, /✅ symbol_match \(found 1\)/);
  assert.doesNotMatch(out, /❌/);
});

test("scope boundary: 3 files passes, 4 files fails", () => {
  const pass = run(CLEAR_TICKET, 3, 1);
  assert.match(pass, /✅ scope \(≤3 matched files, found 3\)/);

  const fail = run(CLEAR_TICKET, 4, 1);
  assert.match(fail, /❌ scope \(≤3 matched files, found 4\) — failed/);
});

test("verb check: missing allowed action verb is flagged", () => {
  const out = run(NO_VERB_TICKET, 1, 1);
  assert.match(out, /❌ verb_present — failed/);
});

test("hedge check: hedge language is flagged", () => {
  const out = run(HEDGE_TICKET, 1, 1);
  assert.match(out, /❌ no_hedge_language — failed/);
});

test("symbol match: zero matches is flagged", () => {
  const out = run(CLEAR_TICKET, 1, 0);
  assert.match(out, /❌ symbol_match \(found 0\) — failed/);
});

test("script always exits 0 (advisory only)", () => {
  // execFileSync above would have thrown on nonzero exit; this documents the
  // contract explicitly for the missing-ticket-file case too.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "eligibility-check-"));
  try {
    const out = execFileSync(SCRIPT, [path.join(tmp, "nope.md"), "1", "1"], {
      encoding: "utf-8",
    });
    assert.match(out, /ticket file not found/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("verb check: inflected allowed verbs pass", () => {
  for (const t of ["Adds a --dry-run flag.", "Fixed the ship banner.", "Removing the legacy sentinel.", "Updates sync docs."]) {
    assert.match(run(t, 1, 1), /✅ verb_present/, t);
  }
});

test("verb check: heading, list, ticket-key and Please prefixes are ignored", () => {
  for (const t of ["# Fix the ship banner", "- Add a flag", "MAD-42: Rename the helper", "Please document the flag."]) {
    assert.match(run(t, 1, 1), /✅ verb_present/, t);
  }
});

test("verb check: a verb far below the opening does not count", () => {
  const out = run("Context about the ship script.\nIt is slow.\nUsers complain.\nWe could add caching.\nAdd caching.", 1, 1);
  assert.match(out, /❌ verb_present — failed/);
});

test("verb check: disallowed verbs still fail", () => {
  assert.match(run("Refactor the ship script.", 1, 1), /❌ verb_present — failed/);
});

test("hedge check: hedge words inside code spans or other words are not hedging", () => {
  assert.match(run("Remove the `maybe()` helper from sync.", 1, 1), /✅ no_hedge_language/);
  assert.match(run("Rename maybeSync to syncIfDirty.", 1, 1), /✅ no_hedge_language/);
});
