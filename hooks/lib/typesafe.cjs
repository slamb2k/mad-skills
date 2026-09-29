'use strict';

/**
 * Optional TypeSafe System One judgments (https://docs.typesafe.ai).
 *
 * Callers use these to stand in for fragile heuristics (word-overlap scores,
 * keyword regexes) with a typed semantic judgment, and ALWAYS keep the
 * heuristic as the fallback: every entry point returns null when the judge
 * is disabled, times out, or fails in any way.
 *
 * Opt-in only — repo content leaves the machine — so both must be set:
 *   MAD_SKILLS_JUDGE=typesafe   (per project, e.g. .claude/settings.local.json env)
 *   TYPESAFE_API_KEY=<key>
 *
 * Zero-dependency: plain fetch against the HTTP API (the SDK needs Node 20+).
 * `judgeSync` runs the request in a child node process so the synchronous
 * ledger/hook code paths can use it without going async.
 */

const { execFileSync } = require('child_process');

const MODEL = 'jev-1.13.0'; // pinned: thresholds are tuned against this version
const BASE_URL = 'https://api.typesafe.ai';
const TIMEOUT_MS = 8000;
const RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504, 529]);

function enabled(env = process.env) {
  return env.MAD_SKILLS_JUDGE === 'typesafe' && Boolean(env.TYPESAFE_API_KEY);
}

/**
 * Run System One over `questions` (the API's id → Question map). Questions
 * are split into parallel requests of at most `opts.chunk` (default 20) to
 * stay under the per-request token budget. Resolves to the merged `answers`
 * map — a failed chunk just leaves its ids absent — or null when disabled
 * or every request failed.
 */
async function judge(state, questions, opts = {}) {
  const env = opts.env || process.env;
  if (!opts.force && !enabled(env)) return null;
  const ids = Object.keys(questions || {});
  if (!ids.length) return {};
  const size = opts.chunk || 20;
  const chunks = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(Object.fromEntries(ids.slice(i, i + size).map((id) => [id, questions[id]])));
  }
  const results = await Promise.all(chunks.map((qs) => request(state, qs, opts, env)));
  if (results.every((r) => r === null)) return null;
  return Object.assign({}, ...results.filter(Boolean));
}

async function request(state, questions, opts, env) {
  const body = JSON.stringify({ model: opts.model || MODEL, state, questions });
  const url = `${env.TYPESAFE_BASE_URL || BASE_URL}/v1/systemone`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.TYPESAFE_API_KEY}`, 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(opts.timeoutMs || TIMEOUT_MS),
      });
      if (res.ok) return (await res.json()).answers || null;
      if (!RETRY_STATUSES.has(res.status)) return null;
    } catch {
      // network error / timeout — fall through to one retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

/** judge() over several independent { state, questions } batches, in parallel. */
async function judgeAll(batches, opts = {}) {
  return Promise.all(batches.map((b) => judge(b.state, b.questions, opts)));
}

/**
 * Synchronous judgeAll() for sync call sites: runs in a child node process.
 * Returns an array aligned with `batches` (entries may be null), or null
 * when disabled or the child fails.
 */
function judgeAllSync(batches, opts = {}) {
  const env = opts.env || process.env;
  if (!opts.force && !enabled(env)) return null;
  if (!batches.length) return [];
  try {
    const out = execFileSync(process.execPath, [__filename], {
      input: JSON.stringify({ batches, opts: { model: opts.model, timeoutMs: opts.timeoutMs, chunk: opts.chunk, force: true } }),
      env,
      timeout: 2 * (opts.timeoutMs || TIMEOUT_MS) + 2000,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const parsed = JSON.parse(String(out));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Synchronous judge() for a single batch; same null-on-failure contract. */
function judgeSync(state, questions, opts = {}) {
  const r = judgeAllSync([{ state, questions }], opts);
  return r ? r[0] : null;
}

/** P(yes) from a noul answer, or null when absent. */
function noul(answers, id) {
  const a = answers && answers[id];
  return a && typeof a.noul === 'number' ? a.noul : null;
}

module.exports = { MODEL, enabled, judge, judgeAll, judgeSync, judgeAllSync, noul };

if (require.main === module) {
  let input = '';
  process.stdin.on('data', (d) => { input += d; });
  process.stdin.on('end', async () => {
    try {
      const { batches, opts } = JSON.parse(input);
      process.stdout.write(JSON.stringify(await judgeAll(batches, opts)));
    } catch {
      process.stdout.write('null');
    }
  });
}
