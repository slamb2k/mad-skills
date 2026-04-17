'use strict';

const { readFileSync } = require('fs');
const { join, dirname } = require('path');

function getVersion() {
  // Walk up from lib/ to find package.json (mad-skills plugin root)
  const hooksDir = dirname(__dirname);
  for (const candidate of [
    join(hooksDir, '..', 'package.json'),
    join(hooksDir, '..', '.claude-plugin', 'plugin.json'),
  ]) {
    try {
      return JSON.parse(readFileSync(candidate, 'utf8')).version;
    } catch {}
  }
  return '0.0.0-dev';
}

module.exports = {
  version: getVersion(),

  staleness: {
    threshold: 3,
    age: { warn: 7, critical: 14 },
    commits: { warn: 20, critical: 50 },
    depDrift: { minor: 0, major: 5 },
    topLevelFiles: 3,
    lockFileDays: 7,
    undocumentedDeps: 5,
    missingDirs: { few: 0, many: 2 },
  },

  monorepo: {
    markers: [
      'pnpm-workspace.yaml', 'lerna.json', 'nx.json',
      'turbo.json', 'rush.json',
    ],
    dirs: ['packages', 'apps', 'services', 'libs', 'modules', 'projects'],
    minSignals: 2,
  },

  configFiles: [
    'tsconfig.json', '.env.example', 'docker-compose.yml',
    'Dockerfile', 'Makefile', 'Cargo.toml', 'go.mod',
  ],

  lockFiles: [
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
    'bun.lock', 'Cargo.lock', 'poetry.lock', 'uv.lock',
  ],

  pythonFiles: ['pyproject.toml', 'requirements.txt', 'setup.py'],

  taskList: { minCommits: 20, minFiles: 30 },

  pluginHealth: {
    claudeMem: {
      maxObservations: 20,
      maxSessionCount: 5,
      recommendedSkipTools: [
        'Read', 'Glob', 'Grep', 'ToolSearch', 'Agent', 'WebSearch', 'WebFetch',
      ],
    },
  },
};
