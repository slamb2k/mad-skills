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

// Pull an inline (non-function) code block out of sync.sh by anchoring on two
// unique strings, so the sweep-loop test drives the real loop body rather than
// a copy — same "stay in sync with source" contract as extractFunction.
function extractSnippet(startMarker, endMarker) {
  const s = SYNC_SRC.indexOf(startMarker);
  assert.ok(s >= 0, `start marker not found: ${startMarker}`);
  const e = SYNC_SRC.indexOf(endMarker, s);
  assert.ok(e >= 0, `end marker not found: ${endMarker}`);
  return SYNC_SRC.slice(s, e + endMarker.length);
}

const SWEEP_LOOP = extractSnippet(
  "# Closed-not-merged PRs (REQ-014)",
  "done < <(git worktree list --porcelain 2>/dev/null)"
);

const HARNESS = `#!/usr/bin/env bash
set -uo pipefail
PLATFORM="\${PLATFORM:-github}"
${extractFunction("worktree_path_for_branch")}

${extractFunction("prepare_branch_for_delete")}

${extractFunction("pr_state_for_branch")}

SKIPPED=()
CLEANED=()
CURRENT_BRANCH="\${CURRENT_BRANCH:-main}"
case "$1" in
  worktree_path_for_branch)
    worktree_path_for_branch "$2" ;;
  prepare_branch_for_delete)
    prepare_branch_for_delete "$2"
    rc=$?
    printf '%s\\n' "\${SKIPPED[@]}"
    exit "$rc" ;;
  pr_state_for_branch)
    pr_state_for_branch "$2" ;;
  sweep)
    ${SWEEP_LOOP}
    printf 'CLEANED=%s\\n' "\${CLEANED[*]-}" ;;
esac
`;

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf-8" });
}

// Fake `gh` / `az` on PATH so pr_state_for_branch never hits the network. Each
// reads a canned value from an env var; the branch arg is ignored.
const FAKE_GH = `#!/usr/bin/env bash
if [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  echo "\${FAKE_GH_STATE:-}"
  exit 0
fi
exit 1
`;

const FAKE_AZ = `#!/usr/bin/env bash
if [ "$1" = "repos" ] && [ "$2" = "pr" ] && [ "$3" = "list" ]; then
  echo "\${FAKE_AZ_ABANDONED_COUNT:-0}"
  exit 0
fi
exit 1
`;

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

  const fakeBin = fs.mkdtempSync(path.join(os.tmpdir(), "sync-cleanup-bin-"));
  fs.writeFileSync(path.join(fakeBin, "gh"), FAKE_GH, { mode: 0o755 });
  fs.writeFileSync(path.join(fakeBin, "az"), FAKE_AZ, { mode: 0o755 });

  // sentinel: write the .mad-skills-auto marker (default true).
  // diverge: add a committed change on the branch so it has unmerged commits
  //          (git branch -d would then refuse), exercising the -D fallback.
  function addWorktree(branch, { sentinel = true, diverge = false } = {}) {
    const wtPath = path.join(worktreesRoot, branch);
    git(repo, ["branch", branch]);
    git(repo, ["worktree", "add", wtPath, branch]);
    if (sentinel) fs.writeFileSync(path.join(wtPath, ".mad-skills-auto"), "auto\n");
    if (diverge) {
      fs.writeFileSync(path.join(wtPath, "work.txt"), "feature work\n");
      git(wtPath, ["add", "work.txt"]);
      git(wtPath, ["commit", "-q", "-m", "feature work"]);
    }
    return wtPath;
  }

  function run(fn, branch, env = {}) {
    try {
      const out = execFileSync(harnessPath, [fn, branch], {
        cwd: repo,
        encoding: "utf-8",
        env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, ...env },
      });
      return { code: 0, out };
    } catch (err) {
      return { code: err.status, out: err.stdout ?? "" };
    }
  }

  function cleanup() {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(worktreesRoot, { recursive: true, force: true });
    fs.rmSync(fakeBin, { recursive: true, force: true });
  }

  return { repo, worktreesRoot, addWorktree, run, cleanup };
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

// ── REQ-014: pr_state_for_branch normalizes closed-not-merged across platforms ──

test("pr_state_for_branch (github): a CLOSED-not-merged PR reports CLOSED", () => {
  const ctx = makeRepoWithWorktree();
  try {
    const { code, out } = ctx.run("pr_state_for_branch", "feature-x", { FAKE_GH_STATE: "CLOSED" });
    assert.equal(code, 0);
    assert.equal(out.trim(), "CLOSED");
  } finally {
    ctx.cleanup();
  }
});

// Regression: a squash-merged branch reports MERGED (not CLOSED) from
// `gh pr view --json state`, so it must never be treated as closed-not-merged.
test("pr_state_for_branch (github): a MERGED PR reports nothing", () => {
  const ctx = makeRepoWithWorktree();
  try {
    // Exit code is discarded by the real `$(pr_state_for_branch ...)` caller;
    // only the printed value matters.
    const { out } = ctx.run("pr_state_for_branch", "feature-x", { FAKE_GH_STATE: "MERGED" });
    assert.equal(out.trim(), "");
  } finally {
    ctx.cleanup();
  }
});

test("pr_state_for_branch (azdo): an abandoned PR (count > 0) reports CLOSED", () => {
  const ctx = makeRepoWithWorktree();
  try {
    const { code, out } = ctx.run("pr_state_for_branch", "feature-x", {
      PLATFORM: "azdo",
      FAKE_AZ_ABANDONED_COUNT: "1",
    });
    assert.equal(code, 0);
    assert.equal(out.trim(), "CLOSED");
  } finally {
    ctx.cleanup();
  }
});

test("pr_state_for_branch (azdo): no abandoned PR (count 0) reports nothing", () => {
  const ctx = makeRepoWithWorktree();
  try {
    const { out } = ctx.run("pr_state_for_branch", "feature-x", {
      PLATFORM: "azdo",
      FAKE_AZ_ABANDONED_COUNT: "0",
    });
    assert.equal(out.trim(), "");
  } finally {
    ctx.cleanup();
  }
});

// ── REQ-014: prepare_branch_for_delete removes sentinel-less worktrees too ──
// Previously it early-returned for any worktree lacking .mad-skills-auto; /build
// worktrees no longer carry the sentinel, so that path must now remove them.
test("prepare_branch_for_delete removes a worktree with NO sentinel", () => {
  const ctx = makeRepoWithWorktree();
  try {
    const wtPath = ctx.addWorktree("feature-nosentinel", { sentinel: false });
    assert.ok(!fs.existsSync(path.join(wtPath, ".mad-skills-auto")), "precondition: no sentinel");
    const { code, out } = ctx.run("prepare_branch_for_delete", "feature-nosentinel");
    assert.equal(code, 0, `expected success, got skip report: ${out}`);
    assert.equal(out.trim(), "", "no skip entries expected");
    assert.ok(!fs.existsSync(wtPath), "sentinel-less worktree should be removed");

    const worktreeList = git(ctx.repo, ["worktree", "list"]);
    assert.doesNotMatch(worktreeList, /feature-nosentinel/);
  } finally {
    ctx.cleanup();
  }
});

// ── REQ-014: the general-sweep loop cleans a closed-not-merged branch ──
// A live worktree whose branch has unmerged commits and a CLOSED PR gets its
// worktree removed and the branch force-deleted (-d refuses, -D succeeds).
test("general-sweep: a closed-not-merged branch's worktree is removed and branch force-deleted", () => {
  const ctx = makeRepoWithWorktree();
  try {
    // diverge: true gives the branch an unmerged commit, so once the worktree
    // is removed a plain `git branch -d` refuses and only the -D fallback deletes it.
    const wtPath = ctx.addWorktree("feature-closed", { diverge: true });

    const { code, out } = ctx.run("sweep", "", { FAKE_GH_STATE: "CLOSED" });
    assert.equal(code, 0, out);
    assert.match(out, /CLEANED=feature-closed/);
    assert.ok(!fs.existsSync(wtPath), "closed-branch worktree should be removed");

    const branches = git(ctx.repo, ["branch", "--format=%(refname:short)"]);
    assert.doesNotMatch(branches, /feature-closed/, "closed-not-merged branch should be deleted");
  } finally {
    ctx.cleanup();
  }
});
