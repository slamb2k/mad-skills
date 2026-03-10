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
│     {✅|⏭️} specs/         Specifications
│     {✅|⏭️} context/       Domain knowledge
│     {✅|⏭️} .tmp/          Temp directory
│
│  📄 Files
│     {✅|⏭️} CLAUDE.md
│     {✅|⏭️} .gitignore
│
│  🗑️ Removed (only if legacy items were cleaned up)
│     {✅} goals/            Legacy goals directory
│     {✅} tools/memory/     Legacy memory scripts
│     {✅} memory/           Legacy memory directory
│
│  ⚠️ Notes
│     {any warnings or skipped items}
│
│  ⚡ Next steps
│     1. Review CLAUDE.md and customise for your project
│     2. Add domain knowledge to context/
│     3. Run /speccy to design your first feature
│
└─────────────────────────────────────────────────
```

Status indicators: ✅ created/exists · ⏭️ skipped · ⚠️ merged/upgraded · ❌ failed
