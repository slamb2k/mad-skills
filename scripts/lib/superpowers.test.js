import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { detectSuperpowers } from "./superpowers.js";

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "sp-"));
}

function writeAnchor(dir, rel) {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "# anchor\n");
}

test("installed: anchor under plugins cache", () => {
  const tmp = mkTmp();
  try {
    writeAnchor(
      tmp,
      ".claude/plugins/somepkg/superpowers/skills/using-superpowers/SKILL.md",
    );
    const result = detectSuperpowers({ homedir: tmp, cwd: tmp });
    assert.equal(result.installed, true);
    assert.ok(result.basePath);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("not installed: empty tree", () => {
  const tmp = mkTmp();
  try {
    const result = detectSuperpowers({ homedir: tmp, cwd: tmp });
    assert.equal(result.installed, false);
    assert.equal(result.basePath, null);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("partial install: anchor missing → not installed", () => {
  const tmp = mkTmp();
  try {
    writeAnchor(
      tmp,
      ".claude/plugins/somepkg/superpowers/skills/writing-plans/SKILL.md",
    );
    const result = detectSuperpowers({ homedir: tmp, cwd: tmp });
    assert.equal(result.installed, false);
    assert.equal(result.basePath, null);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("project-local: anchor under cwd .claude/skills", () => {
  const tmp = mkTmp();
  try {
    writeAnchor(
      tmp,
      ".claude/skills/superpowers-foo/using-superpowers/SKILL.md",
    );
    const result = detectSuperpowers({
      homedir: path.join(tmp, "nohome"),
      cwd: tmp,
    });
    assert.equal(result.installed, true);
    assert.ok(result.basePath);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
