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

function writeJson(dir, rel, data) {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
}

const SP_KEY = "superpowers@claude-plugins-official";
const SP_REL = ".claude/plugins/cache/claude-plugins-official/superpowers/6.3.0";

function registerSuperpowers(tmp, extra = {}) {
  writeAnchor(tmp, `${SP_REL}/skills/using-superpowers/SKILL.md`);
  writeJson(tmp, ".claude/plugins/installed_plugins.json", {
    version: 2,
    plugins: { [SP_KEY]: [{ scope: "user", installPath: path.join(tmp, SP_REL), ...extra }] },
  });
}

test("registry: leftover cache folder without registration → not installed", () => {
  const tmp = mkTmp();
  try {
    writeAnchor(tmp, `${SP_REL}/skills/using-superpowers/SKILL.md`);
    writeJson(tmp, ".claude/plugins/installed_plugins.json", { version: 2, plugins: {} });
    const result = detectSuperpowers({ homedir: tmp, cwd: tmp });
    assert.equal(result.installed, false);
    assert.equal(result.basePath, null);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("registry: marketplace clone is not an install", () => {
  const tmp = mkTmp();
  try {
    writeAnchor(tmp, ".claude/plugins/marketplaces/claude-plugins-official/superpowers/skills/using-superpowers/SKILL.md");
    writeJson(tmp, ".claude/plugins/installed_plugins.json", { version: 2, plugins: {} });
    assert.equal(detectSuperpowers({ homedir: tmp, cwd: tmp }).installed, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("registry: registered with no enabledPlugins entry → installed", () => {
  const tmp = mkTmp();
  try {
    registerSuperpowers(tmp);
    const result = detectSuperpowers({ homedir: tmp, cwd: tmp });
    assert.equal(result.installed, true);
    assert.ok(result.basePath.startsWith(path.join(tmp, SP_REL)));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("registry: disabled in user settings → not installed", () => {
  const tmp = mkTmp();
  try {
    registerSuperpowers(tmp);
    writeJson(tmp, ".claude/settings.json", { enabledPlugins: { [SP_KEY]: false } });
    assert.equal(detectSuperpowers({ homedir: tmp, cwd: path.join(tmp, "proj") }).installed, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("registry: project-local settings override user settings", () => {
  const tmp = mkTmp();
  try {
    const home = path.join(tmp, "home");
    const proj = path.join(tmp, "proj");
    registerSuperpowers(home);
    writeJson(home, ".claude/settings.json", { enabledPlugins: { [SP_KEY]: true } });
    writeJson(proj, ".claude/settings.local.json", { enabledPlugins: { [SP_KEY]: false } });
    assert.equal(detectSuperpowers({ homedir: home, cwd: proj }).installed, false);
    writeJson(proj, ".claude/settings.local.json", { enabledPlugins: { [SP_KEY]: true } });
    assert.equal(detectSuperpowers({ homedir: home, cwd: proj }).installed, true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("registry: project-scoped install only counts inside its project", () => {
  const tmp = mkTmp();
  try {
    const proj = path.join(tmp, "proj");
    registerSuperpowers(tmp, { scope: "project", projectPath: proj });
    assert.equal(detectSuperpowers({ homedir: tmp, cwd: proj }).installed, true);
    assert.equal(detectSuperpowers({ homedir: tmp, cwd: path.join(tmp, "other") }).installed, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("registry: standalone ~/.claude/skills/superpowers still detected", () => {
  const tmp = mkTmp();
  try {
    writeJson(tmp, ".claude/plugins/installed_plugins.json", { version: 2, plugins: {} });
    writeAnchor(tmp, ".claude/skills/superpowers/using-superpowers/SKILL.md");
    assert.equal(detectSuperpowers({ homedir: tmp, cwd: tmp }).installed, true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
