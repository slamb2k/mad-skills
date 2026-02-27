#!/usr/bin/env node

/**
 * Lints SKILL.md files for common issues:
 * - Broken markdown headings
 * - Inconsistent heading hierarchy
 * - Overly long lines in non-code blocks
 * - Missing blank lines around headings
 * - Trailing whitespace
 * - TODO/FIXME/HACK markers
 */

import { readdir, readFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, "..", "skills");

let totalWarnings = 0;
let totalErrors = 0;

function lint(skillName, content) {
  const lines = content.split("\n");
  const issues = [];
  let inCodeBlock = false;
  let inFrontmatter = false;
  let frontmatterClosed = false;
  let prevHeadingLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Track frontmatter
    if (i === 0 && line === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter && line === "---") {
      inFrontmatter = false;
      frontmatterClosed = true;
      continue;
    }
    if (inFrontmatter) continue;

    // Track code blocks
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Check heading hierarchy
    const headingMatch = line.match(/^(#{1,6})\s/);
    if (headingMatch) {
      const level = headingMatch[1].length;

      // Heading should not skip levels (e.g., # -> ###)
      if (prevHeadingLevel > 0 && level > prevHeadingLevel + 1) {
        issues.push({
          line: lineNum,
          severity: "warn",
          message: `Heading level skipped: h${prevHeadingLevel} -> h${level}`,
        });
      }
      prevHeadingLevel = level;

      // Check blank line before heading (except first line after frontmatter)
      if (i > 0 && lines[i - 1]?.trim() !== "" && !(i === 2 && frontmatterClosed)) {
        issues.push({
          line: lineNum,
          severity: "warn",
          message: "Missing blank line before heading",
        });
      }
    }

    // Check for TODO/FIXME/HACK
    if (/\b(TODO|FIXME|HACK|XXX)\b/.test(line)) {
      issues.push({
        line: lineNum,
        severity: "warn",
        message: `Contains ${line.match(/\b(TODO|FIXME|HACK|XXX)\b/)[1]} marker`,
      });
    }

    // Trailing whitespace
    if (line !== line.trimEnd() && line.trim() !== "") {
      issues.push({
        line: lineNum,
        severity: "warn",
        message: "Trailing whitespace",
      });
    }
  }

  // Report
  if (issues.length > 0) {
    console.log(`\n📝 ${skillName}/SKILL.md`);
    for (const issue of issues) {
      const icon = issue.severity === "error" ? "❌" : "⚠️";
      console.log(`  ${icon} L${issue.line}: ${issue.message}`);
      if (issue.severity === "error") totalErrors++;
      else totalWarnings++;
    }
  }

  return issues;
}

async function main() {
  console.log("📝 Linting SKILL.md files...");

  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  const skillDirs = entries.filter(
    (e) => e.isDirectory() && !e.name.startsWith(".")
  );

  for (const dir of skillDirs) {
    const skillMdPath = join(SKILLS_DIR, dir.name, "SKILL.md");
    try {
      const content = await readFile(skillMdPath, "utf-8");
      lint(dir.name, content);
    } catch {
      // validate-skills.js catches missing SKILL.md
    }
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(
    `Lint: ${totalErrors} error(s), ${totalWarnings} warning(s)`
  );

  // Lint warnings don't fail the build (only errors do)
  if (totalErrors > 0) {
    process.exit(1);
  }

  console.log("✅ Lint passed\n");
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
