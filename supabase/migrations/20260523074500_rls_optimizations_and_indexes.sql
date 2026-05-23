-- Migration: Optimize PostgreSQL RLS policies with subquery caching and add missing foreign key indexes

-- 1. Create missing indexes on foreign keys
CREATE INDEX IF NOT EXISTS idx_users_store_id ON users(store_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_variant_id ON invoice_items(variant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_store_id ON audit_logs(store_id);

-- 2. Drop existing RLS policies to recreate them with cached subqueries
DROP POLICY IF EXISTS "Users can manage their own store record" ON stores;
DROP POLICY IF EXISTS "Users can manage their own user record" ON users;
DROP POLICY IF EXISTS "Users can manage products in their store" ON products;
DROP POLICY IF EXISTS "Users can manage product variants" ON product_variants;
DROP POLICY IF EXISTS "Users can manage inventory" ON inventory;
DROP POLICY IF EXISTS "Users can manage invoices" ON invoices;
DROP POLICY IF EXISTS "Users can manage invoice items" ON invoice_items;
DROP POLICY IF EXISTS "Users can read audit logs of their store" ON audit_logs;
DROP POLICY IF EXISTS "Users can insert audit logs for their store" ON audit_logs;

-- 3. Recreate RLS policies with cached subquery wrappers
CREATE POLICY "Users can manage their own store record" ON stores 
  FOR ALL USING (id = (SELECT get_user_store_id()));

CREATE POLICY "Users can manage their own user record" ON users 
  FOR ALL USING (id = (SELECT auth.uid()));

CREATE POLICY "Users can manage products in their store" ON products 
  FOR ALL USING (store_id = (SELECT get_user_store_id()));

CREATE POLICY "Users can manage product variants" ON product_variants 
  FOR ALL USING (product_id IN (SELECT id FROM products WHERE store_id = (SELECT get_user_store_id())));

CREATE POLICY "Users can manage inventory" ON inventory 
  FOR ALL USING (variant_id IN (SELECT id FROM product_variants WHERE product_id IN (SELECT id FROM products WHERE store_id = (SELECT get_user_store_id()))));

CREATE POLICY "Users can manage invoices" ON invoices 
  FOR ALL USING (store_id = (SELECT get_user_store_id()));

CREATE POLICY "Users can manage invoice items" ON invoice_items 
  FOR ALL USING (invoice_id IN (SELECT id FROM invoices WHERE store_id = (SELECT get_user_store_id())));

CREATE POLICY "Users can read audit logs of their store" ON audit_logs 
  FOR SELECT USING (store_id = (SELECT get_user_store_id()));

CREATE POLICY "Users can insert audit logs for their store" ON audit_logs 
  FOR INSERT WITH CHECK (store_id = (SELECT get_user_store_id()));
