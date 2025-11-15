#!/usr/bin/env python3
"""
Initialize the docs/ directory structure for document lifecycle management.
Creates all required directories and initial README.md.
"""

import os
import sys
from pathlib import Path
from datetime import datetime


DIRECTORY_STRUCTURE = {
    'ai_docs': 'Reference materials for Claude Code: SDKs, API docs, repo context',
    'specs': 'Feature and migration specifications',
    'analysis': 'Investigation outputs: bug hunting, optimization, cleanup',
    'plans': 'Implementation plans from specs, analysis, or ad-hoc tasks',
    'templates': 'Reusable document templates',
    'archive': 'Historical and completed documents'
}


README_TEMPLATE = """# Documentation Structure

This directory contains project documentation organized by purpose and lifecycle stage.

## Directory Structure

{directory_descriptions}

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
Last updated: {timestamp}
"""


def create_directory_structure(base_path: Path) -> None:
    """Create the docs directory structure."""
    docs_path = base_path / 'docs'
    
    # Create main docs directory
    docs_path.mkdir(exist_ok=True)
    print(f"✅ Created: {docs_path}")
    
    # Create category directories
    for directory, description in DIRECTORY_STRUCTURE.items():
        dir_path = docs_path / directory
        dir_path.mkdir(exist_ok=True)
        print(f"✅ Created: {dir_path}")
        
        # Create .gitkeep for empty directories
        gitkeep = dir_path / '.gitkeep'
        if not any(dir_path.iterdir()):
            gitkeep.touch()


def create_readme(base_path: Path) -> None:
    """Create the README.md file."""
    docs_path = base_path / 'docs'
    readme_path = docs_path / 'README.md'
    
    # Format directory descriptions
    descriptions = []
    for directory, description in DIRECTORY_STRUCTURE.items():
        descriptions.append(f"- **{directory}/** - {description}")
    
    readme_content = README_TEMPLATE.format(
        directory_descriptions='\n'.join(descriptions),
        timestamp=datetime.now().strftime('%Y-%m-%d')
    )
    
    readme_path.write_text(readme_content)
    print(f"✅ Created: {readme_path}")


def create_index(base_path: Path) -> None:
    """Create initial INDEX.md file."""
    docs_path = base_path / 'docs'
    index_path = docs_path / 'INDEX.md'
    
    index_content = f"""# Documentation Index

Auto-generated index of all documents. Last updated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

Run `python scripts/index_docs.py` to regenerate this index.

---

## Summary

Total documents: 0

---

_No documents found. Add documents to the category directories and regenerate the index._
"""
    
    index_path.write_text(index_content)
    print(f"✅ Created: {index_path}")


def main():
    """Main entry point."""
    if len(sys.argv) > 1:
        base_path = Path(sys.argv[1]).resolve()
    else:
        base_path = Path.cwd()
    
    print(f"Initializing docs structure at: {base_path}")
    print()
    
    create_directory_structure(base_path)
    create_readme(base_path)
    create_index(base_path)
    
    print()
    print("🎉 Documentation structure initialized successfully!")
    print()
    print("Next steps:")
    print("1. Add documents to the category directories")
    print("2. Run 'python scripts/index_docs.py' to update the index")
    print("3. Run 'python scripts/archive_docs.py' periodically to maintain the archive")


if __name__ == '__main__':
    main()
