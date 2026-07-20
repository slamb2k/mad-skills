# Autonomous Architecture-Surface Markers

Shared eligibility check for `/speccy --auto` (REQ-002) and `/build --auto`'s
per-decision self-evaluation (REQ-010). A dimension distinct from the
existing risk-keyword-path list (`references/autonomous-review-thresholds.md`)
— a one-file change to a public API or shared state module is small but
high-impact, so scope alone (file count) can't catch it. Defined here — not
inline in `skills/speccy/SKILL.md` or `skills/build/SKILL.md` — so it can be
tuned without touching skill logic (CON-002).

## Architectural-surface categories

A file matches this list if it falls into one of these categories:

- **Public/exported interface** — a module's public API surface: exported
  functions/classes at a package boundary, CLI command definitions, REST/RPC
  endpoint handlers, and similar contracts other code or external callers
  depend on.
- **Schema/migration file** — database migrations, schema definition files
  (SQL DDL, ORM models, Prisma/GraphQL schemas), and config schemas that
  other components validate against.
- **Shared cross-cutting state module** — global config, shared constants
  consumed by multiple modules, session/auth state stores, and similar
  modules whose change ripples across unrelated call sites rather than
  staying local to one feature.

This list is deliberately category-based rather than keyword/path-based —
architectural surface is a structural property (what depends on this file),
not a string match, so it relies on the same exploration step's file/symbol
matches rather than a fixed path pattern.

## Consumption

`/speccy --auto`'s eligibility gate (REQ-002) checks this list against the
exploration step's matched files as one of its four eligibility conditions.
`/build --auto`'s per-decision self-evaluation (REQ-010) checks it alongside
the risk-keyword-path list to decide whether a genuine ambiguity should be
decided autonomously or deferred to interview. Single source, referenced by
both — never duplicated.

## Tuning

Add or remove architectural-surface categories by editing this file only.
No other file encodes this rule.
