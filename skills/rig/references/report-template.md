# Rig Final Report Template

Present this summary after all configuration is complete:

```
Rig Complete!

Repository: {repo_name}
Branch: {branch}

Configured:
  {status} Lefthook installed and configured
  {status} Pre-commit hooks: {list of hooks}
  {status} Pre-push hooks: {list of hooks}
  {status} Commit template: .gitmessage
  {status} PR template: {.github/pull_request_template.md | .azuredevops/pull_request_template.md}
  {status} CI workflow: {.github/workflows/ci.yml | azure-pipelines.yml}
  {if azdo and pipelines registered:}
  {status} Azure Pipelines registered: {list of pipeline names}

Notes:
  {any warnings, e.g., "Branch is 'master', consider renaming to 'main'"}

Next steps:
  1. Review generated files and commit them
  2. Push to remote to activate CI
  3. Test hooks with: lefthook run pre-commit
```
