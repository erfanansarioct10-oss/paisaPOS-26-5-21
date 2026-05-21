# DATABASE_SCHEMA

Version: 1.0  
Status: Active  
Last Updated: 2026-05-21

---

# 1. DATABASE OVERVIEW

PaisaPOS uses PostgreSQL through Supabase as the primary database system.

The database architecture prioritizes:
- transactional consistency
- inventory integrity
- operational reliability
- maintainability
- relational clarity

The database is intentionally:
- simple
- normalized
- SQL-first
- inventory-safe

---

# 2. DATABASE PRINCIPLES

## 2.1 Inventory Integrity First

Inventory data must always remain:
- accurate
- consistent
- rollback-safe

---

## 2.2 Relational Architecture

The system uses:
- normalized relational tables
- explicit foreign keys
- strong data relationships

Avoid:
- unstructured data
- NoSQL complexity
- denormalized chaos

---

## 2.3 Atomic Transactions

Critical operations MUST be:
- atomic
- isolated
- rollback-safe

Especially:
- checkout
- stock deduction
- invoice creation

---

## 2.4 Backend Authority

The database is the source of truth.

Business-critical logic should remain:
- inside PostgreSQL
- server-controlled
- transactional

---

# 3. DATABASE EXTENSIONS

```sql
create extension if not exists "uuid-ossp";
```

Used for:
- UUID generation

---

# 4. TABLE OVERVIEW

Core tables:

```text
stores
users
products
product_variants
inventory
invoices
invoice_items
```

---

# 5. TABLE: stores

## Purpose

Represents a business/store using PaisaPOS.

---

## Schema

```sql
create table stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  pan_vat text,
  created_at timestamp with time zone
    default timezone('utc'::text, now()) not null
);
```

---

## Notes

- MVP currently assumes one active store per account
- Structure is future-ready for multi-store SaaS

---

# 6. TABLE: users

## Purpose

Represents authenticated users connected to stores.

---

## Schema

```sql
create table users (
  id uuid primary key
    references auth.users on delete cascade,

  name text not null,

  store_id uuid
    references stores(id)
    on delete set null,

  created_at timestamp with time zone
    default timezone('utc'::text, now()) not null
);
```

---

## Relationships

```text
users → stores
```

Many users can belong to one store.

---

# 7. TABLE: products

## Purpose

Represents base products.

Example:
```text
Oversized Hoodie
Baggy Jeans
Kurti Set
```

---

## Schema

```sql
create table products (
  id uuid primary key default gen_random_uuid(),

  store_id uuid
    references stores(id)
    on delete cascade
    not null,

  name text not null,

  category text not null,

  image_url text,

  low_stock_threshold integer
    default 5
    not null,

  created_at timestamp with time zone
    default timezone('utc'::text, now()) not null
);
```

---

## Notes

Products do NOT contain:
- direct stock
- direct pricing

Those belong to variants.

---

# 8. TABLE: product_variants

## Purpose

Represents:
- size variants
- color variants
- SKU-level sellable units

---

## Example

```text
Oversized Hoodie / Black / M
Oversized Hoodie / Black / L
Oversized Hoodie / White / M
```

---

## Schema

```sql
create table product_variants (
  id uuid primary key default gen_random_uuid(),

  product_id uuid
    references products(id)
    on delete cascade
    not null,

  size text not null,

  color text not null,

  sku text unique not null,

  price numeric(10,2)
    not null
    check (price >= 0),

  created_at timestamp with time zone
    default timezone('utc'::text, now()) not null
);
```

---

## Relationships

```text
product_variants → products
```

Many variants belong to one product.

---

# 9. TABLE: inventory

## Purpose

Tracks stock quantities for each variant.

Inventory is variant-level ONLY.

---

## Schema

```sql
create table inventory (
  id uuid primary key default gen_random_uuid(),

  variant_id uuid
    references product_variants(id)
    on delete cascade
    unique
    not null,

  quantity integer
    not null
    default 0
    check (quantity >= 0),

  updated_at timestamp with time zone
    default timezone('utc'::text, now()) not null
);
```

---

## Relationships

```text
inventory → product_variants
```

One inventory row per variant.

---

## Important Rule

Inventory quantity must NEVER become negative.

---

# 10. TABLE: invoices

## Purpose

Represents completed customer sales.

---

## Schema

```sql
create table invoices (
  id uuid primary key default gen_random_uuid(),

  store_id uuid
    references stores(id)
    on delete cascade
    not null,

  invoice_number text not null,

  customer_name text,

  customer_phone text,

  total_amount numeric(10,2)
    not null
    check (total_amount >= 0),

  discount_amount numeric(10,2)
    default 0.00
    check (discount_amount >= 0),

  paid_amount numeric(10,2)
    not null
    check (paid_amount >= 0),

  payment_method text not null,

  created_at timestamp with time zone
    default timezone('utc'::text, now()) not null
);
```

---

## Supported Payment Methods

```text
Cash
eSewa
Khalti
Fonepay
```

---

# 11. TABLE: invoice_items

## Purpose

Represents line items inside invoices.

---

## Schema

```sql
create table invoice_items (
  id uuid primary key default gen_random_uuid(),

  invoice_id uuid
    references invoices(id)
    on delete cascade
    not null,

  variant_id uuid
    references product_variants(id)
    on delete cascade
    not null,

  quantity integer
    not null
    check (quantity > 0),

  unit_price numeric(10,2)
    not null
    check (unit_price >= 0),

  subtotal numeric(10,2)
    not null
    check (subtotal >= 0)
);
```

---

## Relationships

```text
invoice_items → invoices
invoice_items → product_variants
```

---

# 12. RELATIONSHIP OVERVIEW

```text
stores
  └── users

stores
  └── products
        └── product_variants
              └── inventory

stores
  └── invoices
        └── invoice_items
              └── product_variants
```

---

# 13. INVENTORY TRANSACTION SYSTEM

## Critical Principle

Inventory deduction MUST be atomic.

Checkout should:
- fully succeed
OR
- fully fail

Never partial success.

---

# 14. RPC CHECKOUT FUNCTION

Checkout uses:

```sql
create_invoice_and_deduct_stock()
```

This function:
- validates stock
- locks inventory rows
- creates invoices
- inserts invoice items
- deducts inventory
- commits transaction atomically

---

# 15. WHY RPC INSTEAD OF TRIGGERS

Triggers were intentionally avoided because:
- harder debugging
- implicit behavior
- race condition risks
- reduced visibility

RPC functions provide:
- explicit flow
- easier testing
- better transaction control

---

# 16. CHECKOUT FLOW

## Transaction Steps

```text
1. Begin transaction
2. Lock inventory rows
3. Validate quantities
4. Create invoice
5. Insert invoice items
6. Deduct stock
7. Commit transaction
```

If any step fails:
```text
ROLLBACK EVERYTHING
```

---

# 17. ROW LOCKING STRATEGY

Uses:

```sql
FOR UPDATE
```

to prevent:
- overselling
- concurrent corruption
- inconsistent stock deduction

---

# 18. INDEXING STRATEGY

Important indexes should exist for:

## Product Search

```sql
products.name
products.category
product_variants.sku
```

---

## Inventory Queries

```sql
inventory.variant_id
```

---

## Invoice Queries

```sql
invoices.created_at
invoices.store_id
```

---

# 19. LOW STOCK STRATEGY

Low stock is determined using:

```text
inventory.quantity <= products.low_stock_threshold
```

This should support:
- dashboard alerts
- inventory warnings

---

# 20. SKU STRATEGY

SKUs must be:
- unique
- searchable
- operationally readable

Example:
```text
HOOD-BLK-M
JEAN-BLU-32
```

---

# 21. DATA VALIDATION RULES

## Quantities
Must never be negative.

---

## Prices
Must never be negative.

---

## Required Fields
Critical operational fields cannot be null.

---

# 22. ROW LEVEL SECURITY (RLS)

## Purpose

Prevent:
- cross-store access
- unauthorized inventory viewing
- unauthorized invoice access

---

## MVP Scope

Each authenticated user should only access:
- their own store's data

---

# 23. FUTURE DATABASE EXPANSION

Potential future tables:
- suppliers
- barcode mappings
- employee roles
- audit logs
- analytics snapshots

NOT included in MVP.

---

# 24. DATABASE ANTI-GOALS

Do NOT introduce:
- NoSQL systems
- distributed databases
- event sourcing
- CQRS
- complex replication systems

Current scale does not require them.

---

# 25. MIGRATION STRATEGY

Use:
- versioned SQL migrations
- incremental schema updates
- rollback-safe migration practices

Avoid:
- destructive production changes

---

# 26. BACKUP STRATEGY

Critical production backups should include:
- daily snapshots
- invoice retention
- inventory state preservation

---

# 27. TESTING REQUIREMENTS

Critical database tests:
- checkout rollback safety
- inventory consistency
- row locking behavior
- invoice integrity
- low stock calculations

---

# 28. OBSERVABILITY REQUIREMENTS

Track:
- failed transactions
- stock deduction failures
- RPC failures
- invalid checkout attempts

---

# 29. FUTURE SCALABILITY

Current schema supports:
- MVP scale
- growing inventory sizes
- future multi-store expansion

WITHOUT introducing:
- architectural complexity
- distributed systems

---

# 30. FINAL DATABASE PRINCIPLE

The database exists to guarantee:
- inventory trust
- transactional consistency
- operational reliability

Every schema decision should support:
- simplicity
- correctness
- maintainability
- business safety
