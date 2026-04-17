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
│     {✅|⏭️} ~/.claude/CLAUDE.md  {updated / already present / skipped (project-only)}
│     {✅|⏭️} .gitignore
│
│  🗑️ Removed (only if legacy items were cleaned up)
│     {✅} goals/            Legacy goals directory
│     {✅} tools/memory/     Legacy memory scripts
│     {✅} memory/           Legacy memory directory
│
│  🔌 Plugin Tuning (only if Phase 7 ran)
│     {✅|⏭️} claude-mem SKIP_TOOLS: {optimised / already optimal / not installed / skipped / N/A}
│     {✅|⏭️} claude-mem context: {reduced / already optimal / not installed / skipped / N/A}
│     {✅|⏭️} claude-mem provider: {switched / already optimal / not installed / skipped / N/A}
│     {⏭️}    oh-my-claudecode: {installed / not installed}
│     {✅|⏭️} Plugin role separation: {injected / already present / not applicable / skipped}
│
│  ⚠️ Notes
│     {any warnings or skipped items}
│
│  ⚡ Next steps
│     1. Review CLAUDE.md and customise for your project
│     2. Add domain knowledge to context/
│     3. Run /speccy to design your first feature
│     4. Restart Claude Code to activate plugin changes (if any applied)
│
└─────────────────────────────────────────────────
```

Status indicators: ✅ created/exists · ⏭️ skipped · ⚠️ merged/upgraded · ❌ failed
