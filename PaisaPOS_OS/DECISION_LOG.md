# DECISION_LOG

Version: 1.0  
Status: Active  
Last Updated: 2026-05-21

---

# PURPOSE

This document records important product, engineering, architecture, and operational decisions made during PaisaPOS development.

The goal is to:
- preserve reasoning
- maintain consistency
- prevent repeated debates
- align all AI agents and contributors

---

# DECISION FORMAT

Each decision should include:

```text
Decision ID
Date
Status
Decision
Reasoning
Consequences
```

---

# DECISION-001

## Title
Inventory-First Product Direction

## Date
2026-05-21

## Status
Accepted

---

## Decision

PaisaPOS will focus primarily on:
```text
inventory + billing
```

instead of becoming a full ERP or accounting platform.

---

## Reasoning

Research showed Nepali clothing stores struggle most with:
- stock confusion
- variant tracking
- manual khata workflows
- fast billing

Inventory reliability creates the highest operational value.

---

## Consequences

### Positive
- clearer product focus
- faster MVP execution
- easier onboarding
- stronger operational UX

### Negative
- excludes broader business management features initially

---

# DECISION-002

## Title
Target Clothing Stores First

## Date
2026-05-21

## Status
Accepted

---

## Decision

Initial target users:
- boutiques
- fashion stores
- streetwear shops
- Instagram clothing sellers

---

## Reasoning

Clothing stores have:
- variant-heavy inventory
- high stock confusion
- simple billing needs
- large operational pain

The vertical is ideal for MVP focus.

---

## Consequences

### Positive
- focused UX
- simplified workflows
- better product-market fit validation

### Negative
- reduced market breadth initially

---

# DECISION-003

## Title
Use Supabase as Primary Backend

## Date
2026-05-21

## Status
Accepted

---

## Decision

PaisaPOS will use:
- Supabase
- PostgreSQL
- Supabase Auth
- RPC functions

as the backend stack.

---

## Reasoning

Supabase provides:
- rapid development
- relational PostgreSQL
- authentication
- RLS security
- scalable infrastructure

without operational overhead.

---

## Consequences

### Positive
- fast MVP execution
- lower infrastructure complexity
- strong SQL support

### Negative
- some vendor coupling

---

# DECISION-004

## Title
SQL-Only Database Architecture

## Date
2026-05-21

## Status
Accepted

---

## Decision

PaisaPOS will remain:
```text
PostgreSQL-first
```

without adding NoSQL systems.

---

## Reasoning

The product data is highly relational:
- products
- variants
- inventory
- invoices

SQL is the correct operational fit.

---

## Consequences

### Positive
- simpler architecture
- easier maintenance
- stronger transactional integrity

### Negative
- less flexibility for unstructured data

---

# DECISION-005

## Title
Avoid Dual Database Mode

## Date
2026-05-21

## Status
Accepted

---

## Decision

The initial proposal for:
```text
Supabase + localStorage dual mode
```

was rejected.

The system will use:
```text
Supabase-only
```

with seeded demo accounts.

---

## Reasoning

Dual-mode systems introduce:
- sync complexity
- inconsistent logic
- testing difficulty
- maintenance overhead

---

## Consequences

### Positive
- simpler architecture
- cleaner codebase
- fewer edge cases

### Negative
- requires internet access for production usage

---

# DECISION-006

## Title
Atomic Checkout via PostgreSQL RPC

## Date
2026-05-21

## Status
Accepted

---

## Decision

Checkout transactions will use:
```sql
create_invoice_and_deduct_stock()
```

implemented as a PostgreSQL RPC function.

---

## Reasoning

Inventory operations require:
- atomic consistency
- rollback safety
- concurrency protection

RPCs provide clearer control than triggers.

---

## Consequences

### Positive
- stronger inventory integrity
- explicit transaction flow
- easier debugging

### Negative
- slightly more backend logic complexity

---

# DECISION-007

## Title
Avoid Trigger-Based Inventory Logic

## Date
2026-05-21

## Status
Accepted

---

## Decision

Inventory deduction logic should NOT rely on:
```text
implicit database triggers
```

for critical transactional behavior.

---

## Reasoning

Triggers:
- hide business logic
- complicate debugging
- increase implicit behavior
- risk race conditions

---

## Consequences

### Positive
- clearer transaction flow
- easier maintenance
- better debugging

### Negative
- more explicit backend implementation required

---

# DECISION-008

## Title
Use Zustand for Lightweight Client State

## Date
2026-05-21

## Status
Accepted

---

## Decision

Use Zustand for:
- cart state
- UI state
- temporary interactions

---

## Reasoning

The app does not require:
- Redux complexity
- enterprise state systems

Zustand is lightweight and sufficient.

---

## Consequences

### Positive
- simpler frontend architecture
- faster development
- lower boilerplate

### Negative
- requires discipline to avoid misuse

---

# DECISION-009

## Title
Shopify/Linear Inspired UI Direction

## Date
2026-05-21

## Status
Accepted

---

## Decision

The UI direction should prioritize:
- calm interfaces
- operational clarity
- high contrast
- touch friendliness

Inspired by:
- Shopify Admin
- Linear
- Stripe Dashboard

---

## Reasoning

Retail software should optimize for:
- speed
- readability
- operational flow

not flashy visuals.

---

## Consequences

### Positive
- cleaner UX
- lower cognitive load
- easier daily usage

### Negative
- less visually experimental branding

---

# DECISION-010

## Title
Mobile-First Operational Design

## Date
2026-05-21

## Status
Accepted

---

## Decision

All critical workflows must support:
- Android phones
- tablets
- touch interactions

---

## Reasoning

Many Nepali retailers operate primarily on:
- mobile devices
- lower-end Android hardware

---

## Consequences

### Positive
- broader accessibility
- real-world usability

### Negative
- stricter UI constraints

---

# DECISION-011

## Title
Bulk Variant Matrix Generator

## Date
2026-05-21

## Status
Accepted

---

## Decision

Inventory onboarding will support:
- comma-separated sizes
- comma-separated colors
- automatic variant matrix generation

---

## Reasoning

Manual variant creation is extremely repetitive.

Bulk generation dramatically speeds onboarding.

---

## Consequences

### Positive
- faster setup
- lower friction
- better retailer adoption

### Negative
- additional UI complexity

---

# DECISION-012

## Title
Keep MVP Scope Ruthlessly Small

## Date
2026-05-21

## Status
Accepted

---

## Decision

The MVP intentionally excludes:
- CRM
- accounting
- analytics overload
- ERP systems
- employee permissions
- ecommerce

---

## Reasoning

Overengineering destroys:
- speed
- clarity
- validation quality

The MVP should solve:
```text
inventory + billing only
```

extremely well.

---

## Consequences

### Positive
- faster shipping
- easier maintenance
- stronger focus

### Negative
- fewer immediately marketable features

---

# DECISION-013

## Title
Use RLS For Store Isolation

## Date
2026-05-21

## Status
Accepted

---

## Decision

Supabase Row Level Security (RLS) will enforce:
```text
store-scoped data access
```

---

## Reasoning

Retail data must remain isolated securely.

RLS provides strong built-in protection.

---

## Consequences

### Positive
- stronger security
- simplified backend authorization

### Negative
- requires careful policy management

---

# DECISION-014

## Title
Optimize For Operational Speed

## Date
2026-05-21

## Status
Accepted

---

## Decision

UX optimization priorities:
1. search speed
2. checkout speed
3. touch interaction speed

---

## Reasoning

Retail workflows depend heavily on:
- rapid interactions
- low friction
- repetitive speed

---

## Consequences

### Positive
- better operator efficiency
- stronger daily usability

### Negative
- less focus on decorative features

---

# DECISION-015

## Title
Avoid Premature Scale Architecture

## Date
2026-05-21

## Status
Accepted

---

## Decision

Do NOT introduce:
- microservices
- Kafka
- CQRS
- distributed systems
- Redis complexity
- Kubernetes

during MVP stage.

---

## Reasoning

The product does not yet justify:
- operational complexity
- infrastructure overhead
- enterprise architecture

---

## Consequences

### Positive
- cleaner engineering
- lower maintenance burden
- faster iteration

### Negative
- future migrations may eventually be needed

---

# DECISION-016

## Title
Pilot-Driven Product Development

## Date
2026-05-21

## Status
Accepted

---

## Decision

Product evolution should be guided by:
- real retailer usage
- operational observation
- pilot feedback

NOT assumptions.

---

## Reasoning

Actual workflows reveal:
- friction
- missing functionality
- usability pain

far better than speculative planning.

---

## Consequences

### Positive
- stronger product-market fit
- more practical roadmap

### Negative
- slower feature expansion initially

---

# DECISION-017

## Title
Use Thermal Receipt Browser Printing

## Date
2026-05-21

## Status
Accepted

---

## Decision

Thermal receipts will initially use:
```text
window.print()
```

with print-specific CSS.

---

## Reasoning

Native browser printing is:
- simple
- stable
- cross-platform
- sufficient for MVP

---

## Consequences

### Positive
- faster implementation
- fewer dependencies

### Negative
- less printer-specific control

---

# DECISION-018

## Title
Notion-Based Persistent AI Memory System

## Date
2026-05-21

## Status
Accepted

---

## Decision

Project memory and operational context will be maintained through:
```text
structured Notion workspace documentation
```

---

## Reasoning

AI agents require:
- persistent context
- architectural alignment
- documented decisions

across sessions.

---

## Consequences

### Positive
- stronger continuity
- scalable documentation system
- aligned AI workflows

### Negative
- requires documentation discipline

---

# DECISION-019

## Title
Automated Multi-Tenant RLS & Browser Print Centering Verifications

## Date
2026-05-22

## Status
Accepted

---

## Decision

We validated security boundaries and CSS print layouts via:
- Writing an integration test suite ([rls-verification.test.ts](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/lib/store/__tests__/rls-verification.test.ts)) simulating parallel store clients to perform cross-tenant insert/read/update/delete attacks.
- Setting explicit page height constraints (`size: 80mm 250mm; margin: 0mm;`) in [globals.css](file:///c:/nooridigital_assets/my-projects/billing-system-26-5-21/src/app/globals.css) and centering the thermal print area horizontally to prevent top-left empty margins on standard printing canvases.

---

## Reasoning

Manual multi-tenant and layout QA are time-consuming and error-prone. Standardizing automated SQL boundary checks and CSS page sizing ensures future changes won't leak customer transactions or break physical printer dimensions.

---

## Consequences

### Positive
- Strict security verification runs automatically in CI/CD pipeline (25 tests).
- Layout adapts to PDF generators and thermal receipts gracefully.

### Negative
- Print layouts require checking settings to ensure browsers do not inject default headers.

---

# FUTURE DECISION TEMPLATE

Copy for future decisions:

---

# DECISION-XXX

## Title

## Date

## Status
Proposed / Accepted / Rejected / Deprecated

---

## Decision

---

## Reasoning

---

## Consequences

### Positive

### Negative

---
