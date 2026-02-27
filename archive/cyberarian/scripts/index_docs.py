#!/usr/bin/env python3
"""
Generate and update the INDEX.md file by scanning all documents in docs/.
Reads YAML frontmatter to extract metadata and organize the index.
"""

import os
import sys
import re
from pathlib import Path
from datetime import datetime
from collections import defaultdict
import yaml


def extract_frontmatter(file_path: Path) -> dict:
    """Extract YAML frontmatter from a markdown file."""
    try:
        content = file_path.read_text()
        
        # Match YAML frontmatter between --- delimiters
        match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
        if not match:
            return {}
        
        frontmatter_text = match.group(1)
        metadata = yaml.safe_load(frontmatter_text)
        
        return metadata if isinstance(metadata, dict) else {}
    
    except Exception as e:
        print(f"⚠️  Warning: Could not parse frontmatter in {file_path}: {e}")
        return {}


def get_file_stats(file_path: Path) -> dict:
    """Get file statistics."""
    stats = file_path.stat()
    return {
        'size': stats.st_size,
        'modified': datetime.fromtimestamp(stats.st_mtime)
    }


def scan_documents(docs_path: Path) -> dict:
    """Scan all markdown documents in docs/ and extract metadata."""
    categories = defaultdict(list)
    
    # Skip these files/directories
    skip_files = {'README.md', 'INDEX.md', '.gitkeep'}
    skip_dirs = {'archive'}  # We'll handle archive separately
    
    for category_dir in docs_path.iterdir():
        if not category_dir.is_dir() or category_dir.name.startswith('.'):
            continue
        
        category_name = category_dir.name
        
        # Find all markdown files
        for md_file in category_dir.rglob('*.md'):
            if md_file.name in skip_files:
                continue
            
            # Extract metadata
            metadata = extract_frontmatter(md_file)
            stats = get_file_stats(md_file)
            
            # Build document entry
            relative_path = md_file.relative_to(docs_path)
            doc_entry = {
                'path': str(relative_path),
                'title': metadata.get('title', md_file.stem),
                'status': metadata.get('status', 'unknown'),
                'created': metadata.get('created', 'unknown'),
                'last_updated': metadata.get('last_updated', stats['modified'].strftime('%Y-%m-%d')),
                'tags': metadata.get('tags', []),
                'category': category_name,
                'file_modified': stats['modified']
            }
            
            categories[category_name].append(doc_entry)
    
    return categories


def generate_index(categories: dict) -> str:
    """Generate the INDEX.md content."""
    total_docs = sum(len(docs) for docs in categories.values())
    
    index_lines = [
        "# Documentation Index",
        "",
        f"Auto-generated index of all documents. Last updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "Run `python scripts/index_docs.py` to regenerate this index.",
        "",
        "---",
        "",
        "## Summary",
        "",
        f"Total documents: {total_docs}",
        ""
    ]
    
    # Add category breakdown
    if categories:
        index_lines.append("By category:")
        for category in sorted(categories.keys()):
            count = len(categories[category])
            index_lines.append(f"- **{category}**: {count} document{'s' if count != 1 else ''}")
        index_lines.append("")
    
    index_lines.append("---")
    index_lines.append("")
    
    # Add documents by category
    if not categories:
        index_lines.append("_No documents found. Add documents to the category directories and regenerate the index._")
    else:
        for category in sorted(categories.keys()):
            docs = categories[category]
            docs.sort(key=lambda d: d['last_updated'], reverse=True)
            
            index_lines.append(f"## {category.replace('_', ' ').title()}")
            index_lines.append("")
            
            for doc in docs:
                # Format: [Title](path) - status | updated: date | tags
                title_link = f"[{doc['title']}]({doc['path']})"
                status_badge = f"**{doc['status']}**"
                updated = f"updated: {doc['last_updated']}"
                tags = f"tags: [{', '.join(doc['tags'])}]" if doc['tags'] else ""
                
                parts = [title_link, status_badge, updated]
                if tags:
                    parts.append(tags)
                
                index_lines.append(f"- {' | '.join(parts)}")
            
            index_lines.append("")
    
    return '\n'.join(index_lines)


def main():
    """Main entry point."""
    if len(sys.argv) > 1:
        base_path = Path(sys.argv[1]).resolve()
    else:
        base_path = Path.cwd()
    
    docs_path = base_path / 'docs'
    
    if not docs_path.exists():
        print(f"❌ Error: docs/ directory not found at {docs_path}")
        print("Run 'python scripts/init_docs_structure.py' first to initialize the structure.")
        sys.exit(1)
    
    print(f"Scanning documents in: {docs_path}")
    
    # Scan all documents
    categories = scan_documents(docs_path)
    
    # Generate index content
    index_content = generate_index(categories)
    
    # Write INDEX.md
    index_path = docs_path / 'INDEX.md'
    index_path.write_text(index_content)
    
    total_docs = sum(len(docs) for docs in categories.values())
    print(f"✅ Generated index with {total_docs} documents")
    print(f"✅ Updated: {index_path}")


if __name__ == '__main__':
    main()
