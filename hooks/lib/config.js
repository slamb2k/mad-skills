'use strict';

module.exports = {
  version: '1.0.0',

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
};
