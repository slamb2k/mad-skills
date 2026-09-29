'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');

const { importsAgents, isPointerOnly, hasOwnContent, resolveInstructions } = require('./instructions.cjs');

function dir(t) {
  const d = mkdtempSync(join(tmpdir(), 'instructions-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}

test('pointer detection accepts @AGENTS.md imports, inline or standalone, plus headings', () => {
  assert.equal(isPointerOnly('@AGENTS.md\n'), true);
  assert.equal(isPointerOnly('@./AGENTS.md\n'), true);
  assert.equal(isPointerOnly('# Project\n\nSee @AGENTS.md for instructions.\n'), true);
  assert.equal(isPointerOnly('<!-- managed -->\n@AGENTS.md\n'), true);
  assert.equal(isPointerOnly(''), false);
  assert.equal(isPointerOnly('# Project\n\nUse bun.\n'), false);
  assert.equal(isPointerOnly('@AGENTS.md\n\nAlso use bun.\n'), false);
});

test('links, prose mentions, and imports inside code do not import AGENTS.md', () => {
  assert.equal(importsAgents('See [AGENTS.md](./AGENTS.md) for instructions.\n'), false);
  assert.equal(importsAgents('Instructions live in AGENTS.md.\n'), false);
  assert.equal(importsAgents('Write `@AGENTS.md` to CLAUDE.md.\n'), false);
  assert.equal(importsAgents('```md\n@AGENTS.md\n```\n'), false);
  assert.equal(importsAgents('<!-- @AGENTS.md -->\n'), false);
  assert.equal(importsAgents('email@AGENTS.md.example\n'), false);
  assert.equal(isPointerOnly('# Project\n\nSee [AGENTS.md](./AGENTS.md) for instructions.\n'), false);
});

test('own-content detection ignores headings, comments and AGENTS.md imports', () => {
  assert.equal(hasOwnContent('@AGENTS.md\n'), false);
  assert.equal(hasOwnContent('# Title\n<!-- note -->\n'), false);
  assert.equal(hasOwnContent('# Title\n- Use uv for Python\n'), true);
});

test('resolveInstructions prefers AGENTS.md and reports migration/pointer needs', (t) => {
  const both = dir(t);
  writeFileSync(join(both, 'AGENTS.md'), '# P\n');
  writeFileSync(join(both, 'CLAUDE.md'), '# P\nUse bun.\n');
  let info = resolveInstructions(both);
  assert.equal(info.primaryName, 'AGENTS.md');
  assert.equal(info.needsMigration, true);
  assert.equal(info.needsPointer, true);

  writeFileSync(join(both, 'CLAUDE.md'), '@AGENTS.md\n');
  info = resolveInstructions(both);
  assert.equal(info.claudeIsPointer, true);
  assert.equal(info.needsMigration, false);
  assert.equal(info.needsPointer, false);

  const claudeOnly = dir(t);
  writeFileSync(join(claudeOnly, 'CLAUDE.md'), '# P\nUse bun.\n');
  info = resolveInstructions(claudeOnly);
  assert.equal(info.primaryName, 'CLAUDE.md');
  assert.equal(info.hasAgents, false);
  assert.equal(info.needsMigration, true);

  writeFileSync(join(both, 'CLAUDE.md'), '@AGENTS.md\n\n## Claude only\n- Use plan mode for refactors.\n');
  info = resolveInstructions(both);
  assert.equal(info.claudeHasContent, true);
  assert.equal(info.needsMigration, false, 'Claude-only notes under the import are intentional');
  assert.equal(info.needsPointer, false);

  const agentsOnly = dir(t);
  writeFileSync(join(agentsOnly, 'AGENTS.md'), '# P\n');
  info = resolveInstructions(agentsOnly);
  assert.equal(info.primaryName, 'AGENTS.md');
  assert.equal(info.needsPointer, true);
  assert.equal(info.needsMigration, false);

  assert.equal(resolveInstructions(dir(t)).primary, null);
});

test('a CLAUDE.md that only links to AGENTS.md still needs the pointer', (t) => {
  const d = dir(t);
  writeFileSync(join(d, 'AGENTS.md'), '# P\n');
  writeFileSync(join(d, 'CLAUDE.md'), '# P\n\nSee [AGENTS.md](./AGENTS.md) for instructions.\n');
  const info = resolveInstructions(d);
  assert.equal(info.claudeImportsAgents, false);
  assert.equal(info.needsPointer, true);
});

test('a CLAUDE.md with its own rules and a passing AGENTS.md mention is offered migration', (t) => {
  const d = dir(t);
  writeFileSync(join(d, 'AGENTS.md'), '# P\n');
  writeFileSync(join(d, 'CLAUDE.md'), '# P\n- Use bun.\n- Codex reads AGENTS.md.\n');
  const info = resolveInstructions(d);
  assert.equal(info.needsMigration, true);
  assert.equal(info.needsPointer, true);
});

test('Claude-only notes under an @AGENTS.md import need no migration', (t) => {
  const d = dir(t);
  writeFileSync(join(d, 'AGENTS.md'), '# P\n');
  writeFileSync(join(d, 'CLAUDE.md'), '@AGENTS.md\n\n- Prefer the Sonnet tier for subagents.\n');
  const info = resolveInstructions(d);
  assert.equal(info.needsMigration, false);
  assert.equal(info.needsPointer, false);
});
