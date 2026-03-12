# Specification Template

Use this template when generating the final specification document in Stage 3.
Fill every section with content from the interview decisions and project context.
Omit sections that are genuinely not applicable, but err on the side of inclusion.

## Writing Guidelines

- Use precise, explicit, and unambiguous language
- Clearly distinguish between requirements, constraints, and recommendations
- Use structured formatting (headings, lists, tables) for easy parsing
- Avoid idioms, metaphors, or context-dependent references
- Define all acronyms and domain-specific terms
- Include examples and edge cases where applicable
- Ensure the document is self-contained and does not rely on external context

## File Naming

Save to `specs/{slug}.md` where `{slug}` is a kebab-case name derived from
the GOAL. Examples: `specs/user-auth.md`, `specs/payment-integration.md`.

## Template

```md
---
title: [Concise Title Describing the Specification's Focus]
version: 1.0
date_created: [YYYY-MM-DD]
last_updated: [YYYY-MM-DD]
tags: [e.g., infrastructure, process, design, app, schema, tool, data, architecture]
---

# Introduction

[A short concise introduction to the specification and the goal it is intended to achieve.]

## 1. Purpose & Scope

[Clear, concise description of the specification's purpose and scope. State the intended audience and any assumptions.]

## 2. Definitions

[List and define all acronyms, abbreviations, and domain-specific terms used in this specification.]

## 3. Requirements, Constraints & Guidelines

[Explicitly list all requirements, constraints, rules, and guidelines. Use bullet points or tables for clarity.]

- **REQ-001**: [Functional requirement]
- **SEC-001**: [Security requirement]
- **CON-001**: [Constraint]
- **GUD-001**: [Guideline]
- **PAT-001**: [Pattern to follow]

## 4. Interfaces & Data Contracts

[Describe the interfaces, APIs, data contracts, or integration points. Use tables or code blocks for schemas and examples.]

## 5. Acceptance Criteria

[Define clear, testable acceptance criteria for each requirement using Given-When-Then format where appropriate.]

- **AC-001**: Given [context], When [action], Then [expected outcome]
- **AC-002**: The system shall [specific behavior] when [condition]

## 6. Test Automation Strategy

[Define the testing approach, frameworks, and automation requirements.]

- **Test Levels**: Unit, Integration, End-to-End
- **Frameworks**: [appropriate for the project's stack]
- **Test Data Management**: [approach for test data creation and cleanup]
- **CI/CD Integration**: [automated testing in pipelines]
- **Coverage Requirements**: [minimum code coverage thresholds]
- **Performance Testing**: [approach for load and performance testing]

## 7. Rationale & Context

[Explain the reasoning behind the requirements, constraints, and guidelines. Provide context for design decisions.]

## 8. Dependencies & External Integrations

[Define external systems, services, and architectural dependencies. Focus on what is needed rather than how it's implemented.]

### External Systems
- **EXT-001**: [External system name] - [Purpose and integration type]

### Third-Party Services
- **SVC-001**: [Service name] - [Required capabilities and SLA requirements]

### Infrastructure Dependencies
- **INF-001**: [Infrastructure component] - [Requirements and constraints]

### Data Dependencies
- **DAT-001**: [External data source] - [Format, frequency, and access requirements]

### Technology Platform Dependencies
- **PLT-001**: [Platform/runtime requirement] - [Version constraints and rationale]

**Note**: Focus on architectural and business dependencies, not specific package implementations.

## 9. Examples & Edge Cases

[Code snippets or data examples demonstrating correct application, including edge cases.]

## 10. Validation Criteria

[List the criteria or tests that must be satisfied for compliance with this specification.]

## 11. Related Specifications / Further Reading

[Links to related specs or relevant external documentation.]
```
