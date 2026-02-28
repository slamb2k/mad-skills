# FORGE Build Methodology

Content for `goals/build_app.md`. Copied during forge Phase 4.

---

## Goal

Build full-stack applications using AI assistance within the GOTCHA framework.
FORGE is a 5-step process that ensures apps are production-ready.

| Step | Phase | What You Do |
|------|-------|-------------|
| **F** | Frame | Define problem, users, success metrics |
| **O** | Outline | Data schema, integrations map, stack proposal |
| **R** | Rig | Validate ALL connections before building |
| **G** | Generate | Build with layered architecture |
| **E** | Evaluate | Test functionality, error handling |

---

## F — Frame

**Purpose:** Know exactly what you are building before touching code.

1. **What problem does this solve?** — One sentence.
2. **Who is this for?** — Specific user, not "everyone".
3. **What does success look like?** — Measurable outcome.
4. **What are the constraints?** — Budget, time, technical limits.

**Output:** App Brief (problem, user, success criteria, constraints)

---

## O — Outline

**Purpose:** Design before building. Define the source of truth.

1. **Data schema** — Tables, fields, relationships
2. **Integrations map** — External services, auth types, API availability
3. **Technology stack proposal** — Database, backend, frontend (user approves)
4. **Edge cases** — Rate limits, auth expiry, timeouts, invalid input

**Output:** Schema, approved stack, integrations checklist, edge cases

---

## R — Rig

**Purpose:** Validate all connections BEFORE building.

Checklist:
- [ ] Database connection tested
- [ ] All API keys verified
- [ ] OAuth flows working
- [ ] Environment variables set
- [ ] Rate limits understood

**Output:** All green. Fix anything that fails before proceeding.

---

## G — Generate

**Purpose:** Build with proper architecture.

Build order:
1. Database schema first
2. Backend API routes second
3. Frontend UI last

Follow GOTCHA separation: frontend (display), backend (logic), database (truth).

**Output:** Working application with functional DB, API, and UI.

---

## E — Evaluate

**Purpose:** Test before shipping.

- **Functional:** All buttons work, data saves/retrieves, navigation works
- **Integration:** API calls succeed, auth persists, rate limits respected
- **Edge cases:** Invalid input handled, empty states display, errors show feedback
- **User acceptance:** Solves the original problem, no major friction

**Output:** Test report (passed, failed, needs fixing)

---

## Anti-Patterns

1. Building before designing — rewrites everything
2. Skipping connection validation — hours wasted on broken integrations
3. No data modeling — schema changes cascade into UI rewrites
4. No testing — ship broken code, lose trust
5. Hardcoding everything — no flexibility for changes

---

## GOTCHA Layer Mapping

| FORGE Step | GOTCHA Layer |
|------------|--------------|
| Frame | Goals (define the process) |
| Outline | Context (reference patterns) |
| Rig | Args (environment setup) |
| Generate | Tools (execution) |
| Evaluate | Orchestration (AI validates) |
