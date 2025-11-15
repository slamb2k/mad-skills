# Document Metadata Schema

All documents in the docs/ directory must include YAML frontmatter with the following structure.

## Required Fields

### title
- **Type**: String
- **Description**: Human-readable document title
- **Example**: `"OAuth2 Migration Specification"`

### category
- **Type**: String (enum)
- **Description**: Document category, must match the directory it's in
- **Valid values**: 
  - `ai_docs` - Reference materials for Claude Code
  - `specs` - Feature and migration specifications
  - `analysis` - Investigation outputs
  - `plans` - Implementation plans
  - `templates` - Reusable templates
  - `archive` - Historical documents (auto-set on archiving)
- **Example**: `specs`

### status
- **Type**: String (enum)
- **Description**: Current lifecycle status of the document
- **Valid values**:
  - `draft` - Document is being created
  - `active` - Document is current and relevant
  - `complete` - Work is done, kept for reference
  - `archived` - Document has been archived
- **Example**: `active`
- **Lifecycle**: draft → active → complete → archived

### created
- **Type**: Date (YYYY-MM-DD)
- **Description**: Date the document was created
- **Example**: `2024-11-16`

### last_updated
- **Type**: Date (YYYY-MM-DD)
- **Description**: Date the document was last modified
- **Example**: `2024-11-16`
- **Note**: Should be updated whenever significant changes are made

## Optional Fields

### tags
- **Type**: List of strings
- **Description**: Keywords for categorization and search
- **Example**: `[auth, oauth2, security, migration]`
- **Best practice**: Use consistent tags across related documents

### archivable_after
- **Type**: Date (YYYY-MM-DD)
- **Description**: Explicit date after which the document can be auto-archived
- **Example**: `2025-02-16`
- **Note**: Overrides category-based archiving rules when set

### archived_date
- **Type**: Date (YYYY-MM-DD)
- **Description**: Date the document was archived (auto-set by archiving script)
- **Example**: `2024-12-01`

### archive_reason
- **Type**: String
- **Description**: Reason for archiving (auto-set by archiving script)
- **Example**: `"90 days old (threshold: 90)"`

### author
- **Type**: String
- **Description**: Document author or owner
- **Example**: `"Simon Lamb"`

### related_docs
- **Type**: List of strings (file paths)
- **Description**: Links to related documents
- **Example**: `["specs/auth-system/oauth2-spec.md", "plans/oauth2-rollout.md"]`

## Complete Example

```yaml
---
title: OAuth2 Migration Specification
category: specs
status: active
created: 2024-11-16
last_updated: 2024-11-16
tags: [auth, oauth2, security, migration]
author: Simon Lamb
related_docs:
  - analysis/auth-system-audit.md
  - plans/oauth2-implementation-plan.md
---
```

## Validation

Documents are validated using `scripts/validate_doc_metadata.py`. Run this before committing to ensure all metadata is correct.

## Metadata Updates

### When Creating a New Document
1. Copy from `assets/doc_template.md`
2. Fill in all required fields
3. Set status to `draft`
4. Set created and last_updated to current date

### When Updating a Document
1. Update `last_updated` to current date
2. Update `status` if lifecycle stage changes
3. Add relevant `tags` if needed

### When Completing Work
1. Set `status` to `complete`
2. Update `last_updated` to current date
3. Optionally set `archivable_after` if auto-archiving should be deferred

## Best Practices

1. **Consistent Tags**: Use a common vocabulary of tags across documents
2. **Accurate Status**: Keep status up to date as work progresses
3. **Related Docs**: Link to related documents for context and discoverability
4. **Regular Updates**: Update `last_updated` whenever making significant changes
5. **Descriptive Titles**: Use clear, specific titles that describe the content
