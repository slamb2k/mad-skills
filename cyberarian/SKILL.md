---
name: cyberarian
description: The digital librarian for Claude Code projects. Enforces structured document lifecycle management - organizing, indexing, and archiving project documentation automatically. Use when creating, organizing, or managing project documentation. Ensures documents are created in the proper `docs/` directory structure with required metadata, handles temporary documents in system temp directories, maintains an auto-generated index, and performs automatic archiving of old/complete documents. Use for any task involving document creation, organization, or maintenance.
---

# Cyberarian - Document Lifecycle Management

This skill enforces a structured approach to documentation in Claude Code projects, ensuring consistency, discoverability, and automatic maintenance.

## Core Principles

1. **Structured Organization**: All persistent documentation goes in `docs/` with semantic categorization
2. **No Temporary Docs in docs/**: Ephemeral/scratch documents belong in `/tmp` or system temp, never in `docs/`
3. **Metadata-Driven**: YAML frontmatter enables automation and lifecycle management
4. **Automatic Maintenance**: Indexing and archiving happen automatically, not manually

## Directory Structure

```
docs/
├── README.md           # Human-written guide to the structure
├── INDEX.md            # Auto-generated index of all documents
├── ai_docs/           # Reference materials for Claude Code (SDKs, APIs, repo context)
├── specs/             # Feature and migration specifications
├── analysis/          # Investigation outputs (bugs, optimization, cleanup)
├── plans/             # Implementation plans
├── templates/         # Reusable templates
└── archive/           # Historical and completed documents
    ├── specs/
    ├── analysis/
    └── plans/
```

## Workflows

### First-Time Setup

When a project doesn't have a `docs/` directory:

1. **Initialize the structure**:
   ```bash
   python scripts/init_docs_structure.py
   ```
   This creates all directories, README.md, and initial INDEX.md

2. **Inform the user** about the structure and conventions

### Creating a New Document

When asked to create documentation (specs, analysis, plans, etc.):

1. **Determine the category**:
   - **ai_docs**: SDKs, API references, repo architecture, coding conventions
   - **specs**: Feature specifications, migration plans, technical designs
   - **analysis**: Bug investigations, performance analysis, code audits
   - **plans**: Implementation plans, rollout strategies, task breakdowns
   - **templates**: Reusable document templates

2. **Use the template**:
   ```bash
   cp assets/doc_template.md docs/<category>/<descriptive-name>.md
   ```

3. **Fill in metadata**:
   - Set `title`, `category`, `status`, `created`, `last_updated`
   - Add relevant `tags`
   - Start with `status: draft`

4. **Write the content** following the document structure

5. **Update the index**:
   ```bash
   python scripts/index_docs.py
   ```

**File naming convention**: Use lowercase with hyphens, descriptive names:
- ✅ `oauth2-migration-spec.md`
- ✅ `auth-performance-analysis.md`
- ❌ `spec1.md`
- ❌ `MyDocument.md`

### Working with Existing Documents

When modifying existing documentation:

1. **Update metadata**:
   - Set `last_updated` to current date
   - Update `status` if lifecycle changes (draft → active → complete)

2. **Regenerate index** if significant changes:
   ```bash
   python scripts/index_docs.py
   ```

### Creating Temporary/Scratch Documents

When creating ephemeral documents (scratchpads, temporary notes, single-use docs):

**NEVER create in docs/** - Use system temp instead:

```bash
# Create in /tmp for Linux/macOS
/tmp/scratch-notes.md
/tmp/debug-output.txt

# Let the system clean up temporary files
```

**Why**: The `docs/` directory is for persistent, managed documentation. Temporary files clutter the structure and interfere with indexing and archiving.

### Regular Maintenance

**When to run**:
- After creating/modifying documents: Update index
- Weekly/monthly: Run archiving to clean up completed work
- Before commits: Validate metadata

**Maintenance workflow**:

1. **Validate metadata**:
   ```bash
   python scripts/validate_doc_metadata.py
   ```
   Checks all documents have proper frontmatter

2. **Archive old documents** (dry run first):
   ```bash
   python scripts/archive_docs.py --dry-run
   python scripts/archive_docs.py
   ```

3. **Update index**:
   ```bash
   python scripts/index_docs.py
   ```

### Archiving Documents

Archiving happens automatically based on category-specific rules. See `references/archiving-criteria.md` for full details.

**Quick reference**:
- `specs/`: Auto-archive when `status: complete` AND >90 days
- `analysis/`: Auto-archive when `status: complete` AND >60 days  
- `plans/`: Auto-archive when `status: complete` AND >30 days
- `ai_docs/`: Manual archiving only
- `templates/`: Never auto-archive

**To prevent auto-archiving**, set in frontmatter:
```yaml
archivable_after: 2025-12-31
```

## Metadata Requirements

Every document must have YAML frontmatter. See `references/metadata-schema.md` for complete schema.

**Minimal required frontmatter**:
```yaml
---
title: Document Title
category: specs
status: draft
created: 2024-11-16
last_updated: 2024-11-16
tags: []
---
```

**Lifecycle statuses**:
- `draft` → Document being created
- `active` → Current and relevant
- `complete` → Work done, kept for reference
- `archived` → Moved to archive

## Reference Files

Load these when needed for detailed guidance:

- **references/metadata-schema.md**: Complete YAML frontmatter specification
- **references/archiving-criteria.md**: Detailed archiving rules and philosophy

## Scripts Reference

All scripts accept optional path argument (defaults to current directory):

- `scripts/init_docs_structure.py [path]` - Initialize docs structure
- `scripts/index_docs.py [path]` - Regenerate INDEX.md
- `scripts/archive_docs.py [path] [--dry-run]` - Archive old documents
- `scripts/validate_doc_metadata.py [path]` - Validate all metadata

## Common Patterns

### Creating a Specification
```bash
# Copy template
cp assets/doc_template.md docs/specs/new-feature-spec.md

# Edit with proper metadata
# category: specs
# status: draft
# tags: [feature-name, relevant-tags]

# Update index
python scripts/index_docs.py
```

### Completing Work
```bash
# Update document metadata
# status: draft → active → complete
# last_updated: <current-date>

# After a while, archiving script will auto-archive
python scripts/archive_docs.py
```

### Finding Documents
```bash
# Check the INDEX.md (auto-maintained)
cat docs/INDEX.md

# Or search by tag, category, status
grep -r "tags:.*performance" docs/
```

## Best Practices

1. **Always use metadata**: Don't skip the frontmatter, it enables automation
2. **Keep status current**: Update as work progresses (draft → active → complete)
3. **Use descriptive names**: File names should be clear and searchable
4. **Update dates**: Set `last_updated` when making significant changes
5. **Run maintenance regularly**: Index and archive periodically
6. **Temp goes in /tmp**: Never create temporary/scratch docs in docs/
7. **Validate before committing**: Run `validate_doc_metadata.py` to catch issues

## Error Handling

**Document has no frontmatter**:
- Add frontmatter using `assets/doc_template.md` as reference
- Run `validate_doc_metadata.py` to confirm

**Document in wrong category**:
- Move file to correct category directory
- Update `category` field in frontmatter to match
- Regenerate index

**Archived document still needed**:
- Move from `archive/<category>/` back to `<category>/`
- Update `status` from `archived` to `active`
- Remove `archived_date` and `archive_reason` fields
- Regenerate index
