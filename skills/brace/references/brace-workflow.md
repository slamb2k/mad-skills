# BRACE Build Methodology

Content for `goals/build_app.md`. Copied during brace Phase 4.

---

## Goal

Build full-stack applications using AI assistance within the GOTCHA framework.
BRACE maps to the MAD Skills pipeline — each step is automated by a skill.

| Step | Phase | Skill | What Happens |
|------|-------|-------|--------------|
| **B** | Brief | `/speccy` | Interview-driven spec: problem, users, success metrics |
| **R** | Research | `/speccy` + `/prime` | Context gathering, data schema, integrations, stack |
| **A** | Architect | `/build` Stage 3 | Design structure, validate connections |
| **C** | Construct | `/build` Stage 4 | Implementation with layered architecture |
| **E** | Evaluate | `/build` Stages 5-7 | Code review, fix findings, run tests |

## Workflow

```
/speccy → specs/{name}.md → /build specs/{name}.md → /ship
 Brief     Spec artifact      Arch+Build+Test        Merge PR
 Research
```

1. **`/speccy`** interviews the user (Brief + Research) and writes a structured
   spec to `specs/{name}.md`
2. **`/build specs/{name}.md`** reads the spec file, explores the codebase,
   designs architecture, implements, reviews, tests, and ships
3. **`/ship`** commits, creates PR, waits for CI, and merges

The `specs/` directory is the handoff point — `/prime` and `/build` both scan
it automatically.

---

## Anti-Patterns

1. Building before designing — rewrites everything
2. Skipping connection validation — hours wasted on broken integrations
3. No data modeling — schema changes cascade into UI rewrites
4. No testing — ship broken code, lose trust
5. Hardcoding everything — no flexibility for changes

---

## GOTCHA Layer Mapping

| BRACE Step | GOTCHA Layer |
|------------|--------------|
| Brief | Goals (define the process) |
| Research | Context (reference patterns) |
| Architect | Args (environment setup) |
| Construct | Tools (execution) |
| Evaluate | Orchestration (AI validates) |
