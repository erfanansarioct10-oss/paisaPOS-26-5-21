# AI_AGENT_RULEBOOK

Version: 1.0  
Status: Active  
Last Updated: 2026-05-21

---

# 1. PURPOSE

This document defines how all AI agents must behave while working on PaisaPOS.

It ensures:
- architectural consistency
- MVP discipline
- engineering quality
- operational reliability
- product alignment

This document applies to:
- coding agents
- planning agents
- architecture agents
- documentation agents
- automation agents

---

# 2. PRODUCT UNDERSTANDING

PaisaPOS is:

```text
A lightweight inventory-first POS and billing SaaS
for Nepali clothing stores.
```

Primary users:
- boutiques
- streetwear stores
- Instagram clothing sellers
- local fashion retailers

---

# 3. CORE PRODUCT PRIORITIES

Every AI agent must prioritize:

1. inventory trust
2. billing speed
3. operational simplicity
4. maintainability
5. mobile usability

NOT:
- technical sophistication
- enterprise architecture
- unnecessary scalability

---

# 4. MVP DISCIPLINE

## CRITICAL RULE

Do NOT expand scope unnecessarily.

Avoid introducing:
- enterprise systems
- ERP functionality
- analytics overload
- speculative features
- premature scaling infrastructure

---

# 5. APPROVED MVP FEATURES

Agents may work on:

- authentication
- dashboard
- inventory management
- variant generation
- billing POS
- invoice history
- thermal receipts
- stock deduction
- low stock alerts

Anything outside this requires explicit approval.

---

# 6. ARCHITECTURE RULES

## Approved Stack

### Frontend
- Next.js App Router
- TypeScript
- Tailwind CSS
- Zustand

### Backend
- Supabase
- PostgreSQL
- RPC functions

---

## Database Rules

Use:
- PostgreSQL only
- relational schema
- normalized tables
- UUID primary keys

Avoid:
- NoSQL systems
- mixed databases
- distributed architectures

---

# 7. TRANSACTION SAFETY RULES

## Highest Priority

Inventory consistency is sacred.

All checkout systems must:
- be atomic
- rollback safely
- prevent overselling
- lock rows correctly

---

## Required Checkout Flow

```text
1. Validate stock
2. Lock inventory rows
3. Create invoice
4. Create invoice items
5. Deduct inventory
6. Commit transaction
```

If any step fails:
```text
ROLLBACK EVERYTHING
```

---

# 8. UI/UX RULES

## Design Philosophy

UI should feel:
- calm
- operational
- fast
- touch-friendly

Inspired by:
- Shopify Admin
- Linear
- Stripe Dashboard

---

## Avoid

- flashy animations
- visual clutter
- gradient overload
- experimental UI

---

# 9. MOBILE RULES

Mobile support is mandatory.

All workflows must support:
- Android devices
- touch interactions
- portrait orientation

Minimum touch target:
```text
44px
```

---

# 10. SEARCH RULES

Search is mission-critical.

Search must:
- feel instant
- support keyboard usage
- support SKU/product/category
- prioritize operational speed

---

# 11. CODE QUALITY RULES

## Code Should Be

- readable
- maintainable
- explicit
- simple

---

## Avoid

- giant files
- hidden abstractions
- unnecessary generics
- over-engineered patterns

---

# 12. TYPESCRIPT RULES

Use:
- strict typing
- reusable interfaces
- explicit types

Avoid:
```ts
any
```

unless absolutely necessary.

---

# 13. STATE MANAGEMENT RULES

Use Zustand ONLY for:
- cart state
- UI state
- temporary client interactions

Do NOT use Zustand as:
- backend authority
- inventory truth source

---

# 14. DATABASE LOGIC RULES

Business-critical logic belongs:
- in PostgreSQL
- in RPC functions
- server-side

Avoid:
- client-side inventory logic
- duplicated transaction logic

---

# 15. COMPONENT RULES

Components should:
- do one thing well
- remain small
- remain composable

Avoid:
- monolithic components
- mixed concerns

---

# 16. FILE STRUCTURE RULES

Preferred structure:

```text
src/
├── app/
├── components/
├── features/
├── lib/
├── server/
├── styles/
├── types/
```

---

# 17. PERFORMANCE RULES

Optimize for:
- low-end Android devices
- weak internet
- quick interactions

Avoid:
- massive bundles
- heavy animations
- unnecessary rerenders

---

# 18. SECURITY RULES

Protect against:
- cross-store access
- unauthorized inventory changes
- invoice tampering

Always use:
- Row Level Security
- store-scoped queries

---

# 19. ERROR HANDLING RULES

Errors must:
- be operationally clear
- explain what failed
- help recovery

Avoid:
- vague errors
- technical jargon
- silent failures

---

# 20. TESTING RULES

Highest testing priority:
- inventory consistency
- rollback behavior
- checkout correctness
- stock integrity

---

# 21. DOCUMENTATION RULES

Agents must document:
- architecture decisions
- schema changes
- RPC behavior
- critical workflows

Avoid:
- stale docs
- unnecessary documentation noise

---

# 22. GIT RULES

Commits should be:
- small
- atomic
- descriptive

Avoid:
- giant mixed commits
- unrelated changes

---

# 23. DEPENDENCY RULES

Before adding any dependency ask:
```text
Can this be solved simply without it?
```

Avoid:
- dependency bloat
- overlapping libraries
- trendy tooling

---

# 24. FORBIDDEN ARCHITECTURE

AI agents MUST NOT introduce:

- microservices
- Kafka
- event sourcing
- CQRS
- Redis caching layers
- GraphQL complexity
- distributed systems
- Kubernetes infrastructure

Current product stage does not justify them.

---

# 25. APPROVED COMPLEXITY LEVEL

The product should remain:
- operationally focused
- technically understandable
- easy to onboard into

If a junior engineer cannot reasonably understand the system:
it is probably too complex.

---

# 26. FEATURE REQUEST EVALUATION

Before implementing features ask:

```text
Does this improve:
- inventory trust?
- checkout speed?
- operational simplicity?
- retailer workflow quality?
```

If not:
reject or defer.

---

# 27. PILOT-FIRST THINKING

Optimize for:
- real retailer feedback
- daily operations
- practical workflows

NOT hypothetical enterprise scenarios.

---

# 28. RELEASE PHILOSOPHY

Ship:
- stable improvements
- operational wins
- iterative upgrades

Avoid:
- unstable feature dumps
- rushed complexity

---

# 29. SCALING PHILOSOPHY

Scale through:
- simplicity
- clean architecture
- operational clarity

NOT premature infrastructure.

---

# 30. FINAL AGENT PRINCIPLE

Every AI agent working on PaisaPOS must protect:

- inventory trust
- simplicity
- maintainability
- operational reliability
- MVP discipline

If a decision increases complexity without strong operational value:
do not implement it.
