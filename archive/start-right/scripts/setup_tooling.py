#!/usr/bin/env python3
"""
Detect project type and set up appropriate tooling configuration

This script:
- Detects project type from files/directories
- Creates appropriate configuration files for linting, formatting, type checking
- Sets up test frameworks
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
    """Detect project type from existing files."""
    cwd = Path(".")
    
    if (cwd / "package.json").exists():
        with open("package.json") as f:
            pkg = json.load(f)
            deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
            
            if "react" in deps or "next" in deps:
                return "react"
            elif "vue" in deps:
                return "vue"
            elif "typescript" in deps or (cwd / "tsconfig.json").exists():
                return "typescript"
            else:
                return "node"
    
    elif (cwd / "Cargo.toml").exists():
        return "rust"
    
    elif (cwd / "go.mod").exists():
        return "go"
    
    elif any(cwd.glob("*.py")) or (cwd / "requirements.txt").exists() or (cwd / "pyproject.toml").exists():
        return "python"
    
    elif (cwd / "Dockerfile").exists():
        return "docker"
    
    return "unknown"


def setup_node_tooling():
    """Set up tooling for Node.js projects."""
    configs = {}
    
    # ESLint configuration
    configs[".eslintrc.json"] = {
        "env": {
            "node": True,
            "es2021": True
        },
        "extends": "eslint:recommended",
        "parserOptions": {
            "ecmaVersion": "latest",
            "sourceType": "module"
        },
        "rules": {}
    }
    
    # Prettier configuration
    configs[".prettierrc.json"] = {
        "semi": True,
        "singleQuote": True,
        "tabWidth": 2,
        "trailingComma": "es5"
    }
    
    # Prettier ignore
    configs[".prettierignore"] = """node_modules
dist
build
coverage
.next
"""
    
    return configs


def setup_typescript_tooling():
    """Set up tooling for TypeScript projects."""
    configs = setup_node_tooling()
    
    # Update ESLint for TypeScript
    configs[".eslintrc.json"] = {
        "env": {
            "node": True,
            "es2021": True
        },
        "extends": [
            "eslint:recommended",
            "plugin:@typescript-eslint/recommended"
        ],
        "parser": "@typescript-eslint/parser",
        "parserOptions": {
            "ecmaVersion": "latest",
            "sourceType": "module"
        },
        "plugins": ["@typescript-eslint"],
        "rules": {}
    }
    
    # Basic TypeScript config if not exists
    if not Path("tsconfig.json").exists():
        configs["tsconfig.json"] = {
            "compilerOptions": {
                "target": "ES2020",
                "module": "commonjs",
                "lib": ["ES2020"],
                "outDir": "./dist",
                "rootDir": "./src",
                "strict": True,
                "esModuleInterop": True,
                "skipLibCheck": True,
                "forceConsistentCasingInFileNames": True
            },
            "include": ["src/**/*"],
            "exclude": ["node_modules", "dist"]
        }
    
    return configs


def setup_python_tooling():
    """Set up tooling for Python projects."""
    configs = {}
    
    # Black configuration (pyproject.toml section)
    configs[".black.toml"] = """[tool.black]
line-length = 88
target-version = ['py39', 'py310', 'py311']
include = '\\.pyi?$'
"""
    
    # Flake8 configuration
    configs[".flake8"] = """[flake8]
max-line-length = 88
extend-ignore = E203, W503
exclude = .git,__pycache__,venv,.venv,build,dist
"""
    
    # MyPy configuration
    configs["mypy.ini"] = """[mypy]
python_version = 3.9
warn_return_any = True
warn_unused_configs = True
disallow_untyped_defs = True
"""
    
    return configs


def setup_rust_tooling():
    """Set up tooling for Rust projects."""
    configs = {}
    
    # Rustfmt configuration
    configs["rustfmt.toml"] = """edition = "2021"
max_width = 100
hard_tabs = false
tab_spaces = 4
"""
    
    # Clippy configuration (in Cargo.toml, return as string for manual addition)
    return configs


def write_configs(configs):
    """Write configuration files to disk."""
    for filename, content in configs.items():
        if isinstance(content, dict):
            with open(filename, "w") as f:
                json.dump(content, f, indent=2)
        else:
            with open(filename, "w") as f:
                f.write(content)
        print(f"✅ Created {filename}")


def main():
    project_type = sys.argv[1] if len(sys.argv) > 1 else detect_project_type()
    
    print(f"🔧 Setting up tooling for {project_type} project...")
    print()
    
    configs = {}
    
    if project_type in ["node", "javascript"]:
        configs = setup_node_tooling()
    elif project_type in ["typescript", "react", "vue"]:
        configs = setup_typescript_tooling()
    elif project_type == "python":
        configs = setup_python_tooling()
    elif project_type == "rust":
        configs = setup_rust_tooling()
    else:
        print(f"⚠️  Unknown project type: {project_type}")
        print("Skipping tooling setup.")
        return
    
    if configs:
        write_configs(configs)
        print(f"\n✅ Tooling configuration complete for {project_type}!")
    
    print("\nNext steps:")
    print("  1. Install dependencies for linting/formatting tools")
    print("  2. Set up pre-commit hooks")
    print("  3. Configure GitHub Actions workflows")


if __name__ == "__main__":
    main()
