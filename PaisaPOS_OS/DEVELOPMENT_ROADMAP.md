# DEVELOPMENT_ROADMAP

Version: 1.0  
Status: Active  
Last Updated: 2026-05-23

---

# 1. ROADMAP OVERVIEW

This roadmap exists to:
- maintain MVP discipline
- prioritize correctly
- prevent feature creep
- guide engineering decisions
- align all AI agents and contributors

The roadmap prioritizes:
1. operational reliability
2. inventory trust
3. billing speed
4. usability
5. iterative learning

NOT feature quantity.

---

# 2. PRODUCT DEVELOPMENT PHILOSOPHY

PaisaPOS should grow through:
- real-world usage
- pilot feedback
- operational observation
- workflow optimization

NOT assumptions.

---

# 3. CURRENT STAGE

## Current Phase
```text
MVP Development
```

Primary goals:
- stable core workflows
- inventory consistency
- fast billing
- pilot readiness

---

# 4. ROADMAP STRUCTURE

The roadmap is divided into:

```text
Phase 1 → Core MVP
Phase 2 → Operational Expansion
Phase 3 → Scale Preparation
```

---

# 5. PHASE 1 — CORE MVP

Status:
```text
ACTIVE
```

Goal:
Build the smallest reliable operational POS for Nepali clothing stores.

---

# 6. PHASE 1 OBJECTIVES

The MVP must reliably solve:

- inventory tracking
- fast billing
- variant management
- invoice generation
- low stock visibility

---

# 7. PHASE 1 — FEATURE LIST

## 7.1 Authentication

### Includes
- Supabase Auth
- login
- protected routes
- store-scoped access

### Priority
CRITICAL

---

## 7.2 Dashboard

### Includes
- today's sales
- low stock alerts
- invoice count
- quick actions
- recent invoices

### Priority
HIGH

---

## 7.3 Inventory Management

### Includes
- create products
- edit products
- variant management
- stock updates
- low stock visibility

### Priority
CRITICAL

---

## 7.4 Variant Matrix Generator

### Includes
- bulk variant generation
- sizes/colors input
- automatic combinations
- editable stock/pricing/SKU

### Priority
CRITICAL

---

## 7.5 Billing POS

### Includes
- instant search
- cart system
- variant selection
- checkout flow
- payment method selection

### Priority
CRITICAL

---

## 7.6 Atomic Checkout RPC

### Includes
- transactional checkout
- inventory deduction
- rollback safety
- row locking

### Priority
MISSION CRITICAL

---

## 7.7 Invoice History

### Includes
- invoice listing
- invoice search
- receipt reprint

### Priority
HIGH

---

## 7.8 Thermal Receipt Printing

### Includes
- browser printing
- thermal layout
- print CSS optimization

### Priority
HIGH

---

# 8. PHASE 1 — UX PRIORITIES

Highest UX priorities:

## 1. Search Speed
Search must feel instant.

---

## 2. Variant Selection Speed
One-tap variant workflows.

---

## 3. Checkout Speed
Minimal friction billing.

---

## 4. Mobile Usability
Smooth Android/tablet usage.

---

# 9. PHASE 1 — ENGINEERING PRIORITIES

Highest engineering priorities:

## Inventory Consistency
Never allow stock corruption.

---

## Transaction Safety
Checkout must rollback safely.

---

## Performance
Fast interactions on low-end devices.

---

## Simplicity
Avoid overengineering.

---

# 10. PHASE 1 — SUCCESS CRITERIA

The MVP succeeds if stores can:
- onboard quickly
- trust inventory
- bill rapidly
- operate daily without confusion

---

# 11. PHASE 1 — NON-GOALS

Do NOT build during MVP:

- analytics systems
- CRM
- supplier management
- ecommerce
- loyalty systems
- payroll
- accounting
- employee permissions
- multi-store management

---

# 12. PHASE 2 — OPERATIONAL EXPANSION

Status:
```text
FUTURE
```

Goal:
Expand operational capabilities carefully.

---

# 13. PHASE 2 — POSSIBLE FEATURES

Potential additions:
- barcode scanning
- supplier management
- employee accounts
- offline mode
- analytics
- advanced reporting

### High-Priority Operational Micro-Features
Planned for incremental rollout:
1. **WhatsApp/Viber Restock Draft (Quick Supplier Orders)**: Formats and copies a plain-text restock order list of low-stock items directly to clipboard for fast messaging to Kathmandu wholesalers.
2. **[COMPLETED] Ad-hoc Custom Cart Item (Fast Checkout)**: Quick input in POS billing cart sidebar to add custom item names/pricing (e.g., custom alterations, unlisted stock) without leaving the billing workflow. (Implemented and verified May 2026)
3. **[COMPLETED] Inline Stock Bumpers**: Tactical `+` and `-` clickers next to quantities in the main Inventory variant list view to perform instant quantity updates. (Implemented and verified May 2026)
4. **[COMPLETED] Quick-Access Favorite Chips**: Tap-friendly shortcut chips below the billing search bar for high-frequency items (bags, gift wraps, top-selling seasonal variants) with horizontal momentum scroll and dynamic fades for 1-tap addition. (Implemented and verified May 2026)
5. **Role-Based UI Isolation (Access Control)**: Configure cashier-level visual blocks and administrative guards directly inside the frontend UI (leveraging the newly deployed database-level `users.role` cashier/owner columns).
6. **Bulk Catalog Importer (Onboarding Acceleration)**: Create a lightweight CSV/Excel catalog parser to help boutique owners bulk-upload their product listings and initial variant stock in seconds during pilot onboarding.

Only after:
- strong MVP validation
- stable operations
- clear demand

---

# 14. PHASE 2 — OFFLINE MODE

Potential future feature:
- temporary offline billing
- sync reconciliation

Important:
Offline mode introduces major complexity.

Do NOT implement prematurely.

---

# 15. PHASE 2 — ANALYTICS

Potential additions:
- sales trends
- best-selling products
- category performance

Avoid:
- dashboard overload
- vanity metrics

---

# 16. PHASE 3 — SCALE PREPARATION

Status:
```text
LONG TERM
```

Goal:
Prepare for larger SaaS operations.

---

# 17. PHASE 3 — POSSIBLE EXPANSIONS

Potential future areas:
- multi-branch support
- ecommerce integrations
- warehouse syncing
- advanced permissions
- audit logging

Only if:
real usage demands them.

---

# 18. ROADMAP PRIORITIZATION RULES

When prioritizing features ask:

```text
Does this improve:
- inventory trust?
- checkout speed?
- operational simplicity?
- retailer workflow quality?
```

If not:
deprioritize heavily.

---

# 19. FEATURE EVALUATION FRAMEWORK

Every proposed feature should be evaluated on:

## Operational Value
Does it solve daily problems?

---

## Frequency
Will users use it often?

---

## Complexity
Does it introduce unnecessary architecture?

---

## Reliability Impact
Could it reduce operational trust?

---

# 20. ROADMAP ANTI-GOALS

Avoid becoming:
- ERP software
- accounting suite
- enterprise retail system
- feature-heavy admin dashboard

---

# 21. AI AGENT ROADMAP RULES

All AI agents MUST:
- respect roadmap priorities
- avoid unauthorized feature expansion
- preserve MVP discipline
- prioritize operational reliability

---

# 22. RELEASE STRATEGY

## Release Philosophy

Ship:
- small improvements
- stable workflows
- operational upgrades

Avoid:
- massive unstable releases

---

## Iteration Strategy

Prefer:
```text
Build → Observe → Improve
```

NOT:
```text
Assume → Overbuild → Complicate
```

---

# 23. TECHNICAL DEBT STRATEGY

Accept small technical debt if:
- it speeds validation safely
- it does not threaten inventory consistency

But avoid:
- architectural chaos
- hidden complexity

---

# 24. LONG-TERM PRODUCT VISION

Long-term goal:
Become the default lightweight retail operating system for Nepali fashion stores.

The product should win through:
- reliability
- operational excellence
- simplicity
- workflow quality

NOT feature quantity.

---

# 25. FINAL ROADMAP PRINCIPLE

The roadmap exists to protect:
- simplicity
- operational focus
- inventory trust
- product clarity

Every future decision should support:
- daily retailer workflows
- operational reliability
- maintainable growth

If a feature adds complexity without strong operational value:
it should probably not exist.
