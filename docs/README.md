# Documentation Structure

This directory contains project documentation organized by purpose and lifecycle stage.

## Directory Structure

- **ai_docs/** - Reference materials for Claude Code: SDKs, API docs, repo context
- **specs/** - Feature and migration specifications
- **analysis/** - Investigation outputs: bug hunting, optimization, cleanup
- **plans/** - Implementation plans from specs, analysis, or ad-hoc tasks
- **templates/** - Reusable document templates
- **archive/** - Historical and completed documents

## Document Lifecycle

Documents follow a lifecycle managed through YAML frontmatter:

1. **Draft** → Document is being created
2. **Active** → Document is current and relevant
3. **Complete** → Work is done, kept for reference
4. **Archived** → Moved to archive/ when no longer relevant

## Metadata Requirements

All documents should include YAML frontmatter:

```yaml
---
title: Document Title
category: specs|analysis|plans|ai_docs|templates
status: draft|active|complete|archived
created: YYYY-MM-DD
last_updated: YYYY-MM-DD
tags: [tag1, tag2]
---
```

See INDEX.md for a complete list of all documents.

## Temporary Documents

Ephemeral/scratch documents should be created in `/tmp` or system temp directories,
NOT in this docs/ directory. The docs/ directory is for persistent documentation only.

---
Last updated: 2025-11-16
