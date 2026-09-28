// Smoke tests for ci-watch.sh's Azure DevOps paths (deliberate exception to
// the "no test for ship scripts" convention — mirrors create-pr.test.js).
// There is no live AzDO account behind these: `curl`, `az` and `sleep` are
// PATH shims driven by env vars. Covers the LOGBOOK regressions: REST mode
// crashing with `jq: Cannot iterate over null` on error bodies, reporting
// all_passed while a build is still running, and polling the source branch
// instead of AzDO's refs/pull/<id>/merge validation ref.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCRIPT = new URL("./ci-watch.sh", import.meta.url).pathname;

const FAKE_CURL = `#!/usr/bin/env bash
url="\${@: -1}"
echo "$url" >> "$FAKE_CALL_LOG"
case "$url" in
  *policy/evaluations*)     printf '%s' "\${FAKE_CURL_POLICY-{\\"value\\":[]\\}}" ;;
  *refs/pull/*)             printf '%s' "\${FAKE_CURL_PR_BUILDS-{\\"value\\":[]\\}}" ;;
  *refs/heads/*)            printf '%s' "\${FAKE_CURL_BRANCH_BUILDS-{\\"value\\":[]\\}}" ;;
esac
`;

const FAKE_AZ = `#!/usr/bin/env bash
echo "az $*" >> "$FAKE_CALL_LOG"
if [ "$1" = "pipelines" ] && [ "$2" = "runs" ]; then
  branch="" query=""
  while [ $# -gt 0 ]; do
    case "$1" in --branch) branch="$2"; shift ;; --query) query="$2"; shift ;; esac
    shift
  done
  case "$branch" in refs/pull/*) runs="\${FAKE_AZ_PR_RUNS:-[]}" ;; *) runs="\${FAKE_AZ_BRANCH_RUNS:-[]}" ;; esac
  case "$query" in
    "length(@)") echo "$runs" | jq 'length' ;;
    *failed*)    echo "$runs" | jq '[.[] | select(.result=="failed")] | length' ;;
    *completed*) echo "$runs" | jq '[.[] | select(.status!="completed")] | length' ;;
    *)           echo "$runs" | jq '[.[] | {name:.definition.name, status, result}]' ;;
  esac
  exit 0
fi
if [ "$1" = "repos" ] && [ "$2" = "pr" ] && [ "$3" = "policy" ]; then
  echo 0
  exit 0
fi
exit 1
`;

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ci-watch-fakebin-"));
  fs.writeFileSync(path.join(dir, "curl"), FAKE_CURL, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, "az"), FAKE_AZ, { mode: 0o755 });
  fs.writeFileSync(path.join(dir, "sleep"), "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 });
  return { dir, log: path.join(dir, "calls.log") };
}

function parseReport(out) {
  const block = out.match(/CHECKS_REPORT_BEGIN\n([\s\S]*?)CHECKS_REPORT_END/);
  assert.ok(block, `no report block found in output: ${out}`);
  const report = {};
  for (const line of block[1].trim().split("\n")) {
    const [key, ...rest] = line.split("=");
    report[key] = rest.join("=");
  }
  return report;
}

function run(mode, extraEnv, fake) {
  const env = { ...process.env, PATH: `${fake.dir}:${process.env.PATH}`, FAKE_CALL_LOG: fake.log };
  delete env.AZURE_DEVOPS_EXT_PAT;
  delete env.AZDO_PAT;
  Object.assign(env, { AZDO_PAT: "test-pat", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" }, extraEnv);
  const args = [
    "azdo", "7", "feature-x",
    `--azdo-mode=${mode}`,
    "--azdo-org-url=https://dev.azure.com/org",
    "--azdo-project=proj",
    "--azdo-project-url-safe=proj",
  ];
  try {
    return { code: 0, out: execFileSync(SCRIPT, args, { env, encoding: "utf-8" }) };
  } catch (err) {
    return { code: err.status, out: err.stdout ?? "" };
  }
}

const build = (name, status, result) =>
  ({ definition: { name }, status, ...(result ? { result } : {}) });
const list = (...builds) => JSON.stringify({ value: builds });

function withFake(fn) {
  const fake = setup();
  try {
    fn(fake);
  } finally {
    fs.rmSync(fake.dir, { recursive: true, force: true });
  }
}

test("rest: error object without .value is a failed call (exit 3), not a jq crash or no_checks", () => {
  withFake((fake) => {
    const { code, out } = run("rest", {
      FAKE_CURL_PR_BUILDS: JSON.stringify({ message: "TF400813: not authorized", typeKey: "UnauthorizedRequestException" }),
    }, fake);
    assert.equal(code, 3, out);
    const report = parseReport(out);
    assert.match(report.checks, /^error:TF400813/);
    assert.doesNotMatch(out, /Cannot iterate over null/);
  });
});

test("rest: empty 401 body is a failed call, not zero builds", () => {
  withFake((fake) => {
    const { code, out } = run("rest", { FAKE_CURL_PR_BUILDS: "" }, fake);
    assert.equal(code, 3, out);
    assert.match(parseReport(out).checks, /^error:/);
  });
});

test("regression: rest build still inProgress/notStarted reports pending, never all_passed", () => {
  withFake((fake) => {
    const { code, out } = run("rest", {
      FAKE_CURL_PR_BUILDS: list(build("ci", "inProgress"), build("lint", "notStarted"), build("docs", "completed", "succeeded")),
    }, fake);
    assert.equal(code, 2, out);
    const report = parseReport(out);
    assert.equal(report.status, "pending");
    assert.match(report.checks, /ci:inProgress/);
    assert.match(report.checks, /lint:notStarted/);
  });
});

test("rest: completed + succeeded builds report all_passed", () => {
  withFake((fake) => {
    const { code, out } = run("rest", { FAKE_CURL_PR_BUILDS: list(build("ci", "completed", "succeeded")) }, fake);
    assert.equal(code, 0, out);
    assert.equal(parseReport(out).status, "all_passed");
  });
});

test("rest: canceled build counts as a failure", () => {
  withFake((fake) => {
    const { code, out } = run("rest", { FAKE_CURL_PR_BUILDS: list(build("ci", "completed", "canceled")) }, fake);
    assert.equal(code, 1, out);
    assert.equal(parseReport(out).failing_checks, "ci");
  });
});

test("regression: rest queries refs/pull/<id>/merge first", () => {
  withFake((fake) => {
    run("rest", { FAKE_CURL_PR_BUILDS: list(build("ci", "completed", "succeeded")) }, fake);
    const first = fs.readFileSync(fake.log, "utf-8").split("\n")[0];
    assert.match(first, /branchName=refs\/pull\/7\/merge/);
  });
});

test("regression: rest with policies but no builds on either ref reports pending, not all_passed", () => {
  withFake((fake) => {
    const { code, out } = run("rest", {
      FAKE_CURL_POLICY: JSON.stringify({ value: [{ status: "queued" }] }),
    }, fake);
    assert.equal(code, 2, out);
    assert.equal(parseReport(out).status, "pending");
  });
});

test("rest: no builds and no policies reports no_checks", () => {
  withFake((fake) => {
    const { code, out } = run("rest", {}, fake);
    assert.equal(code, 0, out);
    assert.equal(parseReport(out).status, "no_checks");
  });
});

test("rest: no env PAT falls back to git credential fill", () => {
  withFake((fake) => {
    const { code, out } = run("rest", {
      AZDO_PAT: "",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "credential.helper",
      GIT_CONFIG_VALUE_0: "!f() { echo username=u; echo password=from-git; }; f",
      FAKE_CURL_PR_BUILDS: list(build("ci", "completed", "succeeded")),
    }, fake);
    assert.equal(code, 0, out);
    assert.equal(parseReport(out).status, "all_passed");
  });
});

test("regression: cli run notStarted (result null) reports pending, never all_passed", () => {
  withFake((fake) => {
    const { code, out } = run("cli", {
      FAKE_AZ_PR_RUNS: JSON.stringify([build("ci", "notStarted")]),
    }, fake);
    assert.equal(code, 2, out);
    assert.equal(parseReport(out).status, "pending");
    const firstRuns = fs.readFileSync(fake.log, "utf-8").split("\n").find((l) => l.startsWith("az pipelines"));
    assert.match(firstRuns, /--branch refs\/pull\/7\/merge/);
  });
});

test("cli: completed + succeeded runs report all_passed", () => {
  withFake((fake) => {
    const { code, out } = run("cli", {
      FAKE_AZ_PR_RUNS: JSON.stringify([build("ci", "completed", "succeeded")]),
    }, fake);
    assert.equal(code, 0, out);
    assert.equal(parseReport(out).status, "all_passed");
  });
});
