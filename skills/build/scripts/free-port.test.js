import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";

const SCRIPT = new URL("./free-port.sh", import.meta.url).pathname;

function runOnce() {
  return new Promise((resolve, reject) => {
    const child = spawn(SCRIPT, [], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`exit ${code}`));
      else resolve(out.trim());
    });
  });
}

test("returns a numeric port in the valid TCP range", () => {
  const out = execFileSync(SCRIPT, [], { encoding: "utf-8" }).trim();
  const port = Number(out);
  assert.ok(Number.isInteger(port), `expected integer, got ${out}`);
  assert.ok(port > 0 && port <= 65535, `port ${port} out of range`);
});

test("two concurrent invocations return distinct valid ports", async () => {
  const [a, b] = await Promise.all([runOnce(), runOnce()]);
  const pa = Number(a);
  const pb = Number(b);
  assert.ok(Number.isInteger(pa) && pa > 0 && pa <= 65535, `port ${a} out of range`);
  assert.ok(Number.isInteger(pb) && pb > 0 && pb <= 65535, `port ${b} out of range`);
  assert.notEqual(pa, pb, "concurrent invocations collided on the same port");
});
