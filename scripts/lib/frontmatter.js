/**
 * Shared YAML frontmatter parser for SKILL.md files.
 * Used by validate-skills.js and build-manifests.js.
 */

export function parseFrontmatter(content) {
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
