#!/usr/bin/env node
'use strict';

/**
 * Session Guard — Claude Code project health validation
 *
 * Replaces the shell-based session-guard.sh + session-guard-prompt.sh with a
 * single Node.js entry point using subcommand dispatch.
 *
 * Subcommands:
 *   check   — SessionStart: validate git, AGENTS.md/CLAUDE.md, tasks, staleness
 *   remind  — UserPromptSubmit: re-emit pending context on first prompt
 *   handoff — SessionStart: inject the armed build/waybill handoff slots
 *   handoff-arm | handoff-clear | handoff-clean | handoff-path — manage handoff slots
 *
 * Usage:
 *   node session-guard.js check
 *   node session-guard.js remind
 *   node session-guard.js handoff-arm --kind build --spec specs/x.md
 */

const { existsSync, mkdirSync } = require('fs');
const { join, basename, dirname } = require('path');
const { spawn } = require('child_process');

const config = require('./lib/config.cjs');
const state = require('./lib/state.cjs');
const { OutputBuilder } = require('./lib/output.cjs');
const { getBanner } = require('./lib/banner.cjs');
const { checkGit } = require('./lib/git-checks.cjs');
const { checkTaskList } = require('./lib/task-checks.cjs');
const { checkStaleness, judgeStaleness } = require('./lib/staleness.cjs');
const { git } = require('./lib/utils.cjs');
const lifecycle = require('./lib/lifecycle.cjs');
const handoff = require('./lib/handoff.cjs');
const ledger = require('./lib/logbook.cjs');
const { readHookInput, nonemptyString } = require('./lib/session.cjs');
const { resolveInstructions } = require('./lib/instructions.cjs');

const command = process.argv[2];
const hookInput = readHookInput(command);
const PROJECT_DIR = nonemptyString(hookInput.cwd) || process.env.CLAUDE_PROJECT_DIR || process.cwd();
const SESSION_ID = nonemptyString(hookInput.session_id)
  || process.env.MAD_SKILLS_SESSION_ID || process.env.CODEX_THREAD_ID || '';
// AGENTS.md is canonical; CLAUDE.md is only the primary when AGENTS.md is absent.
const INSTRUCTIONS = resolveInstructions(PROJECT_DIR);
const INSTRUCTIONS_MD = INSTRUCTIONS.primary || INSTRUCTIONS.agentsPath;
const INSTRUCTIONS_NAME = basename(INSTRUCTIONS_MD);

// Staleness prompt options. Updates always target AGENTS.md; when CLAUDE.md
// carries its own content, offer to move it rather than doing so silently.
function stalenessOptions(info) {
  const update = 'review project structure, deps, recent changes';
  if (!info.hasAgents) {
    return [
      `"Migrate to AGENTS.md and update" \u2014 move CLAUDE.md content into a new AGENTS.md, ${update} and update AGENTS.md (preserve user-written notes), then replace CLAUDE.md with \`@AGENTS.md\``,
      `"Update CLAUDE.md in place" \u2014 ${update} and update CLAUDE.md (preserve user-written notes)`,
      '"Show signals" \u2014 list what\'s drifted before deciding',
      '"Skip" \u2014 continue with current CLAUDE.md',
    ];
  }
  if (info.needsMigration) {
    return [
      `"Update AGENTS.md and move CLAUDE.md content into it" \u2014 ${update} and update AGENTS.md (preserve user-written notes); merge CLAUDE.md's own sections into AGENTS.md and replace CLAUDE.md with \`@AGENTS.md\``,
      `"Update AGENTS.md only" \u2014 ${update} and update AGENTS.md (preserve user-written notes); leave CLAUDE.md as is`,
      '"Show signals" \u2014 list what\'s drifted before deciding',
      '"Skip" \u2014 continue with current AGENTS.md',
    ];
  }
  return [
    `"Update it" \u2014 ${update} and update AGENTS.md (preserve user-written notes)${info.needsPointer ? '; write \`@AGENTS.md\` to CLAUDE.md' : ''}`,
    '"Show signals" \u2014 list what\'s drifted before deciding',
    '"Skip" \u2014 continue with current AGENTS.md',
  ];
}

// ─── check ─────────────────────────────────────────────────────────────
// Runs at SessionStart. Spawns background worker and exits immediately
// so the Claude Code UI stays responsive.

function check() {
  // Dedup: skip if recently checked (handles dual global+project registration)
  if (state.isRecentlyChecked(PROJECT_DIR, 5, SESSION_ID)) {
    console.log(JSON.stringify({}));
    return;
  }

  // Write in-progress marker immediately (also serves as dedup guard)
  state.saveInProgress(PROJECT_DIR, SESSION_ID);

  // Emit empty response — SessionStart returns instantly
  console.log(JSON.stringify({}));

  // Spawn background worker for heavy checks
  // windowsHide: true prevents a console window from flashing on Windows
  const worker = spawn(process.execPath, [__filename, 'check-bg'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, CLAUDE_PROJECT_DIR: PROJECT_DIR, MAD_SKILLS_SESSION_ID: SESSION_ID },
  });
  worker.unref();
}

// ─── check-bg ──────────────────────────────────────────────────────────
// Runs as a detached background process. Performs all validation and
// writes results to the state file for remind() to pick up.

function checkBackground() {
  const output = new OutputBuilder();

  // Banner — shown once per session at start
  output.add(getBanner());
  output.blank();

  // 0) Git repository validation
  const { gitRoot } = checkGit(PROJECT_DIR, output);

  // 1) Project instructions existence
  if (!INSTRUCTIONS.primary) {
    output.add('[SESSION GUARD] \u26A0\uFE0F  No AGENTS.md or CLAUDE.md found in project root.');
    output.addQuestion(
      'No AGENTS.md or CLAUDE.md found. Want me to set up project instructions?',
      'single_select',
      [
        '"Set up with /brace" \u2014 scaffold AGENTS.md (with a CLAUDE.md pointer) + project structure (specs, tools, context)',
        '"Basic init" \u2014 run `/init`, then move the result to AGENTS.md and leave CLAUDE.md as `@AGENTS.md`',
        '"Skip" \u2014 continue without one',
      ],
    );
    saveState(output);
    return;
  }

  output.add(`[SESSION GUARD] \u2705 ${INSTRUCTIONS_NAME} found in: ${PROJECT_DIR}`);
  if (INSTRUCTIONS.hasAgents && INSTRUCTIONS.needsMigration) {
    output.add('[SESSION GUARD] \u2139\uFE0F  CLAUDE.md also carries its own content \u2014 AGENTS.md is canonical; CLAUDE.md should just be `@AGENTS.md`.');
  } else if (INSTRUCTIONS.hasAgents && INSTRUCTIONS.needsPointer) {
    output.add('[SESSION GUARD] \u2139\uFE0F  CLAUDE.md does not reference AGENTS.md \u2014 write `@AGENTS.md` to CLAUDE.md so Claude Code loads it.');
  } else if (!INSTRUCTIONS.hasAgents) {
    output.add('[SESSION GUARD] \u2139\uFE0F  No AGENTS.md \u2014 the next update will migrate CLAUDE.md to AGENTS.md and leave CLAUDE.md as `@AGENTS.md`.');
  }

  // 1b) Project scaffold check
  checkBrace(PROJECT_DIR, output);

  // 1c) Rig (dev tooling) check
  checkRig(PROJECT_DIR, output);

  // 2) Task List ID
  checkTaskList(PROJECT_DIR, gitRoot, output);

  // 3) Staleness evaluation
  checkStaleness(PROJECT_DIR, INSTRUCTIONS_MD, gitRoot, output);

  // 4) Lifecycle recommendation Lifecycle recommendation (ambient drift surface). SessionStart = one
  // session — bump the counter once so cooldowns advance.
  lifecycle.bumpSession(PROJECT_DIR);
  checkLifecycle(PROJECT_DIR, output);

  // 4c) LOGBOOK.md dirty check — capture/resolve/dismiss/add are plain
  // writeFileSync calls with no git integration, so entries can silently sit
  // uncommitted between /ship runs. A warning, not an auto-commit: committing
  // on the user's behalf would land LOGBOOK.md onto whatever branch happens
  // to be checked out.
  checkLogbookDirty(gitRoot, output);

  // 5) Staleness summary — heuristic score, optionally gated by a semantic
  // "does anything actually need updating?" judgment (null when disabled).
  const overThreshold = output.score >= config.staleness.threshold;
  const materialP = overThreshold ? judgeStaleness(PROJECT_DIR, INSTRUCTIONS_MD, output.signals) : null;
  const judgedFine = materialP !== null && materialP < config.staleness.judgedSuppressBelow;
  if (overThreshold && !judgedFine) {
    output.blank();
    output.add(`[SESSION GUARD] \u26A0\uFE0F  ${INSTRUCTIONS_NAME} appears STALE (score: ${output.score}/${config.staleness.threshold})`);
    output.blank();
    output.add('Signals:');
    output.signals.forEach(sig => output.add(`  ${sig}`));
    if (materialP !== null) output.add(`  Semantic check: P(update needed) = ${materialP.toFixed(2)}`);
    output.addQuestion(
      `${INSTRUCTIONS_NAME} appears out of date (${output.signals.length} signals detected). What would you like to do?`,
      'single_select',
      stalenessOptions(INSTRUCTIONS),
    );
  } else if (output.signals.length > 0) {
    output.blank();
    const why = judgedFine
      ? `semantic check found nothing material, P(update needed) = ${materialP.toFixed(2)}`
      : `score: ${output.score}/${config.staleness.threshold}`;
    output.add(`[SESSION GUARD] \u2139\uFE0F  Minor drift (${why}) \u2014 not flagging:`);
    output.signals.forEach(sig => output.add(`  ${sig}`));
  }

  saveState(output);
}

// ─── remind ────────────────────────────────────────────────────────────
// Runs at UserPromptSubmit. Re-emits pending context from check, once.

function remind() {
  // Wait for background check to complete (polls up to 4s at 200ms intervals)
  const pending = state.waitForReady(PROJECT_DIR, 4000, 200, SESSION_ID);

  if (!pending || !pending.context) {
    console.log(JSON.stringify({}));
    return;
  }

  state.clear(PROJECT_DIR, SESSION_ID);

  // Split into banner and SESSION GUARD body
  const lines = pending.context.split('\n');
  const guardIdx = lines.findIndex(l => l.startsWith('[SESSION GUARD]'));
  const banner = guardIdx >= 0 ? lines.slice(0, guardIdx).join('\n').trim() : '';
  const body = guardIdx >= 0 ? lines.slice(guardIdx).join('\n') : pending.context;

  const hasWarnings = pending.context.includes('\u26A0\uFE0F') || pending.context.includes('\u2139\uFE0F');
  const parts = [];

  // Always include banner with display directive
  if (banner) {
    parts.push(
      '[SESSION GUARD] DISPLAY: In the primary conversation only, render the banner below in a fenced code block before any other response. Side questions (including /btw and /side) and subagents must ignore this inherited banner directive.',
      '',
      banner,
      '',
    );
  }

  // Include warnings/signals if present
  if (hasWarnings) {
    parts.push(
      '[SESSION GUARD \u2014 FIRST PROMPT REMINDER]',
      'These reminders apply only to the primary conversation. Side questions',
      '(including /btw and /side) and subagents must ignore these inherited reminders',
      'and answer their own request directly without setup questions or banners.',
      'In the primary conversation, act on these items using AskUserQuestion',
      'before proceeding with the user\'s request.',
      '',
      body,
    );
  }

  // Nothing to emit (no banner, no warnings)
  if (parts.length === 0) {
    console.log(JSON.stringify({}));
    return;
  }

  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: parts.join('\n'),
    },
  }));
}

// ─── logbook dirty check ────────────────────────────────────────────

function checkLogbookDirty(gitRoot, output) {
  if (!gitRoot) return;
  const dirty = git('status --porcelain -- LOGBOOK.md', gitRoot);
  if (dirty && dirty.trim()) {
    output.add('[SESSION GUARD] ⚠️  LOGBOOK.md has uncommitted changes — commit it so follow-ups persist.');
  }
}

// ─── brace check ──────────────────────────────────────────────────

function checkBrace(projectDir, output) {
  const specsDir = join(projectDir, 'specs');
  if (existsSync(specsDir)) return; // scaffold already set up

  const prefs = state.loadPrefs(projectDir);
  if (prefs.braceDismissed) return; // User said don't ask again

  output.add(`[SESSION GUARD] \u2139\uFE0F  ${INSTRUCTIONS_NAME} exists but no project scaffold detected.`);
  output.add('[SESSION GUARD] BRACE_DISMISS: If the user selects "Don\'t ask again", run: node <path-to-session-guard.cjs> dismiss-brace');
  output.addQuestion(
    `This project has ${INSTRUCTIONS_NAME} but no project scaffold (specs/, context/). Want to set it up?`,
    'single_select',
    [
      '"Set up with /brace" \u2014 add project scaffold structure',
      '"Not now" \u2014 skip for this session',
      '"Don\'t ask again" \u2014 dismiss permanently for this project',
    ],
    'low',
  );
}

// ─── rig check ────────────────────────────────────────────────────

const PLATFORM_MARKERS = [
  'package.json', 'pyproject.toml', 'requirements.txt', 'setup.py',
  'go.mod', 'Cargo.toml', 'Gemfile', 'pom.xml', 'build.gradle',
];

const INFRA_MARKERS = [
  'lefthook.yml', '.lefthook.yml',                                    // git hooks
  '.husky',                                                           // git hooks (alt)
  '.gitmessage',                                                      // commit template
  '.github/pull_request_template.md',                                 // PR template (GitHub)
  '.azuredevops/pull_request_template.md',                            // PR template (Azure)
  '.github/workflows',                                                // CI (GitHub Actions)
  'azure-pipelines.yml',                                              // CI (Azure DevOps)
  '.gitlab-ci.yml',                                                   // CI (GitLab)
  'Jenkinsfile',                                                      // CI (Jenkins)
  '.circleci',                                                        // CI (CircleCI)
];

function checkRig(projectDir, output) {
  const prefs = state.loadPrefs(projectDir);
  if (prefs.rigDismissed) return;

  // Need at least one platform
  const hasPlatform = PLATFORM_MARKERS.some(f => existsSync(join(projectDir, f)));
  if (!hasPlatform) return;

  // If any infra marker exists, rig is (at least partially) set up
  const hasInfra = INFRA_MARKERS.some(f => existsSync(join(projectDir, f)));
  if (hasInfra) return;

  output.add('[SESSION GUARD] \u2139\uFE0F  Project has code but no dev tooling (hooks, CI, PR templates) detected.');
  output.add('[SESSION GUARD] RIG_DISMISS: If the user selects "Don\'t ask again", run: node <path-to-session-guard.cjs> dismiss-rig');
  output.addQuestion(
    'No dev tooling detected (git hooks, CI, PR templates, commit templates). Want to set it up?',
    'single_select',
    [
      '"Set up with /rig" \u2014 configure lefthook, CI workflow, PR template, commit template',
      '"Not now" \u2014 skip for this session',
      '"Don\'t ask again" \u2014 dismiss permanently for this project',
    ],
    'low',
  );
}

// ─── lifecycle recommendation check ───────────────────────────────────

function checkLifecycle(projectDir, output) {
  try {
    const { offer } = lifecycle.evaluate(projectDir, { surface: 'session-guard' });
    if (!offer) return;

    const passive = offer.reArm === 'drift' || offer.presentation === 'drift';
    if (passive) {
      output.blank();
      output.add(`[SESSION GUARD] 🧭 Lifecycle: ${offer.prompt}`);
      output.add(`[SESSION GUARD] → Consider: ${offer.offers}`);
      output.add(`[SESSION GUARD] LIFECYCLE_DISMISS: to stop this, run: node ${__filename} lifecycle-dismiss ${offer.id}`);
      return;
    }

    // Causal (first) offer — prompt for consent.
    output.add(`[SESSION GUARD] 🧭 Lifecycle: the next step (${offer.offers}) is available.`);
    output.add(`[SESSION GUARD] LIFECYCLE_DISMISS: "Not now" → run: node ${__filename} lifecycle-dismiss ${offer.id}`);
    output.add(`[SESSION GUARD] LIFECYCLE_MUTE: "Never" → run: node ${__filename} lifecycle-mute ${offer.id}`);
    output.addQuestion(
      offer.prompt,
      'single_select',
      [
        `"Set it up now" — invoke ${offer.offers}`,
        '"Not now" — skip; re-offer only when the project changes',
        '"Never" — mute this recommendation for this project',
      ],
      'low',
    );
  } catch { /* CON-003: degrade to silence */ }
}

// ─── helpers ───────────────────────────────────────────────────────────

/** Print a lifecycle offer block to stdout (shared by lifecycle-complete/-checkpoint). */
function printOffer(offer) {
  if (offer) {
    console.log('LIFECYCLE_OFFER_BEGIN');
    console.log(`The next lifecycle step is available: ${offer.offers}`);
    console.log(offer.prompt);
    console.log(`Present this to the user with AskUserQuestion: options "Set it up now" (invoke ${offer.offers}) / "Not now" (run: node ${__filename} lifecycle-dismiss ${offer.id}) / "Never" (run: node ${__filename} lifecycle-mute ${offer.id}).`);
    console.log('LIFECYCLE_OFFER_END');
  } else {
    console.log('LIFECYCLE_OFFER_NONE');
  }
}

/** Save check results to state file (used by background worker, no stdout). */
function saveState(output) {
  state.save(PROJECT_DIR, {
    context: output.parts.join('\n'),
    score: output.score,
    signals: output.signals,
  }, SESSION_ID);
}

// ─── dispatch ──────────────────────────────────────────────────────────

switch (command) {
  case 'check':
    check();
    break;
  case 'remind':
    remind();
    break;
  case 'check-bg':
    try {
      checkBackground();
    } catch {
      // Background worker failed — clear in-progress marker so remind()
      // doesn't hang waiting. Graceful degradation: no context this session.
      state.clear(PROJECT_DIR, SESSION_ID);
    }
    break;
  case 'dismiss-brace': {
    const prefs = state.loadPrefs(PROJECT_DIR);
    prefs.braceDismissed = true;
    state.savePrefs(PROJECT_DIR, prefs);
    console.log(`BRACE prompt dismissed for ${PROJECT_DIR}`);
    break;
  }
  case 'dismiss-rig': {
    const prefs = state.loadPrefs(PROJECT_DIR);
    prefs.rigDismissed = true;
    state.savePrefs(PROJECT_DIR, prefs);
    console.log(`Rig prompt dismissed for ${PROJECT_DIR}`);
    break;
  }
  case 'lifecycle-dismiss': {
    try {
      const rec = process.argv[3];
      const lc = lifecycle.loadLifecyclePrefs(PROJECT_DIR);
      const sig = lifecycle.computeSignature(PROJECT_DIR);
      lc.recs = lc.recs || {};
      lc.recs[rec] = {
        status: 'dismissed',
        dismissedSlice: lifecycle.sliceFor(sig, rec),
        dismissedTier: lifecycle.tier(sig),
        dismissedMetric: sig.size,
        lastOfferedSession: lifecycle.currentSession(PROJECT_DIR),
      };
      lifecycle.saveLifecyclePrefs(PROJECT_DIR, lc);
      console.log(`Lifecycle recommendation '${rec}' dismissed for ${PROJECT_DIR}`);
    } catch (e) { console.error(`lifecycle-dismiss failed: ${e.message}`); }
    break;
  }
  case 'lifecycle-mute': {
    try {
      const rec = process.argv[3];
      const lc = lifecycle.loadLifecyclePrefs(PROJECT_DIR);
      lc.recs = lc.recs || {};
      lc.recs[rec] = { status: 'muted' };
      lifecycle.saveLifecyclePrefs(PROJECT_DIR, lc);
      console.log(`Lifecycle recommendation '${rec}' muted for ${PROJECT_DIR}`);
    } catch (e) { console.error(`lifecycle-mute failed: ${e.message}`); }
    break;
  }
  case 'lifecycle-mute-all': {
    try {
      const lc = lifecycle.loadLifecyclePrefs(PROJECT_DIR);
      lc.mutedAll = true;
      lifecycle.saveLifecyclePrefs(PROJECT_DIR, lc);
      console.log(`All lifecycle recommendations muted for ${PROJECT_DIR}`);
    } catch (e) { console.error(`lifecycle-mute-all failed: ${e.message}`); }
    break;
  }
  case 'lifecycle-unmute': {
    try {
      const rec = process.argv[3];
      const lc = lifecycle.loadLifecyclePrefs(PROJECT_DIR);
      if (rec === 'all') {
        lc.mutedAll = false;
      } else if (lc.recs) {
        delete lc.recs[rec];
      }
      lifecycle.saveLifecyclePrefs(PROJECT_DIR, lc);
      console.log(`Lifecycle recommendation '${rec}' unmuted for ${PROJECT_DIR}`);
    } catch (e) { console.error(`lifecycle-unmute failed: ${e.message}`); }
    break;
  }
  case 'lifecycle-complete': {
    try {
      const raw = process.argv[3];
      // dock/hoist both satisfy the single 'release' rec — normalize so the
      // marker is written as .mad/state/release.json (where selectOffer looks).
      const skill = (raw === 'dock' || raw === 'hoist') ? 'release' : raw;
      const ranAt = new Date().toISOString();
      const sig = lifecycle.computeSignature(PROJECT_DIR);
      lifecycle.writeMarker(PROJECT_DIR, skill, lifecycle.sliceFor(sig, skill), ranAt);
      const { offer } = lifecycle.evaluate(PROJECT_DIR, { surface: 'skill-completion', sourceSkill: skill });
      printOffer(offer);
    } catch (e) { console.error(`lifecycle-complete failed: ${e.message}`); }
    break;
  }
  case 'lifecycle-checkpoint': {
    // AC-007: resurface a deferred offer at end of /ship — no marker written.
    try {
      const { offer } = lifecycle.evaluate(PROJECT_DIR, { surface: 'session-guard' });
      printOffer(offer);
    } catch (e) { console.error(`lifecycle-checkpoint failed: ${e.message}`); }
    break;
  }
  case 'lifecycle-next': {
    // /logbook overview (plan step 7): on-demand list of every applicable step,
    // bypassing anti-nag suppression. Read-only.
    try {
      const { all } = lifecycle.next(PROJECT_DIR);
      const pending = handoff.peek(PROJECT_DIR).build;
      console.log('LIFECYCLE_NEXT_BEGIN');
      if (pending) {
        const spec = handoff.specArtifact(pending);
        const since = new Date(pending.createdAt).toISOString().slice(0, 10);
        console.log(`${pending.resume || `/build ${spec ? spec.path : ''}`} — spec ready since ${since}`);
      }
      if (!all.length && !pending) {
        console.log('none — no lifecycle steps are applicable right now.');
      } else {
        for (const r of all) {
          const tag = r.status === 'dismissed' ? ' [previously dismissed]' : '';
          console.log(`${r.offers} — ${r.prompt}${tag}`);
        }
      }
      console.log('LIFECYCLE_NEXT_END');
    } catch (e) { console.error(`lifecycle-next failed: ${e.message}`); }
    break;
  }
  case 'handoff': {
    // SessionStart: inject armed build/waybill slots (one-shot, then swept).
    let text = '';
    try { text = handoff.consume(PROJECT_DIR, nonemptyString(hookInput.source)); } catch { /* never block session start */ }
    if (text) {
      const output = new OutputBuilder();
      output.add(text);
      console.log(output.toJson('SessionStart'));
    } else {
      console.log(JSON.stringify({}));
    }
    break;
  }
  case 'handoff-arm':
  case 'handoff-clear':
  case 'handoff-clean':
  case 'handoff-path': {
    const flags = handoff.parseFlags(process.argv.slice(3));
    const dir = typeof flags.dir === 'string' ? flags.dir : process.cwd();
    try {
      if (command === 'handoff-arm') {
        const r = handoff.arm({ ...flags, dir });
        if (r.skipped) {
          console.log(`handoff: kept existing ${r.skipped} waybill; auto-checkpoint skipped`);
        } else {
          for (const n of r.notices) console.log(n);
          const id = r.waybill && r.waybill.id ? ` (waybill id=${r.waybill.id.slice(0, 8)})` : '';
          console.log(`handoff: armed ${flags.kind} for ${r.repo.repoRoot}${id}`);
        }
      } else if (command === 'handoff-clear') {
        for (const n of handoff.clear({ kind: flags.kind, source: typeof flags.source === 'string' ? flags.source : undefined, dir })) console.log(n);
        console.log(`handoff: cleared ${flags.kind}`);
      } else if (command === 'handoff-clean') {
        for (const line of handoff.clean({ yes: flags.yes === true, legacy: flags.legacy === true, dir })) console.log(line);
      } else {
        const file = handoff.defaultWaybillPath(handoff.resolveRepo(dir), ['build', 'checkpoint'].includes(flags.kind) ? flags.kind : 'waybill');
        mkdirSync(dirname(file), { recursive: true });
        console.log(file);
      }
    } catch (e) {
      console.error(`${command} failed: ${e.message}`);
      console.error('Usage: handoff-arm --kind build|waybill [--spec P] [--waybill P] [--resume CMD] [--source S] [--owned true|false] [--dir D]');
      console.error('       handoff-clear --kind build|waybill|all [--source S] [--dir D]');
      console.error('       handoff-clean [--yes] [--legacy] [--dir D]');
      console.error('       handoff-path [--kind build|waybill|checkpoint] [--dir D]');
      process.exit(1);
    }
    break;
  }
  case 'logbook-hint': {
    // Passive cold-start line — gated to startup|resume by the hooks.json
    // matcher, silent on an empty ledger (REQ-042/043, AC-007/008).
    try {
      const n = ledger.count(PROJECT_DIR);
      const output = new OutputBuilder();
      if (n > 0) output.add(`[SESSION GUARD] 📌 ${n} open follow-up${n === 1 ? '' : 's'} — /logbook to review`);
      if (n > 0) console.log(output.toJson('SessionStart'));
    } catch (e) { console.error(`logbook-hint failed: ${e.message}`); }
    break;
  }
  case 'logbook-list': {
    // Numbered open ledger grouped by category — the /logbook pull surface.
    try {
      const open = ledger.openItems(PROJECT_DIR);
      if (!open.length) { console.log('LOGBOOK_LIST_EMPTY'); break; }
      console.log('LOGBOOK_LIST_BEGIN');
      let n = 0;
      let cat = null;
      for (const it of open) {
        if (it.category !== cat) { cat = it.category; console.log(`## ${ledger.HEADINGS[cat]}`); }
        const link = it.link ? ` [${it.link}]` : '';
        console.log(`${++n}. ${it.title} — ${it.source} (${it.date})${link}`);
      }
      console.log('LOGBOOK_LIST_END');
    } catch (e) { console.error(`logbook-list failed: ${e.message}`); }
    break;
  }
  case 'logbook-capture': {
    // Auto-capture from /build & /ship debrief; arg is a JSON array of items.
    try {
      const items = JSON.parse(process.argv[3] || '[]');
      const r = ledger.capture(PROJECT_DIR, items);
      const relocated = r.relocationCandidates.map((c) => c.title);
      console.log(`LOGBOOK_CAPTURED added:${r.added} deduped:${r.deduped.length} relocated:${JSON.stringify(relocated)}`);
    } catch (e) { console.error(`logbook-capture failed: ${e.message}`); }
    break;
  }
  case 'logbook-resolve': {
    try {
      const it = ledger.resolve(PROJECT_DIR, process.argv[3]);
      console.log(it ? `Resolved: ${it.title}` : `No open item at ${process.argv[3]}`);
    } catch (e) { console.error(`logbook-resolve failed: ${e.message}`); }
    break;
  }
  case 'logbook-dismiss': {
    try {
      const it = ledger.dismiss(PROJECT_DIR, process.argv[3]);
      console.log(it ? `Dismissed: ${it.title}` : `No open item at ${process.argv[3]}`);
    } catch (e) { console.error(`logbook-dismiss failed: ${e.message}`); }
    break;
  }
  case 'logbook-add': {
    try {
      const argv = process.argv.slice(3);
      const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
      const title = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--'))).join(' ');
      const { item, relocationCandidates } = ledger.add(PROJECT_DIR, { title, category: flag('--category') || 'ideas', link: flag('--link') || null });
      console.log(item ? `Added: ${item.title} (${item.category})` : 'Nothing added');
      if (relocationCandidates.length) console.log(`Relocated to archive (cap reached): ${JSON.stringify(relocationCandidates.map((c) => c.title))}`);
    } catch (e) { console.error(`logbook-add failed: ${e.message}`); }
    break;
  }
  case 'logbook-review': {
    // Assisted cleanup: silently auto-resolve linked items (REQ-030), then
    // surface free-text likely-done/stale candidates for user-confirmed
    // resolution (REQ-031/032 — never resolved here without confirmation).
    try {
      const resolved = ledger.autoResolveLinked(PROJECT_DIR);
      if (resolved.length) console.log(`LOGBOOK_AUTORESOLVED ${JSON.stringify(resolved.map((i) => i.title))}`);
      const cands = ledger.reviewCandidates(PROJECT_DIR);
      if (!cands.length) { console.log('LOGBOOK_REVIEW_EMPTY'); break; }
      console.log('LOGBOOK_REVIEW_BEGIN');
      for (const c of cands) console.log(`${c.selector}. ${c.item.title} — ${c.reason}`);
      console.log('LOGBOOK_REVIEW_END');
    } catch (e) { console.error(`logbook-review failed: ${e.message}`); }
    break;
  }
  case 'logbook-capture-preview': {
    // Non-mutating dry-run of logbook-capture — the breach-time triage prompt
    // shows this before the real capture writes anything (REQ-006/008).
    try {
      const items = JSON.parse(process.argv[3] || '[]');
      const r = ledger.previewCapture(PROJECT_DIR, items);
      console.log('LOGBOOK_CAPTURE_PREVIEW_BEGIN');
      console.log(`would_add:${r.added} would_dedupe:${r.deduped.length}`);
      if (!r.relocationCandidates.length) {
        console.log('would_relocate: none');
      } else {
        r.relocationCandidates.forEach((c, i) => {
          console.log(`${i + 1}. ${c.title} — ${c.category} · ${c.source} (${c.date})`);
        });
      }
      console.log('LOGBOOK_CAPTURE_PREVIEW_END');
    } catch (e) { console.error(`logbook-capture-preview failed: ${e.message}`); }
    break;
  }
  case 'logbook-restore': {
    try {
      const r = ledger.restore(PROJECT_DIR, process.argv[3]);
      if (!r.restored) { console.log(`No relocatable item at ${process.argv[3]}`); break; }
      console.log(`Restored: ${r.restored.title}`);
      if (r.relocationCandidates.length) {
        console.log(`Relocated (cap reached): ${JSON.stringify(r.relocationCandidates.map((c) => c.title))}`);
      }
    } catch (e) { console.error(`logbook-restore failed: ${e.message}`); }
    break;
  }
  case 'logbook-archive': {
    try {
      const { relocated, history } = ledger.archiveView(PROJECT_DIR);
      if (!relocated.length && !history.length) { console.log('LOGBOOK_ARCHIVE_EMPTY'); break; }
      console.log('LOGBOOK_ARCHIVE_BEGIN');
      relocated.forEach((it, i) => {
        console.log(`a${i + 1}. ${it.title} — ${it.source} (${it.date}) [relocated:${it.relocatedDate}]`);
      });
      if (history.length) {
        console.log('-- history (not actionable) --');
        for (const it of history) {
          const marker = it.status === 'resolved' ? `resolved:${it.resolvedDate}` : `dismissed:${it.dismissedDate}`;
          console.log(`- ${it.title} — ${it.source} (${it.date}) [${marker}]`);
        }
      }
      console.log('LOGBOOK_ARCHIVE_END');
    } catch (e) { console.error(`logbook-archive failed: ${e.message}`); }
    break;
  }
  default:
    console.error(`Session Guard v${config.version}`);
    console.error('Usage: node session-guard.js <check|remind|dismiss-brace|dismiss-rig|lifecycle-dismiss|lifecycle-mute|lifecycle-mute-all|lifecycle-unmute|lifecycle-complete|lifecycle-checkpoint|lifecycle-next|handoff|handoff-arm|handoff-clear|handoff-clean|handoff-path|logbook-hint|logbook-list|logbook-capture|logbook-capture-preview|logbook-resolve|logbook-dismiss|logbook-add|logbook-review|logbook-archive|logbook-restore>');
    process.exit(1);
}
