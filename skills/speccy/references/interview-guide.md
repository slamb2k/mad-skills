# Interview Guide

Reference material for conducting effective specification interviews.

---

## Question Categories & Example Topics

### Architecture & Technical Design
- Compute model (serverless vs hosted vs edge)
- Frontend framework and rendering strategy
- API design (REST vs GraphQL, versioning)
- State management approach
- Caching strategy
- Real-time requirements (WebSockets, SSE, polling)
- Monorepo vs multi-repo structure

### Requirements & Scope
- Core user stories and acceptance criteria
- Feature phasing (MVP vs full implementation)
- Must-have vs nice-to-have features
- Known limitations or explicit non-goals
- Backward compatibility requirements

### UI & UX
- Navigation model (wizard, tabs, SPA routing)
- Theme and visual design (light/dark, brand)
- Component library choice
- Responsive and mobile requirements
- Accessibility standards (WCAG level)
- Loading states and error presentation
- Dashboard and data visualisation approach

### Security & Auth
- Authentication method (SSO, OAuth, API keys)
- Authorization model (RBAC, ABAC, per-resource)
- Data sensitivity and encryption requirements
- Audit logging needs
- Session management

### Infrastructure & Deployment
- Hosting platform (Azure, AWS, GCP, self-hosted)
- IaC tooling (Bicep, Terraform, Pulumi)
- CI/CD pipeline design
- Environment strategy (dev, staging, prod)
- Monitoring and alerting
- Cost constraints

### Data & Storage
- Primary data store (SQL, NoSQL, blob, file)
- Data retention and lifecycle policies
- Migration strategy
- Caching layers
- Data import/export formats

### Testing & Quality
- Test framework and tooling
- Coverage targets
- Integration and E2E test approach
- Performance testing requirements
- Linting and formatting standards

### Concerns & Tradeoffs
- Known technical risks
- Alternatives considered and why rejected
- Performance vs complexity tradeoffs
- Build vs buy decisions
- Technical debt acceptance

---

## Anti-Patterns to Avoid

- **Don't ask what you can read** — if the codebase already answers it, don't ask
- **Don't ask leading questions** — present options neutrally (except recommendations)
- **Don't ask compound questions** — one decision per question
- **Don't ask about implementation details too early** — architecture first
- **Don't assume technology** — let the user confirm even if it seems obvious
- **Don't skip the "why"** — understanding rationale prevents spec rot

---

## Recommendation Guidelines

When marking an option as `(Recommended)`:

1. **Base it on evidence** — codebase patterns, project conventions, or the
   specific constraints you've discovered
2. **Explain why in the description** — the recommendation reason should be
   clear from the option's description text
3. **Don't force it** — if you genuinely don't have a strong opinion, don't
   recommend. Quality over quantity.
4. **Respect existing choices** — if the project already uses a technology
   or pattern, recommending consistency is usually right
5. **Consider the user's context** — team size, timeline, and expertise
   matter more than theoretical best practice
