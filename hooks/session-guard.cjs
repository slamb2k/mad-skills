#!/usr/bin/env node
'use strict';

/**
 * Session Guard — Claude Code project health validation
 *
 * Replaces the shell-based session-guard.sh + session-guard-prompt.sh with a
 * single Node.js entry point using subcommand dispatch.
 *
 * Subcommands:
 *   check   — SessionStart: validate git, CLAUDE.md, tasks, staleness
 *   remind  — UserPromptSubmit: re-emit pending context on first prompt
 *
 * Usage:
 *   node session-guard.js check
 *   node session-guard.js remind
 */

const { existsSync } = require('fs');
const { join } = require('path');
const { spawn } = require('child_process');

const config = require('./lib/config.cjs');
const state = require('./lib/state.cjs');
const { OutputBuilder } = require('./lib/output.cjs');
const { getBanner } = require('./lib/banner.cjs');
const { checkGit } = require('./lib/git-checks.cjs');
const { checkTaskList } = require('./lib/task-checks.cjs');
const { checkStaleness } = require('./lib/staleness.cjs');
const { git } = require('./lib/utils.cjs');
const lifecycle = require('./lib/lifecycle.cjs');
const ledger = require('./lib/logbook.cjs');

const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const CLAUDE_MD = join(PROJECT_DIR, 'CLAUDE.md');

// ─── check ─────────────────────────────────────────────────────────────
// Runs at SessionStart. Spawns background worker and exits immediately
// so the Claude Code UI stays responsive.

function check() {
  // Dedup: skip if recently checked (handles dual global+project registration)
  if (state.isRecentlyChecked(PROJECT_DIR)) {
    console.log(JSON.stringify({}));
    return;
  }

  // Write in-progress marker immediately (also serves as dedup guard)
  state.saveInProgress(PROJECT_DIR);

  // Emit empty response — SessionStart returns instantly
  console.log(JSON.stringify({}));

  // Spawn background worker for heavy checks
  // windowsHide: true prevents a console window from flashing on Windows
  const worker = spawn(process.execPath, [__filename, 'check-bg'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, CLAUDE_PROJECT_DIR: PROJECT_DIR },
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

  // 1) CLAUDE.md existence
  if (!existsSync(CLAUDE_MD)) {
    output.add('[SESSION GUARD] \u26A0\uFE0F  No CLAUDE.md found in project root.');
    output.addQuestion(
      'No CLAUDE.md found. Want me to set up this project for Claude Code?',
      'single_select',
      [
        '"Set up with /brace" \u2014 scaffold CLAUDE.md + project structure (specs, tools, context)',
        '"Basic init" \u2014 run `/init` to scaffold CLAUDE.md only',
        '"Skip" \u2014 continue without one',
      ],
    );
    saveState(output);
    return;
  }

  output.add(`[SESSION GUARD] \u2705 CLAUDE.md found in: ${PROJECT_DIR}`);

  // 1b) Project scaffold check
  checkBrace(PROJECT_DIR, output);

  // 1c) Rig (dev tooling) check
  checkRig(PROJECT_DIR, output);

  // 2) Task List ID
  checkTaskList(PROJECT_DIR, gitRoot, output);

  // 3) Staleness evaluation
  checkStaleness(PROJECT_DIR, CLAUDE_MD, gitRoot, output);

  // 4) Pending build check
  checkPendingBuild(PROJECT_DIR, output);

  // 4b) Lifecycle recommendation (ambient drift surface). SessionStart = one
  // session — bump the counter once so cooldowns advance.
  lifecycle.bumpSession(PROJECT_DIR);
  checkLifecycle(PROJECT_DIR, output);

  // 4c) LOGBOOK.md dirty check — capture/resolve/dismiss/add are plain
  // writeFileSync calls with no git integration, so entries can silently sit
  // uncommitted between /ship runs. A warning, not an auto-commit: committing
  // on the user's behalf would land LOGBOOK.md onto whatever branch happens
  // to be checked out.
  checkLogbookDirty(gitRoot, output);

  // 5) Staleness summary
  if (output.score >= config.staleness.threshold) {
    output.blank();
    output.add(`[SESSION GUARD] \u26A0\uFE0F  CLAUDE.md appears STALE (score: ${output.score}/${config.staleness.threshold})`);
    output.blank();
    output.add('Signals:');
    output.signals.forEach(sig => output.add(`  ${sig}`));
    output.addQuestion(
      `CLAUDE.md appears out of date (${output.signals.length} signals detected). What would you like to do?`,
      'single_select',
      [
        '"Update it" \u2014 review project structure, deps, recent changes and update CLAUDE.md (preserve user-written notes)',
        '"Show signals" \u2014 list what\'s drifted before deciding',
        '"Skip" \u2014 continue with current CLAUDE.md',
      ],
    );
  } else if (output.signals.length > 0) {
    output.blank();
    output.add(`[SESSION GUARD] \u2139\uFE0F  Minor drift (score: ${output.score}/${config.staleness.threshold}) \u2014 not flagging:`);
    output.signals.forEach(sig => output.add(`  ${sig}`));
  }

  saveState(output);
}

// ─── remind ────────────────────────────────────────────────────────────
// Runs at UserPromptSubmit. Re-emits pending context from check, once.

function remind() {
  // Wait for background check to complete (polls up to 4s at 200ms intervals)
  const pending = state.waitForReady(PROJECT_DIR);

  if (!pending || !pending.context) {
    console.log(JSON.stringify({}));
    return;
  }

  state.clear(PROJECT_DIR);

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
      '[SESSION GUARD] DISPLAY: Render the banner below in a fenced code block before any other response.',
      '',
      banner,
      '',
    );
  }

  // Include warnings/signals if present
  if (hasWarnings) {
    parts.push(
      '[SESSION GUARD \u2014 FIRST PROMPT REMINDER]',
      'The following was detected at session start. Act on these items NOW using',
      'AskUserQuestion BEFORE proceeding with the user\'s request.',
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

  output.add('[SESSION GUARD] \u2139\uFE0F  CLAUDE.md exists but no project scaffold detected.');
  output.add('[SESSION GUARD] BRACE_DISMISS: If the user selects "Don\'t ask again", run: node <path-to-session-guard.cjs> dismiss-brace');
  output.addQuestion(
    'This project has a CLAUDE.md but no project scaffold (specs/, context/). Want to set it up?',
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

// ─── pending build check ──────────────────────────────────────────────

function checkPendingBuild(projectDir, output) {
  const pending = state.loadPendingBuild(projectDir);
  if (!pending) return;

  const specPath = pending.specPath;
  const specExists = existsSync(join(projectDir, specPath));

  if (!specExists) {
    // Spec file was deleted — clean up stale marker
    state.clearPendingBuild(projectDir);
    return;
  }

  output.blank();
  output.add(`[SESSION GUARD] 📋 Pending spec ready for build: ${specPath}`);
  output.add(`[SESSION GUARD] → Run: /build ${specPath}`);
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
  });
}

// ─── dispatch ──────────────────────────────────────────────────────────

const command = process.argv[2];

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
      state.clear(PROJECT_DIR);
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
      console.log('LIFECYCLE_NEXT_BEGIN');
      if (!all.length) {
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
  case 'logbook-hint': {
    // Passive cold-start line — gated to startup|resume by the hooks.json
    // matcher, silent on an empty ledger (REQ-042/043, AC-007/008).
    try {
      const n = ledger.count(PROJECT_DIR);
      if (n > 0) console.log(`[SESSION GUARD] 📌 ${n} open follow-up${n === 1 ? '' : 's'} — /logbook to review`);
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
    console.error('Usage: node session-guard.js <check|remind|dismiss-brace|dismiss-rig|lifecycle-dismiss|lifecycle-mute|lifecycle-mute-all|lifecycle-unmute|lifecycle-complete|lifecycle-checkpoint|lifecycle-next|logbook-hint|logbook-list|logbook-capture|logbook-capture-preview|logbook-resolve|logbook-dismiss|logbook-add|logbook-review|logbook-archive|logbook-restore>');
    process.exit(1);
}
