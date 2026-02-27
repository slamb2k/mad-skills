#!/usr/bin/env python3
"""
Initialize git repository and create GitHub remote

This script handles:
- Git initialization with main as default branch
- GitHub repository creation (public/private)
- Remote configuration
- Initial commit setup
"""

import subprocess
import sys
import json
from pathlib import Path


def run_command(cmd, check=True, capture_output=True):
    """Run a shell command and return the result."""
    result = subprocess.run(
        cmd,
        shell=True,
        check=check,
        capture_output=capture_output,
        text=True
    )
    return result


def check_prerequisites():
    """Verify git and gh CLI are installed and authenticated."""
    errors = []
    
    # Check git
    try:
        run_command("git --version")
    except subprocess.CalledProcessError:
        errors.append("Git is not installed")
    
    # Check gh CLI
    try:
        run_command("gh --version")
    except subprocess.CalledProcessError:
        errors.append("GitHub CLI (gh) is not installed")
    else:
        # Check gh authentication
        try:
            run_command("gh auth status")
        except subprocess.CalledProcessError:
            errors.append("GitHub CLI is not authenticated (run: gh auth login)")
    
    return errors


def init_git():
    """Initialize git repository with main as default branch."""
    if Path(".git").exists():
        print("⚠️  Git repository already initialized")
        return False
    
    run_command("git init -b main")
    print("✅ Initialized git repository with 'main' as default branch")
    return True


def create_github_repo(repo_name, visibility="public", org=None):
    """Create GitHub repository and set as remote."""
    # Build gh repo create command
    cmd = f"gh repo create {repo_name} --{visibility} --source=."
    
    if org:
        cmd += f" --org {org}"
    
    try:
        result = run_command(cmd)
        print(f"✅ Created GitHub repository: {repo_name} ({visibility})")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to create GitHub repository: {e.stderr}")
        return False


def create_gitignore(project_type=None):
    """Create an appropriate .gitignore file."""
    common_patterns = [
        "# Dependencies",
        "node_modules/",
        ".pnp",
        ".pnp.js",
        "",
        "# Testing",
        "coverage/",
        "*.log",
        "",
        "# Environment",
        ".env",
        ".env.local",
        ".env.*.local",
        "",
        "# IDE",
        ".vscode/",
        ".idea/",
        "*.swp",
        "*.swo",
        "*~",
        "",
        "# OS",
        ".DS_Store",
        "Thumbs.db",
        "",
        "# Build outputs",
        "dist/",
        "build/",
        "*.exe",
        "*.dll",
        "*.so",
        "*.dylib",
        ""
    ]
    
    type_specific = {
        "node": [
            "# Node specific",
            "npm-debug.log*",
            "yarn-debug.log*",
            "yarn-error.log*",
            ".npm",
        ],
        "python": [
            "# Python specific",
            "__pycache__/",
            "*.py[cod]",
            "*$py.class",
            ".Python",
            "venv/",
            "ENV/",
            ".venv/",
            "*.egg-info/",
        ],
        "rust": [
            "# Rust specific",
            "target/",
            "Cargo.lock",
            "**/*.rs.bk",
        ],
        "go": [
            "# Go specific",
            "*.exe",
            "*.exe~",
            "*.test",
            "*.out",
            "vendor/",
        ],
    }
    
    gitignore_content = common_patterns
    if project_type and project_type in type_specific:
        gitignore_content.extend([""] + type_specific[project_type])
    
    with open(".gitignore", "w") as f:
        f.write("\n".join(gitignore_content))
    
    print("✅ Created .gitignore")


def main():
    if len(sys.argv) < 2:
        print("Usage: init_git_repo.py <repo-name> [--private] [--org <org-name>] [--type <type>]")
        print("\nOptions:")
        print("  --private       Create private repository (default: public)")
        print("  --org <name>    Create under organization")
        print("  --type <type>   Project type for .gitignore (node|python|rust|go)")
        sys.exit(1)
    
    repo_name = sys.argv[1]
    visibility = "private" if "--private" in sys.argv else "public"
    org = sys.argv[sys.argv.index("--org") + 1] if "--org" in sys.argv else None
    project_type = sys.argv[sys.argv.index("--type") + 1] if "--type" in sys.argv else None
    
    print("🚀 Initializing repository setup...")
    print(f"   Repository: {repo_name}")
    print(f"   Visibility: {visibility}")
    if org:
        print(f"   Organization: {org}")
    if project_type:
        print(f"   Type: {project_type}")
    print()
    
    # Check prerequisites
    errors = check_prerequisites()
    if errors:
        print("❌ Prerequisites not met:")
        for error in errors:
            print(f"   - {error}")
        sys.exit(1)
    
    # Initialize git
    init_git()
    
    # Create .gitignore
    create_gitignore(project_type)
    
    # Create GitHub repo
    if not create_github_repo(repo_name, visibility, org):
        sys.exit(1)
    
    print("\n✅ Repository setup complete!")
    print("\nNext steps:")
    print("  1. Configure branch protection rules")
    print("  2. Set up CI/CD workflows")
    print("  3. Configure git hooks")


if __name__ == "__main__":
    main()
