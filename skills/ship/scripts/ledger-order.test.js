// Guards the /ship ledger timing contract (REQ-010/044): follow-ups must be
// captured before the commit stage so a commit exists to carry them, and the
// commit stage must stage the ledger files rather than leave them dirty.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const skill = readFileSync(new URL("../SKILL.md", import.meta.url), "utf8");
const prompts = readFileSync(new URL("../references/stage-prompts.md", import.meta.url), "utf8");

const heading = (re) => {
  const m = skill.match(re);
  assert.ok(m, `missing heading ${re}`);
  return m.index;
};

test("ledger capture stage comes after sync and before the commit stage", () => {
  const sync = heading(/^## Stage 1: Sync/m);
  const capture = heading(/^## Stage 1b: Follow-ups Ledger/m);
  const commit = heading(/^## Stage 2: Commit/m);
  assert.ok(sync < capture, "Stage 1b must follow Stage 1");
  assert.ok(capture < commit, "Stage 1b must precede Stage 2 so a commit carries the ledger");
});

test("the post-merge ledger section is only a net after the merge", () => {
  const merge = heading(/^## Stage 5: Merge/m);
  const net = heading(/^## Follow-ups Ledger — post-merge net/m);
  assert.ok(merge < net, "post-merge net must come after Stage 5");
});

test("capture runs preview before the real capture", () => {
  const section = skill.slice(heading(/^## Stage 1b:/m), heading(/^## Stage 2:/m));
  const preview = section.indexOf("logbook-capture-preview");
  const capture = section.search(/session-guard\.cjs" logbook-capture \\/);
  assert.ok(preview >= 0, "Stage 1b must call logbook-capture-preview");
  assert.ok(capture > preview, "real logbook-capture must follow the preview");
});

test("the commit stage prompt stages the ledger files in their own commit", () => {
  const stage2 = prompts.slice(prompts.indexOf("## Stage 2"), prompts.indexOf("## Stage 3"));
  assert.match(stage2, /LOGBOOK\.md/);
  assert.match(stage2, /LOGBOOK-ARCHIVE\.md/);
  assert.match(stage2, /docs\(logbook\)/);
  assert.match(stage2, /Never leave them uncommitted/);
});
