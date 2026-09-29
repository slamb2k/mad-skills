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
  while [ $# -gt 0 ]; do
    [ "$1" = "--description" ] && [ -n "\${FAKE_DESC_OUT:-}" ] && printf '%s' "$2" > "$FAKE_DESC_OUT"
    shift
  done
  if [ -n "\${FAKE_AZ_CREATE_ERR:-}" ]; then echo "$FAKE_AZ_CREATE_ERR" >&2; exit 1; fi
  echo "\$FAKE_AZ_CREATE_OUTPUT"
  exit 0
fi
exit 1
`;

// REST shim: list returns no PRs; create echoes back a PR and records the payload.
const FAKE_CURL = `#!/usr/bin/env bash
method=GET data="" auth=""
while [ $# -gt 0 ]; do
  case "$1" in -X) method="$2"; shift ;; -d) data="$2"; shift ;; -H) case "$2" in Authorization*) auth="$2" ;; esac; shift ;; esac
  shift
done
[ -n "\${FAKE_AUTH_OUT:-}" ] && printf '%s' "$auth" > "$FAKE_AUTH_OUT"
if [ "$method" = "POST" ]; then
  [ -n "\${FAKE_PAYLOAD_OUT:-}" ] && printf '%s' "$data" > "$FAKE_PAYLOAD_OUT"
  echo '{"pullRequestId":99}'
else
  echo '{"value":[]}'
fi
`;

function makeFakeBinDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "create-pr-fakebin-"));
  fs.writeFileSync(path.join(dir, "gh"), FAKE_GH, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, "az"), FAKE_AZ, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, "curl"), FAKE_CURL, { mode: 0o755 });
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

// ── Azure DevOps: description cap + CLI auth fallback ─────────────────────

function runAzdo(mode, body, extraEnv) {
  const fakeBin = makeFakeBinDir();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "create-pr-repo-"));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["remote", "add", "origin", "https://dev.azure.com/org/proj/_git/myrepo"], { cwd: repo });
  const bodyFile = path.join(fakeBin, "body.md");
  fs.writeFileSync(bodyFile, body);
  const outFile = (n) => path.join(fakeBin, n);
  const env = {
    ...process.env,
    PATH: `${fakeBin}:${process.env.PATH}`,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    FAKE_AZ_LIST: "[]",
    FAKE_AZ_CREATE_OUTPUT: '{"pullRequestId":42}',
    FAKE_DESC_OUT: outFile("desc"),
    FAKE_PAYLOAD_OUT: outFile("payload"),
    FAKE_AUTH_OUT: outFile("auth"),
    ...extraEnv,
  };
  delete env.AZURE_DEVOPS_EXT_PAT;
  if (!("AZDO_PAT" in extraEnv)) delete env.AZDO_PAT;
  const result = run(
    ["azdo", "My PR", bodyFile, "feature-x", "--target-branch=main", `--azdo-mode=${mode}`,
      "--azdo-org-url=https://dev.azure.com/org", "--azdo-project=proj", "--azdo-project-url-safe=proj"],
    { cwd: repo, env }
  );
  const read = (n) => (fs.existsSync(outFile(n)) ? fs.readFileSync(outFile(n), "utf-8") : null);
  result.desc = read("desc");
  result.payload = read("payload");
  result.auth = read("auth");
  fs.rmSync(fakeBin, { recursive: true, force: true });
  fs.rmSync(repo, { recursive: true, force: true });
  return result;
}

const LONG_BODY = "x".repeat(5000);
const GIT_CRED_HELPER = {
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "credential.helper",
  GIT_CONFIG_VALUE_0: "!f() { echo username=u; echo password=from-git; }; f",
};

test("azdo cli: description over 4000 chars is truncated with a note", () => {
  const { code, out, desc } = runAzdo("cli", LONG_BODY, {});
  assert.equal(code, 0, out);
  assert.ok(desc.length <= 4000, `description length ${desc.length}`);
  assert.match(desc, /truncated/);
});

test("azdo cli: short description passes through unchanged", () => {
  const { code, desc } = runAzdo("cli", "Short body.\n", {});
  assert.equal(code, 0);
  assert.equal(desc, "Short body.");
});

test("azdo rest: description over 4000 chars is truncated in the payload", () => {
  const { code, out, payload } = runAzdo("rest", LONG_BODY, { AZDO_PAT: "test-pat" });
  assert.equal(code, 0, out);
  const desc = JSON.parse(payload).description;
  assert.ok(desc.length <= 4000, `description length ${desc.length}`);
  assert.match(desc, /truncated/);
});

test("regression: azdo cli create 403 TF400813 falls back to REST with git credential fill", () => {
  const { code, out, payload, auth } = runAzdo("cli", "Body.\n", {
    ...GIT_CRED_HELPER,
    FAKE_AZ_CREATE_ERR: "ERROR: TF400813: The user '' is not authorized to access this resource.",
  });
  assert.equal(code, 0, out);
  const report = parseReport(out);
  assert.equal(report.status, "success");
  assert.match(report.pr_url, /\/myrepo\/pullrequest\/99$/);
  assert.equal(JSON.parse(payload).sourceRefName, "refs/heads/feature-x");
  assert.equal(auth, `Authorization: Basic ${Buffer.from(":from-git").toString("base64")}`);
});

test("azdo cli create non-auth failure does not fall back to REST", () => {
  const { code, out, payload } = runAzdo("cli", "Body.\n", {
    ...GIT_CRED_HELPER,
    FAKE_AZ_CREATE_ERR: "ERROR: TF401179: An active pull request for the source and target branch already exists.",
  });
  assert.equal(code, 1, out);
  assert.equal(parseReport(out).status, "failed");
  assert.equal(payload, null);
});
