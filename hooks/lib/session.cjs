'use strict';

const { readFileSync } = require('fs');

function readHookInput(command) {
  if (!['check', 'remind', 'logbook-hint'].includes(command) || process.stdin.isTTY) return {};
  try {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    return input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  } catch {
    return {};
  }
}

function nonemptyString(value) {
  return typeof value === 'string' && value.length > 0 ? value : '';
}

module.exports = { readHookInput, nonemptyString };
