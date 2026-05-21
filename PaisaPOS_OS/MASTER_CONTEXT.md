# PaisaPOS — MASTER CONTEXT

Version: 1.0  
Status: Active  
Last Updated: 2026-05-21

---

# 1. PRODUCT OVERVIEW

PaisaPOS is a fast, inventory-first billing and POS SaaS built for Nepali clothing stores, fashion boutiques, streetwear brands, and social-commerce retailers.

The product exists to replace:
- manual khata systems
- spreadsheet inventory tracking
- inconsistent stock management
- slow billing workflows

Primary users:
- boutique owners
- Instagram/TikTok clothing sellers
- physical fashion stores
- hybrid online/offline retailers

The system prioritizes:
- operational speed
- inventory accuracy
- mobile usability
- onboarding simplicity
- low-friction daily usage

---

# 2. PRODUCT PHILOSOPHY

PaisaPOS is NOT trying to become:
- ERP software
- enterprise retail software
- accounting software
- analytics-heavy platform

The goal is:
"A retailer should reliably manage inventory and billing daily with minimal friction."

The product should feel:
- dependable
- fast
- calm
- operational
- easy to trust

---

# 3. CORE PRODUCT PRINCIPLES

## 3.1 Inventory Accuracy > Everything
Inventory trust is the foundation of the product.

Users must never feel:
"stock might be wrong."

All engineering decisions must prioritize:
- consistency
- atomicity
- rollback safety
- transactional integrity

---

## 3.2 Speed Over Feature Count

The product should:
- reduce clicks
- reduce operational friction
- optimize daily workflows

We prioritize:
- faster billing
- faster search
- faster onboarding
- faster inventory updates

over:
- excessive feature additions

---

## 3.3 Operational Simplicity Wins

The product should feel:
- obvious
- clean
- focused

Avoid:
- unnecessary dashboards
- deep menu systems
- feature overload
- enterprise complexity

---

## 3.4 Mobile-First Always

Most Nepali retailers heavily use:
- Android phones
- tablets
- low-to-mid range devices

All interfaces must:
- work smoothly on mobile
- support touch-first interaction
- remain performant

---

## 3.5 Search UX Is Mission-Critical

Billing speed depends heavily on search quality.

Search must be:
- instant
- keyboard-friendly
- typo-tolerant
- SKU searchable
- touch-friendly

---

# 4. TARGET USERS

Primary ICP:
- Nepali clothing stores
- fashion boutiques
- streetwear retailers
- hybrid online/offline stores

Typical characteristics:
- 1–10 employees
- inventory managed manually
- no reliable POS
- active on Instagram/TikTok/Facebook
- limited technical expertise

---

# 5. MVP SCOPE

## INCLUDED IN MVP

### Inventory System
- products
- variants
- stock quantities
- low stock alerts

### Billing System
- cart
- checkout
- invoice generation
- payment method tracking

### Variant System
- size/color variants
- bulk variant generation
- SKU support

### POS Workflow
- fast product search
- quick variant selection
- mobile-first billing flow

### Invoice History
- previous invoices
- receipt reprinting

---

# 6. EXCLUDED FROM MVP

DO NOT BUILD:

- accounting system
- ERP modules
- CRM
- supplier management
- payroll
- ecommerce platform
- loyalty system
- AI features
- advanced analytics
- multi-branch management
- complex reporting
- realtime collaboration
- marketplace integrations

Maintain strict MVP discipline.

---

# 7. APPROVED TECH STACK

## Frontend
- Next.js App Router
- TypeScript
- Tailwind CSS
- Zustand
- shadcn/ui

## Backend
- Supabase

## Database
- PostgreSQL

## Hosting
- Vercel (frontend)
- Supabase (backend)

---

# 8. DATABASE PHILOSOPHY

PaisaPOS uses:
- relational SQL architecture
- strongly structured data
- transactional integrity

We intentionally avoid:
- NoSQL complexity
- hybrid databases
- premature distributed systems

---

# 9. SOURCE OF TRUTH RULES

Supabase is the ONLY source of truth.

Business-critical logic MUST remain:
- server-side
- transactional
- centralized

Do NOT duplicate business logic client-side.

---

# 10. STATE MANAGEMENT RULES

Zustand is ONLY for:
- UI state
- cart state
- temporary interaction state

Zustand must NOT contain:
- transactional inventory logic
- business-critical consistency logic
- duplicated backend calculations

---

# 11. CHECKOUT ARCHITECTURE

Checkout MUST use:
- atomic PostgreSQL RPC transactions

Primary RPC:
create_invoice_and_deduct_stock()

Requirements:
- rollback safety
- row locking
- concurrency safety
- inventory consistency

Trigger-based inventory deduction is NOT allowed.

---

# 12. ENGINEERING RULES

## General
- avoid overengineering
- prefer simple systems
- optimize maintainability
- modular architecture only

---

## Code Standards
- TypeScript strictly typed
- no giant files
- small focused components
- reusable primitives
- clean folder structure

---

## Backend Rules
- business logic server-side only
- transactional operations atomic
- UUID primary keys
- timestamps required

---

## Database Naming Rules
- snake_case only
- plural table names
- UUID ids everywhere
- explicit foreign keys

---

# 13. UI/UX RULES

The UI should feel:
- calm
- operational
- clean
- readable

Inspired by:
- Shopify Admin
- Linear
- Stripe Dashboard

---

## UI Priorities
- readability
- spacing
- touch usability
- fast interactions
- minimal friction

---

## Avoid
- excessive gradients
- flashy animations
- visual experimentation
- heavy glassmorphism
- cluttered dashboards

---

## Interaction Rules
- minimum 44px touch targets
- one-tap variant selection
- minimal modal chains
- clear operational feedback

---

# 14. SEARCH RULES

Search must support:
- product names
- SKU search
- category search
- instant filtering

Search should prioritize:
- speed
- reliability
- low latency

Avoid:
- overly complex fuzzy search systems initially

---

# 15. PERFORMANCE PHILOSOPHY

Performance matters heavily because:
- users operate in busy environments
- devices may be low-end
- internet may be inconsistent

The app should:
- load fast
- feel responsive
- minimize unnecessary re-renders
- minimize excessive client complexity

---

# 16. TESTING PHILOSOPHY

Inventory consistency is the highest testing priority.

Critical systems:
- checkout rollback safety
- stock deduction
- invoice integrity
- concurrency handling

Every release should validate:
- inventory accuracy
- checkout consistency
- low stock logic
- mobile usability

---

# 17. AI AGENT OPERATING RULES

All AI agents working on PaisaPOS MUST:

## Respect Product Principles
Do not violate:
- MVP discipline
- operational simplicity
- inventory-first philosophy

---

## Avoid Scope Expansion
Do not introduce:
- ERP features
- enterprise abstractions
- unnecessary systems

---

## Maintain Architecture Consistency
Respect:
- Supabase-first architecture
- server-side business logic
- SQL-first data modeling
- atomic transactions

---

## Maintain UX Consistency
Prioritize:
- speed
- clarity
- operational workflows
- touch usability

---

# 18. CURRENT PRODUCT STAGE

Current phase:
MVP Development + Pilot Testing Preparation

Current goals:
- complete stable MVP
- onboard pilot stores
- observe real usage
- optimize workflows
- validate operational reliability

---

# 19. LONG-TERM PRODUCT VISION

Long-term goal:
Become the default lightweight retail operating system for small Nepali fashion retailers.

But growth must happen carefully:
- through operational trust
- through workflow excellence
- through reliability

NOT through feature overload.

---

# 20. FINAL PRINCIPLE

Every decision should support:

- inventory trust
- operational speed
- onboarding simplicity
- mobile usability
- daily business reliability

If a feature does not improve those outcomes:
it should probably not exist.
