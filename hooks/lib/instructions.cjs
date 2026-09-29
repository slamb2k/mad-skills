'use strict';

/**
 * Project instructions file resolution.
 *
 * AGENTS.md is the canonical project instructions file. CLAUDE.md is kept as a
 * thin pointer (`@AGENTS.md`) so Claude Code still loads it, while every other
 * agent tool reads AGENTS.md directly. All updates target AGENTS.md. A CLAUDE.md
 * that imports AGENTS.md may keep Claude-only notes under the import; only a
 * CLAUDE.md with content and no AGENTS.md reference is offered a migration.
 */

const { existsSync, readFileSync } = require('fs');
const { join, basename } = require('path');

const AGENTS_NAME = 'AGENTS.md';
const CLAUDE_NAME = 'CLAUDE.md';
const POINTER_CONTENT = '@AGENTS.md\n';

// Claude Code only loads AGENTS.md through an `@AGENTS.md` import, on its own
// line or inline in prose. A markdown link or a sentence naming the file loads
// nothing, and imports inside code spans or fenced code blocks are not
// evaluated — so none of those count as pointing at AGENTS.md.
const IMPORT = /(^|\s)@(\.\/)?AGENTS\.md(?=$|[\s.,;:)])/;

function isHeadingLine(line) {
  return /^#{1,6}\s/.test(line);
}

function stripComments(content) {
  return content.replace(/<!--[\s\S]*?-->/g, '');
}

// Non-blank lines (comments stripped), each flagged when it imports AGENTS.md.
function classifyLines(content) {
  const out = [];
  let fence = null;
  for (const raw of stripComments(content).split('\n')) {
    const line = raw.trim();
    const marker = line.match(/^(```|~~~)/);
    if (marker) {
      fence = fence === marker[1] ? null : fence || marker[1];
      out.push({ line, isImport: false });
      continue;
    }
    if (!line) continue;
    out.push({ line, isImport: !fence && IMPORT.test(line.replace(/`[^`]*`/g, '')) });
  }
  return out;
}

function importsAgents(content) {
  return classifyLines(content).some(l => l.isImport);
}

// True when CLAUDE.md holds nothing beyond an @AGENTS.md import (and headings).
function isPointerOnly(content) {
  const lines = classifyLines(content);
  if (!lines.some(l => l.isImport)) return false;
  return lines.every(l => l.isImport || isHeadingLine(l.line));
}

// True when the file has any substantive (non-blank, non-heading, non-import) content.
function hasOwnContent(content) {
  return classifyLines(content).some(l => !l.isImport && !isHeadingLine(l.line));
}

function resolveInstructions(projectDir) {
  const agentsPath = join(projectDir, AGENTS_NAME);
  const claudePath = join(projectDir, CLAUDE_NAME);
  const hasAgents = existsSync(agentsPath);
  const hasClaude = existsSync(claudePath);

  let claudeContent = '';
  if (hasClaude) {
    try { claudeContent = readFileSync(claudePath, 'utf8'); } catch { claudeContent = ''; }
  }
  const claudeIsPointer = hasClaude && isPointerOnly(claudeContent);
  const claudeHasContent = hasClaude && hasOwnContent(claudeContent);
  const claudeImportsAgents = hasClaude && importsAgents(claudeContent);

  const primary = hasAgents ? agentsPath : hasClaude ? claudePath : null;

  return {
    agentsPath,
    claudePath,
    hasAgents,
    hasClaude,
    claudeIsPointer,
    claudeHasContent,
    claudeImportsAgents,
    primary,
    primaryName: primary ? basename(primary) : null,
    // Legacy CLAUDE.md: has content and does not import AGENTS.md. Extra notes
    // under an @AGENTS.md import are intentional Claude-only steering.
    needsMigration: hasClaude && claudeHasContent && !claudeImportsAgents,
    // AGENTS.md exists but CLAUDE.md does not point at it.
    needsPointer: hasAgents && !claudeImportsAgents,
  };
}

module.exports = {
  AGENTS_NAME,
  CLAUDE_NAME,
  POINTER_CONTENT,
  importsAgents,
  isPointerOnly,
  hasOwnContent,
  resolveInstructions,
};
