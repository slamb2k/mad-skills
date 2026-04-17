#!/usr/bin/env node

/**
 * Builds a manifest.json with metadata for all skills.
 * Used by the CLI for --list and by downstream tooling.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "./lib/frontmatter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = resolve(__dirname, "..", "skills");
const MANIFEST_PATH = resolve(__dirname, "..", "skills", "manifest.json");

async function main() {
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  const skills = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

    const skillMdPath = join(SKILLS_DIR, entry.name, "SKILL.md");
    try {
      const content = await readFile(skillMdPath, "utf-8");
      const fm = parseFrontmatter(content);

      // Count lines for size indication
      const lineCount = content.split("\n").length;

      // Check for subdirectories
      const subEntries = await readdir(join(SKILLS_DIR, entry.name), {
        withFileTypes: true,
      });
      const subdirs = subEntries
        .filter((e) => e.isDirectory())
        .map((e) => e.name);

      skills.push({
        name: fm.name ?? entry.name,
        directory: entry.name,
        description: fm.description ?? "",
        lines: lineCount,
        hasScripts: subdirs.includes("scripts"),
        hasReferences: subdirs.includes("references"),
        hasAssets: subdirs.includes("assets"),
        hasTests: subdirs.includes("tests"),
      });
    } catch {
      // Skip non-skill directories
    }
  }

  const manifest = {
    generated: new Date().toISOString(),
    count: skills.length,
    skills,
  };

  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`✅ Manifest written: ${skills.length} skills`);
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
