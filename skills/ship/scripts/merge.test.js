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

// ── Azure DevOps (no live account: az/curl/sleep are PATH shims) ──────────

const FAKE_AZ_MERGE = `#!/usr/bin/env bash
echo "az $*" >> "$FAKE_CALL_LOG"
if [ "$1" = "repos" ] && [ "$2" = "pr" ] && [ "$3" = "policy" ]; then echo '[]'; exit 0; fi
if [ "$1" = "repos" ] && [ "$2" = "pr" ] && [ "$3" = "update" ]; then
  for a in "$@"; do [ "$a" = "--project" ] && { echo "unrecognized arguments: --project" >&2; exit 2; }; done
  exit 0
fi
exit 0
`;

const FAKE_CURL_MERGE = `#!/usr/bin/env bash
method=GET url="" data=""
while [ $# -gt 0 ]; do
  case "$1" in -X) method="$2"; shift ;; -d) data="$2"; shift ;; -H|-o|-w) shift ;; -*) ;; *) url="$1" ;; esac
  shift
done
echo "$method $url $data" >> "$FAKE_CALL_LOG"
DEFAULT_PATCH='{"status":"completed","lastMergeCommit":{"commitId":"feedbeef99"}}'
case "$method $url" in
  *connectiondata*)        echo '{}' ;;
  *policy/evaluations*)    printf '%s' "\${FAKE_CURL_EVALS-{\\"value\\":[]\\}}" ;;
  "PATCH "*pullrequests*)  printf '%s' "\${FAKE_CURL_PATCH:-$DEFAULT_PATCH}" ;;
  "GET "*pullrequests*)    printf '%s' '{"status":"active","lastMergeSourceCommit":{"commitId":"abc123"}}' ;;
esac
`;

function runAzdo(mode, extraEnv) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "merge-azdo-"));
  const log = path.join(dir, "calls.log");
  fs.writeFileSync(path.join(dir, "az"), FAKE_AZ_MERGE, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, "curl"), FAKE_CURL_MERGE, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, "sleep"), "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 });
  const repo = path.join(dir, "repo");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["remote", "add", "origin", "https://dev.azure.com/org/proj/_git/myrepo"], { cwd: repo });
  const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, FAKE_CALL_LOG: log, AZDO_PAT: "test-pat", ...extraEnv };
  delete env.AZURE_DEVOPS_EXT_PAT;
  let result;
  try {
    result = { code: 0, out: execFileSync(SCRIPT, ["azdo", "7", "--squash", "--delete-branch",
      `--azdo-mode=${mode}`, "--azdo-org-url=https://dev.azure.com/org", "--azdo-project=proj",
      "--azdo-project-url-safe=proj"], { cwd: repo, env, encoding: "utf-8" }) };
  } catch (err) {
    result = { code: err.status, out: err.stdout ?? "" };
  }
  result.calls = fs.existsSync(log) ? fs.readFileSync(log, "utf-8") : "";
  fs.rmSync(dir, { recursive: true, force: true });
  return result;
}

test("azdo cli: az repos pr update is called without --project and succeeds", () => {
  const { code, out, calls } = runAzdo("cli");
  assert.equal(code, 0, out);
  assert.equal(parseReport(out).status, "success");
  const update = calls.split("\n").find((l) => l.startsWith("az repos pr update"));
  assert.ok(update, calls);
  assert.doesNotMatch(update, /--project/);
});

test("azdo rest: completes with lastMergeSourceCommit and reports merge commit", () => {
  const { code, out, calls } = runAzdo("rest");
  assert.equal(code, 0, out);
  const report = parseReport(out);
  assert.equal(report.status, "success");
  assert.equal(report.merge_commit, "feedbee");
  const patch = calls.split("\n").find((l) => l.startsWith("PATCH "));
  assert.match(patch, /"lastMergeSourceCommit":\{"commitId":"abc123"\}/);
  assert.match(patch, /"mergeStrategy":"squash"/);
});

test("regression: azdo rest policy call returning an error object fails, never merges", () => {
  const { code, out, calls } = runAzdo("rest", {
    FAKE_CURL_EVALS: JSON.stringify({ message: "TF400813: not authorized" }),
  });
  assert.equal(code, 1, out);
  const report = parseReport(out);
  assert.equal(report.status, "failed");
  assert.match(report.errors, /policy check failed: TF400813/);
  assert.doesNotMatch(out, /Cannot iterate over null/);
  assert.doesNotMatch(calls, /^PATCH /m);
});
