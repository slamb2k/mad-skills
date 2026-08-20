import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCRIPT = new URL("./spec-completeness-check.sh", import.meta.url).pathname;

function run(specBody) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "spec-check-"));
  const specPath = path.join(tmp, "spec.md");
  fs.writeFileSync(specPath, specBody);
  try {
    return execFileSync(SCRIPT, [specPath], { encoding: "utf-8" });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const COMPLETE_SPEC = `---
title: Example
autonomy_ready: true
---

## Definition of Done
- [ ] thing works

## Roadmap
next steps here

## Risks
some risk
`;

// Real specs in this repo (e.g. specs/pr-first-autonomous-build.md) write these
// sections as level-1 headings; a level-2-only match reported them missing.
const LEVEL_ONE_SPEC = `---
title: Example
autonomy_ready: true
---

# Definition of Done
- [ ] thing works

# Assumption Authorization
delegated to /build

# Roadmap
next steps here

# Risks
some risk
`;

const MISSING_DOD_SPEC = `---
title: Example
autonomy_ready: true
---

## Roadmap
next steps here

## Risks
some risk
`;

test("pass case: spec with all required sections reports no missing items", () => {
  const out = run(COMPLETE_SPEC);
  assert.match(out, /✅ autonomy_ready frontmatter field/);
  assert.match(out, /✅ Definition of Done heading/);
  assert.match(out, /✅ Definition of Done checklist item/);
  assert.doesNotMatch(out, /❌/);
});

test("pass case: level-1 headings are detected too", () => {
  const out = run(LEVEL_ONE_SPEC);
  assert.match(out, /✅ Definition of Done heading/);
  assert.match(out, /✅ Roadmap \/ what's-next context/);
  assert.match(out, /✅ Risks \/ rationale content/);
  assert.match(out, /✅ Assumption Authorization heading/);
  assert.doesNotMatch(out, /❌/);
});

test("fail case: spec missing Definition of Done is flagged", () => {
  const out = run(MISSING_DOD_SPEC);
  assert.match(out, /❌ Definition of Done heading — missing/);
  assert.match(out, /❌ Definition of Done checklist item — missing/);
});

test("script always exits 0 (advisory only)", () => {
  // execFileSync above would have thrown on nonzero exit; this documents the
  // contract explicitly for the missing-spec-file case too.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "spec-check-"));
  try {
    const out = execFileSync(SCRIPT, [path.join(tmp, "nope.md")], {
      encoding: "utf-8",
    });
    assert.match(out, /spec not found/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
