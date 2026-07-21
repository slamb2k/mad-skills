// Fixture tests for worktree-aware sync.sh (specs/worktree-aware-sync.md,
// AC-001..AC-008 + the untracked-sentinel case from the Task 1 fix round).
// Runs the whole script end to end against real git state — no function
// extraction, since worktree mode is one continuous flow, not isolated
// helpers like sync-cleanup.test.js's prepare_branch_for_delete.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SYNC_SH = new URL("./sync.sh", import.meta.url).pathname;

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf-8" });
}

function configureRepo(dir) {
  git(dir, ["config", "user.email", "test@example.com"]);
  git(dir, ["config", "user.name", "Test"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
}

// Builds: seed commit -> bare origin -> primary clone (branch main), and
// optionally a linked worktree on branch "feature" (one commit, pushed with
// upstream tracking so gone-upstream detection works in AC-003).
function makeFixture({ withWorktree = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sync-fixture-"));

  const seed = path.join(root, "seed");
  fs.mkdirSync(seed);
  git(seed, ["init", "-q", "-b", "main"]);
  configureRepo(seed);
  fs.writeFileSync(path.join(seed, "README.md"), "seed\n");
  git(seed, ["add", "README.md"]);
  git(seed, ["commit", "-q", "-m", "initial"]);

  const originPath = path.join(root, "origin.git");
  execFileSync("git", ["clone", "-q", "--bare", seed, originPath]);

  const primaryPath = path.join(root, "primary");
  execFileSync("git", ["clone", "-q", originPath, primaryPath]);
  configureRepo(primaryPath);
  git(primaryPath, ["checkout", "-q", "main"]);

  let wtPath = null;
  if (withWorktree) {
    wtPath = path.join(root, "wt-feature");
    git(primaryPath, ["worktree", "add", "-q", "-b", "feature", wtPath, "main"]);
    fs.writeFileSync(path.join(wtPath, "FEATURE.txt"), "feature work\n");
    git(wtPath, ["add", "FEATURE.txt"]);
    git(wtPath, ["commit", "-q", "-m", "feature work"]);
    git(wtPath, ["push", "-q", "-u", "origin", "feature"]);
  }

  return {
    root,
    originPath,
    primaryPath,
    wtPath,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

// Merges (or squash-merges) origin/feature into main via a throwaway clone,
// so the primary's local main ref stays behind until sync.sh pulls it —
// this is what makes main_sync=updated observable.
function mergeFeatureViaTempClone(root, originPath, { squash = false, deleteRemoteBranch = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(root, "tmp-clone-"));
  execFileSync("git", ["clone", "-q", originPath, tmp]);
  configureRepo(tmp);
  git(tmp, ["checkout", "-q", "main"]);
  if (squash) {
    git(tmp, ["merge", "-q", "--squash", "origin/feature"]);
    git(tmp, ["commit", "-q", "-m", "squash feature"]);
  } else {
    git(tmp, ["merge", "-q", "--no-ff", "--no-edit", "origin/feature"]);
  }
  git(tmp, ["push", "-q", "origin", "main"]);
  if (deleteRemoteBranch) {
    git(tmp, ["push", "-q", "origin", "--delete", "feature"]);
  }
}

// Merges feature into the primary's own main ref directly, so the merge is
// already visible (refs are shared across linked worktrees) even before
// sync.sh runs — needed for AC-006, where the primary never gets to pull.
function mergeFeatureViaPrimary(primaryPath) {
  git(primaryPath, ["merge", "-q", "--no-ff", "--no-edit", "feature"]);
  git(primaryPath, ["push", "-q", "origin", "main"]);
}

// Advances origin/main with an unrelated commit, via a throwaway clone, so
// the primary (and the worktree's rebase target) has new upstream history.
function advanceMainViaTempClone(root, originPath) {
  const tmp = fs.mkdtempSync(path.join(root, "tmp-advance-"));
  execFileSync("git", ["clone", "-q", originPath, tmp]);
  configureRepo(tmp);
  fs.writeFileSync(path.join(tmp, "MAIN_UPDATE.txt"), "main moved on\n");
  git(tmp, ["add", "MAIN_UPDATE.txt"]);
  git(tmp, ["commit", "-q", "-m", "advance main"]);
  git(tmp, ["push", "-q", "origin", "main"]);
}

function runSync(cwd, extraArgs = []) {
  return spawnSync("bash", [SYNC_SH, "origin", "main", ...extraArgs], { cwd, encoding: "utf-8" });
}

function parseReport(out) {
  const block = out.match(/SYNC_REPORT_BEGIN\n([\s\S]*?)SYNC_REPORT_END/);
  assert.ok(block, `no report block found in output: ${out}`);
  const report = {};
  for (const line of block[1].trim().split("\n")) {
    const [key, ...rest] = line.split("=");
    report[key] = rest.join("=");
  }
  return report;
}

test("AC-001: checkout-failure guard (non-worktree) restores stash and leaves the feature branch untouched", () => {
  const fx = makeFixture({ withWorktree: false });
  try {
    git(fx.primaryPath, ["checkout", "-q", "-b", "feature"]);
    const otherWt = path.join(fx.root, "other-wt");
    // Locks "main" to a second worktree so the primary's own checkout of
    // main is guaranteed to fail with a nonzero exit.
    git(fx.primaryPath, ["worktree", "add", "-q", otherWt, "main"]);

    const featureShaBefore = git(fx.primaryPath, ["rev-parse", "feature"]).trim();
    fs.writeFileSync(path.join(fx.primaryPath, "README.md"), "dirty edit\n");

    const res = runSync(fx.primaryPath);
    const report = parseReport(res.stdout);

    assert.equal(res.status, 1);
    assert.equal(report.status, "failed");
    assert.equal(report.errors, "Failed to checkout main");
    assert.equal(
      fs.readFileSync(path.join(fx.primaryPath, "README.md"), "utf-8"),
      "dirty edit\n",
      "auto-stash should have been restored"
    );
    assert.equal(git(fx.primaryPath, ["stash", "list"]).trim(), "");
    assert.equal(git(fx.primaryPath, ["branch", "--show-current"]).trim(), "feature");
    assert.equal(report.current_branch, "feature");
    assert.equal(
      git(fx.primaryPath, ["rev-parse", "feature"]).trim(),
      featureShaBefore,
      "feature tip must not move — no pull ran on it"
    );
  } finally {
    fx.cleanup();
  }
});

test("AC-002: merged branch + clean worktree + clean primary — main synced, worktree and branch removed", () => {
  const fx = makeFixture({ withWorktree: true });
  try {
    mergeFeatureViaTempClone(fx.root, fx.originPath);
    const expectedWtPath = fs.realpathSync(fx.wtPath);

    const res = runSync(fx.wtPath);
    const report = parseReport(res.stdout);

    assert.equal(res.status, 0, res.stderr);
    assert.equal(report.worktree_mode, "true");
    assert.equal(fs.realpathSync(report.primary_path), fs.realpathSync(fx.primaryPath));
    assert.equal(report.worktree_removed, expectedWtPath);
    assert.equal(report.main_sync, "updated");
    assert.equal(report.branches_cleaned, "feature");
    assert.equal(fs.existsSync(fx.wtPath), false);
    assert.equal(git(fx.primaryPath, ["branch", "--list", "feature"]).trim(), "");
    const worktreeList = git(fx.primaryPath, ["worktree", "list"]).trim().split("\n");
    assert.equal(worktreeList.length, 1);
  } finally {
    fx.cleanup();
  }
});

test("AC-003: gone-upstream branch after squash-merge — same cleanup as a real merge, via the sanctioned -D fallback", () => {
  const fx = makeFixture({ withWorktree: true });
  try {
    mergeFeatureViaTempClone(fx.root, fx.originPath, { squash: true, deleteRemoteBranch: true });
    const expectedWtPath = fs.realpathSync(fx.wtPath);

    const res = runSync(fx.wtPath);
    const report = parseReport(res.stdout);

    assert.equal(res.status, 0, res.stderr);
    assert.equal(report.worktree_removed, expectedWtPath);
    assert.equal(report.branches_cleaned, "feature");
    assert.equal(fs.existsSync(fx.wtPath), false);
    assert.equal(git(fx.primaryPath, ["branch", "--list", "feature"]).trim(), "");
  } finally {
    fx.cleanup();
  }
});

test("AC-004: dirty finished worktree — removal refused, main still syncs, no stash created", () => {
  const fx = makeFixture({ withWorktree: true });
  try {
    mergeFeatureViaTempClone(fx.root, fx.originPath);
    fs.writeFileSync(path.join(fx.wtPath, "README.md"), "dirty worktree edit\n");

    const res = runSync(fx.wtPath);
    const report = parseReport(res.stdout);

    assert.equal(res.status, 2);
    assert.equal(report.worktree_removed, "skipped (dirty)");
    assert.equal(report.main_sync, "updated");
    assert.equal(fs.existsSync(fx.wtPath), true);
    assert.notEqual(git(fx.primaryPath, ["branch", "--list", "feature"]).trim(), "");
    assert.equal(git(fx.wtPath, ["stash", "list"]).trim(), "");
    assert.equal(
      fs.readFileSync(path.join(fx.wtPath, "README.md"), "utf-8"),
      "dirty worktree edit\n"
    );
  } finally {
    fx.cleanup();
  }
});

test("AC-005: unfinished branch — worktree kept, rebased onto updated main, dirty edit stashed and restored", () => {
  const fx = makeFixture({ withWorktree: true });
  try {
    advanceMainViaTempClone(fx.root, fx.originPath);
    fs.writeFileSync(path.join(fx.wtPath, "README.md"), "local wip\n");

    const res = runSync(fx.wtPath);
    const report = parseReport(res.stdout);

    assert.equal(res.status, 0, res.stderr);
    assert.equal(report.main_sync, "updated");
    assert.equal(report.worktree_removed, "none");
    assert.equal(report.rebase, "success");
    assert.equal(report.stash, "restored");
    assert.equal(fs.existsSync(fx.wtPath), true);
    assert.notEqual(git(fx.primaryPath, ["branch", "--list", "feature"]).trim(), "");
    assert.equal(git(fx.wtPath, ["stash", "list"]).trim(), "");
    assert.equal(fs.readFileSync(path.join(fx.wtPath, "README.md"), "utf-8"), "local wip\n");

    const newMainSha = git(fx.primaryPath, ["rev-parse", "main"]).trim();
    const ancestorCheck = spawnSync("git", ["merge-base", "--is-ancestor", newMainSha, "feature"], {
      cwd: fx.wtPath,
    });
    assert.equal(ancestorCheck.status, 0, "rebased feature branch must contain the new main tip");
  } finally {
    fx.cleanup();
  }
});

test("AC-006: dirty primary — main sync skipped without mutating primary, worktree cleanup still proceeds", () => {
  const fx = makeFixture({ withWorktree: true });
  try {
    // Merge via the primary itself so the local main ref already reflects
    // the merge before the primary goes dirty (a pull that never runs
    // couldn't otherwise deliver it).
    mergeFeatureViaPrimary(fx.primaryPath);
    fs.writeFileSync(path.join(fx.primaryPath, "README.md"), "primary wip\n");

    const res = runSync(fx.wtPath);
    const report = parseReport(res.stdout);

    assert.equal(res.status, 0, res.stderr);
    assert.equal(report.main_sync, "skipped (dirty primary)");
    assert.equal(
      fs.readFileSync(path.join(fx.primaryPath, "README.md"), "utf-8"),
      "primary wip\n",
      "primary's uncommitted file must be untouched"
    );
    assert.equal(fs.existsSync(fx.wtPath), false);
    assert.equal(git(fx.primaryPath, ["branch", "--list", "feature"]).trim(), "");
  } finally {
    fx.cleanup();
  }
});

test("AC-007: --no-cleanup syncs main but leaves a finished worktree and branch untouched", () => {
  const fx = makeFixture({ withWorktree: true });
  try {
    mergeFeatureViaTempClone(fx.root, fx.originPath);

    const res = runSync(fx.wtPath, ["--no-cleanup"]);
    const report = parseReport(res.stdout);

    assert.equal(res.status, 0, res.stderr);
    assert.equal(report.main_sync, "updated");
    assert.equal(report.worktree_removed, "none");
    assert.equal(fs.existsSync(fx.wtPath), true);
    assert.notEqual(git(fx.primaryPath, ["branch", "--list", "feature"]).trim(), "");
    assert.match(git(fx.primaryPath, ["worktree", "list"]), /wt-feature/);
  } finally {
    fx.cleanup();
  }
});

test("AC-008: non-worktree run stays byte-compatible — worktree_mode=false and no worktree-mode fields", () => {
  const fx = makeFixture({ withWorktree: false });
  try {
    advanceMainViaTempClone(fx.root, fx.originPath);

    const res = runSync(fx.primaryPath);
    const report = parseReport(res.stdout);

    assert.equal(res.status, 0, res.stderr);
    assert.equal(report.worktree_mode, "false");
    assert.deepEqual(Object.keys(report), [
      "status",
      "remote",
      "default_branch",
      "main_updated_to",
      "current_branch",
      "worktree_mode",
      "stash",
      "rebase",
      "branches_cleaned",
      "worktrees_skipped",
      "errors",
    ]);
  } finally {
    fx.cleanup();
  }
});

test("sentinel: an untracked .mad-skills-auto file does not block worktree removal", () => {
  const fx = makeFixture({ withWorktree: true });
  try {
    mergeFeatureViaTempClone(fx.root, fx.originPath);
    fs.writeFileSync(path.join(fx.wtPath, ".mad-skills-auto"), "auto\n");
    const expectedWtPath = fs.realpathSync(fx.wtPath);

    const res = runSync(fx.wtPath);
    const report = parseReport(res.stdout);

    assert.equal(res.status, 0, res.stderr);
    assert.equal(report.worktree_removed, expectedWtPath);
    assert.equal(fs.existsSync(fx.wtPath), false);
  } finally {
    fx.cleanup();
  }
});
