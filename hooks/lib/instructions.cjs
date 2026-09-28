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

// A line "references" AGENTS.md if it is an @import, a markdown link, or
// prose that names the file. Headings and blank lines are ignored.
function isReferenceLine(line) {
  return /AGENTS\.md/.test(line);
}

function isHeadingLine(line) {
  return /^#{1,6}\s/.test(line);
}

function stripComments(content) {
  return content.replace(/<!--[\s\S]*?-->/g, '');
}

// True when CLAUDE.md holds nothing beyond a reference to AGENTS.md.
function isPointerOnly(content) {
  const lines = stripComments(content).split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.some(isReferenceLine)) return false;
  return lines.every(l => isReferenceLine(l) || isHeadingLine(l));
}

// True when the file has any substantive (non-blank, non-heading, non-reference) content.
function hasOwnContent(content) {
  const lines = stripComments(content).split('\n').map(l => l.trim()).filter(Boolean);
  return lines.some(l => !isReferenceLine(l) && !isHeadingLine(l));
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
  const claudeReferencesAgents = hasClaude && /AGENTS\.md/.test(claudeContent);

  const primary = hasAgents ? agentsPath : hasClaude ? claudePath : null;

  return {
    agentsPath,
    claudePath,
    hasAgents,
    hasClaude,
    claudeIsPointer,
    claudeHasContent,
    claudeReferencesAgents,
    primary,
    primaryName: primary ? basename(primary) : null,
    // Legacy CLAUDE.md: has content and does not import AGENTS.md. Extra notes
    // under an @AGENTS.md import are intentional Claude-only steering.
    needsMigration: hasClaude && claudeHasContent && !claudeReferencesAgents,
    // AGENTS.md exists but CLAUDE.md does not point at it.
    needsPointer: hasAgents && !claudeReferencesAgents,
  };
}

module.exports = {
  AGENTS_NAME,
  CLAUDE_NAME,
  POINTER_CONTENT,
  isPointerOnly,
  hasOwnContent,
  resolveInstructions,
};
