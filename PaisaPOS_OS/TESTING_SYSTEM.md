# TESTING_SYSTEM

Version: 1.0  
Status: Active  
Last Updated: 2026-05-21

---

# 1. PURPOSE

This document defines the testing philosophy, testing layers, validation requirements, and operational quality standards for PaisaPOS.

Testing exists to protect:
- inventory integrity
- transactional consistency
- operational reliability
- checkout correctness
- production stability

---

# 2. TESTING PHILOSOPHY

PaisaPOS testing prioritizes:
1. inventory trust
2. transaction safety
3. operational workflows
4. usability
5. reliability

NOT:
- artificial test coverage numbers
- overengineered testing systems

---

# 3. CORE TESTING PRINCIPLE

The most important rule:

```text
Inventory must never become inconsistent.
```

All testing systems exist primarily to guarantee:
- accurate stock
- safe billing
- rollback correctness

---

# 4. TESTING LAYERS

The testing system consists of:

```text
1. Type Safety
2. Linting
3. Unit Testing
4. Integration Testing
5. Transaction Testing
6. Manual Operational Testing
7. Pilot Validation
```

---

# 5. TYPE SAFETY TESTING

## Requirement

All builds must pass:
```bash
npm run build
```

without:
- TypeScript errors
- invalid imports
- compilation failures

---

## Rules

TypeScript must remain:
- strict
- explicit
- maintainable

Avoid:
```ts
any
```

unless absolutely unavoidable.

---

# 6. LINTING SYSTEM

## Requirement

All code must pass:
```bash
npm run lint
```

before production deployment.

---

## Purpose

Linting protects:
- code consistency
- readability
- maintainability

---

# 7. UNIT TESTING

## Purpose

Unit tests validate:
- isolated logic
- utility functions
- calculations
- formatting behavior

---

## High Priority Unit Tests

### Inventory Calculations
- stock math
- low stock checks

---

### Pricing Calculations
- subtotal calculations
- discount calculations
- invoice totals

---

### Search Logic
- filtering behavior
- SKU matching
- category matching

---

# 8. INTEGRATION TESTING

## Purpose

Integration tests validate:
- connected workflows
- multi-step operations
- UI + database behavior

---

# 9. CRITICAL INTEGRATION FLOWS

Highest priority flows:

## Checkout Flow
Must verify:
- invoice creation
- stock deduction
- rollback behavior

---

## Product Creation Flow
Must verify:
- product creation
- variant generation
- inventory initialization

---

## Search Flow
Must verify:
- instant filtering
- keyboard interaction
- variant selection

---

# 10. TRANSACTION TESTING

## Highest Priority Testing Category

All checkout transactions must be tested aggressively.

---

# 11. REQUIRED CHECKOUT TESTS

## Successful Checkout

Verify:
- invoice created
- invoice items created
- stock deducted correctly

---

## Failed Checkout Rollback

Verify:
- no partial invoices
- no partial stock deduction
- rollback consistency

---

## Concurrent Checkout Safety

Verify:
- row locking works
- overselling prevented
- inventory remains consistent

---

# 12. ATOMIC ROLLBACK TEST

## Mandatory Validation

Scenario:

```text
Cart:
- Item A → valid stock
- Item B → insufficient stock
```

Expected behavior:
```text
1. Entire transaction fails
2. No invoice created
3. No stock deducted
4. Clear error returned
```

---

# 13. INVENTORY TESTING

## Required Inventory Tests

### Stock Deduction
Verify exact quantity deduction.

---

### Low Stock Detection
Verify threshold logic.

---

### Out-of-Stock Protection
Verify blocked checkout.

---

### Variant Isolation
Verify variants update independently.

---

# 14. SEARCH TESTING

Search is operationally critical.

---

## Required Search Tests

### SKU Search
Must match instantly.

---

### Product Name Search
Must feel instant.

---

### Category Search
Must filter correctly.

---

### Keyboard Navigation
Must support:
- ArrowUp
- ArrowDown
- Enter
- Escape

---

# 15. MOBILE TESTING

## Required Devices

Test on:
- Android phones
- tablets
- smaller screens

---

## Required Mobile Behaviors

Verify:
- touch responsiveness
- cart usability
- variant selection
- keyboard visibility
- print behavior

---

# 16. RESPONSIVE TESTING

## Required Breakpoints

Test:
```text
mobile
tablet
desktop
```

---

## Verify

- layout stability
- no overflow
- no clipped actions
- readable spacing

---

# 17. BILLING WORKFLOW TESTING

Critical operational tests:

---

## Fast Checkout Test

Measure:
- billing speed
- interaction friction

---

## Cart Editing Test

Verify:
- quantity adjustment
- removal behavior
- recalculation accuracy

---

## Payment Method Test

Verify:
- Cash
- eSewa
- Khalti
- Fonepay

all behave correctly.

---

# 18. RECEIPT TESTING

## Required Tests

Verify:
- thermal formatting
- browser printing
- receipt readability
- invoice consistency

---

## Print Testing

Test:
```text
window.print()
```

on:
- desktop browsers
- mobile browsers

---

# 19. DATABASE TESTING

## Required Validation

Verify:
- foreign keys
- relational integrity
- UUID generation
- RLS isolation

---

# 20. RLS SECURITY TESTING

Critical security tests:

---

## Store Isolation Test

Verify:
- users cannot access other stores

---

## Unauthorized Mutation Test

Verify:
- invalid writes are blocked

---

# 21. PERFORMANCE TESTING

## Primary Goal

The app must remain fast on:
- lower-end Android devices
- weaker internet connections

---

# 22. REQUIRED PERFORMANCE TESTS

## Search Performance

Test:
```text
100+ variants
```

Expected:
```text
instant filtering
```

---

## Billing Speed

Verify:
- responsive cart updates
- instant variant interactions

---

## Render Performance

Verify:
- minimal lag
- smooth scrolling
- fast page loads

---

# 23. ERROR HANDLING TESTING

## Verify Errors Are

- understandable
- actionable
- operationally clear

Avoid:
- cryptic technical errors
- silent failures

---

# 24. MANUAL TESTING REQUIREMENTS

Manual testing is mandatory.

Some operational issues cannot be detected automatically.

---

# 25. REQUIRED MANUAL TEST FLOWS

## Daily Retail Workflow

Simulate:
- opening store
- adding products
- multiple checkouts
- low stock scenarios

---

## Rapid Billing Sessions

Stress test:
- repeated billing
- fast interactions
- mobile usage

---

# 26. PILOT TESTING

## Real Usage Testing

Observe:
- onboarding friction
- workflow confusion
- inventory mistakes
- billing delays

---

## Pilot Success Metrics

Track:
- onboarding speed
- billing speed
- operational confidence

---

# 27. TEST DATA STRATEGY

Use realistic Nepali retail data.

Examples:
```text
Oversized Hoodie
Baggy Jeans
Kurti Set
Cargo Pants
Sneakers
```

---

## Include Variants

```text
Sizes:
S, M, L, XL

Colors:
Black, White, Olive, Navy
```

---

# 28. CI/CD TEST REQUIREMENTS

Before deployment:
- build must pass
- lint must pass
- critical transaction tests must pass

---

# 29. BUG PRIORITY LEVELS

## P0 — Critical

Examples:
- inventory corruption
- overselling
- failed rollback
- invoice inconsistency

Fix immediately.

---

## P1 — High

Examples:
- checkout friction
- major mobile issues
- search failures

---

## P2 — Medium

Examples:
- visual inconsistencies
- minor UX polish

---

# 30. TESTING ANTI-GOALS

Avoid:
- meaningless coverage chasing
- overengineered test systems
- excessive mocking complexity

Testing should remain:
- operational
- practical
- business-focused

---

# 31. AI AGENT TESTING RULES

All AI agents must:
- protect inventory consistency
- validate transactional behavior
- avoid untested critical logic

---

## AI Agents Must NEVER

- bypass rollback testing
- skip checkout validation
- ignore mobile testing
- assume inventory safety

---

# 32. RELEASE VALIDATION CHECKLIST

Before release verify:

```text
[ ] Build passes
[ ] Lint passes
[ ] Checkout rollback works
[ ] Inventory deduction correct
[ ] Mobile usability verified
[ ] Receipt printing verified
[ ] Low stock alerts verified
[ ] Search speed acceptable
```

---

# 33. OBSERVABILITY REQUIREMENTS

Track production:
- checkout failures
- RPC errors
- stock inconsistencies
- failed inventory writes

---

# 34. LONG-TERM TESTING PHILOSOPHY

As the product scales:
- preserve simplicity
- focus on operational correctness
- prioritize retailer workflows

Testing exists to protect:
```text
retailer trust
```

---

# 35. FINAL TESTING PRINCIPLE

Every testing decision should prioritize:
- inventory trust
- operational reliability
- checkout safety
- retailer confidence

If inventory consistency is not guaranteed:
the system is not production-ready.
