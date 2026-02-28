#!/usr/bin/env node

/**
 * Claude Skills Installer CLI
 *
 * Usage:
 *   npx @your-scope/claude-skills                    # Install all skills
 *   npx @your-scope/claude-skills --list             # List available skills
 *   npx @your-scope/claude-skills --skill foo,bar    # Install specific skills
 *   npx @your-scope/claude-skills --target ./path    # Custom install path
 *   npx @your-scope/claude-skills --upgrade          # Upgrade existing skills
 */

import { readdir, readFile, mkdir, access, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_SRC = resolve(__dirname, "..", "skills");

const DEFAULT_TARGETS = [
  ".claude/skills", // Project-level (preferred)
  join(process.env.HOME ?? "~", ".claude", "skills"), // User-level fallback
];

const { values: args } = parseArgs({
  options: {
    list: { type: "boolean", default: false },
    skill: { type: "string", default: "" },
    target: { type: "string", default: "" },
    upgrade: { type: "boolean", default: false },
    force: { type: "boolean", short: "f", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
  strict: true,
});

if (args.help) {
  console.log(`
Claude Skills Installer

Usage:
  npx @your-scope/claude-skills [options]

Options:
  --list              List available skills with descriptions
  --skill <names>     Comma-separated skill names to install (default: all)
  --target <path>     Installation directory (default: .claude/skills)
  --upgrade           Overwrite existing skills
  --force, -f         Skip confirmation prompts
  --help, -h          Show this help

Examples:
  npx @your-scope/claude-skills --list
  npx @your-scope/claude-skills --skill git-workflow,mcp-builder
  npx @your-scope/claude-skills --target ./my-project/.claude/skills --upgrade
`);
  process.exit(0);
}

async function discoverSkills() {
  const entries = await readdir(SKILLS_SRC, { withFileTypes: true });
  const skills = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

    const skillMd = join(SKILLS_SRC, entry.name, "SKILL.md");
    try {
      await access(skillMd);
      const content = await readFile(skillMd, "utf-8");
      const frontmatter = parseFrontmatter(content);

      skills.push({
        name: entry.name,
        displayName: frontmatter.name ?? entry.name,
        description: frontmatter.description ?? "(no description)",
        path: join(SKILLS_SRC, entry.name),
      });
    } catch {
      // Skip directories without SKILL.md
    }
  }

  return skills;
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result = {};
  for (const line of match[1].split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    result[key] = value;
  }
  return result;
}

async function resolveTarget() {
  if (args.target) return resolve(args.target);

  // Prefer project-level if we're in a git repo or have .claude dir
  for (const candidate of DEFAULT_TARGETS) {
    const resolved = resolve(candidate);
    try {
      await access(dirname(resolved));
      return resolved;
    } catch {
      continue;
    }
  }

  return resolve(DEFAULT_TARGETS[0]);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Dependency management
// ---------------------------------------------------------------------------

const VALID_DEP_TYPES = new Set(["cli", "npm", "agent", "skill", "plugin"]);
const VALID_DEP_RESOLUTIONS = new Set(["url", "install", "ask", "fallback", "stop"]);

/**
 * Parse a markdown dependency table from instructions.md content.
 * Returns an array of { name, type, check, required, resolution, detail }.
 */
function parseDependencyTable(content) {
  const lines = content.split("\n");
  const deps = [];

  const headerIdx = lines.findIndex((l) =>
    /^\|\s*Dependency\s*\|/i.test(l)
  );
  if (headerIdx === -1) return deps;

  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith("|")) break;

    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 6) continue;

    const check = cells[2].replace(/^`|`$/g, "");
    deps.push({
      name: cells[0],
      type: cells[1],
      check: check === "—" || check === "-" || check === "" ? null : check,
      required: cells[3].toLowerCase() === "yes",
      resolution: cells[4],
      detail: cells[5].replace(/^`|`$/g, ""),
    });
  }

  return deps;
}

/**
 * Check whether a single dependency is available.
 * Returns true if found, false if missing.
 */
function checkDependency(dep, targetDir) {
  if (!dep.check) return true;

  try {
    switch (dep.type) {
      case "cli":
      case "npm":
        execSync(dep.check, { stdio: "ignore", timeout: 15000 });
        return true;
      case "agent":
      case "skill": {
        const p = dep.check.replace(/^~/, process.env.HOME ?? "~");
        if (existsSync(resolve(p))) return true;
        // For skill deps, also check inside the install target directory
        if (targetDir && dep.type === "skill") {
          const parts = dep.check.split("/");
          const idx = parts.indexOf("skills");
          if (idx !== -1 && idx + 1 < parts.length) {
            const targetPath = join(targetDir, parts[idx + 1], "SKILL.md");
            if (existsSync(targetPath)) return true;
          }
        }
        return false;
      }
      case "plugin":
        return false;
      default:
        return true;
    }
  } catch {
    return false;
  }
}

/**
 * Apply the resolution strategy for a missing dependency.
 * Returns "installed" | "warning" | "info".
 */
function resolveDependency(dep) {
  switch (dep.resolution) {
    case "stop":
    case "url": {
      const icon = dep.required ? "⚠" : "ℹ";
      console.log(`     ${icon}  ${dep.name} not found — ${dep.detail}`);
      return "warning";
    }
    case "install": {
      try {
        execSync(dep.detail, { stdio: "pipe", timeout: 60000 });
        console.log(`     ✅ ${dep.name} installed (ran: ${dep.detail})`);
        return "installed";
      } catch {
        console.log(
          `     ⚠  ${dep.name} auto-install failed — run manually: ${dep.detail}`
        );
        return "warning";
      }
    }
    case "ask": {
      console.log(
        `     ℹ  ${dep.name} not found — optional, install with: ${dep.detail}`
      );
      return "info";
    }
    case "fallback": {
      console.log(`     ℹ  ${dep.name} not found — ${dep.detail}`);
      return "info";
    }
    default:
      return "ok";
  }
}

/**
 * Check all dependencies declared in a skill's instructions.md.
 * Returns { installed, warnings } counts.
 */
async function checkSkillDependencies(skillName, targetDir) {
  const instructionsPath = join(targetDir, skillName, "instructions.md");
  let content;
  try {
    content = await readFile(instructionsPath, "utf-8");
  } catch {
    return { installed: 0, warnings: 0 };
  }

  const deps = parseDependencyTable(content);
  if (deps.length === 0) return { installed: 0, warnings: 0 };

  let installed = 0;
  let warnCount = 0;

  for (const dep of deps) {
    if (checkDependency(dep, targetDir)) continue;
    const result = resolveDependency(dep);
    if (result === "installed") installed++;
    if (result === "warning") warnCount++;
  }

  return { installed, warnings: warnCount };
}

async function installSkill(skill, targetDir) {
  const dest = join(targetDir, skill.name);
  const destExists = await exists(dest);

  if (destExists && !args.upgrade) {
    return { name: skill.name, status: "skipped" };
  }

  // Copy skill, filtering out CI-only directories
  await cpFiltered(skill.path, dest);

  return { name: skill.name, status: destExists ? "upgraded" : "installed" };
}

/**
 * Recursively copies a skill directory, excluding CI/test artefacts
 * that consumers don't need. Matches the .skill package exclusions.
 */
const INSTALL_EXCLUDE_DIRS = new Set([
  "tests",
  "evals",
  "__pycache__",
  "node_modules",
  ".git",
]);
const INSTALL_EXCLUDE_FILES = new Set([".DS_Store", ".gitkeep"]);

async function cpFiltered(src, dest) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      if (INSTALL_EXCLUDE_DIRS.has(entry.name)) continue;
      await cpFiltered(srcPath, destPath);
    } else if (entry.isFile()) {
      if (INSTALL_EXCLUDE_FILES.has(entry.name)) continue;
      if (entry.name.endsWith(".pyc")) continue;
      const { copyFile } = await import("node:fs/promises");
      await copyFile(srcPath, destPath);
    }
  }
}

async function main() {
  const skills = await discoverSkills();

  if (skills.length === 0) {
    console.error("No skills found in package. This is likely a packaging error.");
    process.exit(1);
  }

  // --list mode
  if (args.list) {
    console.log("\nAvailable skills:\n");
    const maxName = Math.max(...skills.map((s) => s.name.length));
    for (const skill of skills) {
      const desc =
        skill.description.length > 80
          ? skill.description.slice(0, 77) + "..."
          : skill.description;
      console.log(`  ${skill.name.padEnd(maxName + 2)} ${desc}`);
    }
    console.log(`\n${skills.length} skill(s) available\n`);
    process.exit(0);
  }

  // Filter skills if --skill specified
  let toInstall = skills;
  if (args.skill) {
    const requested = new Set(args.skill.split(",").map((s) => s.trim()));
    toInstall = skills.filter((s) => requested.has(s.name));
    const found = new Set(toInstall.map((s) => s.name));
    const missing = [...requested].filter((r) => !found.has(r));
    if (missing.length > 0) {
      console.error(`Unknown skills: ${missing.join(", ")}`);
      console.error(`Use --list to see available skills`);
      process.exit(1);
    }
  }

  const targetDir = await resolveTarget();
  await mkdir(targetDir, { recursive: true });

  console.log(`\nInstalling ${toInstall.length} skill(s) to ${targetDir}\n`);

  // Pass 1: Install all skills (file copy)
  const results = [];
  for (const skill of toInstall) {
    results.push(await installSkill(skill, targetDir));
  }

  // Pass 2: Print results and check dependencies
  let totalDepsInstalled = 0;
  let totalDepsWarnings = 0;

  for (const result of results) {
    if (result.status === "skipped") {
      console.log(`  ⏭  ${result.name} (exists, use --upgrade to overwrite)`);
    } else {
      console.log(`  ✅ ${result.name} (${result.status})`);
      const depResult = await checkSkillDependencies(result.name, targetDir);
      totalDepsInstalled += depResult.installed;
      totalDepsWarnings += depResult.warnings;
    }
  }

  const installed = results.filter((r) => r.status === "installed").length;
  const upgraded = results.filter((r) => r.status === "upgraded").length;
  const skipped = results.filter((r) => r.status === "skipped").length;

  console.log(
    `\nDone: ${installed} installed, ${upgraded} upgraded, ${skipped} skipped`
  );
  if (totalDepsInstalled > 0 || totalDepsWarnings > 0) {
    const parts = [];
    if (totalDepsInstalled > 0) {
      parts.push(
        `${totalDepsInstalled} ${totalDepsInstalled === 1 ? "dependency" : "dependencies"} installed`
      );
    }
    if (totalDepsWarnings > 0) {
      parts.push(
        `${totalDepsWarnings} ${totalDepsWarnings === 1 ? "warning" : "warnings"}`
      );
    }
    console.log(`  ${parts.join(", ")}`);
  }
  console.log();
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
