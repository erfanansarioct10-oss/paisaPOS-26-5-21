-- =========================================================================
-- PaisaPOS Cascade Delete RLS Fix
-- Deployed: 2026-05-24
--
-- Updates Row Level Security (RLS) policies to allow cascade deletions
-- to complete successfully when a store is deleted.
-- Additionally, splits the products policy so cashiers/employees can
-- perform SELECT queries while restricting modifications to owners.
-- =========================================================================

-- 1. Products Table RLS Fixes
DROP POLICY IF EXISTS "Owners can modify products in their store" ON products;
DROP POLICY IF EXISTS "Users can read products in their store" ON products;
DROP POLICY IF EXISTS "Users can manage products in their store" ON products;

-- Allow all authenticated store users (owners & cashiers) to read products
CREATE POLICY "Users can read products in their store" ON products
  FOR SELECT USING (
    store_id = (SELECT get_user_store_id())
  );

-- Restrict product writes/modifications to store owners,
-- or allow if the store is being deleted (i.e., no longer exists)
CREATE POLICY "Owners can modify products in their store" ON products
  FOR ALL USING (
    (store_id = (SELECT get_user_store_id()) AND (SELECT role FROM users WHERE id = auth.uid()) = 'owner')
    OR NOT EXISTS (SELECT 1 FROM public.stores WHERE id = products.store_id)
  );


-- 2. Product Variants Table RLS Fixes
DROP POLICY IF EXISTS "Users can manage product variants" ON product_variants;

CREATE POLICY "Users can manage product variants" ON product_variants
  FOR ALL USING (
    store_id = (SELECT get_user_store_id())
    OR NOT EXISTS (SELECT 1 FROM public.stores WHERE id = product_variants.store_id)
  );


-- 3. Inventory Table RLS Fixes
DROP POLICY IF EXISTS "Users can manage inventory" ON inventory;

CREATE POLICY "Users can manage inventory" ON inventory
  FOR ALL USING (
    variant_id IN (SELECT id FROM product_variants WHERE store_id = (SELECT get_user_store_id()))
    OR NOT EXISTS (
      SELECT 1 FROM product_variants pv
      JOIN public.stores s ON pv.store_id = s.id
      WHERE pv.id = inventory.variant_id
    )
  );


-- 4. Invoices Table RLS Fixes
DROP POLICY IF EXISTS "Users can manage invoices" ON invoices;

CREATE POLICY "Users can manage invoices" ON invoices
  FOR ALL USING (
    store_id = (SELECT get_user_store_id())
    OR NOT EXISTS (SELECT 1 FROM public.stores WHERE id = invoices.store_id)
  );


-- 5. Invoice Items Table RLS Fixes
DROP POLICY IF EXISTS "Users can manage invoice items" ON invoice_items;

CREATE POLICY "Users can manage invoice items" ON invoice_items
  FOR ALL USING (
    invoice_id IN (SELECT id FROM invoices WHERE store_id = (SELECT get_user_store_id()))
    OR NOT EXISTS (
      SELECT 1 FROM invoices i
      JOIN public.stores s ON i.store_id = s.id
      WHERE i.id = invoice_items.invoice_id
    )
  );
