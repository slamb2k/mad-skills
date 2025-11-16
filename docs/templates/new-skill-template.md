---
title: New Skill Template
category: templates
status: active
created: 2025-11-16
last_updated: 2025-11-16
tags: [template, skill-development, plugin]
---

# New Skill Template

## Overview

Use this template when adding a new skill to the mad-skills repository. Copy the structure below and customize for your skill.

## Skill Directory Structure

```
your-skill-name/
├── SKILL.md                    # Required
├── scripts/                    # Optional - for executable automation
├── agents/                     # Optional - for subagent definitions
├── assets/                     # Optional - for templates, configs
└── references/                 # Optional - for best practices, examples
```

## SKILL.md Template

```markdown
---
name: your-skill-name
description: Brief description of what the skill does and when to use it. Be specific about use cases.
---

# Your Skill Name

One-paragraph overview of what this skill provides.

## When to Use This Skill

Use this skill when you need to:
- Specific use case 1
- Specific use case 2
- Specific use case 3

## Core Concepts

Explain the key concepts or principles the skill enforces.

## Workflows

### [Primary Workflow Name]

Step-by-step instructions for the main workflow:

1. **Step 1**: What to do
2. **Step 2**: What to do next
3. **Step 3**: How to complete

### [Secondary Workflow Name]

Instructions for alternative workflows.

## Scripts Reference

(If applicable) Document any scripts provided:

- `scripts/script-name.py` - What it does
- `scripts/another-script.js` - What it does

## Best Practices

1. **Practice 1**: Why it matters
2. **Practice 2**: Why it matters

## Examples

### Example 1: [Use Case]

```bash
# Show concrete example
```

### Example 2: [Another Use Case]

```bash
# Show another example
```

## Troubleshooting

**Issue 1**: How to resolve
**Issue 2**: How to resolve

## References

- Link to related docs
- Link to external resources
```

## Script Template (if applicable)

### For Debug Skills (Node.js)

```javascript
#!/usr/bin/env node

/**
 * Script Name - Brief description
 *
 * Usage: node script-name.js <arg1> <arg2>
 *
 * Returns compact JSON, never raw data
 */

async function main() {
  // Parse arguments
  const arg1 = process.argv[2];

  // Perform work
  const result = {
    success: true,
    data: {}, // Keep compact
  };

  // Return JSON
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error(JSON.stringify({
    success: false,
    error: err.message.substring(0, 100) // Truncate errors
  }, null, 2));
  process.exit(1);
});
```

### For Dev Flow Skills (Python)

```python
#!/usr/bin/env python3
"""
Script Name - Brief description

Usage: python script-name.py [args]
"""

import sys
import argparse

def main():
    parser = argparse.ArgumentParser(description='What this script does')
    parser.add_argument('arg1', help='Description of arg1')
    parser.add_argument('--optional', help='Optional argument')

    args = parser.parse_args()

    # Perform work
    print("✅ Success message")

if __name__ == '__main__':
    main()
```

## Adding to Repository

### 1. Choose Plugin Category

- **debug-skills**: MCP alternatives with filtered scripts and subagents
- **design-skills**: Workflow-based UI/UX tools
- **dev-flow**: Development process optimization

### 2. Create Skill Directory

```bash
mkdir your-skill-name
cd your-skill-name
touch SKILL.md
```

### 3. Add to marketplace.json

```json
{
  "name": "appropriate-plugin",
  "skills": [
    "./existing-skill",
    "./your-skill-name"
  ]
}
```

### 4. Update Documentation

- Add skill to README.md "Current Skills" section
- Add skill to CLAUDE.md "Current Status" and "Project Structure"
- Update skill count in repository overview

### 5. Add Validation

Update `.github/workflows/validate.yml`:

```yaml
- name: Validate Your Skill structure
  run: |
    echo "Validating Your Skill structure..."

    required_files=(
      "your-skill-name/SKILL.md"
      # Add other required files
    )

    for file in "${required_files[@]}"; do
      if [ ! -f "$file" ]; then
        echo "ERROR: Required file missing: $file"
        exit 1
      fi
      echo "✓ Found: $file"
    done
```

### 6. Test Locally

```bash
# Read the SKILL.md
cat your-skill-name/SKILL.md

# Test any scripts
node your-skill-name/scripts/test.js

# Validate JSON
jq empty .claude-plugin/marketplace.json
```

### 7. Document in CLAUDE.md

Add a new section under the appropriate plugin:

```markdown
## Your Skill Details

### Overview
**Type:** Workflow/Script/Development Skill

[Description]

### Key Characteristics
- Feature 1
- Feature 2

### Usage Pattern
When users request [X]:
1. Do this
2. Then that
```

## Checklist

- [ ] Created skill directory
- [ ] Added SKILL.md with proper frontmatter
- [ ] Created scripts/agents/assets/references as needed
- [ ] Added to marketplace.json under correct plugin
- [ ] Updated README.md Current Skills section
- [ ] Updated CLAUDE.md Current Status section
- [ ] Updated CLAUDE.md Project Structure
- [ ] Added validation workflow step
- [ ] Tested skill locally
- [ ] Updated version number if needed
- [ ] Committed with descriptive message

## References

- [Repository Architecture](../ai_docs/repository-architecture.md)
- [CLAUDE.md](../../CLAUDE.md) - Development guidance
- [Existing Skills](../../) - Browse for examples
