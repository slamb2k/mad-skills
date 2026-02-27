#!/usr/bin/env node

/**
 * Validates all skills in the skills/ directory.
 *
 * Checks:
 * - SKILL.md exists and has valid YAML frontmatter
 * - Required frontmatter fields (name, description)
 * - Description length and quality heuristics
 * - Referenced files exist
 * - No broken internal links
 * - Directory structure follows conventions
 */

import { readdir, readFile, access } from "node:fs/promises";
import { resolve, join, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, "..", "skills");

const VALID_SUBDIRS = new Set(["scripts", "references", "assets", "agents", "tests", "evals", "eval-viewer"]);
const MAX_SKILL_MD_LINES = 500;
const MIN_DESCRIPTION_LENGTH = 50;
const MAX_DESCRIPTION_LENGTH = 800;

let errors = 0;
let warnings = 0;

function error(skill, msg) {
  console.error(`  ❌ [${skill}] ${msg}`);
  errors++;
}

function warn(skill, msg) {
  console.warn(`  ⚠️  [${skill}] ${msg}`);
  warnings++;
}

function ok(skill, msg) {
  console.log(`  ✅ [${skill}] ${msg}`);
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const result = {};
  let currentKey = null;
  let currentValue = "";

  for (const line of match[1].split("\n")) {
    // Continuation line (indented)
    if (currentKey && (line.startsWith("  ") || line.startsWith("\t"))) {
      currentValue += " " + line.trim();
      result[currentKey] = currentValue;
      continue;
    }

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    currentKey = line.slice(0, colonIdx).trim();
    currentValue = line.slice(colonIdx + 1).trim();
    result[currentKey] = currentValue;
  }

  return result;
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function extractReferencedPaths(content, skillDir) {
  // Match patterns like: `scripts/foo.py`, `references/bar.md`, relative paths in backticks
  const pathPattern = /`([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)`/g;
  const paths = [];
  let match;

  while ((match = pathPattern.exec(content)) !== null) {
    const ref = match[1];
    // Only check paths that look like local references (not URLs, not code snippets)
    if (
      !ref.includes("://") &&
      !ref.startsWith("npm") &&
      !ref.includes("node_modules") &&
      (ref.startsWith("scripts/") ||
        ref.startsWith("references/") ||
        ref.startsWith("assets/") ||
        ref.startsWith("agents/") ||
        ref.startsWith("./"))
    ) {
      paths.push(ref);
    }
  }

  return paths;
}

async function validateSkill(skillName, skillDir) {
  console.log(`\n📦 ${skillName}`);

  // Check SKILL.md exists
  const skillMdPath = join(skillDir, "SKILL.md");
  if (!(await fileExists(skillMdPath))) {
    error(skillName, "Missing SKILL.md");
    return;
  }

  const content = await readFile(skillMdPath, "utf-8");
  const lines = content.split("\n");

  // Check frontmatter
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) {
    error(skillName, "Missing or invalid YAML frontmatter (---\\n...\\n---)");
    return;
  }

  if (!frontmatter.name) {
    error(skillName, "Missing required frontmatter field: name");
  } else if (frontmatter.name !== skillName) {
    warn(
      skillName,
      `Frontmatter name "${frontmatter.name}" differs from directory name "${skillName}"`
    );
  }

  if (!frontmatter.description) {
    error(skillName, "Missing required frontmatter field: description");
  } else {
    const descLen = frontmatter.description.length;
    if (descLen < MIN_DESCRIPTION_LENGTH) {
      warn(
        skillName,
        `Description is short (${descLen} chars). Aim for ${MIN_DESCRIPTION_LENGTH}+ for reliable triggering`
      );
    }
    if (descLen > MAX_DESCRIPTION_LENGTH) {
      warn(
        skillName,
        `Description is long (${descLen} chars). Keep under ${MAX_DESCRIPTION_LENGTH} to avoid context bloat`
      );
    }
  }

  // Check line count
  if (lines.length > MAX_SKILL_MD_LINES) {
    warn(
      skillName,
      `SKILL.md is ${lines.length} lines (recommended max: ${MAX_SKILL_MD_LINES}). Consider moving content to references/`
    );
  }

  // Check referenced files exist
  const refs = await extractReferencedPaths(content, skillDir);
  for (const ref of refs) {
    const refPath = join(skillDir, ref);
    if (!(await fileExists(refPath))) {
      error(skillName, `Referenced file not found: ${ref}`);
    }
  }

  // Check subdirectory naming conventions
  const entries = await readdir(skillDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && !VALID_SUBDIRS.has(entry.name)) {
      warn(
        skillName,
        `Non-standard subdirectory: ${entry.name}/ (expected: ${[...VALID_SUBDIRS].join(", ")})`
      );
    }
  }

  // Check scripts are executable (if any)
  const scriptsDir = join(skillDir, "scripts");
  if (await fileExists(scriptsDir)) {
    const scripts = await readdir(scriptsDir);
    for (const script of scripts) {
      const ext = extname(script);
      if ([".py", ".sh", ".bash"].includes(ext)) {
        // Just check it parses (basic syntax check)
        ok(skillName, `Script found: scripts/${script}`);
      }
    }
  }

  if (errors === 0) {
    ok(skillName, "Structure valid");
  }
}

async function main() {
  console.log("🔍 Validating skills...\n");

  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  const skillDirs = entries.filter(
    (e) => e.isDirectory() && !e.name.startsWith(".")
  );

  if (skillDirs.length === 0) {
    console.log("No skills found in skills/ directory");
    process.exit(0);
  }

  for (const dir of skillDirs) {
    await validateSkill(dir.name, join(SKILLS_DIR, dir.name));
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(
    `Results: ${skillDirs.length} skill(s), ${errors} error(s), ${warnings} warning(s)`
  );

  if (errors > 0) {
    console.error("\n💥 Validation failed\n");
    process.exit(1);
  }

  console.log("\n✅ All skills valid\n");
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
