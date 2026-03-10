# Development Workflow

Reference material for the skills-driven development pipeline.

---

## Workflow

```
/speccy → specs/{name}.md → /build specs/{name}.md → /ship
```

1. **`/speccy`** interviews the user and writes a structured spec to `specs/{name}.md`
2. **`/build specs/{name}.md`** reads the spec, explores the codebase, designs
   architecture, implements, reviews, tests, and ships
3. **`/ship`** commits, creates PR, waits for CI, and merges

The `specs/` directory is the handoff point — `/prime` and `/build` both scan
it automatically.

---

## Anti-Patterns

1. Building before designing — rewrites everything
2. Skipping connection validation — hours wasted on broken integrations
3. No data modelling — schema changes cascade into UI rewrites
4. No testing — ship broken code, lose trust
5. Hardcoding everything — no flexibility for changes
