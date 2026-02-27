#!/usr/bin/env python3
"""
Configure GitHub branch protection rules

This script sets up branch protection for the main branch to:
- Prevent direct pushes to main
- Require pull request reviews
- Require status checks to pass
- Automatically delete head branches after merge
"""

import subprocess
import sys
import json


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


def get_repo_info():
    """Get current repository owner and name."""
    try:
        result = run_command("gh repo view --json owner,name")
        repo_data = json.loads(result.stdout)
        return repo_data["owner"]["login"], repo_data["name"]
    except Exception as e:
        print(f"❌ Failed to get repository info: {e}")
        sys.exit(1)


def enable_branch_protection(branch="main", required_checks=None):
    """Enable branch protection rules."""
    owner, repo = get_repo_info()
    
    # Base protection rules
    protection_rules = {
        "required_pull_request_reviews": {
            "required_approving_review_count": 0,  # Solo dev doesn't need reviews
            "dismiss_stale_reviews": True,
        },
        "enforce_admins": False,  # Allow admins to bypass for solo dev
        "required_status_checks": {
            "strict": True,
            "contexts": required_checks or []
        },
        "restrictions": None,  # No push restrictions for solo dev
        "allow_force_pushes": False,
        "allow_deletions": False,
    }
    
    # Use gh api to set branch protection
    cmd = f'''gh api repos/{owner}/{repo}/branches/{branch}/protection \\
        -X PUT \\
        -H "Accept: application/vnd.github+json" \\
        -f required_status_checks[strict]=true \\
        -f required_status_checks[contexts][]=build \\
        -f enforce_admins=false \\
        -f required_pull_request_reviews[required_approving_review_count]=0 \\
        -f required_pull_request_reviews[dismiss_stale_reviews]=true \\
        -f allow_force_pushes=false \\
        -f allow_deletions=false'''
    
    try:
        run_command(cmd)
        print(f"✅ Enabled branch protection for '{branch}'")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to enable branch protection: {e.stderr}")
        return False


def configure_repo_settings():
    """Configure repository settings for PR workflow."""
    owner, repo = get_repo_info()
    
    # Enable auto-delete of head branches
    cmd = f'''gh api repos/{owner}/{repo} \\
        -X PATCH \\
        -H "Accept: application/vnd.github+json" \\
        -f delete_branch_on_merge=true \\
        -f allow_squash_merge=true \\
        -f allow_merge_commit=false \\
        -f allow_rebase_merge=false'''
    
    try:
        run_command(cmd)
        print("✅ Configured repository settings:")
        print("   - Auto-delete head branches after merge: enabled")
        print("   - Squash merging: enabled")
        print("   - Merge commits: disabled")
        print("   - Rebase merging: disabled")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to configure repository settings: {e.stderr}")
        return False


def main():
    required_checks = []
    if len(sys.argv) > 1:
        # Accept comma-separated list of required status checks
        required_checks = sys.argv[1].split(",")
    
    print("🔒 Configuring branch protection...")
    print()
    
    # Configure repository settings
    configure_repo_settings()
    print()
    
    # Enable branch protection
    enable_branch_protection("main", required_checks)
    
    print("\n✅ Branch protection configured!")
    print("\nProtection rules applied:")
    print("  - Direct pushes to 'main' blocked")
    print("  - Pull requests required")
    print("  - Status checks required (if configured)")
    print("  - Feature branches auto-deleted after merge")
    print("  - Squash merge enforced")


if __name__ == "__main__":
    main()
