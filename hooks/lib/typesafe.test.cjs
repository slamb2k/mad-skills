'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const ts = require('./typesafe.cjs');

/** Local stand-in for the System One endpoint; `handler(body, n)` → [status, json]. */
async function withServer(handler, fn) {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const parsed = JSON.parse(body);
      calls.push({ auth: req.headers.authorization, body: parsed });
      const [status, json] = handler(parsed, calls.length);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const env = {
    MAD_SKILLS_JUDGE: 'typesafe',
    TYPESAFE_API_KEY: 'k',
    TYPESAFE_BASE_URL: `http://127.0.0.1:${server.address().port}`,
  };
  try { return await fn(env, calls); } finally { server.close(); }
}

const echoNouls = (body) => [200, {
  answers: Object.fromEntries(Object.keys(body.questions).map((id) => [id, { type: 'noul', noul: 0.9 }])),
}];

const nouls = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`q${i}`, { type: 'noul', instructions: 'x' }]));

test('enabled requires both the opt-in flag and an API key', () => {
  assert.equal(ts.enabled({ TYPESAFE_API_KEY: 'k' }), false);
  assert.equal(ts.enabled({ MAD_SKILLS_JUDGE: 'typesafe' }), false);
  assert.equal(ts.enabled({ MAD_SKILLS_JUDGE: 'typesafe', TYPESAFE_API_KEY: 'k' }), true);
});

test('disabled judge never calls out and returns null', async () => {
  assert.equal(await ts.judge({}, nouls(1), { env: {} }), null);
  assert.equal(ts.judgeSync({}, nouls(1), { env: {} }), null);
  assert.equal(ts.judgeAllSync([{ state: {}, questions: nouls(1) }], { env: {} }), null);
});

test('judge posts the pinned model with bearer auth and returns answers', async () => {
  await withServer(echoNouls, async (env, calls) => {
    const a = await ts.judge({ s: 1 }, nouls(2), { env });
    assert.equal(ts.noul(a, 'q1'), 0.9);
    assert.equal(calls[0].auth, 'Bearer k');
    assert.equal(calls[0].body.model, ts.MODEL);
    assert.deepEqual(calls[0].body.state, { s: 1 });
  });
});

test('judge chunks questions across requests and merges the answers', async () => {
  await withServer(echoNouls, async (env, calls) => {
    const a = await ts.judge({}, nouls(25), { env, chunk: 10 });
    assert.equal(calls.length, 3);
    assert.equal(Object.keys(a).length, 25);
  });
});

test('judge retries once on a retryable status', async () => {
  await withServer((body, n) => (n === 1 ? [529, {}] : echoNouls(body)), async (env, calls) => {
    const a = await ts.judge({}, nouls(1), { env });
    assert.equal(calls.length, 2);
    assert.equal(ts.noul(a, 'q0'), 0.9);
  });
});

test('judge returns null on a non-retryable error', async () => {
  await withServer(() => [400, { detail: { error_type: 'max_tokens_exceeded' } }], async (env, calls) => {
    assert.equal(await ts.judge({}, nouls(1), { env }), null);
    assert.equal(calls.length, 1);
  });
});

test('a failed chunk only drops its own answers', async () => {
  await withServer((body) => ('q0' in body.questions ? [400, {}] : echoNouls(body)), async (env) => {
    const a = await ts.judge({}, nouls(4), { env, chunk: 2 });
    assert.deepEqual(Object.keys(a).sort(), ['q2', 'q3']);
  });
});

test('judgeAllSync returns null when the endpoint is unreachable', () => {
  const env = { MAD_SKILLS_JUDGE: 'typesafe', TYPESAFE_API_KEY: 'k', TYPESAFE_BASE_URL: 'http://127.0.0.1:9' };
  assert.deepEqual(ts.judgeAllSync([{ state: {}, questions: nouls(1) }], { env, timeoutMs: 1000 }), [null]);
});
