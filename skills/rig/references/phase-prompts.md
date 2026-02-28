# Rig Phase Prompts

Subagent prompts for system check, repo analysis, and verification phases.

---

## Phase 1: System Requirements Check

**Agent:** Bash (haiku)

```
Check system requirements for repository bootstrapping.

Limit SYSTEM_REPORT to 10 lines maximum.

## Checks

1. **Git installed**
   git --version
   Record: git_installed, git_version

2. **Git global config**
   git config --global user.email
   git config --global user.name
   Record: email_configured, name_configured, email_value, name_value

## Output Format

SYSTEM_REPORT:
- git_installed: true|false
- git_version: {version}
- email_configured: true|false
- email_value: {email or "not set"}
- name_configured: true|false
- name_value: {name or "not set"}
```

---

## Phase 2: Repository Analysis

**Agent:** Bash (haiku)

```
Analyze repository structure and current configuration.

Limit REPO_REPORT to 20 lines maximum.

## Checks

1. **Git initialization**
   [ -d .git ] && echo "initialized" || echo "not initialized"
   Record: git_initialized

2. **Branch name** (if initialized)
   git branch --show-current 2>/dev/null || git symbolic-ref --short HEAD 2>/dev/null
   Record: current_branch, is_main=(branch == "main")

3. **Lefthook**
   command -v lefthook >/dev/null && echo "installed" || echo "not installed"
   [ -f lefthook.yml ] && echo "configured" || echo "not configured"
   Record: lefthook_installed, lefthook_configured

4. **Commit template**
   [ -f .gitmessage ] && echo "exists" || echo "missing"
   git config commit.template 2>/dev/null
   Record: commit_template_exists, commit_template_configured

5. **Platform detection**
   REMOTE_URL=$(git remote get-url origin 2>/dev/null)
   if echo "$REMOTE_URL" | grep -qiE 'dev\.azure\.com|visualstudio\.com'; then
     PLATFORM="azdo"
   elif echo "$REMOTE_URL" | grep -qi 'github\.com'; then
     PLATFORM="github"
   else
     PLATFORM="github"
   fi
   Record: platform

6. **PR template**
   If PLATFORM == github:
     [ -f .github/pull_request_template.md ] && echo "exists" || echo "missing"
   If PLATFORM == azdo:
     ([ -f .azuredevops/pull_request_template.md ] || [ -f pull_request_template.md ]) && echo "exists" || echo "missing"
   Record: pr_template_exists

7. **CI workflow**
   If PLATFORM == github:
     [ -f .github/workflows/ci.yml ] && echo "exists" || echo "missing"
   If PLATFORM == azdo:
     [ -f azure-pipelines.yml ] && echo "exists" || echo "missing"
   Record: ci_workflow_exists

8. **Azure pipeline YAML files** (if PLATFORM == azdo)
   Find pipeline YAML files in the repo:
   ```
   find . -maxdepth 3 \( -name "azure-pipelines.yml" -o -name "*.azure-pipelines.yml" \) -not -path "./.git/*" 2>/dev/null
   ```
   For each file found, check if a matching pipeline already exists in Azure DevOps:
   ```
   az pipelines list --query "[].{name:name, path:process.yamlFilename}" -o tsv 2>/dev/null
   ```
   Record: pipeline_yaml_files, existing_pipelines

9. **Project structure**
   ls package.json 2>/dev/null && echo "has_package_json"
   ls requirements.txt pyproject.toml setup.py 2>/dev/null && echo "has_python"
   ls go.mod 2>/dev/null && echo "has_go"
   ls Cargo.toml 2>/dev/null && echo "has_rust"
   Find frontend dirs: src/components, frontend/, client/, app/
   Find backend dirs: src/api, backend/, server/, api/
   Record: project_type, has_frontend, has_backend, detected_components

9. **Existing scripts** (for hook configuration)
   Parse package.json scripts if exists: lint, format, format:check, typecheck, type-check, test
   Record: available_scripts

## Output Format

REPO_REPORT:
- git_initialized: true|false
- current_branch: {branch or "N/A"}
- is_main_branch: true|false
- platform: github|azdo
- lefthook_installed: true|false
- lefthook_configured: true|false
- commit_template_exists: true|false
- commit_template_configured: true|false
- pr_template_exists: true|false
- ci_workflow_exists: true|false
- pipeline_yaml_files: [list of paths, or "none"] (azdo only)
- existing_pipelines: [list of registered pipeline names, or "none"] (azdo only)
- unregistered_pipelines: [pipeline YAMLs not yet registered, or "none"] (azdo only)
- project_type: node|python|go|rust|unknown
- has_frontend: true|false
- has_backend: true|false
- detected_components: [list]
- available_scripts: {scripts from package.json}
```

---

## Phase 5: Verification

**Agent:** Bash (haiku)

```
Verify rig configuration was applied correctly.

Limit VERIFY_REPORT to 10 lines maximum.

## Checks

1. Test lefthook
   lefthook run pre-commit --dry-run 2>&1

2. Verify files exist
   Detect platform from remote URL (same pattern as Phase 2).
   If PLATFORM == github:
     ls -la .gitmessage lefthook.yml .github/pull_request_template.md .github/workflows/ci.yml
   If PLATFORM == azdo:
     ls -la .gitmessage lefthook.yml .azuredevops/pull_request_template.md azure-pipelines.yml
     (Also check root-level pull_request_template.md as fallback)

3. Check git config
   git config --local commit.template

4. Verify Azure Pipelines registered (if PLATFORM == azdo and pipelines were created in Phase 4)
   az pipelines list --query "[].{name:name, id:id}" -o table 2>/dev/null
   Record: registered_pipelines

## Output Format

VERIFY_REPORT:
- lefthook_working: true|false
- lefthook_error: {error if any}
- files_created: [list]
- git_config_set: true|false
- registered_pipelines: [list of pipeline names, or "N/A"] (azdo only)
```
