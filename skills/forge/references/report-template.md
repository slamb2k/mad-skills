# Forge Report Template

Present this summary after verification completes.

---

```
Forge Complete!

  Project:   {project_name}
  Directory: {cwd}

  Structure:
    {status} goals/         Goals layer
    {status} tools/         Tools layer
    {status} context/       Context layer
    {status} hardprompts/   Hard prompts layer
    {status} args/          Args layer
    {status} .tmp/          Temp directory

  Files:
    {status} CLAUDE.md
    {status} .gitignore
    {status} goals/manifest.md
    {status} goals/build_app.md
    {status} tools/manifest.md

  Notes:
    {any warnings or skipped items}

  Next steps:
    1. Review CLAUDE.md and customise for your project
    2. Add domain knowledge to context/
    3. Define your first goal in goals/
    4. Start building with the FORGE methodology
```

Status indicators: [created] [exists] [merged] [upgraded] [skipped] [failed]
