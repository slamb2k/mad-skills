/**
 * Loads the referenced/*.md files a SKILL.md points to, so eval runs see the
 * same content a skill's shared-reference-file convention actually relies on
 * (e.g. references/location-check.md, skills/build/references/pre-stage.md).
 * Without this, evals can only assert on text duplicated inline in SKILL.md.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

const REFERENCE_PATH_RE = /references\/[\w./-]+\.md/g;

export function extractReferencePaths(skillContent) {
  return [...new Set(skillContent.match(REFERENCE_PATH_RE) ?? [])];
}

export async function loadReferencedFiles(skillDir, repoRoot, skillContent) {
  const sections = [];
  for (const relPath of extractReferencePaths(skillContent)) {
    for (const candidate of [join(skillDir, relPath), join(repoRoot, relPath)]) {
      try {
        const content = await readFile(candidate, "utf-8");
        sections.push(`<reference path="${relPath}">\n${content}\n</reference>`);
        break;
      } catch {
        // not at this candidate path, try the next
      }
    }
  }
  return sections.join("\n\n");
}
