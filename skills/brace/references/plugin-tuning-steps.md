# Plugin Tuning Steps

Procedural reference for Phase 7 — `node -e` scripts for each audit rule.
Each script is idempotent: re-reads the target file before writing and
checks current value before modifying.

---

## H1/H2: Disable Hookify

Target: `~/.claude/settings.json`

```bash
node -e "
  const fs = require('fs');
  const p = require('os').homedir() + '/.claude/settings.json';
  const s = JSON.parse(fs.readFileSync(p, 'utf8'));
  const key = Object.keys(s.enabledPlugins || {}).find(k => k.includes('hookify'));
  if (key && s.enabledPlugins[key] !== false) {
    s.enabledPlugins[key] = false;
    fs.writeFileSync(p, JSON.stringify(s, null, 2) + '\n');
    console.log('Disabled hookify');
  } else {
    console.log('Hookify already disabled — skipped');
  }
"
```

---

## M1: Add Read-Only Tools to SKIP_TOOLS

Target: `~/.claude-mem/settings.json`

```bash
node -e "
  const fs = require('fs');
  const p = require('os').homedir() + '/.claude-mem/settings.json';
  const s = JSON.parse(fs.readFileSync(p, 'utf8'));
  const required = ['Read','Glob','Grep','ToolSearch','Agent','WebSearch','WebFetch'];
  const current = (s.CLAUDE_MEM_SKIP_TOOLS || '').split(',').map(t => t.trim()).filter(Boolean);
  const missing = required.filter(t => !current.includes(t));
  if (missing.length > 0) {
    s.CLAUDE_MEM_SKIP_TOOLS = [...new Set([...current, ...missing])].join(',');
    fs.writeFileSync(p, JSON.stringify(s, null, 2) + '\n');
    console.log('Added to SKIP_TOOLS: ' + missing.join(', '));
  } else {
    console.log('All read-only tools already in SKIP_TOOLS — skipped');
  }
"
```

---

## M2: Reduce Context Injection

Target: `~/.claude-mem/settings.json`

```bash
node -e "
  const fs = require('fs');
  const p = require('os').homedir() + '/.claude-mem/settings.json';
  const s = JSON.parse(fs.readFileSync(p, 'utf8'));
  let changed = false;
  if (parseInt(s.CLAUDE_MEM_CONTEXT_OBSERVATIONS || '50') > 10) {
    s.CLAUDE_MEM_CONTEXT_OBSERVATIONS = '10';
    changed = true;
  }
  if (parseInt(s.CLAUDE_MEM_CONTEXT_SESSION_COUNT || '10') > 3) {
    s.CLAUDE_MEM_CONTEXT_SESSION_COUNT = '3';
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(p, JSON.stringify(s, null, 2) + '\n');
    console.log('Reduced context injection: observations=10, sessions=3');
  } else {
    console.log('Context injection already optimal — skipped');
  }
"
```

---

## M3: Switch Provider to OpenRouter

Target: `~/.claude-mem/settings.json`

Pre-check: verify OpenRouter API key exists. If missing, warn and skip.

```bash
node -e "
  const fs = require('fs');
  const p = require('os').homedir() + '/.claude-mem/settings.json';
  const s = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (s.CLAUDE_MEM_PROVIDER === 'claude') {
    if (!s.CLAUDE_MEM_OPENROUTER_API_KEY && !process.env.OPENROUTER_API_KEY) {
      console.log('SKIP: No OpenRouter API key configured');
      process.exit(0);
    }
    s.CLAUDE_MEM_PROVIDER = 'openrouter';
    fs.writeFileSync(p, JSON.stringify(s, null, 2) + '\n');
    console.log('Switched provider to openrouter');
  } else {
    console.log('Provider already ' + (s.CLAUDE_MEM_PROVIDER || 'unset') + ' — skipped');
  }
"
```

---

## Plugin Role Separation Content

Inject after `## Memory` in the project CLAUDE.md when both claude-mem AND
oh-my-claudecode are enabled. Skip if `### Plugin Role Separation` already
exists (idempotent).

```markdown
### Plugin Role Separation (claude-mem + OMC)

- **claude-mem** = passive memory layer (auto-capture, recall, search). Let it run silently.
- **OMC project memory** = active, curated checkpoints and project status.
- **OMC wiki** = architectural decisions, bug solutions, patterns.
- Searching past work → OMC project memory first, then claude-mem for older/cross-project.
- Code navigation → OMC LSP tools. Planning → OMC /plan or /autopilot.
```
