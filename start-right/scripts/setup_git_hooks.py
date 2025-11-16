#!/usr/bin/env python3
"""
Set up git hooks using husky (Node.js) or lefthook (universal)

This script:
- Detects project type
- Installs and configures appropriate git hooks tool
- Sets up pre-commit and pre-push hooks with validation checks
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


def is_node_project():
    """Check if this is a Node.js project."""
    return Path("package.json").exists()


def setup_husky(checks):
    """Set up husky for Node.js projects."""
    print("📦 Installing husky...")
    
    # Install husky
    try:
        run_command("npm install --save-dev husky")
        run_command("npx husky init")
        print("✅ Husky installed and initialized")
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to install husky: {e}")
        return False
    
    # Create pre-commit hook
    pre_commit_commands = []
    if "format" in checks:
        pre_commit_commands.append("npm run format:check || (echo '❌ Format check failed. Run npm run format' && exit 1)")
    if "lint" in checks:
        pre_commit_commands.append("npm run lint")
    if "type-check" in checks:
        pre_commit_commands.append("npm run type-check")
    
    if pre_commit_commands:
        hook_content = "#!/bin/sh\n. \"$(dirname \"$0\")/_/husky.sh\"\n\n"
        hook_content += "\n".join(pre_commit_commands)
        
        with open(".husky/pre-commit", "w") as f:
            f.write(hook_content)
        Path(".husky/pre-commit").chmod(0o755)
        print("✅ Created pre-commit hook")
    
    # Create pre-push hook
    pre_push_commands = []
    if "test" in checks:
        pre_push_commands.append("npm run test")
    if "build" in checks:
        pre_push_commands.append("npm run build")
    
    if pre_push_commands:
        hook_content = "#!/bin/sh\n. \"$(dirname \"$0\")/_/husky.sh\"\n\n"
        hook_content += "\n".join(pre_push_commands)
        
        with open(".husky/pre-push", "w") as f:
            f.write(hook_content)
        Path(".husky/pre-push").chmod(0o755)
        print("✅ Created pre-push hook")
    
    # Update package.json with scripts if they don't exist
    update_package_json_scripts(checks)
    
    return True


def setup_lefthook(checks):
    """Set up lefthook for any project type."""
    print("📦 Installing lefthook...")
    
    # Check if lefthook is installed
    try:
        run_command("lefthook version")
    except subprocess.CalledProcessError:
        print("Installing lefthook globally...")
        # Try to install via common package managers
        try:
            run_command("brew install lefthook", check=False)
        except:
            try:
                run_command("go install github.com/evilmartians/lefthook@latest", check=False)
            except:
                print("❌ Could not install lefthook. Please install manually:")
                print("   brew install lefthook")
                print("   OR")
                print("   go install github.com/evilmartians/lefthook@latest")
                return False
    
    # Create lefthook.yml configuration
    config = {
        "pre-commit": {
            "parallel": True,
            "commands": {}
        },
        "pre-push": {
            "parallel": False,
            "commands": {}
        }
    }
    
    # Pre-commit checks
    if "format" in checks:
        config["pre-commit"]["commands"]["format-check"] = {
            "run": "npm run format:check || echo 'Run: npm run format'",
        }
    
    if "lint" in checks:
        config["pre-commit"]["commands"]["lint"] = {
            "run": "npm run lint" if is_node_project() else "echo 'Configure linting for your project'",
        }
    
    if "type-check" in checks:
        config["pre-commit"]["commands"]["type-check"] = {
            "run": "npm run type-check",
        }
    
    # Pre-push checks
    if "test" in checks:
        config["pre-push"]["commands"]["test"] = {
            "run": "npm run test" if is_node_project() else "echo 'Configure tests for your project'",
        }
    
    if "build" in checks:
        config["pre-push"]["commands"]["build"] = {
            "run": "npm run build" if is_node_project() else "echo 'Configure build for your project'",
        }
    
    # Write configuration
    import yaml
    try:
        with open("lefthook.yml", "w") as f:
            yaml.dump(config, f, default_flow_style=False)
    except ImportError:
        # Fallback to manual YAML writing if pyyaml not available
        with open("lefthook.yml", "w") as f:
            f.write("pre-commit:\n")
            f.write("  parallel: true\n")
            f.write("  commands:\n")
            for cmd_name, cmd_config in config["pre-commit"]["commands"].items():
                f.write(f"    {cmd_name}:\n")
                f.write(f"      run: {cmd_config['run']}\n")
            
            f.write("\npre-push:\n")
            f.write("  parallel: false\n")
            f.write("  commands:\n")
            for cmd_name, cmd_config in config["pre-push"]["commands"].items():
                f.write(f"    {cmd_name}:\n")
                f.write(f"      run: {cmd_config['run']}\n")
    
    print("✅ Created lefthook.yml")
    
    # Install git hooks
    try:
        run_command("lefthook install")
        print("✅ Installed git hooks")
    except subprocess.CalledProcessError:
        print("⚠️  Run 'lefthook install' to activate hooks")
    
    return True


def update_package_json_scripts(checks):
    """Update package.json with necessary npm scripts if they don't exist."""
    if not is_node_project():
        return
    
    with open("package.json", "r") as f:
        pkg = json.load(f)
    
    scripts = pkg.get("scripts", {})
    modified = False
    
    suggested_scripts = {
        "format": "prettier --write .",
        "format:check": "prettier --check .",
        "lint": "eslint .",
        "type-check": "tsc --noEmit",
        "test": "jest",
        "build": "tsc"
    }
    
    for script_name, script_cmd in suggested_scripts.items():
        if script_name not in scripts:
            # Only add if the check is enabled
            check_type = script_name.split(":")[0] if ":" in script_name else script_name
            if check_type in checks:
                scripts[script_name] = script_cmd
                modified = True
                print(f"ℹ️  Added npm script: {script_name}")
    
    if modified:
        pkg["scripts"] = scripts
        with open("package.json", "w") as f:
            json.dump(pkg, f, indent=2)
        print("✅ Updated package.json scripts")


def main():
    if len(sys.argv) < 2:
        print("Usage: setup_git_hooks.py [--husky|--lefthook] [--checks format,lint,type-check,test,build]")
        print("\nOptions:")
        print("  --husky         Use husky (Node.js projects only)")
        print("  --lefthook      Use lefthook (universal)")
        print("  --checks <list> Comma-separated list of checks to enable")
        print("\nExample:")
        print("  setup_git_hooks.py --husky --checks format,lint,test")
        sys.exit(1)
    
    # Parse arguments
    use_husky = "--husky" in sys.argv
    use_lefthook = "--lefthook" in sys.argv
    
    # Get checks list
    checks = ["format", "lint", "test"]  # defaults
    if "--checks" in sys.argv:
        idx = sys.argv.index("--checks")
        if idx + 1 < len(sys.argv):
            checks = sys.argv[idx + 1].split(",")
    
    # Auto-detect if not specified
    if not use_husky and not use_lefthook:
        if is_node_project():
            use_husky = True
        else:
            use_lefthook = True
    
    print("🪝 Setting up git hooks...")
    print(f"   Tool: {'husky' if use_husky else 'lefthook'}")
    print(f"   Checks: {', '.join(checks)}")
    print()
    
    if use_husky:
        if not is_node_project():
            print("❌ Husky requires a Node.js project (package.json)")
            print("   Use --lefthook for non-Node projects")
            sys.exit(1)
        success = setup_husky(checks)
    else:
        success = setup_lefthook(checks)
    
    if success:
        print("\n✅ Git hooks configured!")
        print("\nHooks will run:")
        print("  Pre-commit:", ", ".join([c for c in checks if c in ["format", "lint", "type-check"]]))
        print("  Pre-push:", ", ".join([c for c in checks if c in ["test", "build"]]))


if __name__ == "__main__":
    main()
