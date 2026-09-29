/**
 * Shared YAML frontmatter parser for SKILL.md files.
 * Used by validate-skills.js and build-manifests.js.
 *
 * Handles the flat scalar subset SKILL.md uses: plain, single-quoted and
 * double-quoted scalars (optionally folded across indented lines), and
 * block scalars (`>`, `|`, with `-` / `+` chomping indicators).
 */

const BLOCK_HEADER = /^([|>])([+-]?)$/;

function unquote(value) {
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\(["\\\/nt])/g, (_, c) =>
      ({ n: "\n", t: "\t" })[c] ?? c,
    );
  }
  return value;
}

function blockScalar(style, chomp, lines) {
  const indents = lines.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length);
  const indent = indents.length ? Math.min(...indents) : 0;
  const body = lines.map((l) => l.slice(indent));

  let text;
  if (style === "|") {
    text = body.join("\n");
  } else {
    // Folded: single newlines become spaces, blank lines become newlines.
    text = body.reduce((acc, line, i) => {
      if (i === 0) return line;
      if (line === "") return acc + "\n";
      return acc.endsWith("\n") || acc === "" ? acc + line : acc + " " + line;
    }, "");
  }

  const content = text.replace(/\n+$/, "");
  if (chomp === "-") return content;
  if (chomp === "+") return text + "\n";
  return content + "\n";
}

export function parseFrontmatter(content) {
  // Normalise line endings (CRLF → LF) for cross-platform support
  const normalised = content.replace(/\r\n/g, "\n");
  const match = normalised.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const result = {};
  const lines = match[1].split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (line.startsWith(" ") || line.startsWith("\t")) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const raw = line.slice(colonIdx + 1).trim();

    // Gather the indented (or blank) lines that belong to this key.
    const continuation = [];
    while (
      i + 1 < lines.length &&
      (lines[i + 1].startsWith(" ") || lines[i + 1].startsWith("\t") || !lines[i + 1].trim())
    ) {
      continuation.push(lines[++i]);
    }
    while (continuation.length && !continuation[continuation.length - 1].trim()) {
      continuation.pop();
    }

    const header = raw.match(BLOCK_HEADER);
    if (header) {
      result[key] = blockScalar(header[1], header[2], continuation);
      continue;
    }

    const folded = [raw, ...continuation.map((l) => l.trim())].filter(Boolean).join(" ");
    result[key] = unquote(folded);
  }

  return result;
}
