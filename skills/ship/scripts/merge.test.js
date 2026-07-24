// Smoke test for merge.sh (deliberate exception to the "no test for ship
// scripts" convention — mirrors create-pr.test.js's fake-gh pattern). Covers
// the regression this fix addresses: gh pr merge can fail on its post-merge
// local branch-switch/delete step (e.g. worktree conflict) even though the
// merge itself succeeded on GitHub — merge.sh must not report status=failed
// for an already-merged PR.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCRIPT = new URL("./merge.sh", import.meta.url).pathname;

const FAKE_GH = `#!/usr/bin/env bash
if [ "$1" = "pr" ] && [ "$2" = "merge" ]; then
  echo "\${FAKE_GH_MERGE_ERR:-}" >&2
  exit "\${FAKE_GH_MERGE_EXIT:-0}"
fi
if [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  for arg in "$@"; do
    case "$arg" in
      *state*) echo "\${FAKE_GH_PR_STATE:-OPEN}"; exit 0 ;;
      *mergeCommit*) echo "\${FAKE_GH_MERGE_COMMIT:-}"; exit 0 ;;
      *headRefName*) echo "\${FAKE_GH_HEAD_REF:-feature-x}"; exit 0 ;;
      *mergeStateStatus*) echo "\${FAKE_GH_MERGE_STATE:-CLEAN}"; exit 0 ;;
    esac
  done
  exit 0
fi
if [ "$1" = "api" ]; then
  exit "\${FAKE_GH_API_EXIT:-0}"
fi
exit 1
`;

function makeFakeBinDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "merge-fakebin-"));
  fs.writeFileSync(path.join(dir, "gh"), FAKE_GH, { mode: 0o755 });
  return dir;
}

function parseReport(out) {
  const block = out.match(/LAND_REPORT_BEGIN\n([\s\S]*?)LAND_REPORT_END/);
  assert.ok(block, `no report block found in output: ${out}`);
  const report = {};
  for (const line of block[1].trim().split("\n")) {
    const [key, ...rest] = line.split("=");
    report[key] = rest.join("=");
  }
  return report;
}

function run(args, env) {
  try {
    const out = execFileSync(SCRIPT, args, { env, encoding: "utf-8" });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status, out: err.stdout ?? "" };
  }
}

test("gh pr merge succeeds: reports success", () => {
  const fakeBin = makeFakeBinDir();
  try {
    const { code, out } = run(["github", "126", "--squash", "--delete-branch"], {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      FAKE_GH_MERGE_EXIT: "0",
      FAKE_GH_MERGE_COMMIT: "abc1234",
    });
    assert.equal(code, 0);
    const report = parseReport(out);
    assert.equal(report.status, "success");
    assert.equal(report.branch_deleted, "true");
  } finally {
    fs.rmSync(fakeBin, { recursive: true, force: true });
  }
});

test("regression: gh pr merge exits non-zero but PR is already MERGED — reports success, not failed", () => {
  const fakeBin = makeFakeBinDir();
  try {
    const { code, out } = run(["github", "126", "--squash", "--delete-branch"], {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      FAKE_GH_MERGE_EXIT: "1",
      FAKE_GH_MERGE_ERR: "fatal: 'main' is already used by worktree at '/repo'",
      FAKE_GH_PR_STATE: "MERGED",
      FAKE_GH_MERGE_COMMIT: "def5678",
      FAKE_GH_API_EXIT: "0",
    });
    assert.equal(code, 0);
    const report = parseReport(out);
    assert.equal(report.status, "success");
    assert.equal(report.merge_commit, "def5678");
    assert.equal(report.branch_deleted, "true");
    assert.match(report.errors, /local post-merge cleanup failed/);
  } finally {
    fs.rmSync(fakeBin, { recursive: true, force: true });
  }
});

test("gh pr merge fails and PR is genuinely not merged: reports failed", () => {
  const fakeBin = makeFakeBinDir();
  try {
    const { code, out } = run(["github", "126", "--squash", "--delete-branch"], {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      FAKE_GH_MERGE_EXIT: "1",
      FAKE_GH_MERGE_ERR: "merge conflict",
      FAKE_GH_PR_STATE: "OPEN",
      FAKE_GH_MERGE_STATE: "DIRTY",
    });
    assert.equal(code, 1);
    const report = parseReport(out);
    assert.equal(report.status, "failed");
  } finally {
    fs.rmSync(fakeBin, { recursive: true, force: true });
  }
});
