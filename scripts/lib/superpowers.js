/**
 * Shared Superpowers detection helper.
 * Soft-dependency, on-disk anchor check — used by speccy/build/ship pre-flight.
 */

import os from "node:os";
import fs from "node:fs";
import path from "node:path";

const ANCHOR = "using-superpowers/SKILL.md";
const MAX_DEPTH = 5;

function anchorExists(dir) {
  try {
    return fs.existsSync(path.join(dir, ANCHOR));
  } catch {
    return false;
  }
}

function findAnchorDir(root, depth = 0) {
  if (depth > MAX_DEPTH) return null;

  if (anchorExists(root)) return root;

  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const child = path.join(root, entry.name);
    const hit = findAnchorDir(child, depth + 1);
    if (hit) return hit;
  }

  return null;
}

export function detectSuperpowers({
  homedir = os.homedir(),
  cwd = process.cwd(),
} = {}) {
  const roots = [
    path.join(homedir, ".claude", "plugins"),
    path.join(homedir, ".claude", "skills", "superpowers"),
    path.join(cwd, ".claude", "skills"),
  ];

  for (const root of roots) {
    const hit = findAnchorDir(root);
    if (hit) {
      return { installed: true, basePath: hit };
    }
  }

  return { installed: false, basePath: null };
}
