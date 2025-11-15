#!/usr/bin/env python3
"""
Validate that all documents have proper YAML frontmatter metadata.
Reports documents with missing or invalid metadata.
"""

import sys
import re
from pathlib import Path
from datetime import datetime
import yaml


REQUIRED_FIELDS = ['title', 'category', 'status', 'created', 'last_updated']
VALID_STATUSES = ['draft', 'active', 'complete', 'archived']
VALID_CATEGORIES = ['ai_docs', 'specs', 'analysis', 'plans', 'templates', 'archive']


def extract_frontmatter(file_path: Path) -> dict:
    """Extract YAML frontmatter from a markdown file."""
    try:
        content = file_path.read_text()
        
        # Match YAML frontmatter between --- delimiters
        match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
        if not match:
            return None  # No frontmatter found
        
        frontmatter_text = match.group(1)
        metadata = yaml.safe_load(frontmatter_text)
        
        return metadata if isinstance(metadata, dict) else None
    
    except Exception as e:
        return {'_error': str(e)}


def validate_date(date_str: str) -> bool:
    """Validate date format (YYYY-MM-DD)."""
    try:
        datetime.strptime(str(date_str), '%Y-%m-%d')
        return True
    except (ValueError, TypeError):
        return False


def validate_metadata(metadata: dict, category_from_path: str) -> list[str]:
    """
    Validate metadata against requirements.
    Returns list of validation errors (empty if valid).
    """
    errors = []
    
    if metadata is None:
        return ["No YAML frontmatter found"]
    
    if '_error' in metadata:
        return [f"Failed to parse frontmatter: {metadata['_error']}"]
    
    # Check required fields
    for field in REQUIRED_FIELDS:
        if field not in metadata:
            errors.append(f"Missing required field: {field}")
    
    # Validate status
    if 'status' in metadata:
        if metadata['status'] not in VALID_STATUSES:
            errors.append(f"Invalid status '{metadata['status']}'. Must be one of: {', '.join(VALID_STATUSES)}")
    
    # Validate category
    if 'category' in metadata:
        if metadata['category'] not in VALID_CATEGORIES:
            errors.append(f"Invalid category '{metadata['category']}'. Must be one of: {', '.join(VALID_CATEGORIES)}")
        elif metadata['category'] != category_from_path:
            errors.append(f"Category mismatch: metadata says '{metadata['category']}' but file is in '{category_from_path}/'")
    
    # Validate dates
    for date_field in ['created', 'last_updated']:
        if date_field in metadata:
            if not validate_date(metadata[date_field]):
                errors.append(f"Invalid {date_field} date format. Must be YYYY-MM-DD")
    
    # Validate tags (optional but must be list if present)
    if 'tags' in metadata:
        if not isinstance(metadata['tags'], list):
            errors.append("Tags must be a list")
    
    return errors


def scan_and_validate(docs_path: Path) -> dict:
    """
    Scan all documents and validate their metadata.
    Returns validation results.
    """
    results = {
        'valid': [],
        'invalid': [],
        'no_frontmatter': [],
        'total': 0
    }
    
    skip_files = {'README.md', 'INDEX.md', '.gitkeep'}
    
    for category_dir in docs_path.iterdir():
        if not category_dir.is_dir() or category_dir.name.startswith('.'):
            continue
        
        category_name = category_dir.name
        
        # Find all markdown files
        for md_file in category_dir.rglob('*.md'):
            if md_file.name in skip_files:
                continue
            
            results['total'] += 1
            relative_path = md_file.relative_to(docs_path)
            
            # Extract and validate metadata
            metadata = extract_frontmatter(md_file)
            errors = validate_metadata(metadata, category_name)
            
            if not errors:
                results['valid'].append(str(relative_path))
            else:
                results['invalid'].append({
                    'path': str(relative_path),
                    'errors': errors
                })
    
    return results


def main():
    """Main entry point."""
    if len(sys.argv) > 1:
        base_path = Path(sys.argv[1]).resolve()
    else:
        base_path = Path.cwd()
    
    docs_path = base_path / 'docs'
    
    if not docs_path.exists():
        print(f"❌ Error: docs/ directory not found at {docs_path}")
        sys.exit(1)
    
    print(f"Validating documents in: {docs_path}")
    print()
    
    # Scan and validate
    results = scan_and_validate(docs_path)
    
    # Display results
    print("=" * 60)
    print("Validation Results:")
    print(f"  Total documents: {results['total']}")
    print(f"  ✅ Valid: {len(results['valid'])}")
    print(f"  ❌ Invalid: {len(results['invalid'])}")
    print()
    
    if results['invalid']:
        print("Invalid Documents:")
        print()
        for item in results['invalid']:
            print(f"  📄 {item['path']}")
            for error in item['errors']:
                print(f"     • {error}")
            print()
    
    if results['valid'] and not results['invalid']:
        print("🎉 All documents have valid metadata!")
    
    # Exit with error code if any invalid documents
    sys.exit(1 if results['invalid'] else 0)


if __name__ == '__main__':
    main()
