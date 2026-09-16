'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkStaleness } = require('./staleness.cjs');
const { OutputBuilder } = require('./output.cjs');

for (const instructionsName of ['CLAUDE.md', 'AGENTS.md']) {
  test(`staleness signals identify ${instructionsName} and retain their scores`, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-staleness-'));
    try {
      const instructionsPath = path.join(dir, instructionsName);
      fs.writeFileSync(instructionsPath, '# Project\n0 dependencies\n');
      const oldTime = new Date(Date.now() - 21 * 86400000);
      fs.utimesSync(instructionsPath, oldTime, oldTime);
      for (const name of ['src', 'tools', 'tests']) fs.mkdirSync(path.join(dir, name));
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
        dependencies: { alpha: '1', beta: '1', gamma: '1', delta: '1', epsilon: '1', zeta: '1' },
      }));
      for (const name of ['requirements.txt', 'Dockerfile', 'bun.lock']) {
        fs.writeFileSync(path.join(dir, name), 'fixture\n');
      }

      const output = new OutputBuilder();
      checkStaleness(dir, instructionsPath, null, output);

      assert.equal(output.signals.length, 8);
      assert.equal(output.score, 12);
      for (const signal of output.signals) {
        assert.ok(signal.includes(instructionsName), signal);
        assert.ok(!signal.includes(instructionsName === 'AGENTS.md' ? 'CLAUDE.md' : 'AGENTS.md'), signal);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
