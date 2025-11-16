#!/usr/bin/env python3
"""
Generate GitHub Actions workflows for CI/CD

This script creates:
- PR validation workflow (runs on feature branches)
- Main branch validation workflow (runs on merge to main)
- Release workflow (versioning, tagging, deployment)
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


def detect_project_type():
    """Detect project type for workflow generation."""
    cwd = Path(".")
    
    if (cwd / "package.json").exists():
        with open("package.json") as f:
            pkg = json.load(f)
            deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
            
            if "react" in deps or "next" in deps:
                return "react"
            elif "vite" in deps:
                return "vite"
            else:
                return "node"
    
    elif (cwd / "Cargo.toml").exists():
        return "rust"
    
    elif (cwd / "go.mod").exists():
        return "go"
    
    elif (cwd / "Dockerfile").exists():
        return "docker"
    
    elif any(cwd.glob("*.py")):
        return "python"
    
    return "generic"


def create_pr_workflow(project_type, checks):
    """Create PR validation workflow."""
    workflow = {
        "name": "PR Validation",
        "on": {
            "pull_request": {
                "branches": ["main"]
            }
        },
        "jobs": {
            "validate": {
                "runs-on": "ubuntu-latest",
                "steps": [
                    {
                        "name": "Checkout code",
                        "uses": "actions/checkout@v4"
                    }
                ]
            }
        }
    }
    
    # Add project-specific setup
    if project_type in ["node", "react", "vite"]:
        workflow["jobs"]["validate"]["steps"].extend([
            {
                "name": "Setup Node.js",
                "uses": "actions/setup-node@v4",
                "with": {
                    "node-version": "20",
                    "cache": "npm"
                }
            },
            {
                "name": "Install dependencies",
                "run": "npm ci"
            }
        ])
    elif project_type == "rust":
        workflow["jobs"]["validate"]["steps"].extend([
            {
                "name": "Setup Rust",
                "uses": "actions-rs/toolchain@v1",
                "with": {
                    "toolchain": "stable",
                    "override": True
                }
            },
            {
                "name": "Cache cargo",
                "uses": "actions/cache@v4",
                "with": {
                    "path": "~/.cargo\ntarget",
                    "key": "${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}"
                }
            }
        ])
    elif project_type == "python":
        workflow["jobs"]["validate"]["steps"].extend([
            {
                "name": "Setup Python",
                "uses": "actions/setup-python@v5",
                "with": {
                    "python-version": "3.11",
                    "cache": "pip"
                }
            },
            {
                "name": "Install dependencies",
                "run": "pip install -r requirements.txt"
            }
        ])
    elif project_type == "go":
        workflow["jobs"]["validate"]["steps"].extend([
            {
                "name": "Setup Go",
                "uses": "actions/setup-go@v5",
                "with": {
                    "go-version": "1.21",
                    "cache": True
                }
            },
            {
                "name": "Install dependencies",
                "run": "go mod download"
            }
        ])
    
    # Add validation checks based on project type
    if "format" in checks:
        if project_type in ["node", "react", "vite"]:
            workflow["jobs"]["validate"]["steps"].append({
                "name": "Check formatting",
                "run": "npm run format:check"
            })
        elif project_type == "rust":
            workflow["jobs"]["validate"]["steps"].append({
                "name": "Check formatting",
                "run": "cargo fmt --check"
            })
        elif project_type == "python":
            workflow["jobs"]["validate"]["steps"].append({
                "name": "Check formatting",
                "run": "black --check ."
            })
    
    if "lint" in checks:
        if project_type in ["node", "react", "vite"]:
            workflow["jobs"]["validate"]["steps"].append({
                "name": "Lint",
                "run": "npm run lint"
            })
        elif project_type == "rust":
            workflow["jobs"]["validate"]["steps"].append({
                "name": "Lint",
                "run": "cargo clippy -- -D warnings"
            })
        elif project_type == "python":
            workflow["jobs"]["validate"]["steps"].append({
                "name": "Lint",
                "run": "flake8 ."
            })
    
    if "type-check" in checks:
        if project_type in ["node", "react", "vite"]:
            workflow["jobs"]["validate"]["steps"].append({
                "name": "Type check",
                "run": "npm run type-check"
            })
        elif project_type == "python":
            workflow["jobs"]["validate"]["steps"].append({
                "name": "Type check",
                "run": "mypy ."
            })
    
    if "test" in checks:
        if project_type in ["node", "react", "vite"]:
            workflow["jobs"]["validate"]["steps"].append({
                "name": "Run tests",
                "run": "npm test"
            })
        elif project_type == "rust":
            workflow["jobs"]["validate"]["steps"].append({
                "name": "Run tests",
                "run": "cargo test"
            })
        elif project_type == "python":
            workflow["jobs"]["validate"]["steps"].append({
                "name": "Run tests",
                "run": "pytest"
            })
        elif project_type == "go":
            workflow["jobs"]["validate"]["steps"].append({
                "name": "Run tests",
                "run": "go test ./..."
            })
    
    if "build" in checks:
        if project_type in ["node", "react", "vite"]:
            workflow["jobs"]["validate"]["steps"].append({
                "name": "Build",
                "run": "npm run build"
            })
        elif project_type == "rust":
            workflow["jobs"]["validate"]["steps"].append({
                "name": "Build",
                "run": "cargo build --release"
            })
        elif project_type == "go":
            workflow["jobs"]["validate"]["steps"].append({
                "name": "Build",
                "run": "go build -o bin/ ./..."
            })
    
    return workflow


def create_main_workflow(project_type, checks):
    """Create main branch workflow with versioning and release."""
    workflow = {
        "name": "Main Branch CI/CD",
        "on": {
            "push": {
                "branches": ["main"]
            }
        },
        "jobs": {
            "validate": {
                "runs-on": "ubuntu-latest",
                "steps": [
                    {
                        "name": "Checkout code",
                        "uses": "actions/checkout@v4",
                        "with": {
                            "fetch-depth": 0  # Full history for versioning
                        }
                    }
                ]
            }
        }
    }
    
    # Reuse PR validation steps
    pr_workflow = create_pr_workflow(project_type, checks)
    workflow["jobs"]["validate"]["steps"].extend(pr_workflow["jobs"]["validate"]["steps"][1:])
    
    # Add versioning and tagging
    workflow["jobs"]["validate"]["steps"].extend([
        {
            "name": "Bump version and push tag",
            "id": "version",
            "uses": "anothrNick/github-tag-action@1.67.0",
            "env": {
                "GITHUB_TOKEN": "${{ secrets.GITHUB_TOKEN }}",
                "WITH_V": "true",
                "DEFAULT_BUMP": "patch"
            }
        }
    ])
    
    # Add release job
    workflow["jobs"]["release"] = {
        "needs": "validate",
        "runs-on": "ubuntu-latest",
        "permissions": {
            "contents": "write"
        },
        "steps": [
            {
                "name": "Checkout code",
                "uses": "actions/checkout@v4"
            },
            {
                "name": "Call release workflow",
                "uses": "./.github/workflows/release.yml",
                "with": {
                    "version": "${{ needs.validate.outputs.new_tag }}"
                }
            }
        ]
    }
    
    # Set output
    workflow["jobs"]["validate"]["outputs"] = {
        "new_tag": "${{ steps.version.outputs.new_tag }}"
    }
    
    return workflow


def create_release_workflow(project_type, release_type):
    """Create reusable release workflow based on project and release type."""
    workflow = {
        "name": "Release",
        "on": {
            "workflow_call": {
                "inputs": {
                    "version": {
                        "required": True,
                        "type": "string"
                    }
                }
            }
        },
        "jobs": {
            "release": {
                "runs-on": "ubuntu-latest",
                "permissions": {
                    "contents": "write",
                    "packages": "write"
                },
                "steps": [
                    {
                        "name": "Checkout code",
                        "uses": "actions/checkout@v4"
                    }
                ]
            }
        }
    }
    
    if release_type == "npm":
        workflow["jobs"]["release"]["steps"].extend([
            {
                "name": "Setup Node.js",
                "uses": "actions/setup-node@v4",
                "with": {
                    "node-version": "20",
                    "registry-url": "https://registry.npmjs.org/"
                }
            },
            {
                "name": "Install dependencies",
                "run": "npm ci"
            },
            {
                "name": "Build",
                "run": "npm run build"
            },
            {
                "name": "Publish to npm",
                "run": "npm publish",
                "env": {
                    "NODE_AUTH_TOKEN": "${{ secrets.NPM_TOKEN }}"
                }
            },
            {
                "name": "Create GitHub Release",
                "uses": "softprops/action-gh-release@v1",
                "with": {
                    "tag_name": "${{ inputs.version }}",
                    "name": "Release ${{ inputs.version }}",
                    "generate_release_notes": True
                }
            }
        ])
    
    elif release_type == "github-pages":
        workflow["jobs"]["release"]["steps"].extend([
            {
                "name": "Setup Node.js",
                "uses": "actions/setup-node@v4",
                "with": {
                    "node-version": "20"
                }
            },
            {
                "name": "Install dependencies",
                "run": "npm ci"
            },
            {
                "name": "Build",
                "run": "npm run build"
            },
            {
                "name": "Deploy to GitHub Pages",
                "uses": "peaceiris/actions-gh-pages@v3",
                "with": {
                    "github_token": "${{ secrets.GITHUB_TOKEN }}",
                    "publish_dir": "./dist"
                }
            },
            {
                "name": "Create GitHub Release",
                "uses": "softprops/action-gh-release@v1",
                "with": {
                    "tag_name": "${{ inputs.version }}",
                    "body": "Deployed to GitHub Pages: https://${{ github.repository_owner }}.github.io/${{ github.event.repository.name }}",
                    "generate_release_notes": True
                }
            }
        ])
    
    elif release_type == "docker":
        workflow["jobs"]["release"]["steps"].extend([
            {
                "name": "Set up Docker Buildx",
                "uses": "docker/setup-buildx-action@v3"
            },
            {
                "name": "Login to GitHub Container Registry",
                "uses": "docker/login-action@v3",
                "with": {
                    "registry": "ghcr.io",
                    "username": "${{ github.actor }}",
                    "password": "${{ secrets.GITHUB_TOKEN }}"
                }
            },
            {
                "name": "Build and push",
                "uses": "docker/build-push-action@v5",
                "with": {
                    "context": ".",
                    "push": True,
                    "tags": "ghcr.io/${{ github.repository }}:${{ inputs.version }},ghcr.io/${{ github.repository }}:latest"
                }
            },
            {
                "name": "Create GitHub Release",
                "uses": "softprops/action-gh-release@v1",
                "with": {
                    "tag_name": "${{ inputs.version }}",
                    "body": "Docker image: `ghcr.io/${{ github.repository }}:${{ inputs.version }}`",
                    "generate_release_notes": True
                }
            }
        ])
    
    elif release_type == "binary":
        # For Rust, Go, or other compiled languages
        workflow["jobs"]["release"]["steps"].extend([
            {
                "name": "Build binaries",
                "run": "# Add build commands for your project"
            },
            {
                "name": "Create GitHub Release",
                "uses": "softprops/action-gh-release@v1",
                "with": {
                    "tag_name": "${{ inputs.version }}",
                    "files": "bin/*",  # Adjust path as needed
                    "generate_release_notes": True
                }
            }
        ])
    
    elif release_type == "skill":
        # For Claude Code skills
        workflow["jobs"]["release"]["steps"].extend([
            {
                "name": "Create GitHub Release",
                "uses": "softprops/action-gh-release@v1",
                "with": {
                    "tag_name": "${{ inputs.version }}",
                    "generate_release_notes": True
                }
            }
        ])
    
    return workflow


def write_workflow(workflow, filename):
    """Write workflow to .github/workflows directory."""
    workflows_dir = Path(".github/workflows")
    workflows_dir.mkdir(parents=True, exist_ok=True)
    
    filepath = workflows_dir / filename
    
    import yaml
    try:
        with open(filepath, "w") as f:
            yaml.dump(workflow, f, default_flow_style=False, sort_keys=False)
    except ImportError:
        # Manual YAML writing if pyyaml not available
        import json
        yaml_str = json.dumps(workflow, indent=2)
        # Basic conversion (not perfect but works for simple cases)
        with open(filepath, "w") as f:
            f.write(yaml_str.replace('"', '').replace(',', ''))
    
    print(f"✅ Created {filepath}")


def main():
    if len(sys.argv) < 2:
        print("Usage: generate_workflows.py [--checks format,lint,test,build] [--release npm|github-pages|docker|binary|skill]")
        print("\nOptions:")
        print("  --checks <list>    Comma-separated validation checks")
        print("  --release <type>   Release strategy")
        print("\nRelease types:")
        print("  npm              Publish to npm registry")
        print("  github-pages     Deploy to GitHub Pages")
        print("  docker           Build and push Docker image")
        print("  binary           Build and release binary artifacts")
        print("  skill            Claude Code skill (no deployment needed)")
        sys.exit(1)
    
    # Parse arguments
    checks = ["format", "lint", "test", "build"]  # defaults
    if "--checks" in sys.argv:
        idx = sys.argv.index("--checks")
        if idx + 1 < len(sys.argv):
            checks = sys.argv[idx + 1].split(",")
    
    release_type = None
    if "--release" in sys.argv:
        idx = sys.argv.index("--release")
        if idx + 1 < len(sys.argv):
            release_type = sys.argv[idx + 1]
    
    project_type = detect_project_type()
    
    print("⚙️  Generating GitHub Actions workflows...")
    print(f"   Project type: {project_type}")
    print(f"   Checks: {', '.join(checks)}")
    if release_type:
        print(f"   Release type: {release_type}")
    print()
    
    # Create PR workflow
    pr_workflow = create_pr_workflow(project_type, checks)
    write_workflow(pr_workflow, "pr-validation.yml")
    
    # Create main branch workflow
    main_workflow = create_main_workflow(project_type, checks)
    write_workflow(main_workflow, "main-ci-cd.yml")
    
    # Create release workflow if specified
    if release_type:
        release_workflow = create_release_workflow(project_type, release_type)
        write_workflow(release_workflow, "release.yml")
    
    print("\n✅ GitHub Actions workflows created!")
    print("\nWorkflows:")
    print("  - pr-validation.yml: Runs on PRs to main")
    print("  - main-ci-cd.yml: Runs on merge to main, handles versioning")
    if release_type:
        print(f"  - release.yml: Handles {release_type} deployment")


if __name__ == "__main__":
    main()
