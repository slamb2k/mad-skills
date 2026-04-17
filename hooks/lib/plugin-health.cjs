'use strict';

const { join } = require('path');
const { homedir } = require('os');
const { readdirSync } = require('fs');
const config = require('./config.cjs');
const state = require('./state.cjs');
const { readJson } = require('./utils.cjs');

/**
 * Plugin Health — detect performance anti-patterns in companion plugins.
 *
 * Checks:
 *   - Hookify enabled with no rules (pure overhead)
 *   - claude-mem missing SKIP_TOOLS for read-only tools
 *   - claude-mem context injection too high (when OMC also active)
 *
 * Signals are weight=0 (informational only, won't trigger staleness prompt).
 */

function checkPluginHealth(projectDir, output) {
  const prefs = state.loadPrefs(projectDir);
  if (prefs.pluginHealthDismissed) return;

  const settings = readJson(join(homedir(), '.claude', 'settings.json'));
  if (!settings) return; // No global settings — nothing to check

  const plugins = settings.enabledPlugins || {};

  checkHookify(projectDir, plugins, output);
  checkClaudeMem(plugins, output);
}

// ─── hookify ──────────────────────────────────────────────────────────

function checkHookify(projectDir, plugins, output) {
  const hookifyKey = Object.keys(plugins).find(k => k.includes('hookify'));
  if (!hookifyKey || plugins[hookifyKey] !== true) return; // Not enabled

  // Count rule files in project .claude/ directory
  let ruleCount = 0;
  try {
    const projectClaudeDir = join(projectDir, '.claude');
    const files = readdirSync(projectClaudeDir);
    ruleCount = files.filter(f => config.pluginHealth.hookify.rulePattern.test(f)).length;
  } catch { /* directory doesn't exist — zero rules */ }

  // Also check global .claude/ directory
  try {
    const globalClaudeDir = join(homedir(), '.claude');
    const files = readdirSync(globalClaudeDir);
    ruleCount += files.filter(f => config.pluginHealth.hookify.rulePattern.test(f)).length;
  } catch { /* noop */ }

  if (ruleCount === 0) {
    output.signals.push(
      '\u26A0 Hookify enabled but no rules configured \u2014 fires on every tool call for nothing. Run /brace or disable in settings',
    );
  }
}

// ─── claude-mem ───────────────────────────────────────────────────────

function checkClaudeMem(plugins, output) {
  const memKey = Object.keys(plugins).find(k => k.includes('claude-mem'));
  if (!memKey || plugins[memKey] !== true) return; // Not enabled

  const memSettings = readJson(join(homedir(), '.claude-mem', 'settings.json'));
  if (!memSettings) return; // No settings file

  // Check SKIP_TOOLS for read-only tools
  const currentSkip = (memSettings.CLAUDE_MEM_SKIP_TOOLS || '')
    .split(',')
    .map(t => t.trim())
    .filter(Boolean);

  const missing = config.pluginHealth.claudeMem.recommendedSkipTools
    .filter(t => !currentSkip.includes(t));

  if (missing.length > 0) {
    output.signals.push(
      `\u26A0 claude-mem observing read-only tools (${missing.join(', ')}) \u2014 run /brace to optimise`,
    );
  }

  // Check context injection levels (only flag if OMC is also active)
  const omcKey = Object.keys(plugins).find(k => k.includes('oh-my-claudecode'));
  const omcEnabled = omcKey && plugins[omcKey] === true;

  if (omcEnabled) {
    const obs = parseInt(memSettings.CLAUDE_MEM_CONTEXT_OBSERVATIONS, 10);
    if (!isNaN(obs) && obs > config.pluginHealth.claudeMem.maxObservations) {
      output.signals.push(
        `\u26A0 claude-mem CONTEXT_OBSERVATIONS=${obs} (recommended \u226420) \u2014 may bloat session context`,
      );
    }

    const sessions = parseInt(memSettings.CLAUDE_MEM_CONTEXT_SESSION_COUNT, 10);
    if (!isNaN(sessions) && sessions > config.pluginHealth.claudeMem.maxSessionCount) {
      output.signals.push(
        `\u26A0 claude-mem CONTEXT_SESSION_COUNT=${sessions} (recommended \u22645) \u2014 may bloat session context`,
      );
    }
  }
}

module.exports = { checkPluginHealth };
