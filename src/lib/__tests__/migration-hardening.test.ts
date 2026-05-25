import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migrationSql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260525050559_harden_data_api_tenant_integrity.sql"),
  "utf8"
).toLowerCase();

describe("data api and tenant-integrity hardening migration", () => {
  test("revokes direct invoice and audit mutations from authenticated users", () => {
    expect(migrationSql).toContain("revoke insert, update, delete on table public.invoices from authenticated");
    expect(migrationSql).toContain("revoke insert, update, delete on table public.invoice_items from authenticated");
    expect(migrationSql).toContain("revoke insert, update, delete on table public.audit_logs from authenticated");
    expect(migrationSql).toContain('drop policy if exists "users can insert invoices"');
    expect(migrationSql).toContain('drop policy if exists "users can insert invoice items"');
  });

  test("enforces denormalized tenant columns at database boundary", () => {
    expect(migrationSql).toContain("function public.set_product_variant_store_id()");
    expect(migrationSql).toContain("function public.set_inventory_store_id()");
    expect(migrationSql).toContain("function public.enforce_invoice_item_tenant_integrity()");
    expect(migrationSql).toContain("variant store_id");
    expect(migrationSql).toContain("invoice item variant store_id");
  });

  test("adds explicit data api grants and tenant indexes", () => {
    expect(migrationSql).toContain("grant select on table");
    expect(migrationSql).toContain("to authenticated");
    expect(migrationSql).toContain("idx_inventory_store_variant");
    expect(migrationSql).toContain("idx_products_store_lower_name_category");
    expect(migrationSql).toContain("idx_product_variants_store_upper_sku");
  });
});
