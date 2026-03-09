# Rig Final Report Template

Present this summary after all configuration is complete:

```
┌─ Rig · Report ─────────────────────────────────
│
│  ✅ Rig complete
│
│  📂 Repository: {repo_name}
│  🌐 Branch:     {branch}
│
│  📝 Configured
│     {✅|⏭️} Lefthook installed and configured
│     {✅|⏭️} Pre-commit hooks: {list}
│     {✅|⏭️} Pre-push hooks: {list}
│     {✅|⏭️} Commit template: .gitmessage
│     {✅|⏭️} PR template: {path}
│     {✅|⏭️} CI workflow: {path}
│     {✅|⏭️} Azure Pipelines: {list} (if applicable)
│
│  ⚠️ Notes
│     {any warnings}
│
│  ⚡ Next steps
│     1. Review generated files and commit them
│     2. Push to remote to activate CI
│     3. Test hooks: lefthook run pre-commit
│
└─────────────────────────────────────────────────
```
