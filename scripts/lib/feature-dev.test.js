import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { detectFeatureDev } from "./feature-dev.js";

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fd-"));
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
      ".claude/plugins/cache/claude-plugins-official/feature-dev/unknown/commands/feature-dev.md",
    );
    const result = detectFeatureDev({ homedir: tmp, cwd: tmp });
    assert.equal(result.installed, true);
    assert.ok(result.basePath);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("not installed: empty tree", () => {
  const tmp = mkTmp();
  try {
    const result = detectFeatureDev({ homedir: tmp, cwd: tmp });
    assert.equal(result.installed, false);
    assert.equal(result.basePath, null);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("partial install: agents dir without commands/feature-dev.md → not installed", () => {
  const tmp = mkTmp();
  try {
    writeAnchor(
      tmp,
      ".claude/plugins/cache/claude-plugins-official/feature-dev/unknown/agents/code-explorer.md",
    );
    const result = detectFeatureDev({ homedir: tmp, cwd: tmp });
    assert.equal(result.installed, false);
    assert.equal(result.basePath, null);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
