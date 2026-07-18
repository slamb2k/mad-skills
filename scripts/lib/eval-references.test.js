import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { extractReferencePaths, loadReferencedFiles } from "./eval-references.js";

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eval-refs-"));
}

test("extractReferencePaths finds and dedupes references/*.md mentions", () => {
  const content = `
See references/location-check.md for detection logic.
Also references/location-check.md again, plus references/pre-stage.md.
Not a match: references/notes.txt
`;
  assert.deepEqual(extractReferencePaths(content), [
    "references/location-check.md",
    "references/pre-stage.md",
  ]);
});

test("extractReferencePaths returns empty array when no references appear", () => {
  assert.deepEqual(extractReferencePaths("no references here"), []);
});

test("loadReferencedFiles prefers a skill-local reference over a repo-root one", async () => {
  const tmp = mkTmp();
  try {
    const skillDir = path.join(tmp, "skills", "build");
    fs.mkdirSync(path.join(skillDir, "references"), { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "references", "pre-stage.md"),
      "local pre-stage content",
    );

    const result = await loadReferencedFiles(
      skillDir,
      tmp,
      "See references/pre-stage.md for details.",
    );
    assert.match(result, /local pre-stage content/);
    assert.match(result, /<reference path="references\/pre-stage\.md">/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("loadReferencedFiles falls back to a repo-root shared reference", async () => {
  const tmp = mkTmp();
  try {
    const skillDir = path.join(tmp, "skills", "speccy");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.mkdirSync(path.join(tmp, "references"), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, "references", "location-check.md"),
      "shared location-check content",
    );

    const result = await loadReferencedFiles(
      skillDir,
      tmp,
      "See references/location-check.md for details.",
    );
    assert.match(result, /shared location-check content/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("loadReferencedFiles skips a reference that doesn't exist anywhere", async () => {
  const tmp = mkTmp();
  try {
    const skillDir = path.join(tmp, "skills", "ship");
    fs.mkdirSync(skillDir, { recursive: true });

    const result = await loadReferencedFiles(
      skillDir,
      tmp,
      "See references/missing.md for details.",
    );
    assert.equal(result, "");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
