-- =========================================================================
-- PaisaPOS Data API Grants, Tenant Integrity & Direct Write Lockdown
-- Created: 2026-05-25
--
-- Aligns public-table exposure with Supabase's explicit Data API grants model
-- and closes direct REST write paths that bypass the intended Server
-- Action/RPC authorization boundary.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Explicit Data API exposure grants
-- -------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Keep anonymous browser clients away from table data. Auth flows use
-- Supabase Auth endpoints and RPCs, not direct public table access.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Service role remains the operational/admin role for scripts, tests, and
-- secure server-side maintenance jobs.
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Authenticated browser/API sessions are read-mostly. RLS still decides which
-- rows are visible after the table grant admits the Data API request.
GRANT SELECT ON TABLE
  public.stores,
  public.users,
  public.products,
  public.product_variants,
  public.inventory,
  public.invoices,
  public.invoice_items,
  public.audit_logs,
  public.audit_logs_archive
TO authenticated;

-- Minimal direct DML left available for owner-scoped administrative actions.
-- Checkout and invoice mutations go through create_invoice_and_deduct_stock().
GRANT UPDATE, DELETE ON TABLE public.stores TO authenticated;
GRANT UPDATE, DELETE ON TABLE public.users TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.products TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.product_variants TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.inventory TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.invoices FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.invoice_items FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.audit_logs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.audit_logs_archive FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.security_alerts FROM authenticated, anon;

GRANT EXECUTE ON FUNCTION public.bulk_upsert_products_and_variants(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_and_deduct_stock(uuid, text, text, text, numeric, numeric, numeric, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_store_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_store_and_user(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_product_and_variants(uuid, text, text, integer, uuid[], jsonb) TO authenticated;

-- -------------------------------------------------------------------------
-- 2. Tenant-integrity columns, constraints, and triggers
-- -------------------------------------------------------------------------

ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;

UPDATE public.inventory i
SET store_id = pv.store_id
FROM public.product_variants pv
WHERE i.variant_id = pv.id
  AND i.store_id IS DISTINCT FROM pv.store_id;

ALTER TABLE public.inventory ALTER COLUMN store_id SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.store_id IS DISTINCT FROM p.store_id
  ) THEN
    RAISE EXCEPTION 'Tenant integrity violation: product_variants.store_id does not match products.store_id';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    JOIN public.product_variants pv ON pv.id = ii.variant_id
    WHERE ii.variant_id IS NOT NULL
      AND i.store_id IS DISTINCT FROM pv.store_id
  ) THEN
    RAISE EXCEPTION 'Tenant integrity violation: invoice_items variant belongs to a different store than the invoice';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_id_store_id_key'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_id_store_id_key UNIQUE (id, store_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_variants_id_store_id_key'
  ) THEN
    ALTER TABLE public.product_variants
      ADD CONSTRAINT product_variants_id_store_id_key UNIQUE (id, store_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invoices_id_store_id_key'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_id_store_id_key UNIQUE (id, store_id);
  END IF;

END;
$$;

CREATE OR REPLACE FUNCTION public.set_product_variant_store_id()
RETURNS trigger AS $$
DECLARE
  v_product_store_id uuid;
BEGIN
  SELECT p.store_id INTO v_product_store_id
  FROM public.products p
  WHERE p.id = NEW.product_id;

  IF v_product_store_id IS NULL THEN
    RAISE EXCEPTION 'Product % does not exist', NEW.product_id;
  END IF;

  IF NEW.store_id IS NULL THEN
    NEW.store_id := v_product_store_id;
  ELSIF NEW.store_id IS DISTINCT FROM v_product_store_id THEN
    RAISE EXCEPTION 'Variant store_id % does not match product store_id %', NEW.store_id, v_product_store_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_set_product_variant_store_id ON public.product_variants;
CREATE TRIGGER trg_set_product_variant_store_id
  BEFORE INSERT OR UPDATE OF product_id, store_id ON public.product_variants
  FOR EACH ROW
  EXECUTE FUNCTION public.set_product_variant_store_id();

CREATE OR REPLACE FUNCTION public.set_inventory_store_id()
RETURNS trigger AS $$
DECLARE
  v_variant_store_id uuid;
BEGIN
  SELECT pv.store_id INTO v_variant_store_id
  FROM public.product_variants pv
  WHERE pv.id = NEW.variant_id;

  IF v_variant_store_id IS NULL THEN
    RAISE EXCEPTION 'Product variant % does not exist', NEW.variant_id;
  END IF;

  IF NEW.store_id IS NULL THEN
    NEW.store_id := v_variant_store_id;
  ELSIF NEW.store_id IS DISTINCT FROM v_variant_store_id THEN
    RAISE EXCEPTION 'Inventory store_id % does not match variant store_id %', NEW.store_id, v_variant_store_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_set_inventory_store_id ON public.inventory;
CREATE TRIGGER trg_set_inventory_store_id
  BEFORE INSERT OR UPDATE OF variant_id, store_id ON public.inventory
  FOR EACH ROW
  EXECUTE FUNCTION public.set_inventory_store_id();

CREATE OR REPLACE FUNCTION public.enforce_invoice_item_tenant_integrity()
RETURNS trigger AS $$
DECLARE
  v_invoice_store_id uuid;
  v_variant_store_id uuid;
BEGIN
  IF NEW.variant_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT i.store_id INTO v_invoice_store_id
  FROM public.invoices i
  WHERE i.id = NEW.invoice_id;

  SELECT pv.store_id INTO v_variant_store_id
  FROM public.product_variants pv
  WHERE pv.id = NEW.variant_id;

  IF v_invoice_store_id IS NULL OR v_variant_store_id IS NULL THEN
    RAISE EXCEPTION 'Invoice item references missing invoice or variant';
  END IF;

  IF v_invoice_store_id IS DISTINCT FROM v_variant_store_id THEN
    RAISE EXCEPTION 'Invoice item variant store_id % does not match invoice store_id %', v_variant_store_id, v_invoice_store_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_invoice_item_tenant_integrity ON public.invoice_items;
CREATE TRIGGER trg_enforce_invoice_item_tenant_integrity
  BEFORE INSERT OR UPDATE OF invoice_id, variant_id ON public.invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_invoice_item_tenant_integrity();

REVOKE EXECUTE ON FUNCTION public.set_product_variant_store_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_inventory_store_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_invoice_item_tenant_integrity() FROM PUBLIC, anon, authenticated;

-- -------------------------------------------------------------------------
-- 3. RLS rewrite: read for store users, write only where deliberately scoped
-- -------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can insert audit logs for their store" ON public.audit_logs;
DROP POLICY IF EXISTS "Users can read audit logs of their store" ON public.audit_logs;
CREATE POLICY "Users can read audit logs of their store" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (store_id = (SELECT public.get_user_store_id()));

DROP POLICY IF EXISTS "Users can read archived audit logs of their store" ON public.audit_logs_archive;
CREATE POLICY "Users can read archived audit logs of their store" ON public.audit_logs_archive
  FOR SELECT TO authenticated
  USING (store_id = (SELECT public.get_user_store_id()));

DROP POLICY IF EXISTS "Users can read products in their store" ON public.products;
DROP POLICY IF EXISTS "Owners can insert products in their store" ON public.products;
DROP POLICY IF EXISTS "Owners can update products in their store" ON public.products;
DROP POLICY IF EXISTS "Owners can delete products in their store" ON public.products;
CREATE POLICY "Users can read products in their store" ON public.products
  FOR SELECT TO authenticated
  USING (store_id = (SELECT public.get_user_store_id()));
CREATE POLICY "Owners can insert products in their store" ON public.products
  FOR INSERT TO authenticated
  WITH CHECK (
    store_id = (SELECT public.get_user_store_id())
    AND (SELECT role FROM public.users WHERE id = (SELECT auth.uid())) = 'owner'
  );
CREATE POLICY "Owners can update products in their store" ON public.products
  FOR UPDATE TO authenticated
  USING (
    store_id = (SELECT public.get_user_store_id())
    AND (SELECT role FROM public.users WHERE id = (SELECT auth.uid())) = 'owner'
  )
  WITH CHECK (
    store_id = (SELECT public.get_user_store_id())
    AND (SELECT role FROM public.users WHERE id = (SELECT auth.uid())) = 'owner'
  );
CREATE POLICY "Owners can delete products in their store" ON public.products
  FOR DELETE TO authenticated
  USING (
    (store_id = (SELECT public.get_user_store_id())
      AND (SELECT role FROM public.users WHERE id = (SELECT auth.uid())) = 'owner')
    OR NOT EXISTS (SELECT 1 FROM public.stores WHERE id = products.store_id)
  );

DROP POLICY IF EXISTS "Users can insert product variants" ON public.product_variants;
DROP POLICY IF EXISTS "Users can update product variants" ON public.product_variants;
DROP POLICY IF EXISTS "Users can delete product variants" ON public.product_variants;
DROP POLICY IF EXISTS "Users can read product variants" ON public.product_variants;
CREATE POLICY "Users can read product variants" ON public.product_variants
  FOR SELECT TO authenticated
  USING (store_id = (SELECT public.get_user_store_id()));
CREATE POLICY "Owners can insert product variants" ON public.product_variants
  FOR INSERT TO authenticated
  WITH CHECK (
    store_id = (SELECT public.get_user_store_id())
    AND (SELECT role FROM public.users WHERE id = (SELECT auth.uid())) = 'owner'
  );
CREATE POLICY "Owners can update product variants" ON public.product_variants
  FOR UPDATE TO authenticated
  USING (
    store_id = (SELECT public.get_user_store_id())
    AND (SELECT role FROM public.users WHERE id = (SELECT auth.uid())) = 'owner'
  )
  WITH CHECK (
    store_id = (SELECT public.get_user_store_id())
    AND (SELECT role FROM public.users WHERE id = (SELECT auth.uid())) = 'owner'
  );
CREATE POLICY "Owners can delete product variants" ON public.product_variants
  FOR DELETE TO authenticated
  USING (
    (store_id = (SELECT public.get_user_store_id())
      AND (SELECT role FROM public.users WHERE id = (SELECT auth.uid())) = 'owner')
    OR NOT EXISTS (SELECT 1 FROM public.stores WHERE id = product_variants.store_id)
  );

DROP POLICY IF EXISTS "Users can insert inventory" ON public.inventory;
DROP POLICY IF EXISTS "Users can update inventory" ON public.inventory;
DROP POLICY IF EXISTS "Users can delete inventory" ON public.inventory;
DROP POLICY IF EXISTS "Users can read inventory" ON public.inventory;
CREATE POLICY "Users can read inventory" ON public.inventory
  FOR SELECT TO authenticated
  USING (store_id = (SELECT public.get_user_store_id()));
CREATE POLICY "Owners can insert inventory" ON public.inventory
  FOR INSERT TO authenticated
  WITH CHECK (
    store_id = (SELECT public.get_user_store_id())
    AND (SELECT role FROM public.users WHERE id = (SELECT auth.uid())) = 'owner'
  );
CREATE POLICY "Owners can update inventory" ON public.inventory
  FOR UPDATE TO authenticated
  USING (
    store_id = (SELECT public.get_user_store_id())
    AND (SELECT role FROM public.users WHERE id = (SELECT auth.uid())) = 'owner'
  )
  WITH CHECK (
    store_id = (SELECT public.get_user_store_id())
    AND (SELECT role FROM public.users WHERE id = (SELECT auth.uid())) = 'owner'
  );
CREATE POLICY "Owners can delete inventory" ON public.inventory
  FOR DELETE TO authenticated
  USING (
    (store_id = (SELECT public.get_user_store_id())
      AND (SELECT role FROM public.users WHERE id = (SELECT auth.uid())) = 'owner')
    OR NOT EXISTS (SELECT 1 FROM public.stores WHERE id = inventory.store_id)
  );

DROP POLICY IF EXISTS "Users can insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can delete invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can read invoices" ON public.invoices;
CREATE POLICY "Users can read invoices" ON public.invoices
  FOR SELECT TO authenticated
  USING (store_id = (SELECT public.get_user_store_id()));

DROP POLICY IF EXISTS "Users can insert invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Users can update invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Users can delete invoice items" ON public.invoice_items;
DROP POLICY IF EXISTS "Users can read invoice items" ON public.invoice_items;
CREATE POLICY "Users can read invoice items" ON public.invoice_items
  FOR SELECT TO authenticated
  USING (
    invoice_id IN (
      SELECT i.id
      FROM public.invoices i
      WHERE i.store_id = (SELECT public.get_user_store_id())
    )
  );

-- -------------------------------------------------------------------------
-- 4. Performance indexes for the new access patterns
-- -------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_inventory_store_variant
  ON public.inventory(store_id, variant_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_archive_store_created
  ON public.audit_logs_archive(store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_store_lower_name_category
  ON public.products(store_id, lower(name), lower(category));

CREATE INDEX IF NOT EXISTS idx_product_variants_store_upper_sku
  ON public.product_variants(store_id, upper(sku));

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_variant
  ON public.invoice_items(invoice_id, variant_id);
