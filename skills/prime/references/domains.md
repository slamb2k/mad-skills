# Domain Context Resolution

When domain hints are provided, resolve them to files using these strategies
(in priority order). Stop at the first strategy that produces results.

## Resolution Strategy

1. **Exact directory match** — Look for a directory named `{hint}/` in common
   locations: `src/`, `lib/`, `app/`, `packages/`, `services/`, project root
2. **File pattern match** — Glob for `**/*{hint}*.md`, `**/*{hint}*.yaml`,
   `**/*{hint}*.json` (exclude node_modules, .git, dist, build)
3. **Config/docs match** — Check `docs/{hint}.md`, `docs/{hint}/`,
   `config/{hint}.*`, `.{hint}rc`, `{hint}.config.*`

## Common Domain Hints

These are examples — any directory or topic name works as a hint:

| Hint | Likely Locations |
|------|-----------------|
| auth | src/auth/, lib/auth/, middleware/auth.* |
| api | src/api/, routes/, controllers/ |
| db, database | src/db/, prisma/, migrations/, models/ |
| infra | infra/, terraform/, bicep/, deploy/ |
| frontend | src/components/, src/pages/, app/ |
| backend | src/server/, src/services/, api/ |
| config | config/, .env.example, settings/ |
| test | tests/, __tests__/, spec/, cypress/ |

## Output

For each resolved domain, include in PRIME_REPORT:
- Directory/file paths found
- 2-3 line summary of what was found
- Key patterns or conventions observed
