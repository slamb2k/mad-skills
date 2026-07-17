'use strict';

/**
 * Lifecycle Recommendation Engine.
 *
 * Cheap project signature -> declarative registry -> single best "next skill"
 * offer, governed by signature-diff hysteresis (markers) + user prefs
 * (dismiss/mute). Pure selection logic (`selectOffer`) is IO-free and drives
 * every acceptance test; `evaluate` is the thin IO wrapper.
 */

const { existsSync, writeFileSync, mkdirSync, readdirSync } = require('fs');
const { join, dirname } = require('path');
const { git, readText, readJson } = require('./utils.cjs');
const state = require('./state.cjs');
const { detectSuperpowers } = require('./superpowers-core.cjs');

const COOLDOWN = 3; // sessions before the same dismissed rec may re-offer
const CODE_EXT = new Set([
  '.js', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs', '.rb',
  '.java', '.cs', '.cjs', '.mjs', '.sh',
]);
const MANIFESTS = {
  'package.json': 'node',
  'pyproject.toml': 'python',
  'go.mod': 'go',
  'Cargo.toml': 'rust',
};
const EXCLUDE_PREFIX = ['archive/', 'node_modules/', 'vendor/', '.git/'];
const TIER_ORDER = { small: 0, medium: 1, large: 2 };
const SERVER_DEPS = ['express', 'fastify', 'koa', 'hapi', '@nestjs/core', 'next'];
// Server-framework markers per language — a match means "this component is a
// service" (containerizable → /dock), regardless of what language it's in.
const SERVER_MARKERS = {
  python: /(fastapi|flask|django|uvicorn|gunicorn|starlette|aiohttp|tornado|sanic)/,
  go: /(gin-gonic|labstack\/echo|gofiber\/fiber|go-chi\/chi|gorilla\/mux|net\/http)/,
  ruby: /(rails|sinatra|\brack\b|puma)/,
  rust: /(actix-web|\baxum\b|rocket|warp|tower-http)/,
  dotnet: /(microsoft\.aspnetcore|microsoft\.net\.sdk\.web)/,
};
// Languages whose bare presence (no server, no Dockerfile) is a weak "publish
// me" signal — a lone Go/Rust/Python/Ruby/dotnet tree is usually a package/CLI.
const PUBLISHABLE_LANGS = ['python', 'rust', 'ruby', 'dotnet', 'go'];
const INFRA_TARGETS = new Set(['ghcr', 'vercel']); // targets that imply cloud infra

// ─── small helpers ─────────────────────────────────────────────────────

function safe(fn) {
  try { return fn(); } catch { return undefined; }
}

function norm(v) {
  return Array.isArray(v) ? [...v].sort() : (v === undefined ? null : v);
}

/** ADO pipeline YAML: azure-pipelines[*].yml (root or nested) or .azuredevops/*.yml. */
function isAdoPipelineFile(f) {
  return /(^|\/)azure-pipelines[^/]*\.ya?ml$/.test(f) ||
    (f.startsWith('.azuredevops/') && /\.ya?ml$/.test(f));
}

/** Sorted JSON compare — works for arrays (slices) and scalars (tiers). */
function deepEqualArr(a, b) {
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

function covers(coveredLangs, components) {
  return components.every(c => coveredLangs.includes(c.language));
}

function uncovered(sig) {
  return sig.components
    .map(c => c.language)
    .filter(l => !sig.ciCoveredLanguages.includes(l));
}

function tier(sig) {
  if (sig.size < 150) return 'small';
  if (sig.size <= 600) return 'medium';
  return 'large';
}

function rigged(sig) {
  // An Azure DevOps pipeline counts as rigged on its own: /rig scaffolds
  // GitHub Actions, and the per-language coverage regexes below are
  // GitHub-Actions-shaped — they can't read ADO task YAML (and an ADO pipeline
  // may package a prebuilt artifact with no language-setup step to detect), so
  // parsing coverage from it would false-nag /rig on a fully-CI'd ADO repo.
  return sig.hasCI && (sig.hasAdoPipeline || covers(sig.ciCoveredLanguages, sig.components));
}

function emptySignature() {
  return {
    size: 0, hasScaffold: false, components: [], hasCI: false, hasAdoPipeline: false, hasLefthook: false,
    ciCoveredLanguages: [], hasDockerfile: false, releaseTargets: [], hasIaC: false,
    iacTargets: [], envs: [], hasGraphifyOut: false, hasSuperpowers: false,
    hasServer: false, hasCompose: false, pkgBin: false, pkgLib: false, hasStatic: false,
  };
}

// ─── signature ─────────────────────────────────────────────────────────

// ponytail: in-process memo only — each hook is a fresh <50ms process, a
// cross-process disk cache would be pure overhead.
const _sigCache = new Map();

function excluded(p) {
  return EXCLUDE_PREFIX.some(pre => p.startsWith(pre));
}

function computeSignature(projectDir) {
  let key = null;
  try {
    const head = git('rev-parse HEAD', projectDir) || 'nohead';
    const dirty = (git('status --porcelain', projectDir) || '') !== '' ? 'd' : 'c';
    key = `${projectDir}|${head}|${dirty}`;
    if (_sigCache.has(key)) return _sigCache.get(key);
  } catch { key = null; }

  let sig;
  try {
    sig = _compute(projectDir);
  } catch {
    sig = emptySignature(); // CON-003: degrade to silence
  }
  if (key) _sigCache.set(key, sig);
  return sig;
}

function _compute(projectDir) {
  const sig = emptySignature();
  const lsRaw = git('ls-files --cached --others --exclude-standard', projectDir);
  const files = (lsRaw ? lsRaw.split('\n') : []).filter(f => f && !excluded(f));

  // size
  sig.size = files.filter(f => CODE_EXT.has(extOf(f))).length;

  // components
  for (const f of files) {
    const base = f.split('/').pop();
    let lang = MANIFESTS[base];
    if (!lang && base.endsWith('.gemspec')) lang = 'ruby';
    if (!lang && base.endsWith('.csproj')) lang = 'dotnet';
    if (!lang) continue;
    const dir = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '.';
    sig.components.push({ dir, language: lang, manifest: base });
  }

  // scaffold — ponytail: context/ optional — its absence must not re-nag
  // /brace on an obviously scaffolded repo (GUD-001, §10 silence).
  sig.hasScaffold = existsSync(join(projectDir, 'CLAUDE.md')) && existsSync(join(projectDir, 'specs'));

  // lefthook
  sig.hasLefthook = ['lefthook.yml', 'lefthook.yaml', '.lefthook.yml']
    .some(f => existsSync(join(projectDir, f)));

  // CI workflows
  const workflowFiles = files.filter(f =>
    (f.startsWith('.github/workflows/') && (f.endsWith('.yml') || f.endsWith('.yaml'))) ||
    isAdoPipelineFile(f),
  );
  sig.hasCI = workflowFiles.length > 0;
  // Broaden in lockstep with the filter — a repo whose only pipeline is
  // .azuredevops/foo.yml must still count as ADO, or rigged() false-nags /rig.
  sig.hasAdoPipeline = workflowFiles.some(isAdoPipelineFile);

  const ci = new Set();
  const rel = new Set();
  const envs = new Set();
  for (const wf of workflowFiles) {
    const txt = readText(join(projectDir, wf));
    if (!txt) continue;
    const t = txt.toLowerCase();
    if (/setup-node|actions\/setup-node|\bnpm\b|\bnode /.test(t)) ci.add('node');
    if (/setup-python|\bpip\b|pytest/.test(t)) ci.add('python');
    if (/setup-go\b/.test(t)) ci.add('go');
    if (/setup-rust|\bcargo\b/.test(t)) ci.add('rust');
    if (/setup-ruby/.test(t)) ci.add('ruby');
    if (/setup-dotnet/.test(t)) ci.add('dotnet');
    if (/setup-java/.test(t)) ci.add('java');

    if (/npm publish/.test(t)) rel.add('npm');
    if (/pypi|twine/.test(t)) rel.add('pypi');
    if (/actions\/deploy-pages|\bpages\b/.test(t)) rel.add('pages');
    if (/ghcr\.io|docker push/.test(t)) rel.add('ghcr');
    if (/homebrew/.test(t)) rel.add('homebrew');
    if (/vercel/.test(t)) rel.add('vercel');
    if (/cargo publish/.test(t)) rel.add('crates');

    // ADO deploy/publish tasks — the GitHub-Actions release regexes above don't
    // match ADO task YAML. Coarse 'ado-deploy' token: a non-empty releaseTargets
    // marks the pipeline as already handling release, so /dock isn't re-offered.
    // (Kept out of INFRA_TARGETS — it conflates publish and infra deploy.)
    if (/azurewebapp@|azurefunctionapp@|azurewebappcontainer@|azurefunctionappcontainer@|azurermwebappdeployment@|azurecontainerapps@|azurermresourcegroupdeployment@|azurecli@|kubernetesmanifest@|helm@|buildandpush|twineauthenticate|\bnuget push\b|az (webapp|functionapp|containerapp|staticwebapp|deployment) |func azure |\bdeployment:/.test(t)) rel.add('ado-deploy');

    let m;
    const re = /environment:\s*['"]?([a-z0-9_-]+)['"]?/g;
    while ((m = re.exec(t)) !== null) envs.add(m[1]);
    for (const name of ['dev', 'staging', 'prod', 'production']) {
      if (new RegExp(`\\b${name}\\b`).test(t)) envs.add(name === 'production' ? 'prod' : name);
    }
  }
  sig.ciCoveredLanguages = [...ci].sort();
  sig.releaseTargets = [...rel].sort();
  sig.envs = [...envs].sort();

  // Dockerfile (tracked, non-archive)
  sig.hasDockerfile = files.some(f => f.split('/').pop() === 'Dockerfile');

  // IaC
  const iac = [];
  for (const d of ['terraform', 'bicep', 'pulumi', 'cdk']) {
    if (existsSync(join(projectDir, d))) iac.push(d);
  }
  if (!iac.includes('terraform') && files.some(f => f.endsWith('.tf'))) iac.push('terraform');
  sig.iacTargets = iac.sort();
  sig.hasIaC = iac.length > 0;

  // install-type + release-selection signals
  sig.hasGraphifyOut = existsSync(join(projectDir, 'graphify-out'));
  sig.hasSuperpowers = detectSuperpowers({ cwd: projectDir }).installed;

  const rootPkg = sig.components.some(c => c.dir === '.' && c.language === 'node')
    ? readJson(join(projectDir, 'package.json'))
    : null;
  if (rootPkg) {
    sig.pkgBin = !!rootPkg.bin;
    // A publishable library — has an entry point and isn't marked private.
    // A private app with a `main` is deployed, not published.
    sig.pkgLib = !!((rootPkg.main || rootPkg.exports) && !rootPkg.private);
  }
  sig.hasServer = detectServer(projectDir, sig.components);
  sig.hasCompose = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']
    .some(f => existsSync(join(projectDir, f)));
  sig.hasStatic = ['index.html', join('public', 'index.html'), join('dist', 'index.html')]
    .some(f => existsSync(join(projectDir, f)));

  return sig;
}

function extOf(f) {
  const base = f.split('/').pop();
  const i = base.lastIndexOf('.');
  return i >= 0 ? base.slice(i) : '';
}

// ─── server detection (cross-language, for release selection) ──────────

function componentIsServer(projectDir, c) {
  const p = join(projectDir, c.dir, c.manifest);
  if (c.language === 'node') {
    const pkg = readJson(p);
    if (!pkg) return false;
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    return SERVER_DEPS.some(d => d in deps);
  }
  const re = SERVER_MARKERS[c.language];
  if (!re) return false;
  if (re.test((readText(p) || '').toLowerCase())) return true;
  if (c.language === 'python') {
    const reqs = readText(join(projectDir, c.dir, 'requirements.txt')) || '';
    return re.test(reqs.toLowerCase());
  }
  return false;
}

function detectServer(projectDir, components) {
  return components.some(c => safe(() => componentIsServer(projectDir, c)));
}

// ─── release selection (REQ-060) ───────────────────────────────────────

// /dock when the project reads as a service to containerize; /hoist when it
// reads as an installable package/CLI/static site; the sentinel only when a
// project genuinely carries strong signals of BOTH.
function releaseSelect(s) {
  const container = s.hasDockerfile || s.hasCompose || s.hasServer;
  // Strong publish intent: an explicit CLI, a publishable library, or a built
  // static site. (Weak language signal handled separately below.)
  const strongPublish = s.pkgBin || s.pkgLib || s.hasStatic;

  if (container && !strongPublish) return '/dock';
  if (strongPublish && !container) return '/hoist';
  if (container && strongPublish) return '/dock or /hoist'; // genuinely both

  // Neither strong signal: a lone Go/Rust/Python/Ruby/dotnet tree with no
  // server and no container artifact is almost always a package/CLI → /hoist.
  if (s.components.some(c => PUBLISHABLE_LANGS.includes(c.language))) return '/hoist';
  return '/dock or /hoist'; // truly ambiguous (e.g. a bare node app)
}

// ─── registry (PAT-001: data, real arrow fns) ──────────────────────────

const REGISTRY = [
  {
    id: 'graphify',
    offers: '/graphify',
    priority: 5,
    kind: 'install',
    tierBased: true,
    presentation: 'causal-then-drift',
    requires: s => s.size >= 150,
    satisfied: s => s.hasGraphifyOut,
    slice: s => tier(s),
    prompt: s => `Your codebase (${s.size} files) is large enough to benefit from a knowledge graph — build one with /graphify?`,
  },
  {
    id: 'superpowers',
    offers: 'claude plugin install superpowers',
    priority: 6,
    kind: 'install',
    presentation: 'causal',
    // ask-once: no slice — once dismissed only cooldown re-arms, never drift.
    requires: s => s.hasScaffold && !s.hasSuperpowers,
    satisfied: s => s.hasSuperpowers,
    prompt: () => "Superpowers (plan/build/finish methodology) isn't installed — MAD Skills can defer to it. Install superpowers?",
  },
  {
    id: 'brace',
    offers: '/brace',
    priority: 10,
    kind: 'lifecycle',
    presentation: 'causal',
    requires: s => s.size > 0 && !s.hasScaffold,
    satisfied: s => s.hasScaffold,
    prompt: () => 'This directory has content but no project scaffold — set up /brace?',
  },
  {
    id: 'rig',
    offers: '/rig',
    priority: 20,
    kind: 'lifecycle',
    presentation: 'causal-then-drift',
    requires: s => s.hasScaffold && s.components.length > 0,
    // ponytail: lefthook is a bonus signal, not mandatory — a repo whose CI
    // covers its languages is rigged enough; requiring lefthook would
    // false-nag /rig on mad-skills itself (GUD-001, §10 silence).
    satisfied: rigged,
    slice: s => s.components.map(c => c.language).sort(),
    prompt: s => `Code but no CI covering ${uncovered(s).join(', ') || 'your components'} — set up /rig?`,
  },
  {
    id: 'release',
    offers: '/dock or /hoist',
    priority: 30,
    kind: 'lifecycle',
    presentation: 'causal-then-drift',
    // ADO deploy YAML is now parsed (the 'ado-deploy' release token above), so an
    // ADO repo that already deploys reads releaseTargets non-empty → satisfied →
    // not offered, while a CI-only ADO repo can still be offered /dock or /hoist
    // (both are ADO-capable).
    requires: s => rigged(s) && (s.components.length > 0 || s.hasDockerfile) && s.releaseTargets.length === 0,
    satisfied: s => s.releaseTargets.length > 0,
    slice: s => [...s.components.map(c => c.language), s.hasDockerfile ? 'docker' : ''].filter(Boolean).sort(),
    select: s => releaseSelect(s),
    prompt: () => 'You have a releasable component but no release pipeline — publish it?',
  },
  {
    id: 'keel',
    offers: '/keel',
    priority: 40,
    kind: 'lifecycle',
    presentation: 'causal-then-drift',
    requires: s => s.releaseTargets.some(t => INFRA_TARGETS.has(t)) && !s.hasIaC,
    // ponytail: satisfied = any IaC present; matching IaC to specific targets
    // cheaply is not worth it — a repo with infra dirs is provisioned enough
    // (GUD-001 conservative).
    satisfied: s => s.hasIaC,
    slice: s => s.releaseTargets.filter(t => INFRA_TARGETS.has(t)).sort(),
    prompt: () => 'Your release target needs cloud infrastructure but none is provisioned — set up /keel?',
  },
  {
    id: 'rig-refresh',
    offers: '/rig',
    priority: 45,
    kind: 'lifecycle',
    presentation: 'drift',
    // ponytail: conservative — never a fresh offer; only re-arms on marker
    // drift once release/IaC targets change from the recorded slice (GUD-001).
    requires: s => s.releaseTargets.length > 0 || s.hasIaC,
    satisfied: () => true,
    slice: s => [...s.releaseTargets, ...s.iacTargets].sort(),
    prompt: () => 'Your release/infra targets changed — refresh CI with /rig?',
  },
  {
    id: 'envs',
    offers: '/keel',
    priority: 50,
    kind: 'lifecycle',
    presentation: 'causal-then-drift',
    // ponytail: conservative — only fires when a deploy exists and prod is
    // present without staging; empty env detection => silent (GUD-001).
    requires: s => (s.releaseTargets.length > 0 || s.hasIaC) && s.envs.includes('prod') && !s.envs.includes('staging'),
    satisfied: s => s.envs.includes('staging'),
    slice: s => s.envs.slice().sort(),
    select: s => (s.hasIaC ? '/keel' : '/dock'),
    prompt: () => 'You deploy to prod but have no staging environment — add one?',
  },
];

function recById(id) {
  return REGISTRY.find(r => r.id === id);
}

function sliceFor(sig, recId) {
  const rec = recById(recId);
  return rec && rec.slice ? safe(() => rec.slice(sig)) : null;
}

// ─── pure selection ────────────────────────────────────────────────────

// `pull: true` is the on-demand /logbook mode — the user is explicitly asking
// "what's next", so anti-nag push-gates (active-cycle suppression, global mute,
// per-rec cooldown/dismissal watermark) are bypassed. Per-rec `muted` is still
// honoured (a hard "never show me this"). Default off — every AC test omits it,
// so their behaviour is unchanged.
function selectOffer({ signature, prefs, markers, session, activeCycle, pull }) {
  const recsPref = (prefs && prefs.recs) || {};
  const mk = markers || {};
  const eligible = [];
  const needsBaseline = [];

  // Baseline synthesis (objective repo state) runs regardless of suppression;
  // only the offer/all output is gated below (AC-006/REQ-031, AC-010).
  const suppressed = !pull && (activeCycle || (prefs && prefs.mutedAll));

  for (const rec of REGISTRY) {
    if (!safe(() => rec.requires(signature))) continue;

    const pref = recsPref[rec.id];
    if (pref && pref.status === 'muted') continue; // AC-009

    const sat = !!safe(() => rec.satisfied(signature));
    const curSlice = rec.slice ? safe(() => rec.slice(signature)) : null;
    let reArm = 'causal';

    if (sat) {
      const marker = mk[rec.id];
      if (marker) {
        if (deepEqualArr(marker.coveredSlice, curSlice)) continue; // AC-004 done
        reArm = 'drift'; // slice drifted since marker
      } else {
        needsBaseline.push(rec.id); // AC-005 baseline synth, don't offer
        continue;
      }
    }
    // else: not satisfied -> causal "you haven't done this yet"

    // dismissal / cooldown gate (REQ-030, AC-002/AC-003/AC-012) — skipped in
    // pull mode so /logbook lists steps the user previously dismissed.
    if (!pull && pref && pref.status === 'dismissed') {
      const cooldownElapsed = (session - (pref.lastOfferedSession || 0)) >= COOLDOWN;
      if (rec.tierBased) {
        const curTier = tier(signature);
        const tierIncreased = (TIER_ORDER[curTier] || 0) > (TIER_ORDER[pref.dismissedTier] || 0);
        if (!tierIncreased && !cooldownElapsed) continue;
        if (tierIncreased) reArm = 'drift';
      } else {
        const sliceChanged = rec.slice ? !deepEqualArr(curSlice, pref.dismissedSlice) : false;
        if (!sliceChanged && !cooldownElapsed) continue;
        if (sliceChanged) reArm = 'drift';
      }
    }

    eligible.push({
      id: rec.id,
      offers: (rec.select ? safe(() => rec.select(signature)) : null) || rec.offers,
      priority: rec.priority,
      kind: rec.kind,
      presentation: rec.presentation,
      prompt: safe(() => rec.prompt(signature)) || '',
      reArm,
    });
  }

  if (suppressed) return { offer: null, all: [], needsBaseline };

  eligible.sort((a, b) => a.priority - b.priority); // REQ-011 lowest priority wins
  return { offer: eligible[0] || null, all: eligible, needsBaseline };
}

// ─── markers (committed, .mad/state/<skill>.json) ──────────────────────

function markerPath(projectDir, skill) {
  return join(projectDir, '.mad', 'state', `${skill}.json`);
}

function readMarker(projectDir, skill) {
  const j = readJson(markerPath(projectDir, skill));
  return j ? { coveredSlice: j.coveredSlice, ranAt: j.ranAt } : null;
}

function readAllMarkers(projectDir) {
  const dir = join(projectDir, '.mad', 'state');
  const out = {};
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.endsWith('.json')) continue;
    const skill = e.slice(0, -5);
    const m = readMarker(projectDir, skill);
    if (m) out[skill] = m;
  }
  return out;
}

function writeMarker(projectDir, skill, coveredSlice, ranAt) {
  const p = markerPath(projectDir, skill);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ skill, version: 1, ranAt, coveredSlice }, null, 2) + '\n');
}

// ─── prefs + session counter (per-user, via state.cjs) ─────────────────

function loadLifecyclePrefs(projectDir) {
  return state.loadPrefs(projectDir).lifecycle || {};
}

function saveLifecyclePrefs(projectDir, lc) {
  const prefs = state.loadPrefs(projectDir);
  prefs.lifecycle = lc;
  state.savePrefs(projectDir, prefs);
}

function currentSession(projectDir) {
  return loadLifecyclePrefs(projectDir).sessionCount || 0;
}

function bumpSession(projectDir) {
  const lc = loadLifecyclePrefs(projectDir);
  lc.sessionCount = (lc.sessionCount || 0) + 1;
  saveLifecyclePrefs(projectDir, lc);
  return lc.sessionCount;
}

// ─── suppression ───────────────────────────────────────────────────────

function isActiveCycle(projectDir) {
  try {
    if (state.loadPendingBuild(projectDir)) return true;
    const branch = git('rev-parse --abbrev-ref HEAD', projectDir);
    const dirty = (git('status --porcelain', projectDir) || '') !== '';
    return dirty && !['main', 'master'].includes(branch);
  } catch {
    return false;
  }
}

// ─── evaluate (IO wrapper) ─────────────────────────────────────────────

function evaluate(projectDir, { surface, sourceSkill } = {}) {
  try {
    const signature = computeSignature(projectDir);
    const prefs = loadLifecyclePrefs(projectDir);
    const markers = readAllMarkers(projectDir);
    const session = prefs.sessionCount || 0;
    const activeCycle = isActiveCycle(projectDir);
    const { offer, all, needsBaseline } = selectOffer({
      signature, prefs, markers, session, activeCycle, surface,
    });

    // REQ-022: synthesise baseline markers for pre-engine satisfied recs
    if (needsBaseline && needsBaseline.length) {
      const ranAt = new Date().toISOString();
      for (const id of needsBaseline) {
        writeMarker(projectDir, id, sliceFor(signature, id), ranAt);
      }
    }

    return { offer: offer || null, all: all || [] };
  } catch {
    return { offer: null, all: [] }; // CON-003
  }
}

// ─── /logbook overview (plan step 7) ──────────────────────────────────────

// On-demand pull: every applicable-but-not-done step, ordered by lifecycle
// stage, annotated with the user's per-rec status. Read-only — never
// synthesises markers or mutates state (a query must not have side effects).
function next(projectDir) {
  try {
    const signature = computeSignature(projectDir);
    const prefs = loadLifecyclePrefs(projectDir);
    const markers = readAllMarkers(projectDir);
    const session = prefs.sessionCount || 0;
    const { all } = selectOffer({
      signature, prefs, markers, session, activeCycle: false, pull: true,
    });
    const recsPref = (prefs && prefs.recs) || {};
    const annotated = (all || []).map(r => ({
      ...r,
      status: (recsPref[r.id] && recsPref[r.id].status) || 'available',
    }));
    return { all: annotated };
  } catch {
    return { all: [] }; // CON-003
  }
}

/**
 * Preference-INDEPENDENT: is this rec still genuinely applicable (needs doing)?
 * Evaluates with empty prefs so a user's mute/dismiss/cooldown does NOT read as
 * "done" — but keeps real markers so drift recs (rig-refresh) resolve correctly.
 * On any error, returns true (assume still applicable) so a linked ledger item
 * is never wrongly auto-resolved (GUD-001).
 */
function recApplicable(projectDir, recId) {
  try {
    const signature = computeSignature(projectDir);
    const markers = readAllMarkers(projectDir);
    const { all } = selectOffer({ signature, prefs: {}, markers, session: 0, activeCycle: false, pull: true });
    return (all || []).some(r => r.id === recId);
  } catch {
    return true; // CON-003 — keep the item open, don't resolve on error
  }
}

module.exports = {
  computeSignature, selectOffer, evaluate, next, isActiveCycle,
  readMarker, writeMarker, readAllMarkers, currentSession, bumpSession,
  loadLifecyclePrefs, saveLifecyclePrefs, REGISTRY, recApplicable,
  // extras used by session-guard subcommands
  sliceFor, tier,
  // exposed for release-selection tests
  releaseSelect,
};
