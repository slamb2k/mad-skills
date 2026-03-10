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
│     {✅|⏭️} tools/         Deterministic scripts
│     {✅|⏭️} context/       Domain knowledge
│     {✅|⏭️} hardprompts/   Instruction templates
│     {✅|⏭️} args/          Behaviour settings
│     {✅|⏭️} .tmp/          Temp directory
│
│  📄 Files
│     {✅|⏭️} CLAUDE.md
│     {✅|⏭️} .gitignore
│     {✅|⏭️} tools/manifest.md
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
