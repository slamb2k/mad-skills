# Build Project Detection

Auto-detect the project's language, test runner, and build tools.
Run this during pre-flight to populate PROJECT_CONFIG.

## Detection Chain

```
1. Check for package.json → Node.js project
   test_runner: look for scripts.test → "npm test" / "bun test" / etc.
   test_setup: none (or "npm install" if node_modules missing)

2. Check for pyproject.toml / setup.py / requirements.txt → Python project
   test_runner: "python -m pytest tests/ -x -q --tb=short"
   test_setup: "source .venv/bin/activate" (if .venv exists)

3. Check for go.mod → Go project
   test_runner: "go test ./..."
   test_setup: none

4. Check for Cargo.toml → Rust project
   test_runner: "cargo test"
   test_setup: none

5. Fallback → unknown
   test_runner: prompt user
   test_setup: prompt user
```

## PROJECT_CONFIG Output

```
PROJECT_CONFIG:
  language: node|python|go|rust|unknown
  package_manager: npm|bun|pnpm|yarn|pip|cargo|go|unknown
  test_runner: {command to run tests}
  test_setup: {optional setup command, or "none"}
  build_command: {optional build command, or "none"}
```

## Usage

All stage prompts reference `{PROJECT_CONFIG.test_runner}` instead of
hardcoded test commands. The orchestrator substitutes the detected value
before sending prompts to subagents.
