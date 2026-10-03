import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = new URL("./update-plugins.py", import.meta.url).pathname;
const hasPython = spawnSync("python3", ["--version"]).status === 0;

// Fake `claude` CLI driven by a JSON scenario: installed plugins, which
// marketplace refreshes fail, and which plugin updates fail or bump.
const FAKE = `#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const dir = process.env.FAKE_DIR;
const sc = JSON.parse(fs.readFileSync(path.join(dir, "scenario.json"), "utf8"));
const bumped = path.join(dir, "bumped.json");
const done = fs.existsSync(bumped) ? JSON.parse(fs.readFileSync(bumped, "utf8")) : {};
const [, , , sub, ...rest] = process.argv; // claude plugin <sub> ...
if (sub === "list") {
  for (const [id, v] of Object.entries(sc.plugins)) console.log(\`  ❯ \${id}\\n    Version: \${done[id] || v}\`);
  process.exit(0);
}
if (sub === "marketplace") {
  const name = rest[1];
  if (!name ? sc.bulkFails : (sc.badMarketplaces || []).includes(name)) {
    console.error("fatal: Could not read from remote repository.");
    process.exit(1);
  }
  process.exit(0);
}
if (sub === "update") {
  const id = rest[0];
  if ((sc.failUpdates || []).includes(id)) { console.error("error: plugin cache corrupt"); process.exit(1); }
  if (sc.bumps && sc.bumps[id]) {
    done[id] = sc.bumps[id];
    fs.writeFileSync(bumped, JSON.stringify(done));
    console.log(\`✔ Plugin updated to \${sc.bumps[id]}\`);
  } else console.log("✔ already at the latest version");
  process.exit(0);
}
process.exit(1);
`;

function run(scenario, args = []) {
  const dir = mkdtempSync(join(tmpdir(), "wright-"));
  try {
    writeFileSync(join(dir, "scenario.json"), JSON.stringify(scenario));
    writeFileSync(join(dir, "claude"), FAKE);
    chmodSync(join(dir, "claude"), 0o755);
    const r = spawnSync("python3", [SCRIPT, ...args], {
      encoding: "utf8",
      env: { ...process.env, FAKE_DIR: dir, PATH: `${dir}:${process.env.PATH}` },
    });
    return { code: r.status, out: r.stdout + r.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const plugins = {
  "alpha@good": "1.0.0",
  "beta@good": "2.0.0",
  "devtools@bad": "0.1.0",
};

test("all refresh and update cleanly -> exit 0", { skip: !hasPython }, () => {
  const r = run({ plugins, bumps: { "alpha@good": "1.1.0" } });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /alpha\s+1\.0\.0\s+1\.1\.0\s+↑ updated/);
  assert.match(r.out, /WRIGHT_RESULT applied=true updated=1 names=alpha failed=0/);
});

test("one bad marketplace skips only its plugins; the rest still update", { skip: !hasPython }, () => {
  const r = run({ plugins, bulkFails: true, badMarketplaces: ["bad"], bumps: { "alpha@good": "1.1.0" } });
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /✗ marketplace bad: fatal: Could not read from remote repository\./);
  assert.match(r.out, /alpha\s+1\.0\.0\s+1\.1\.0\s+↑ updated/);
  assert.match(r.out, /beta\s+2\.0\.0\s+2\.0\.0\s+= current/);
  assert.match(r.out, /devtools\s+0\.1\.0\s+0\.1\.0\s+⏭ skipped/);
  assert.match(r.out, /hint: retry with `claude plugin marketplace update bad`/);
  assert.match(r.out, /updated=1 names=alpha failed=1 failed_names=devtools marketplaces_failed=bad/);
});

test("bulk refresh fails but every marketplace refreshes alone -> nothing skipped", { skip: !hasPython }, () => {
  const r = run({ plugins, bulkFails: true });
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /skipped/);
  assert.match(r.out, /All already current/);
});

test("a failed plugin update is reported and the run continues", { skip: !hasPython }, () => {
  const r = run({ plugins, failUpdates: ["alpha@good"], bumps: { "beta@good": "2.1.0" } });
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /alpha\s+FAILED — error: plugin cache corrupt/);
  assert.match(r.out, /beta\s+2\.0\.0\s+2\.1\.0\s+↑ updated/);
  assert.match(r.out, /failed=1 failed_names=alpha/);
});

test("single target whose marketplace fails is skipped and reported, not a crash", { skip: !hasPython }, () => {
  const r = run({ plugins, badMarketplaces: ["bad"], bulkFails: true }, ["devtools"]);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /devtools\s+skipped — marketplace bad could not be refreshed/);
});

test("long plugin names keep the table columns aligned", { skip: !hasPython }, () => {
  const r = run({ plugins: { "powershell-editor-services@lsps": "0.1.0", "x@lsps": "1.0.0" } });
  assert.match(r.out, /powershell-editor-services\s{2,}0\.1\.0/);
});
