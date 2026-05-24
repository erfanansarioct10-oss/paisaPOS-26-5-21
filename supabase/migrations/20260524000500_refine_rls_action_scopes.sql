-- =========================================================================
-- PaisaPOS RLS Policy Refinement & Action Scoping
-- Deployed: 2026-05-24
--
-- Refines Row Level Security (RLS) policies by splitting them into explicit
-- action scopes (SELECT, INSERT, UPDATE, DELETE). This restricts the cascade
-- delete 'OR NOT EXISTS' check strictly to DELETE operations, preventing
-- cross-tenant orphaned record exposure in SELECT queries.
-- =========================================================================

-- 1. PRODUCTS TABLE
DROP POLICY IF EXISTS "Owners can modify products in their store" ON products;
DROP POLICY IF EXISTS "Users can read products in their store" ON products;

CREATE POLICY "Users can read products in their store" ON products
  FOR SELECT USING (store_id = (SELECT get_user_store_id()));

CREATE POLICY "Owners can insert products in their store" ON products
  FOR INSERT WITH CHECK (
    store_id = (SELECT get_user_store_id()) AND 
    (SELECT role FROM users WHERE id = auth.uid()) = 'owner'
  );

CREATE POLICY "Owners can update products in their store" ON products
  FOR UPDATE USING (
    store_id = (SELECT get_user_store_id()) AND 
    (SELECT role FROM users WHERE id = auth.uid()) = 'owner'
  );

CREATE POLICY "Owners can delete products in their store" ON products
  FOR DELETE USING (
    (store_id = (SELECT get_user_store_id()) AND (SELECT role FROM users WHERE id = auth.uid()) = 'owner')
    OR NOT EXISTS (SELECT 1 FROM public.stores WHERE id = products.store_id)
  );


-- 2. PRODUCT VARIANTS TABLE
DROP POLICY IF EXISTS "Users can manage product variants" ON product_variants;

CREATE POLICY "Users can read product variants" ON product_variants
  FOR SELECT USING (store_id = (SELECT get_user_store_id()));

CREATE POLICY "Users can insert product variants" ON product_variants
  FOR INSERT WITH CHECK (store_id = (SELECT get_user_store_id()));

CREATE POLICY "Users can update product variants" ON product_variants
  FOR UPDATE USING (store_id = (SELECT get_user_store_id()));

CREATE POLICY "Users can delete product variants" ON product_variants
  FOR DELETE USING (
    store_id = (SELECT get_user_store_id())
    OR NOT EXISTS (SELECT 1 FROM public.stores WHERE id = product_variants.store_id)
  );


-- 3. INVENTORY TABLE
DROP POLICY IF EXISTS "Users can manage inventory" ON inventory;

CREATE POLICY "Users can read inventory" ON inventory
  FOR SELECT USING (variant_id IN (SELECT id FROM product_variants WHERE store_id = (SELECT get_user_store_id())));

CREATE POLICY "Users can insert inventory" ON inventory
  FOR INSERT WITH CHECK (variant_id IN (SELECT id FROM product_variants WHERE store_id = (SELECT get_user_store_id())));

CREATE POLICY "Users can update inventory" ON inventory
  FOR UPDATE USING (variant_id IN (SELECT id FROM product_variants WHERE store_id = (SELECT get_user_store_id())));

CREATE POLICY "Users can delete inventory" ON inventory
  FOR DELETE USING (
    variant_id IN (SELECT id FROM product_variants WHERE store_id = (SELECT get_user_store_id()))
    OR NOT EXISTS (
      SELECT 1 FROM product_variants pv
      JOIN public.stores s ON pv.store_id = s.id
      WHERE pv.id = inventory.variant_id
    )
  );


-- 4. INVOICES TABLE
DROP POLICY IF EXISTS "Users can manage invoices" ON invoices;

CREATE POLICY "Users can read invoices" ON invoices
  FOR SELECT USING (store_id = (SELECT get_user_store_id()));

CREATE POLICY "Users can insert invoices" ON invoices
  FOR INSERT WITH CHECK (store_id = (SELECT get_user_store_id()));

CREATE POLICY "Users can update invoices" ON invoices
  FOR UPDATE USING (store_id = (SELECT get_user_store_id()));

CREATE POLICY "Users can delete invoices" ON invoices
  FOR DELETE USING (
    store_id = (SELECT get_user_store_id())
    OR NOT EXISTS (SELECT 1 FROM public.stores WHERE id = invoices.store_id)
  );


-- 5. INVOICE ITEMS TABLE
DROP POLICY IF EXISTS "Users can manage invoice items" ON invoice_items;

CREATE POLICY "Users can read invoice items" ON invoice_items
  FOR SELECT USING (invoice_id IN (SELECT id FROM invoices WHERE store_id = (SELECT get_user_store_id())));

CREATE POLICY "Users can insert invoice items" ON invoice_items
  FOR INSERT WITH CHECK (invoice_id IN (SELECT id FROM invoices WHERE store_id = (SELECT get_user_store_id())));

CREATE POLICY "Users can update invoice items" ON invoice_items
  FOR UPDATE USING (invoice_id IN (SELECT id FROM invoices WHERE store_id = (SELECT get_user_store_id())));

CREATE POLICY "Users can delete invoice items" ON invoice_items
  FOR DELETE USING (
    invoice_id IN (SELECT id FROM invoices WHERE store_id = (SELECT get_user_store_id()))
    OR NOT EXISTS (
      SELECT 1 FROM invoices i
      JOIN public.stores s ON i.store_id = s.id
      WHERE i.id = invoice_items.invoice_id
    )
  );
