# FEATURE: BULK CATALOG IMPORTER

Version: 1.0  
Status: PLANNED  
Roadmap Section: Phase 2A — Operational Enhancements (#6)  
Priority: 🥇 HIGHEST (Pilot Readiness Blocker)  
Last Updated: 2026-05-23

---

# 1. WHY THIS FEATURE EXISTS

## The Problem

A typical Nepali clothing boutique stocks 100–500+ products, each with 3–15 size/color variants.

Current onboarding path:
```
Open PaisaPOS → Add Product → Fill name/category → Enter sizes/colors → Generate matrix → Set prices → Save → Repeat 200 times
```

This takes **2–4 hours** of manual data entry per store. For pilot onboarding, this is a dealbreaker.

Most boutique owners already have their catalog in one of these formats:
- handwritten notebook (will be typed into a spreadsheet by us or them)
- Excel/Google Sheet from a wholesaler's price list
- WhatsApp messages with product lists from Kathmandu suppliers

## The Pain Points

| Pain Point | Impact |
|-----------|--------|
| Manual product entry is slow | 2–4 hours per store onboarding |
| Error-prone data entry | Typos in SKUs, wrong prices, missed variants |
| High friction = pilot abandonment | Store owners give up before finishing setup |
| No way to load existing catalog data | Stores can't migrate from notebooks/spreadsheets |
| Repeated work for similar products | Same sizes/colors re-entered per product |

## The Solution

A lightweight CSV/Excel file uploader that:
1. Accepts a simple spreadsheet with product + variant data
2. Validates and previews the data before committing
3. Batch-creates all products, variants, and inventory in one operation
4. Gets a store from zero to operational in **minutes, not hours**

---

# 2. PRODUCT REQUIREMENTS

## Core Promise

> "Upload your product list. Be selling in 5 minutes."

## Success Metrics

- Onboarding time: **< 10 minutes** for a 200-product catalog
- Zero data corruption — every import must be atomic
- Store owner can prepare the file without technical help

## Target Users

- Boutique owner onboarding for the first time
- Store staff adding a new seasonal collection
- PaisaPOS team onboarding pilot stores

---

# 3. FILE FORMAT SPECIFICATION

## Supported Formats

- `.csv` (primary — universally accessible)
- `.xlsx` (secondary — Excel users)

## Required Columns

| Column | Type | Required | Max Length | Description | Example |
|--------|------|----------|-----------|-------------|---------|
| `Product Name` | text | ✅ | 150 chars | Product title | `Oversized Linen Shirt` |
| `Category` | text | ✅ | 100 chars | Product category | `Tops` |
| `Size` | text | ✅ | 50 chars | Variant size | `M` |
| `Color` | text | ✅ | 50 chars | Variant color | `Black` |
| `Price` | number | ✅ | — | Variant price in NPR (≥ 0) | `1500` |
| `Stock` | integer | ✅ | — | Initial stock count (≥ 0) | `10` |

## Optional Columns

| Column | Type | Default | Description | Example |
|--------|------|---------|-------------|---------|
| `SKU` | text | Auto-generated | Variant SKU code | `OVER-BLK-M` |
| `Low Stock Threshold` | integer | `5` | Per-product alert trigger | `3` |

## Column Name Matching Rules

The parser must be **forgiving** with column headers:
- Case-insensitive: `product name` = `Product Name` = `PRODUCT NAME`
- Whitespace-trimmed: ` Size ` = `Size`
- Common aliases accepted:
  - `Product Name` → also accept: `Name`, `Product`, `Item Name`, `Item`
  - `Category` → also accept: `Cat`, `Type`
  - `Price` → also accept: `Unit Price`, `MRP`, `Rate`
  - `Stock` → also accept: `Quantity`, `Qty`, `Initial Stock`
  - `SKU` → also accept: `SKU Code`, `Item Code`, `Barcode`
  - `Low Stock Threshold` → also accept: `Alert Limit`, `Reorder Level`

## Example CSV

```csv
Product Name,Category,Size,Color,Price,Stock,SKU
Oversized Linen Shirt,Tops,S,Black,1500,10,OVER-BLK-S
Oversized Linen Shirt,Tops,M,Black,1500,15,OVER-BLK-M
Oversized Linen Shirt,Tops,L,Black,1500,12,OVER-BLK-L
Oversized Linen Shirt,Tops,S,White,1500,8,OVER-WHT-S
Oversized Linen Shirt,Tops,M,White,1500,20,OVER-WHT-M
Oversized Linen Shirt,Tops,L,White,1500,10,OVER-WHT-L
Baggy Cargo Pants,Bottoms,28,Olive,2200,5,CARG-OLI-28
Baggy Cargo Pants,Bottoms,30,Olive,2200,8,CARG-OLI-30
Baggy Cargo Pants,Bottoms,32,Olive,2200,12,CARG-OLI-32
Baggy Cargo Pants,Bottoms,28,Black,2200,7,CARG-BLK-28
Baggy Cargo Pants,Bottoms,30,Black,2200,10,CARG-BLK-30
Baggy Cargo Pants,Bottoms,32,Black,2200,15,CARG-BLK-32
```

This file represents **2 products with 12 variants** — onboarded in seconds instead of minutes.

## How Rows Map to Products

Multiple rows with the **same Product Name + Category** are grouped into a single product.
Each row within that group becomes one variant.

```
Rows with "Oversized Linen Shirt" + "Tops" → 1 product, 6 variants
Rows with "Baggy Cargo Pants" + "Bottoms"  → 1 product, 6 variants
```

---

# 4. TECHNICAL ARCHITECTURE

## Database Schema Reference

The importer must create records across three tables in this order:

### Table: `products`

```sql
-- File: supabase/migrations/20260521084324_init_schema.sql (L38-46)
create table products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade not null,
  name text not null,
  category text not null,
  image_url text,
  low_stock_threshold integer default 5 not null,
  created_at timestamptz default now() not null
);
```

### Table: `product_variants`

```sql
-- File: supabase/migrations/20260521084324_init_schema.sql (L49-57)
-- Modified by: 20260523104500_tenant_scoped_sku.sql (store_id + scoped SKU)
create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products(id) on delete cascade not null,
  store_id uuid references stores(id) on delete cascade not null,
  size text not null,
  color text not null,
  sku text not null,
  price numeric(10,2) not null check (price >= 0),
  created_at timestamptz default now() not null
);
-- SKU uniqueness is per-store:
-- CONSTRAINT: product_variants_store_sku_key UNIQUE (store_id, sku)
```

### Table: `inventory`

```sql
-- File: supabase/migrations/20260521084324_init_schema.sql (L60-65)
create table inventory (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid references product_variants(id) on delete cascade unique not null,
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz default now() not null
);
```

## Existing RPC to Reuse

The `upsert_product_and_variants` function already handles atomic product + variant + inventory creation:

```sql
-- File: supabase/migrations/20260523104500_tenant_scoped_sku.sql (L20-131)
CREATE OR REPLACE FUNCTION upsert_product_and_variants(
  p_product_id uuid,          -- NULL for create
  p_name text,
  p_category text,
  p_low_stock_threshold integer,
  p_deleted_variant_ids uuid[],
  p_variants jsonb            -- [{size, color, sku, price, stock}]
) RETURNS uuid
```

**Key behaviors:**
- Resolves `store_id` from `auth.uid()` automatically
- Inserts product → then inserts each variant → then inserts inventory for each variant
- Auto-generates audit log entries
- Validates store ownership
- SKU uniqueness enforced at DB level (store-scoped)
- Runs as `SECURITY DEFINER` — safe through RLS

## SKU Auto-Generation Logic

When a user doesn't provide SKU values, the importer should auto-generate them using the same pattern as the existing Variant Matrix Generator:

```typescript
// File: src/features/inventory/import/catalog-parser.ts
const prefix = productName
  .replace(/[^a-zA-Z0-9]/g, "")
  .slice(0, 4)
  .toUpperCase();

const skuSize = size.toUpperCase().replace(/\s/g, "");
const skuColor = color.toUpperCase().slice(0, 3).replace(/\s/g, "");
const sku = `${prefix}-${skuColor}-${skuSize}`;
```

Example: `Oversized Linen Shirt`, Size `M`, Color `Black` → `OVER-BLK-M`

## Category Handling

Categories are a fixed dropdown in the current UI:

```typescript
// File: src/features/inventory/components/inventory-quick-product-wizard.tsx
"Outerwear" | "Bottoms" | "Tops" | "Traditional" | "Accessories"
```

The importer should:
- Accept these exact values (case-insensitive matching)
- Show a warning for unknown categories but still allow import
- Default to `"Tops"` if category is blank

---

# 5. IMPLEMENTATION PHASES

## Phase A — Core Parser & Validation (Backend Logic)

**Goal:** Parse, validate, and group CSV/XLSX data into importable product structures.

### Scope
- File reading (CSV via native parsing, XLSX via `xlsx` or `sheetjs` library)
- Column header detection with alias matching
- Row-by-row validation with error collection
- Grouping: rows → products → variants
- SKU auto-generation for rows missing SKU
- Duplicate SKU detection within the file AND against existing store inventory
- Error report generation (row number + field + reason)

### Validation Rules

| Rule | Severity | Action |
|------|----------|--------|
| Missing required column | ❌ BLOCKING | Reject file with clear message |
| Empty `Product Name` | ❌ BLOCKING | Skip row, report error |
| Empty `Size` or `Color` | ❌ BLOCKING | Skip row, report error |
| `Price` < 0 or non-numeric | ❌ BLOCKING | Skip row, report error |
| `Stock` < 0 or non-integer | ❌ BLOCKING | Skip row, report error |
| `Product Name` > 150 chars | ⚠️ WARNING | Truncate, warn user |
| `SKU` > 100 chars | ⚠️ WARNING | Truncate, warn user |
| Duplicate SKU in file | ❌ BLOCKING | Report conflict, user must fix |
| SKU already exists in store | ⚠️ WARNING | Warn user, offer to skip or overwrite |
| Unknown category value | ⚠️ WARNING | Import as-is, warn user |
| Completely empty row | — | Silently skip |

### Output Structure

```typescript
interface ParsedImport {
  products: ParsedProduct[];
  errors: ImportError[];
  warnings: ImportWarning[];
  stats: {
    totalRows: number;
    validRows: number;
    errorRows: number;
    productCount: number;
    variantCount: number;
  };
}

interface ParsedProduct {
  name: string;
  category: string;
  lowStockThreshold: number;
  variants: {
    size: string;
    color: string;
    sku: string;
    price: number;
    stock: number;
  }[];
}

interface ImportError {
  row: number;
  field: string;
  message: string;
}

interface ImportWarning {
  row: number;
  field: string;
  message: string;
}
```

---

## Phase B — Preview & Confirmation UI

**Goal:** Show the user exactly what will be imported before committing.

### UI Flow

```
[1. Upload]  →  [2. Preview]  →  [3. Confirm]  →  [4. Result]
```

### Step 1 — Upload

- Drag-and-drop zone OR file picker button
- Accept `.csv` and `.xlsx` only
- Max file size: 5MB (safety limit for browser memory)
- Show template download link ("Download sample CSV")
- Show column guide tooltip

### Step 2 — Preview (Critical Step)

After parsing, show:

**Summary Cards:**
```
📦 Products Found: 24
🏷️ Variants Found: 156
⚠️ Warnings: 3
❌ Errors: 0
```

**Product Accordion:**
Expandable list of all detected products, each showing:
- Product name + category
- Variant count
- Variant table (size, color, SKU, price, stock)
- Row-level warnings highlighted in amber

**Error Panel (if errors exist):**
- Table of errors: Row #, Field, Message
- "Fix your file and re-upload" guidance
- Import button DISABLED until zero errors

### Step 3 — Confirm

- "Import X products with Y variants" button
- Progress bar during import (per-product progress)
- Cancel button (stops remaining products, already-imported products remain)

### Step 4 — Result

- Success summary: "24 products and 156 variants imported successfully"
- Warning summary if any rows were skipped
- "Go to Inventory" button
- Option to import another file

### UI Location

- New button on the Inventory page: **"📥 Import Catalog"** (next to "Add Product")
- Opens a full-screen modal or dedicated page
- Mobile-responsive — must work on tablets (pilot onboarding scenario)

---

## Phase C — Batch Database Insertion

**Goal:** Reliably insert all validated products into the database.

### Strategy: Sequential RPC Calls (NOT a single mega-transaction)

**Why sequential, not batch:**
- The existing `upsert_product_and_variants` RPC already handles atomicity per product
- A single mega-transaction risks timeout on large catalogs (200+ products)
- Per-product insertion allows progress reporting and partial recovery
- Each product is independently atomic — if product #47 fails, products 1–46 are safely committed

### Insertion Flow

```
for each ParsedProduct:
  1. Call upsert_product_and_variants RPC (p_product_id = NULL for create)
  2. If success → mark product as ✅ imported, advance progress bar
  3. If failure (SKU collision, etc.) → mark product as ❌ failed, log error, continue
  4. After all products: show final summary
```

### Error Handling

| Scenario | Behavior |
|----------|----------|
| Network timeout mid-import | Stop, show partial result, offer retry for remaining |
| SKU collision (already exists in store) | Skip product, report to user |
| RPC validation failure | Skip product, report error message |
| Auth session expired | Stop, redirect to login |
| Supabase rate limit | Throttle with exponential backoff |

### Rate Limiting

- Insert 1 product per 100ms (10 products/second)
- This prevents overwhelming Supabase's connection pool
- For 200 products: ~20 seconds total (acceptable)

---

# 6. TEMPLATE FILE

The importer should offer a downloadable template file pre-filled with example data:

**Filename:** `PaisaPOS_Catalog_Template.csv`

```csv
Product Name,Category,Size,Color,Price,Stock,SKU,Low Stock Threshold
Example T-Shirt,Tops,S,Black,800,10,,5
Example T-Shirt,Tops,M,Black,800,15,,5
Example T-Shirt,Tops,L,Black,800,12,,5
Example T-Shirt,Tops,S,White,800,8,,5
Example T-Shirt,Tops,M,White,800,20,,5
Example T-Shirt,Tops,L,White,800,10,,5
```

Notes in the template:
- Leave SKU blank for auto-generation
- Low Stock Threshold defaults to 5 if blank
- Delete the example rows and add your products

---

# 7. SCOPE BOUNDARIES

## IN SCOPE

- CSV and XLSX file parsing
- Column validation and alias matching
- Product + variant grouping
- SKU auto-generation
- Preview UI with error/warning display
- Batch insertion via existing RPC
- Progress tracking
- Template download
- Mobile-responsive UI

## EXPLICITLY OUT OF SCOPE

Do NOT build:
- Image upload via CSV (image_url column is ignored)
- Product update/merge (import = create only, not upsert against existing products)
- Multi-sheet Excel support (only first sheet is read)
- Google Sheets direct integration
- API-based import endpoints
- Scheduled/automated imports
- Barcode generation from SKUs
- Category management UI (use existing fixed categories)

---

# 8. DEPENDENCIES

| Dependency | Type | Notes |
|-----------|------|-------|
| `upsert_product_and_variants` RPC | Existing | No changes needed |
| `xlsx` / `sheetjs` npm package | New | For `.xlsx` parsing only. CSV uses native parsing. |
| Existing `addProduct` store action | Existing | May need to be extended or a new `bulkAddProducts` action created |
| Existing `upsertProductAction` server action | Existing | Direct reuse for each product |

---

# 9. ANTI-PATTERNS TO AVOID

| Anti-Pattern | Why |
|-------------|-----|
| Building a full data migration pipeline | This is a simple file uploader, not ETL |
| Adding API import endpoints | No external system integrations needed |
| Building a spreadsheet editor in the UI | The user edits in Excel/Sheets, not in PaisaPOS |
| Supporting arbitrary column structures | Fixed schema with forgiving aliases is enough |
| Mega-transactions for entire file | Per-product atomic inserts are safer and more resilient |
| Auto-detecting product grouping from ambiguous data | Explicit `Product Name + Category` grouping only |

---

# 10. SECURITY CONSIDERATIONS

- All insertions go through `upsert_product_and_variants` RPC which validates `auth.uid()` and `store_id`
- File parsing happens client-side (no server file uploads needed)
- CSV/XLSX parsing library must be trusted and maintained (sheetjs/xlsx is standard)
- No raw SQL — only RPC calls through Supabase client
- SKU uniqueness enforced at database level (`product_variants_store_sku_key`)
- RLS policies automatically scope all data to the authenticated user's store
- File size capped at 5MB to prevent browser memory issues

---

# 11. TESTING PLAN

## Unit Tests

- CSV parser: valid file, missing columns, empty rows, special characters in names
- Column alias matching: all alias combinations
- Product grouping: same name different category = separate products
- SKU auto-generation: matches existing pattern
- Validation: all error types produce correct messages

## Integration Tests

- Import 5 products with 30 variants → verify all appear in inventory
- Import with duplicate SKU → verify error reported, no data corruption
- Import with partial failures → verify successful products committed
- Import with existing products in store → verify no conflicts

## Manual Testing

- Pilot-scale test: 200-product CSV from real store inventory
- Mobile tablet test: full flow on Android Chrome
- Edge case: Unicode product names (Nepali text in names)
- Edge case: CSV exported from Google Sheets vs Excel vs Numbers

---

# 12. SUCCESS DEFINITION

This feature succeeds when:

1. ✅ A boutique owner can prepare a spreadsheet in < 15 minutes
2. ✅ The import completes in < 30 seconds for 200 products
3. ✅ Zero inventory corruption — every imported variant has correct stock
4. ✅ Errors are clear and actionable — the user knows exactly which row to fix
5. ✅ The entire flow works on a mobile tablet
6. ✅ The PaisaPOS team can onboard a pilot store in < 10 minutes total

---

# 13. ROADMAP ALIGNMENT CHECK

| Roadmap Question | Answer |
|-----------------|--------|
| Does this improve inventory trust? | ✅ Accurate bulk data entry reduces typo-driven stock errors |
| Does this improve checkout speed? | ✅ Indirectly — stores can't sell what isn't in the system |
| Does this improve operational simplicity? | ✅ Minutes vs hours of manual entry |
| Does this improve retailer workflow quality? | ✅ First impression of PaisaPOS is "this was easy" |
| Does it introduce unnecessary architecture? | ❌ No — reuses existing RPC, client-side parsing |
| Could it reduce operational trust? | ❌ No — atomic per-product insertion, no new DB changes |

---

# 14. REFERENCE FILES

| File | Purpose |
|------|---------|
| `supabase/migrations/20260521084324_init_schema.sql` | Product, variant, inventory schema |
| `supabase/migrations/20260523104500_tenant_scoped_sku.sql` | Store-scoped SKU constraint + upsert RPC |
| `src/features/inventory/components/inventory-tab.tsx` | Existing inventory workspace flow |
| `src/features/inventory/import/catalog-parser.ts` | Catalog parser and SKU generation logic |
| `src/app/actions.ts` (L138-173) | `upsertProductAction` server action |
| `src/lib/store/useAppStore.ts` | Zustand store with `addProduct` action |
| `PaisaPOS_OS/DEVELOPMENT_ROADMAP.md` (Section 13) | Phase 2A roadmap position |

---

# 15. OPEN QUESTIONS FOR IMPLEMENTATION

1. **Should we support product UPDATE via import?** Current spec is create-only. If a store re-uploads a file with existing product names, should it skip, merge, or error? **Recommendation: Skip with warning for v1.**

2. **Should we add a "category" freeform option?** Current categories are fixed (`Tops`, `Bottoms`, `Outerwear`, `Traditional`, `Accessories`). Some stores may have categories like `Dresses`, `Kurta Sets`, etc. **Recommendation: Accept any text value and let the store owner manage categories organically. Consider a category management UI later.**

3. **Max products per import?** Current spec has no hard limit beyond 5MB file size. **Recommendation: Soft limit of 500 products per import with a warning above 200.**

4. **Should duplicate detection check product names?** If the store already has "Oversized Linen Shirt", should the importer warn? **Recommendation: Yes, warn but allow import. The user may be adding new variants.**
