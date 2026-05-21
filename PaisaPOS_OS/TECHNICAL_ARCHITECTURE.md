# TECHNICAL_ARCHITECTURE

Version: 1.0  
Status: Active  
Last Updated: 2026-05-21

---

# 1. ARCHITECTURE OVERVIEW

PaisaPOS is designed as a:
- modern
- lightweight
- inventory-first
- transactional SaaS

The architecture prioritizes:
- reliability
- operational speed
- simplicity
- maintainability
- rapid iteration

The system intentionally avoids:
- premature microservices
- distributed complexity
- unnecessary abstractions
- overengineering

---

# 2. CORE ARCHITECTURE PRINCIPLES

## 2.1 Simplicity First

Architecture should remain:
- understandable
- maintainable
- scalable through clarity

Avoid:
- enterprise-style abstractions
- unnecessary layers
- speculative architecture

---

## 2.2 Inventory Integrity Is Critical

Inventory consistency is the most important backend concern.

Every inventory operation must support:
- atomicity
- rollback safety
- concurrency protection
- transactional integrity

---

## 2.3 Backend Is Source of Truth

Business-critical logic must remain:
- centralized
- transactional
- server-side

Frontend must NEVER become the source of truth.

---

## 2.4 Operational Speed Matters

The system must feel:
- instant
- responsive
- operationally smooth

Architecture decisions should reduce:
- latency
- unnecessary requests
- excessive client rendering

---

# 3. TECH STACK

## Frontend
- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Zustand

---

## Backend
- Supabase

---

## Database
- PostgreSQL

---

## Hosting
Frontend:
- Vercel

Backend:
- Supabase Cloud

---

## Authentication
- Supabase Auth

---

# 4. WHY THIS STACK

## Why Next.js

Chosen for:
- modern React architecture
- routing simplicity
- scalability
- ecosystem maturity
- Vercel optimization

---

## Why TypeScript

Chosen for:
- type safety
- maintainability
- fewer runtime errors
- scalability

---

## Why Zustand

Chosen because:
- lightweight
- minimal boilerplate
- ideal for UI/cart state
- simpler than Redux

---

## Why Supabase

Chosen because:
- PostgreSQL backend
- fast iteration speed
- authentication included
- managed infrastructure
- realtime optional later
- SQL flexibility

---

## Why PostgreSQL

Chosen because:
- relational consistency
- transactional reliability
- strong querying
- inventory-safe operations

Inventory systems require:
- ACID guarantees
- strong consistency

---

# 5. SYSTEM ARCHITECTURE

## High-Level Flow

```text
Frontend (Next.js)
        ↓
Supabase Client
        ↓
PostgreSQL Database
        ↓
RPC Functions
        ↓
Transactional Inventory Operations
```

---

# 6. FRONTEND ARCHITECTURE

## Frontend Responsibilities

The frontend handles:
- rendering UI
- cart interactions
- search UX
- temporary UI state
- form handling

The frontend does NOT handle:
- inventory authority
- transactional consistency
- stock integrity

---

## Frontend Priorities

- fast rendering
- touch usability
- low latency
- mobile responsiveness
- operational clarity

---

# 7. BACKEND ARCHITECTURE

## Backend Responsibilities

The backend controls:
- inventory truth
- invoice creation
- stock deduction
- transactional safety
- authentication
- data persistence

---

## Business Logic Rules

Business-critical logic MUST remain:
- server-side
- centralized
- transactional

Avoid:
- duplicated calculations
- client-side inventory authority

---

# 8. DATABASE ARCHITECTURE

## Database Type

Relational SQL architecture.

Primary reason:
Inventory systems require structured consistency.

---

## Core Tables

### stores
Store information.

---

### users
Authenticated users tied to stores.

---

### products
Base products.

---

### product_variants
Size/color combinations.

---

### inventory
Variant stock quantities.

---

### invoices
Completed sales.

---

### invoice_items
Line items inside invoices.

---

# 9. DATABASE DESIGN RULES

## Naming Conventions

- snake_case only
- plural table names
- explicit foreign keys

---

## ID Strategy

- UUID primary keys everywhere

Reason:
- scalability
- security
- distributed safety

---

## Timestamps

All important tables require:
- created_at
- updated_at where appropriate

---

# 10. CHECKOUT TRANSACTION ARCHITECTURE

## Core Principle

Checkout MUST be atomic.

A checkout should:
- fully succeed
OR
- fully fail

Never partial success.

---

# 11. RPC-BASED CHECKOUT SYSTEM

Checkout uses:
```sql
create_invoice_and_deduct_stock()
```

Implemented as:
- PostgreSQL RPC function
- transactional operation
- row-locked inventory flow

---

## Why RPC Instead of Triggers

Triggers were rejected because:
- harder debugging
- race condition risk
- reduced explicitness
- operational unpredictability

RPCs provide:
- clearer control flow
- transactional safety
- easier testing
- easier observability

---

# 12. INVENTORY CONSISTENCY FLOW

## Checkout Flow

1. Begin transaction
2. Lock inventory rows
3. Validate quantities
4. Create invoice
5. Insert invoice items
6. Deduct stock
7. Commit transaction

If any step fails:
- rollback entire transaction

---

# 13. CONCURRENCY STRATEGY

Inventory rows use:
```sql
FOR UPDATE
```

to prevent:
- overselling
- simultaneous stock corruption
- race conditions

---

# 14. AUTHENTICATION ARCHITECTURE

Authentication uses:
- Supabase Auth

Current MVP:
- single-store workflow

Future-ready structure supports:
- multi-store SaaS

---

# 15. STATE MANAGEMENT ARCHITECTURE

## Zustand Responsibilities

Allowed:
- cart state
- sidebar state
- search state
- temporary UI interactions

Not allowed:
- inventory authority
- backend consistency logic
- transactional business rules

---

# 16. FILE STRUCTURE

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

# 17. FEATURE ORGANIZATION

Each feature should contain:
- UI
- hooks
- logic
- types
- feature-specific utilities

Avoid:
- giant global folders
- tangled dependencies

---

# 18. API PHILOSOPHY

Prefer:
- direct Supabase interactions
- RPCs for transactions

Avoid:
- unnecessary REST layers
- excessive API wrappers

---

# 19. SEARCH ARCHITECTURE

Search prioritizes:
- low latency
- instant filtering
- local responsiveness

Initial MVP:
- lightweight filtering
- optimized queries

Avoid:
- expensive search infrastructure initially

---

# 20. PERFORMANCE STRATEGY

## Frontend Performance

Optimize:
- rerenders
- state subscriptions
- component size
- bundle size

---

## Backend Performance

Optimize:
- indexed queries
- inventory lookups
- transaction speed

---

# 21. MOBILE PERFORMANCE STRATEGY

The app must remain usable on:
- low-end Android devices
- unstable internet connections

Avoid:
- excessive animations
- heavy rendering
- unnecessary client complexity

---

# 22. SCALABILITY STRATEGY

Current architecture supports:
- MVP scale
- early SaaS growth
- multiple stores later

WITHOUT introducing:
- microservices
- distributed systems
- event-driven architecture

Premature scaling complexity is intentionally avoided.

---

# 23. SECURITY PRINCIPLES

## Backend Security

Use:
- Row Level Security (RLS)
- authenticated access
- scoped store ownership

---

## Data Safety

Prevent:
- unauthorized store access
- inventory tampering
- cross-store leakage

---

# 24. ERROR HANDLING STRATEGY

The system should provide:
- clear operational feedback
- explicit stock errors
- transaction failure visibility

Avoid:
- vague system errors
- silent failures

---

# 25. TESTING STRATEGY

Critical systems requiring testing:
- checkout rollback
- stock deduction
- variant consistency
- invoice generation
- mobile responsiveness

---

# 26. DEPLOYMENT STRATEGY

## Frontend Deployment
- Vercel

## Backend Deployment
- Supabase

---

# 27. OBSERVABILITY STRATEGY

Initially lightweight.

Track:
- checkout failures
- stock errors
- RPC failures
- client crashes

Avoid:
- enterprise monitoring complexity initially

---

# 28. FUTURE ARCHITECTURE EXPANSION

Potential future additions:
- barcode scanning
- offline sync
- multi-store architecture
- analytics
- supplier modules

These should only be added:
AFTER operational validation.

---

# 29. ARCHITECTURE ANTI-GOALS

Do NOT introduce:
- microservices
- Kafka/event systems
- CQRS
- realtime synchronization
- complex caching layers
- premature abstractions
- enterprise patterns

---

# 30. FINAL ARCHITECTURE PRINCIPLE

The architecture should optimize for:
- inventory trust
- operational speed
- maintainability
- simplicity
- rapid iteration

Not technical sophistication for its own sake.
