// Tests for the worktree-cleanup helpers in sync.sh (REQ-007,
// specs/autonomous-execution-mode.md): worktree_path_for_branch and
// prepare_branch_for_delete. These are pure bash functions operating on real
// git state, so rather than running the full sync.sh (which needs a remote),
// we extract just the two functions and drive them against a throwaway repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SYNC_SH = new URL("./sync.sh", import.meta.url).pathname;
const SYNC_SRC = fs.readFileSync(SYNC_SH, "utf-8");

// Pull a `name() { ... }` bash function out of sync.sh by brace-matching, so
// this test stays in sync with the real implementation instead of a copy.
function extractFunction(name) {
  const start = SYNC_SRC.match(new RegExp(`^${name}\\s*\\(\\)\\s*\\{`, "m"));
  assert.ok(start, `function ${name} not found in sync.sh`);
  let i = start.index + start[0].length;
  let depth = 1;
  while (depth > 0 && i < SYNC_SRC.length) {
    if (SYNC_SRC[i] === "{") depth++;
    else if (SYNC_SRC[i] === "}") depth--;
    i++;
  }
  return SYNC_SRC.slice(start.index, i);
}

const HARNESS = `#!/usr/bin/env bash
set -uo pipefail
${extractFunction("worktree_path_for_branch")}

${extractFunction("prepare_branch_for_delete")}

SKIPPED=()
case "$1" in
  worktree_path_for_branch)
    worktree_path_for_branch "$2" ;;
  prepare_branch_for_delete)
    prepare_branch_for_delete "$2"
    rc=$?
    printf '%s\\n' "\${SKIPPED[@]}"
    exit "$rc" ;;
esac
`;

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf-8" });
}

function makeRepoWithWorktree() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "sync-cleanup-repo-"));
  git(repo, ["init", "-q", "-b", "main"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Test"]);
  fs.writeFileSync(path.join(repo, "README.md"), "hello\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "-q", "-m", "initial"]);

  const worktreesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sync-cleanup-wt-"));
  const harnessPath = path.join(repo, "harness.sh");
  fs.writeFileSync(harnessPath, HARNESS, { mode: 0o755 });

  function addWorktree(branch) {
    const wtPath = path.join(worktreesRoot, branch);
    git(repo, ["branch", branch]);
    git(repo, ["worktree", "add", wtPath, branch]);
    fs.writeFileSync(path.join(wtPath, ".mad-skills-auto"), "auto\n");
    return wtPath;
  }

  function run(fn, branch) {
    try {
      const out = execFileSync(harnessPath, [fn, branch], { cwd: repo, encoding: "utf-8" });
      return { code: 0, out };
    } catch (err) {
      return { code: err.status, out: err.stdout ?? "" };
    }
  }

  function cleanup() {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(worktreesRoot, { recursive: true, force: true });
  }

  return { repo, addWorktree, run, cleanup };
}

test("worktree_path_for_branch finds the worktree checked out for a branch", () => {
  const ctx = makeRepoWithWorktree();
  try {
    const wtPath = ctx.addWorktree("feature-x");
    const { code, out } = ctx.run("worktree_path_for_branch", "feature-x");
    assert.equal(code, 0);
    assert.equal(out.trim(), wtPath);
  } finally {
    ctx.cleanup();
  }
});

test("clean case: worktree with only the sentinel is removed and the branch becomes deletable", () => {
  const ctx = makeRepoWithWorktree();
  try {
    const wtPath = ctx.addWorktree("feature-clean");
    const { code, out } = ctx.run("prepare_branch_for_delete", "feature-clean");
    assert.equal(code, 0, `expected success, got skip report: ${out}`);
    assert.equal(out.trim(), "", "no skip entries expected");
    assert.ok(!fs.existsSync(wtPath), "worktree directory should be removed");

    const worktreeList = git(ctx.repo, ["worktree", "list"]);
    assert.doesNotMatch(worktreeList, /feature-clean/);

    // Branch is now free of its worktree and merged into main -> deletable.
    git(ctx.repo, ["branch", "-d", "feature-clean"]);
  } finally {
    ctx.cleanup();
  }
});

test("dirty case: worktree with a real change beyond the sentinel is skipped, not removed", () => {
  const ctx = makeRepoWithWorktree();
  try {
    const wtPath = ctx.addWorktree("feature-dirty");
    fs.writeFileSync(path.join(wtPath, "scratch.txt"), "uncommitted work\n");

    const { code, out } = ctx.run("prepare_branch_for_delete", "feature-dirty");
    assert.equal(code, 1);
    assert.match(out, /feature-dirty: worktree has uncommitted changes/);
    assert.ok(fs.existsSync(wtPath), "dirty worktree must not be removed");
    assert.ok(fs.existsSync(path.join(wtPath, ".mad-skills-auto")), "sentinel must be left in place");

    const worktreeList = git(ctx.repo, ["worktree", "list"]);
    assert.match(worktreeList, /feature-dirty/);
  } finally {
    ctx.cleanup();
  }
});
