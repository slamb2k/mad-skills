# Brace Report Template

Present this summary after verification completes.

---

```
┌─ Brace · Report ───────────────────────────────
│
│  ✅ Brace complete
│
│  📂 Project:   {project_name}
│  📍 Directory: {cwd}
│
│  📝 Structure
│     {✅|⏭️} goals/         Goals layer
│     {✅|⏭️} tools/         Tools layer
│     {✅|⏭️} context/       Context layer
│     {✅|⏭️} hardprompts/   Hard prompts layer
│     {✅|⏭️} args/          Args layer
│     {✅|⏭️} .tmp/          Temp directory
│
│  📄 Files
│     {✅|⏭️} CLAUDE.md
│     {✅|⏭️} .gitignore
│     {✅|⏭️} goals/manifest.md
│     {✅|⏭️} goals/build_app.md
│     {✅|⏭️} tools/manifest.md
│
│  🗑️ Removed (only if legacy memory was cleaned up)
│     {✅} tools/memory/     Legacy memory scripts
│     {✅} memory/           Legacy memory directory
│
│  ⚠️ Notes
│     {any warnings or skipped items}
│
│  ⚡ Next steps
│     1. Review CLAUDE.md and customise for your project
│     2. Add domain knowledge to context/
│     3. Define your first goal in goals/
│     4. Start building with the BRACE methodology
│
└─────────────────────────────────────────────────
```

Status indicators: ✅ created/exists · ⏭️ skipped · ⚠️ merged/upgraded · ❌ failed
