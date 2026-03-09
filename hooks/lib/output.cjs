'use strict';

class OutputBuilder {
  constructor() {
    this.parts = [];
    this.signals = [];
    this.score = 0;
  }

  add(line) {
    this.parts.push(line);
  }

  blank() {
    this.parts.push('');
  }

  addStaleness(message, weight = 1) {
    this.signals.push(`\u26A0 ${message}`);
    this.score += weight;
  }

  addQuestion(question, type, options, priority) {
    this.blank();
    if (priority === 'low') {
      this.add('Use AskUserQuestion (low priority, don\'t block):');
    } else {
      this.add('Use AskUserQuestion to prompt:');
    }
    this.add(`  Question: "${question}"`);
    this.add(`  Type: ${type}`);
    this.add('  Options:');
    options.forEach((opt, i) => this.add(`    ${i + 1}. ${opt}`));
    this.blank();
  }

  toJson(hookEvent = 'SessionStart') {
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: hookEvent,
        additionalContext: this.parts.join('\n'),
      },
    });
  }
}

module.exports = { OutputBuilder };
