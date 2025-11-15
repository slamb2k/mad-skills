# Document Archiving Criteria

Documents are automatically archived based on their category, status, and age. This ensures the active workspace remains focused on current, relevant documentation.

## Archiving Philosophy

**Goals:**
- Keep active directories focused on current work
- Preserve historical context in archive
- Automate routine maintenance while allowing manual control where needed
- Make archiving decisions deterministic and transparent

**Non-goals:**
- Deleting documents (everything is preserved)
- Aggressive archiving that loses important context
- One-size-fits-all rules (categories have different lifecycles)

## Category-Specific Rules

### specs/ - Specifications
**Auto-archive**: Yes  
**Criteria**: Status is `complete` AND >90 days since last_updated

**Rationale**: Specs are valuable reference material even after implementation. 90 days allows for iteration, rollout, and bug fixes before archiving.

**Manual override**: Set `archivable_after` date in frontmatter to defer archiving.

**Example scenarios:**
- ✅ Archive: Feature spec marked `complete` 100 days ago
- ❌ Skip: Active spec being refined
- ❌ Skip: Complete spec only 30 days old (still in rollout phase)

### analysis/ - Investigation Outputs
**Auto-archive**: Yes  
**Criteria**: Status is `complete` AND >60 days since last_updated

**Rationale**: Analysis documents are point-in-time investigations. Once the work is done and changes are implemented, they have less ongoing value. 60 days allows for follow-up work.

**Manual override**: Set `archivable_after` to keep important analyses active longer.

**Example scenarios:**
- ✅ Archive: Bug investigation completed 70 days ago
- ✅ Archive: Performance analysis from 2 months ago
- ❌ Skip: Ongoing investigation (status: `active` or `draft`)

### plans/ - Implementation Plans
**Auto-archive**: Yes  
**Criteria**: Status is `complete` AND >30 days since last_updated

**Rationale**: Plans become stale quickly. Once implementation is done, plans are primarily historical. 30 days accounts for plan execution and retrospective.

**Manual override**: Set `archivable_after` for long-running initiatives.

**Example scenarios:**
- ✅ Archive: Migration plan completed 45 days ago
- ✅ Archive: Sprint plan from last month (status: `complete`)
- ❌ Skip: Ongoing multi-phase plan (status: `active`)
- ❌ Skip: Just-completed plan (20 days old)

### ai_docs/ - Reference Materials
**Auto-archive**: No  
**Manual archiving only**

**Rationale**: Reference materials (SDKs, API docs, repo context) are meant to be persistent. These inform Claude Code's understanding and should only be archived manually when truly obsolete.

**When to manually archive:**
- SDK documentation for deprecated versions
- API references for sunset APIs
- Repository context for archived projects

**Example scenarios:**
- ❌ Auto-archive: Never, regardless of age or status
- ✅ Manual: Move OAuth 1.0 docs when OAuth 2.0 is fully adopted
- ✅ Manual: Archive legacy API docs after migration complete

### templates/ - Reusable Templates
**Auto-archive**: No  
**Templates never auto-archive**

**Rationale**: Templates are meant to be reused indefinitely. They don't have a lifecycle in the same way as other documents.

**When to manually archive:**
- Deprecated templates that should no longer be used
- Templates replaced by improved versions

**Best practice**: Instead of archiving, update templates in place or clearly mark as deprecated in the template itself.

## Archive Structure

Archived documents are moved to `archive/` while preserving their category:

```
archive/
├── specs/
│   └── oauth2-migration-spec.md
├── analysis/
│   └── auth-perf-analysis.md
└── plans/
    └── q3-migration-plan.md
```

This structure:
- Maintains categorical organization
- Allows easy browsing of archived content
- Prevents mixing of categories in archive

## Manual Archiving

To manually archive a document:

1. Move it to `archive/<category>/`
2. Update metadata:
   ```yaml
   status: archived
   archived_date: YYYY-MM-DD
   archive_reason: "Manual archiving: <reason>"
   ```
3. Run `scripts/index_docs.py` to update the index

## Preventing Auto-Archiving

To prevent a document from being auto-archived:

**Option 1**: Keep status as `active` or `draft`  
**Option 2**: Set explicit `archivable_after` date in frontmatter:

```yaml
archivable_after: 2025-12-31  # Don't archive until after this date
```

This is useful for:
- Long-running projects
- Reference specs that should remain active
- Documents with ongoing relevance despite completion

## Running the Archiving Script

```bash
# Dry run to see what would be archived
python scripts/archive_docs.py --dry-run

# Actually archive documents
python scripts/archive_docs.py

# Archive and update index
python scripts/archive_docs.py && python scripts/index_docs.py
```

**Best practice**: Run archiving periodically (weekly or monthly) as part of documentation maintenance.

## Retrieval from Archive

Archived documents are not deleted and can be retrieved by:

1. **Browsing**: Navigate to `archive/<category>/`
2. **Search**: Use grep or file search tools
3. **Index**: Check `INDEX.md` which includes archived documents
4. **Unarchiving**: Move document back to its category and update status

To unarchive a document:
```bash
# Move file back
mv archive/specs/old-spec.md specs/

# Update metadata
# Change status from 'archived' to 'active' or appropriate status
# Remove archived_date and archive_reason fields
```

## Monitoring

The archiving script provides a summary:
```
Archive Summary:
  Documents scanned: 45
  Documents archived: 3
  Documents skipped: 42
  Errors: 0
```

Keep an eye on:
- **Unexpected archives**: Documents archived sooner than expected
- **Errors**: Failed archiving operations
- **Zero archives**: May indicate metadata issues (e.g., status never set to `complete`)
