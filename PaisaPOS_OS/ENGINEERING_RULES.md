# ENGINEERING_RULES

Version: 1.0  
Status: Active  
Last Updated: 2026-05-29

---

# 1. ENGINEERING PHILOSOPHY

PaisaPOS engineering prioritizes:
- simplicity
- maintainability
- reliability
- operational speed
- inventory integrity

The goal is NOT:
- technical sophistication
- architectural complexity
- resume-driven engineering

The system should remain:
- understandable
- scalable through clarity
- easy to maintain
- fast to iterate

---

# 2. CORE ENGINEERING PRINCIPLES

## 2.1 Inventory Trust Above Everything

Inventory consistency is the highest engineering priority.

All critical flows must protect:
- stock accuracy
- transactional consistency
- rollback safety

Never compromise inventory trust for:
- convenience
- shortcuts
- UI speed

---

## 2.2 Simplicity Wins

Prefer:
- boring solutions
- proven patterns
- readable systems

Avoid:
- clever abstractions
- speculative architecture
- unnecessary complexity

---

## 2.3 Build for Real Usage

Optimize for:
- actual store workflows
- daily operational speed
- mobile usage
- low-end devices

NOT theoretical scale.

---

## 2.4 Maintainability Over Perfection

Code should optimize for:
- future readability
- debugging ease
- onboarding simplicity

Not over-optimization.

---

# 3. MVP DISCIPLINE RULES

## 3.1 Protect Scope Ruthlessly

Do NOT introduce:
- ERP systems
- advanced analytics
- realtime collaboration
- unnecessary dashboards
- enterprise abstractions

---

## 3.2 Every Feature Must Solve Real Pain

Before building ask:
```text
Does this improve:
- inventory trust?
- checkout speed?
- operational simplicity?
- onboarding speed?
```

If not:
do not build it.

---

# 4. FRONTEND ENGINEERING RULES

## 4.1 Frontend Responsibilities

Frontend handles:
- rendering
- interactions
- temporary UI state
- cart state
- search UX

Frontend does NOT own:
- inventory truth
- transaction integrity
- business-critical logic

---

## 4.2 Component Philosophy

Components should be:
- small
- reusable
- focused
- readable

Avoid:
- giant components
- deeply nested logic
- mixed responsibilities

---

## 4.3 Component Structure

Prefer:
```text
feature/
├── components/
├── hooks/
├── types/
├── utils/
```

Avoid:
- massive global folders
- tangled imports

---

## 4.4 Client State Rules

Use Zustand ONLY for:
- UI state
- cart state
- temporary interaction state

Do NOT store:
- backend authority
- inventory source of truth
- duplicated calculations

---

# 5. BACKEND ENGINEERING RULES

## 5.1 Backend Is Authority

Business-critical logic MUST remain:
- server-side
- transactional
- centralized

---

## 5.2 Transaction Safety Mandatory

Checkout logic MUST:
- be atomic
- rollback safely
- protect inventory consistency

---

## 5.3 Use RPCs For Critical Logic

Critical inventory operations should use:
- PostgreSQL RPC functions

Avoid:
- hidden trigger logic
- distributed business rules

---

# 6. DATABASE ENGINEERING RULES

## 6.1 PostgreSQL Is Primary

Use:
- relational design
- normalized schema
- strong foreign keys

Avoid:
- NoSQL additions
- hybrid databases
- denormalized chaos

---

## 6.2 Naming Rules

Use:
- snake_case
- plural table names
- explicit foreign keys

---

## 6.3 UUID Rules

All major entities use:
```sql
uuid primary keys
```

---

## 6.4 Timestamp Rules

All important tables require:
- created_at
- updated_at where appropriate

---

# 7. TYPESCRIPT RULES

## 7.1 Strict Type Safety

TypeScript should remain:
- strict
- explicit
- predictable

Avoid:
```ts
any
```

unless absolutely unavoidable.

---

## 7.2 Shared Types

Centralize reusable types.

Avoid:
- duplicate interfaces
- inconsistent typing

---

# 8. FILE ORGANIZATION RULES

## Standard Structure

```text
src/
├── app/
├── features/
├── shared/
├── lib/
├── server/
```

---

## Rules

- keep files focused
- avoid giant utility files
- avoid giant component files
- `src/components` is retired and should remain empty
- new domain UI belongs in `src/features/<feature>/components`, not global `src/components`
- shared UI/layout belongs in `src/shared/ui` or `src/shared/layout`
- server runtime APIs belong in `src/server` or feature `server/` modules, not general-purpose `src/lib`
- structural refactors must be wrapper-first to avoid breaking existing imports, and wrappers must be removed once no imports use them

---

# 9. STYLING RULES

## Tailwind Usage

Use Tailwind consistently.

Prefer:
- utility clarity
- reusable patterns
- readable layouts

Avoid:
- class chaos
- overcomplicated utility chains

---

## UI Consistency

The UI should remain:
- operational
- calm
- readable

Avoid:
- experimental visuals
- excessive animation
- visual inconsistency

---

# 10. PERFORMANCE RULES

## 10.1 Optimize For Low-End Devices

The app must work smoothly on:
- Android devices
- slower networks
- lower-memory devices

---

## 10.2 Avoid Heavy Client Logic

Avoid:
- excessive rerenders
- giant client bundles
- unnecessary abstractions

---

## 10.3 Rendering Rules

Prefer:
- memoized expensive components
- lightweight rendering
- simple state flows

---

# 11. SEARCH ENGINEERING RULES

Search must feel:
- instant
- lightweight
- reliable

Prioritize:
- fast local filtering
- optimized queries

Avoid:
- premature search infrastructure

---

# 12. ERROR HANDLING RULES

## Errors Must Be Operationally Clear

Users should understand:
- what failed
- why it failed
- what to do next

Avoid:
- vague errors
- technical jargon
- silent failures

---

# 13. MOBILE ENGINEERING RULES

## Mobile Is Mandatory

All workflows must support:
- touch usage
- responsive layouts
- portrait orientation

---

## Interaction Rules

Minimum touch targets:
```text
44px
```

---

# 14. AUTHENTICATION RULES

Use:
- Supabase Auth
- store-scoped access
- Row Level Security

Avoid:
- custom auth systems
- premature permission complexity

---

# 15. SECURITY RULES

Protect against:
- cross-store access
- unauthorized inventory access
- invoice tampering

---

## Never Trust Client Input

Critical validation must happen:
- server-side
- transactionally

---

# 16. API RULES

Prefer:
- direct Supabase access
- RPC transactions

Avoid:
- unnecessary REST layers
- premature API gateways

---

# 17. TESTING RULES

## Highest Priority Tests

Critical systems:
- checkout rollback
- inventory deduction
- invoice integrity
- concurrency handling

---

## Manual Testing Required

Always test:
- mobile usability
- touch interaction
- low-stock workflows
- checkout UX

---

# 18. GIT & VERSION CONTROL RULES

## Commit Philosophy

Commits should be:
- focused
- atomic
- understandable

Avoid:
- giant mixed commits

---

## Branch Philosophy

Prefer:
- short-lived branches
- focused PRs
- incremental merges

---

# 19. CODE REVIEW RULES

Review for:
- simplicity
- readability
- operational correctness
- inventory safety

Not cleverness.

---

# 20. DOCUMENTATION RULES

Document:
- architecture decisions
- critical flows
- database logic
- RPC behaviors

Avoid:
- outdated documentation
- excessive documentation noise

---

# 21. OBSERVABILITY RULES

Track:
- checkout failures
- RPC failures
- stock inconsistencies
- client crashes

Avoid:
- enterprise monitoring complexity initially

---

# 22. MIGRATION RULES

Database migrations must be:
- incremental
- rollback-safe
- production-safe

Avoid:
- destructive schema changes

---

# 23. DEPLOYMENT RULES

Production deployments should prioritize:
- stability
- rollback safety
- migration integrity

Avoid:
- risky large releases

---

# 24. ANTI-OVERENGINEERING RULES

Do NOT introduce:
- microservices
- Kafka
- CQRS
- event sourcing
- distributed systems
- complex caching layers
- unnecessary abstractions

Current product scale does not justify them.

---

# 25. AI AGENT ENGINEERING RULES

All AI agents working on PaisaPOS MUST:
- respect MVP discipline
- avoid speculative features
- prioritize simplicity
- preserve inventory safety
- maintain UX consistency

---

## AI Agents Must NOT

- invent architecture patterns
- introduce enterprise systems
- add unnecessary dependencies
- create hidden complexity

---

# 26. DEPENDENCY RULES

Before adding a dependency ask:
```text
Can this be solved simply without it?
```

Avoid:
- dependency bloat
- overlapping libraries
- abandoned packages

---

# 27. RELEASE PHILOSOPHY

Ship:
- stable
- useful
- operational improvements

Avoid:
- feature dumping
- rushed complexity

---

# 28. PILOT TESTING PRIORITIES

Observe:
- onboarding friction
- billing speed
- inventory confusion
- search performance
- mobile usability

Real usage > assumptions.

---

# 29. SCALING PHILOSOPHY

Scale through:
- clean architecture
- operational clarity
- stable foundations

NOT through premature complexity.

---

# 30. FINAL ENGINEERING PRINCIPLE

Every engineering decision should improve:
- inventory trust
- operational speed
- maintainability
- simplicity
- product reliability

If complexity does not clearly improve those:
it should probably not exist.
