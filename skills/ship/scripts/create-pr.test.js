// Smoke test for create-pr.sh (deliberate exception to the "no test for
// ship scripts" convention — two real bugs were found here by code review,
// not by any test: hardcoded `origin` remote, and blind `gh pr view` instead
// of parsing `gh pr create`'s stdout). Not a full suite: 4 cases covering
// create, reuse, non-origin remote regression, and unparseable-URL regression.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCRIPT = new URL("./create-pr.sh", import.meta.url).pathname;

// Fake `gh` / `az` binaries on PATH, controlled via env vars, so the script's
// real network-hitting CLIs are never invoked.
const FAKE_GH = `#!/usr/bin/env bash
if [ "$1" = "pr" ] && [ "$2" = "list" ]; then
  echo "\${FAKE_GH_LIST:-[]}"
  exit 0
fi
if [ "$1" = "pr" ] && [ "$2" = "create" ]; then
  echo "\${FAKE_GH_CREATE_OUTPUT:-https://github.com/acme/repo/pull/1}"
  exit "\${FAKE_GH_CREATE_EXIT:-0}"
fi
exit 1
`;

const FAKE_AZ = `#!/usr/bin/env bash
if [ "$1" = "repos" ] && [ "$2" = "pr" ] && [ "$3" = "list" ]; then
  echo "\${FAKE_AZ_LIST:-[]}"
  exit 0
fi
if [ "$1" = "repos" ] && [ "$2" = "pr" ] && [ "$3" = "create" ]; then
  echo "\$FAKE_AZ_CREATE_OUTPUT"
  exit 0
fi
exit 1
`;

function makeFakeBinDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "create-pr-fakebin-"));
  fs.writeFileSync(path.join(dir, "gh"), FAKE_GH, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, "az"), FAKE_AZ, { mode: 0o755 });
  return dir;
}

function makeBodyFile(dir) {
  const bodyPath = path.join(dir, "body.md");
  fs.writeFileSync(bodyPath, "PR description.\n");
  return bodyPath;
}

function parseReport(out) {
  const block = out.match(/PR_REPORT_BEGIN\n([\s\S]*?)PR_REPORT_END/);
  assert.ok(block, `no report block found in output: ${out}`);
  const report = {};
  for (const line of block[1].trim().split("\n")) {
    const [key, ...rest] = line.split("=");
    report[key] = rest.join("=");
  }
  return report;
}

function run(args, { cwd, env }) {
  try {
    const out = execFileSync(SCRIPT, args, { cwd, env, encoding: "utf-8" });
    return { code: 0, out };
  } catch (err) {
    return { code: err.status, out: err.stdout ?? "" };
  }
}

test("create path: no existing PR found, gh pr create succeeds", () => {
  const fakeBin = makeFakeBinDir();
  try {
    const bodyFile = makeBodyFile(fakeBin);
    const { code, out } = run(
      ["github", "My PR", bodyFile, "feature-x", "--target-branch=main", "--remote=origin"],
      {
        cwd: fakeBin,
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH}`,
          FAKE_GH_LIST: "[]",
          FAKE_GH_CREATE_OUTPUT: "https://github.com/acme/repo/pull/1",
        },
      }
    );
    assert.equal(code, 0);
    const report = parseReport(out);
    assert.equal(report.status, "success");
    assert.equal(report.reused, "false");
    assert.equal(report.pr_url, "https://github.com/acme/repo/pull/1");
    assert.equal(report.pr_number, "1");
  } finally {
    fs.rmSync(fakeBin, { recursive: true, force: true });
  }
});

test("reuse path: existing open PR is reused, not duplicated", () => {
  const fakeBin = makeFakeBinDir();
  try {
    const bodyFile = makeBodyFile(fakeBin);
    const { code, out } = run(
      ["github", "My PR", bodyFile, "feature-x", "--target-branch=main", "--remote=origin"],
      {
        cwd: fakeBin,
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH}`,
          FAKE_GH_LIST: '[{"number":7,"url":"https://github.com/acme/repo/pull/7"}]',
          // If the script attempted a duplicate create, this would appear instead.
          FAKE_GH_CREATE_OUTPUT: "https://github.com/acme/repo/pull/999",
        },
      }
    );
    assert.equal(code, 0);
    const report = parseReport(out);
    assert.equal(report.status, "success");
    assert.equal(report.reused, "true");
    assert.equal(report.pr_number, "7");
    assert.equal(report.pr_url, "https://github.com/acme/repo/pull/7");
  } finally {
    fs.rmSync(fakeBin, { recursive: true, force: true });
  }
});

test("regression: azdo cli mode resolves repo name from --remote=, not hardcoded origin", () => {
  const fakeBin = makeFakeBinDir();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "create-pr-repo-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: repo });
    // Deliberately no "origin" remote — only "upstream". If the script ever
    // hardcodes origin again, `git remote get-url origin` fails and the repo
    // name is derived from empty output instead of the upstream URL.
    execFileSync("git", ["remote", "add", "upstream", "https://dev.azure.com/org/proj/_git/myrepo"], {
      cwd: repo,
    });
    const bodyFile = makeBodyFile(fakeBin);
    const { code, out } = run(
      [
        "azdo",
        "My PR",
        bodyFile,
        "feature-x",
        "--target-branch=main",
        "--remote=upstream",
        "--azdo-mode=cli",
        "--azdo-org-url=https://dev.azure.com/org",
        "--azdo-project=proj",
        "--azdo-project-url-safe=proj",
      ],
      {
        cwd: repo,
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH}`,
          FAKE_AZ_LIST: "[]",
          FAKE_AZ_CREATE_OUTPUT: '{"pullRequestId":42}',
        },
      }
    );
    assert.equal(code, 0, out);
    const report = parseReport(out);
    assert.equal(report.status, "success");
    assert.match(report.pr_url, /\/myrepo\/pullrequest\/42$/, `expected repo name from upstream remote, got: ${report.pr_url}`);
  } finally {
    fs.rmSync(fakeBin, { recursive: true, force: true });
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("regression: github create succeeds but URL unparseable from stdout -> failed, not silently empty", () => {
  const fakeBin = makeFakeBinDir();
  try {
    const bodyFile = makeBodyFile(fakeBin);
    const { code, out } = run(
      ["github", "My PR", bodyFile, "feature-x", "--target-branch=main", "--remote=origin"],
      {
        cwd: fakeBin,
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH}`,
          FAKE_GH_LIST: "[]",
          FAKE_GH_CREATE_OUTPUT: "not a url",
        },
      }
    );
    assert.equal(code, 1);
    const report = parseReport(out);
    assert.equal(report.status, "failed");
    assert.match(report.errors, /could not be parsed/);
  } finally {
    fs.rmSync(fakeBin, { recursive: true, force: true });
  }
});
