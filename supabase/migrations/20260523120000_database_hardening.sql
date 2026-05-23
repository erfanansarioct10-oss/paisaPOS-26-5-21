-- PaisaPOS Database Security & Query Optimization Hardening
-- Deployed: 2026-05-23

-- 1. Prevent store deletions by cashiers/employees
DROP POLICY IF EXISTS "Users can manage their own store record" ON stores;
DROP POLICY IF EXISTS "Users can read their own store record" ON stores;
DROP POLICY IF EXISTS "Users can update their own store record" ON stores;
CREATE POLICY "Users can read their own store record" ON stores 
  FOR SELECT USING (id = (SELECT get_user_store_id()));
CREATE POLICY "Users can update their own store record" ON stores 
  FOR UPDATE USING (id = (SELECT get_user_store_id()));

-- 2. Restrict users table updates to prevent store hijacking (Tenant Hijacking BOLA)
DROP POLICY IF EXISTS "Users can manage their own user record" ON users;
CREATE POLICY "Users can read their own user record" ON users 
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "Users can update their own user profile name" ON users 
  FOR UPDATE USING (id = auth.uid()) 
  WITH CHECK (id = auth.uid() AND store_id IS NOT DISTINCT FROM (SELECT store_id FROM users WHERE id = auth.uid()));

-- 3. Add Store ID immutability trigger for users table
CREATE OR REPLACE FUNCTION protect_user_store_id()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.store_id IS DISTINCT FROM NEW.store_id AND OLD.store_id IS NOT NULL THEN
    RAISE EXCEPTION 'Changing store_id is not allowed.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_user_store_id ON users;
CREATE TRIGGER trg_protect_user_store_id
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION protect_user_store_id();

-- 4. Deploy User Roles Separation (owner/cashier model)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('owner', 'cashier');
  END IF;
END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS role user_role NOT NULL DEFAULT 'cashier';

-- 5. Restrict pricing/deletions/adjustments to Owners in products
DROP POLICY IF EXISTS "Users can manage products in their store" ON products;
CREATE POLICY "Owners can modify products in their store" ON products
  FOR ALL USING (
    store_id = (SELECT get_user_store_id()) AND
    (SELECT role FROM users WHERE id = auth.uid()) = 'owner'
  );

-- 6. Optimize RLS Policies with the new store_id column in product_variants
DROP POLICY IF EXISTS "Users can manage product variants" ON product_variants;
CREATE POLICY "Users can manage product variants" ON product_variants 
  FOR ALL USING (store_id = (SELECT get_user_store_id()));

DROP POLICY IF EXISTS "Users can manage inventory" ON inventory;
CREATE POLICY "Users can manage inventory" ON inventory 
  FOR ALL USING (variant_id IN (SELECT id FROM product_variants WHERE store_id = (SELECT get_user_store_id())));

-- 7. Harden SECURITY DEFINER functions with search_path
ALTER FUNCTION create_invoice_and_deduct_stock(uuid, text, text, text, numeric, numeric, numeric, text, jsonb) SET search_path = public;
ALTER FUNCTION get_user_store_id() SET search_path = public;
ALTER FUNCTION register_store_and_user(text, text) SET search_path = public;
ALTER FUNCTION upsert_product_and_variants(uuid, text, text, integer, uuid[], jsonb) SET search_path = public;
ALTER FUNCTION set_product_variant_store_id() SET search_path = public;

-- 8. Add composite index for optimized audit log sorting
CREATE INDEX IF NOT EXISTS idx_audit_logs_store_created ON audit_logs(store_id, created_at desc);

-- 9. Clean up duplicate product records ("f")
DELETE FROM products WHERE name = 'f';
