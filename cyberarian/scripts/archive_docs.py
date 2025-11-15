#!/usr/bin/env python3
"""
Automatically archive documents based on status, age, and category-specific rules.
Documents are moved to archive/ and their metadata is updated.
"""

import os
import sys
import re
import shutil
from pathlib import Path
from datetime import datetime, timedelta
import yaml


# Archiving rules by category (days since last_updated)
ARCHIVING_RULES = {
    'specs': {
        'complete_after_days': 90,
        'auto_archive': True,
        'require_complete_status': True
    },
    'analysis': {
        'complete_after_days': 60,
        'auto_archive': True,
        'require_complete_status': True
    },
    'plans': {
        'complete_after_days': 30,
        'auto_archive': True,
        'require_complete_status': True
    },
    'ai_docs': {
        'auto_archive': False,  # Manual archiving only for reference docs
    },
    'templates': {
        'auto_archive': False,  # Never auto-archive templates
    }
}


def extract_frontmatter(file_path: Path) -> tuple[dict, str]:
    """Extract YAML frontmatter and remaining content from a markdown file."""
    try:
        content = file_path.read_text()
        
        # Match YAML frontmatter between --- delimiters
        match = re.match(r'^---\s*\n(.*?)\n---\s*\n(.*)', content, re.DOTALL)
        if not match:
            return {}, content
        
        frontmatter_text = match.group(1)
        body = match.group(2)
        metadata = yaml.safe_load(frontmatter_text)
        
        return (metadata if isinstance(metadata, dict) else {}), body
    
    except Exception as e:
        print(f"⚠️  Warning: Could not parse {file_path}: {e}")
        return {}, ""


def update_frontmatter(file_path: Path, metadata: dict) -> None:
    """Update the YAML frontmatter in a markdown file."""
    _, body = extract_frontmatter(file_path)
    
    frontmatter = yaml.dump(metadata, default_flow_style=False, sort_keys=False)
    new_content = f"---\n{frontmatter}---\n{body}"
    
    file_path.write_text(new_content)


def should_archive(metadata: dict, category: str, file_modified: datetime) -> tuple[bool, str]:
    """
    Determine if a document should be archived based on rules.
    Returns (should_archive, reason).
    """
    # Skip if already archived
    if metadata.get('status') == 'archived':
        return False, "already archived"
    
    # Get category rules
    rules = ARCHIVING_RULES.get(category, {})
    
    # Skip if auto-archiving is disabled for this category
    if not rules.get('auto_archive', False):
        return False, f"{category} does not auto-archive"
    
    # Check if status is 'complete' (required for most categories)
    if rules.get('require_complete_status', False):
        if metadata.get('status') != 'complete':
            return False, "status is not 'complete'"
    
    # Check age-based archiving
    complete_after_days = rules.get('complete_after_days')
    if complete_after_days:
        last_updated = metadata.get('last_updated')
        if not last_updated:
            return False, "no last_updated date in metadata"
        
        try:
            if isinstance(last_updated, str):
                updated_date = datetime.strptime(last_updated, '%Y-%m-%d').date()
            else:
                # YAML parser returns date objects, convert to date for comparison
                updated_date = last_updated if hasattr(last_updated, 'year') else datetime.strptime(str(last_updated), '%Y-%m-%d').date()
            
            days_old = (datetime.now().date() - updated_date).days
            
            if days_old >= complete_after_days:
                return True, f"{days_old} days old (threshold: {complete_after_days})"
        except ValueError:
            return False, "invalid last_updated date format"
    
    return False, "no archiving criteria met"


def archive_document(file_path: Path, docs_path: Path, reason: str, dry_run: bool = False) -> bool:
    """
    Archive a document by moving it to archive/ and updating its metadata.
    Returns True if successful.
    """
    try:
        # Read metadata
        metadata, body = extract_frontmatter(file_path)
        
        # Determine archive path (preserve subdirectory structure)
        relative_path = file_path.relative_to(docs_path)
        category = relative_path.parts[0]
        
        # Create archive subdirectory for the category
        archive_path = docs_path / 'archive' / category
        archive_path.mkdir(parents=True, exist_ok=True)
        
        # Build destination path
        archive_file = archive_path / file_path.name
        
        # Handle name conflicts
        if archive_file.exists():
            base = archive_file.stem
            suffix = archive_file.suffix
            counter = 1
            while archive_file.exists():
                archive_file = archive_path / f"{base}_{counter}{suffix}"
                counter += 1
        
        if dry_run:
            print(f"  [DRY RUN] Would archive: {relative_path} → archive/{category}/{archive_file.name}")
            print(f"            Reason: {reason}")
            return True
        
        # Update metadata
        metadata['status'] = 'archived'
        metadata['archived_date'] = datetime.now().strftime('%Y-%m-%d')
        metadata['archive_reason'] = reason
        
        # Write updated file to archive
        frontmatter = yaml.dump(metadata, default_flow_style=False, sort_keys=False)
        new_content = f"---\n{frontmatter}---\n{body}"
        archive_file.write_text(new_content)
        
        # Remove original
        file_path.unlink()
        
        print(f"  ✅ Archived: {relative_path} → archive/{category}/{archive_file.name}")
        print(f"     Reason: {reason}")
        
        return True
    
    except Exception as e:
        print(f"  ❌ Error archiving {file_path}: {e}")
        return False


def scan_and_archive(docs_path: Path, dry_run: bool = False) -> dict:
    """
    Scan all documents and archive those that meet criteria.
    Returns statistics about the archiving operation.
    """
    stats = {
        'scanned': 0,
        'archived': 0,
        'skipped': 0,
        'errors': 0
    }
    
    skip_files = {'README.md', 'INDEX.md', '.gitkeep'}
    skip_dirs = {'archive'}
    
    for category_dir in docs_path.iterdir():
        if not category_dir.is_dir() or category_dir.name in skip_dirs or category_dir.name.startswith('.'):
            continue
        
        category_name = category_dir.name
        
        # Find all markdown files
        for md_file in category_dir.rglob('*.md'):
            if md_file.name in skip_files:
                continue
            
            stats['scanned'] += 1
            
            # Extract metadata
            metadata, _ = extract_frontmatter(md_file)
            file_stats = md_file.stat()
            file_modified = datetime.fromtimestamp(file_stats.st_mtime)
            
            # Check if should archive
            should_arch, reason = should_archive(metadata, category_name, file_modified)
            
            if should_arch:
                success = archive_document(md_file, docs_path, reason, dry_run)
                if success:
                    stats['archived'] += 1
                else:
                    stats['errors'] += 1
            else:
                stats['skipped'] += 1
    
    return stats


def main():
    """Main entry point."""
    dry_run = '--dry-run' in sys.argv
    
    # Get base path
    args = [arg for arg in sys.argv[1:] if not arg.startswith('--')]
    if args:
        base_path = Path(args[0]).resolve()
    else:
        base_path = Path.cwd()
    
    docs_path = base_path / 'docs'
    
    if not docs_path.exists():
        print(f"❌ Error: docs/ directory not found at {docs_path}")
        sys.exit(1)
    
    print(f"Scanning documents in: {docs_path}")
    if dry_run:
        print("🔍 DRY RUN MODE - No files will be modified")
    print()
    
    # Scan and archive
    stats = scan_and_archive(docs_path, dry_run)
    
    print()
    print("=" * 60)
    print("Archive Summary:")
    print(f"  Documents scanned: {stats['scanned']}")
    print(f"  Documents archived: {stats['archived']}")
    print(f"  Documents skipped: {stats['skipped']}")
    print(f"  Errors: {stats['errors']}")
    print()
    
    if not dry_run and stats['archived'] > 0:
        print("💡 Tip: Run 'python scripts/index_docs.py' to update the documentation index")


if __name__ == '__main__':
    main()
