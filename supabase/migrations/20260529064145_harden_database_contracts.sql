-- =========================================================================
-- PaisaPOS Database Contract Hardening
--
-- Tightens the database as the final security and validation boundary while
-- preserving current Data API reads, server action signatures, RPC names, and
-- user-visible behavior.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Privilege reset: make Data API exposure explicit and least-privilege.
-- -------------------------------------------------------------------------

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO service_role;

GRANT SELECT ON TABLE
  public.stores,
  public.users,
  public.products,
  public.product_variants,
  public.inventory,
  public.invoices,
  public.invoice_items,
  public.audit_logs,
  public.audit_logs_archive,
  public.activity_events,
  public.staff_invitations,
  public.privilege_delegations
TO authenticated;

GRANT UPDATE, DELETE ON TABLE public.stores TO authenticated;
GRANT UPDATE, DELETE ON TABLE public.users TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.products TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.product_variants TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.inventory TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_user_store_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_store_and_user(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_and_deduct_stock(uuid, text, text, text, numeric, numeric, numeric, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_product_and_variants(uuid, text, text, integer, uuid[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_upsert_products_and_variants(jsonb) TO authenticated;

-- -------------------------------------------------------------------------
-- 2. Align privilege vocabulary and database validation with app schemas.
-- -------------------------------------------------------------------------

ALTER TYPE public.privilege_scope ADD VALUE IF NOT EXISTS 'activity.read';
ALTER TYPE public.privilege_scope ADD VALUE IF NOT EXISTS 'profile.update';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.stores
    WHERE char_length(btrim(name)) NOT BETWEEN 1 AND 100
      OR (phone IS NOT NULL AND char_length(phone) > 20)
      OR (address IS NOT NULL AND char_length(address) > 200)
      OR (pan_vat IS NOT NULL AND char_length(pan_vat) > 20)
  ) THEN
    RAISE EXCEPTION 'DB contract violation: stores contain values outside the app validation limits.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.users
    WHERE char_length(btrim(name)) NOT BETWEEN 1 AND 100
  ) THEN
    RAISE EXCEPTION 'DB contract violation: users.name must be 1-100 characters.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.products
    WHERE char_length(btrim(name)) NOT BETWEEN 1 AND 150
      OR char_length(btrim(category)) NOT BETWEEN 1 AND 100
      OR low_stock_threshold < 0
      OR low_stock_threshold > 1000000
  ) THEN
    RAISE EXCEPTION 'DB contract violation: products contain values outside the app validation limits.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_variants
    WHERE char_length(btrim(size)) NOT BETWEEN 1 AND 50
      OR char_length(btrim(color)) NOT BETWEEN 1 AND 50
      OR char_length(sku) NOT BETWEEN 1 AND 100
      OR sku <> upper(sku)
      OR sku !~ '^[A-Z0-9_-]+$'
      OR price < 0
      OR price > 99999999.99
  ) THEN
    RAISE EXCEPTION 'DB contract violation: product_variants contain invalid size, color, SKU, or price values.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.inventory
    WHERE quantity < 0
      OR quantity > 1000000
  ) THEN
    RAISE EXCEPTION 'DB contract violation: inventory.quantity must be 0-1000000.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoices
    WHERE char_length(invoice_number) NOT BETWEEN 1 AND 50
      OR (customer_name IS NOT NULL AND char_length(btrim(customer_name)) NOT BETWEEN 1 AND 100)
      OR (customer_phone IS NOT NULL AND char_length(customer_phone) > 20)
      OR total_amount < 0
      OR total_amount > 99999999.99
      OR coalesce(discount_amount, 0) < 0
      OR coalesce(discount_amount, 0) > 99999999.99
      OR paid_amount < 0
      OR paid_amount > 99999999.99
  ) THEN
    RAISE EXCEPTION 'DB contract violation: invoices contain values outside the app validation limits.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoice_items
    WHERE quantity < 1
      OR quantity > 1000000
      OR unit_price < 0
      OR unit_price > 99999999.99
      OR subtotal < 0
      OR subtotal > 99999999.99
      OR (custom_name IS NOT NULL AND char_length(btrim(custom_name)) NOT BETWEEN 1 AND 200)
      OR (variant_id IS NULL AND custom_name IS NULL)
  ) THEN
    RAISE EXCEPTION 'DB contract violation: invoice_items contain invalid quantity, money, or custom item values.';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.stores'::regclass
      AND conname = 'stores_profile_fields_contract'
  ) THEN
    ALTER TABLE public.stores
      ADD CONSTRAINT stores_profile_fields_contract CHECK (
        char_length(btrim(name)) BETWEEN 1 AND 100
        AND (phone IS NULL OR char_length(phone) <= 20)
        AND (address IS NULL OR char_length(address) <= 200)
        AND (pan_vat IS NULL OR char_length(pan_vat) <= 20)
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND conname = 'users_name_contract'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_name_contract CHECK (
        char_length(btrim(name)) BETWEEN 1 AND 100
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_catalog_fields_contract'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_catalog_fields_contract CHECK (
        char_length(btrim(name)) BETWEEN 1 AND 150
        AND char_length(btrim(category)) BETWEEN 1 AND 100
        AND low_stock_threshold BETWEEN 0 AND 1000000
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.product_variants'::regclass
      AND conname = 'product_variants_catalog_fields_contract'
  ) THEN
    ALTER TABLE public.product_variants
      ADD CONSTRAINT product_variants_catalog_fields_contract CHECK (
        char_length(btrim(size)) BETWEEN 1 AND 50
        AND char_length(btrim(color)) BETWEEN 1 AND 50
        AND char_length(sku) BETWEEN 1 AND 100
        AND sku = upper(sku)
        AND sku ~ '^[A-Z0-9_-]+$'
        AND price BETWEEN 0 AND 99999999.99
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.inventory'::regclass
      AND conname = 'inventory_quantity_contract'
  ) THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT inventory_quantity_contract CHECK (
        quantity BETWEEN 0 AND 1000000
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.invoices'::regclass
      AND conname = 'invoices_customer_money_contract'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_customer_money_contract CHECK (
        char_length(invoice_number) BETWEEN 1 AND 50
        AND (customer_name IS NULL OR char_length(btrim(customer_name)) BETWEEN 1 AND 100)
        AND (customer_phone IS NULL OR char_length(customer_phone) <= 20)
        AND total_amount BETWEEN 0 AND 99999999.99
        AND coalesce(discount_amount, 0) BETWEEN 0 AND 99999999.99
        AND paid_amount BETWEEN 0 AND 99999999.99
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.invoice_items'::regclass
      AND conname = 'invoice_items_quantity_money_contract'
  ) THEN
    ALTER TABLE public.invoice_items
      ADD CONSTRAINT invoice_items_quantity_money_contract CHECK (
        quantity BETWEEN 1 AND 1000000
        AND unit_price BETWEEN 0 AND 99999999.99
        AND subtotal BETWEEN 0 AND 99999999.99
        AND (custom_name IS NULL OR char_length(btrim(custom_name)) BETWEEN 1 AND 200)
        AND (variant_id IS NOT NULL OR custom_name IS NOT NULL)
      ) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.stores VALIDATE CONSTRAINT stores_profile_fields_contract;
ALTER TABLE public.users VALIDATE CONSTRAINT users_name_contract;
ALTER TABLE public.products VALIDATE CONSTRAINT products_catalog_fields_contract;
ALTER TABLE public.product_variants VALIDATE CONSTRAINT product_variants_catalog_fields_contract;
ALTER TABLE public.inventory VALIDATE CONSTRAINT inventory_quantity_contract;
ALTER TABLE public.invoices VALIDATE CONSTRAINT invoices_customer_money_contract;
ALTER TABLE public.invoice_items VALIDATE CONSTRAINT invoice_items_quantity_money_contract;

-- -------------------------------------------------------------------------
-- 3. Harden SECURITY DEFINER routines and simplify permissive read policies.
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_inventory_adjustment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id uuid;
  v_user_id uuid;
BEGIN
  IF current_setting('app.checkout_active', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF OLD.quantity IS DISTINCT FROM NEW.quantity THEN
    SELECT p.store_id INTO v_store_id
    FROM public.product_variants pv
    JOIN public.products p ON pv.product_id = p.id
    WHERE pv.id = NEW.variant_id;

    v_user_id := auth.uid();

    INSERT INTO public.audit_logs (store_id, user_id, operation, affected_entity, result, created_at)
    VALUES (
      v_store_id,
      v_user_id,
      'STOCK_ADJUSTMENT',
      'Variant ID: ' || NEW.variant_id || ' (Stock: ' || OLD.quantity || ' -> ' || NEW.quantity || ')',
      'SUCCESS',
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_price_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_id uuid;
  v_user_id uuid;
BEGIN
  IF OLD.price IS DISTINCT FROM NEW.price THEN
    SELECT p.store_id INTO v_store_id
    FROM public.products p
    WHERE p.id = NEW.product_id;

    v_user_id := auth.uid();

    INSERT INTO public.audit_logs (store_id, user_id, operation, affected_entity, result, created_at)
    VALUES (
      v_store_id,
      v_user_id,
      'PRICE_UPDATE',
      'SKU: ' || NEW.sku || ' (Price: Rs. ' || OLD.price || ' -> Rs. ' || NEW.price || ')',
      'SUCCESS',
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_store_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_store_name text;
BEGIN
  SELECT s.name INTO v_store_name
  FROM public.stores s
  WHERE s.id = NEW.store_id;

  INSERT INTO public.audit_logs (store_id, user_id, operation, affected_entity, result, created_at)
  VALUES (
    NEW.store_id,
    NEW.id,
    'STORE_REGISTRATION',
    'Store: ' || COALESCE(v_store_name, 'Unknown') || ' (User: ' || NEW.name || ')',
    'SUCCESS',
    now()
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE PROCEDURE public.archive_and_purge_old_audit_logs()
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cutoff_date timestamptz;
BEGIN
  v_cutoff_date := now() - interval '90 days';

  INSERT INTO public.audit_logs_archive
  SELECT id, store_id, user_id, operation, affected_entity, result, error_message, created_at
  FROM public.audit_logs
  WHERE created_at < v_cutoff_date;

  DELETE FROM public.audit_logs
  WHERE created_at < v_cutoff_date;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_inventory_adjustment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_price_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_store_registration() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON PROCEDURE public.archive_and_purge_old_audit_logs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON PROCEDURE public.archive_and_purge_old_audit_logs() TO service_role;

DROP POLICY IF EXISTS "Users can read their own user record" ON public.users;
CREATE POLICY "Users can read their own user record"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update their own user profile name" ON public.users;
CREATE POLICY "Users can update their own user profile name"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (
    id = (SELECT auth.uid())
    AND store_id IS NOT DISTINCT FROM (SELECT public.get_user_store_id())
  );

DROP POLICY IF EXISTS "Users can delete their own user profile" ON public.users;
CREATE POLICY "Users can delete their own user profile"
  ON public.users
  FOR DELETE
  TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Owners can update their own store record" ON public.stores;
CREATE POLICY "Owners can update their own store record"
  ON public.stores
  FOR UPDATE
  TO authenticated
  USING (
    id = (SELECT public.get_user_store_id())
    AND (
      SELECT u.role
      FROM public.users u
      WHERE u.id = (SELECT auth.uid())
    ) = 'owner'::public.user_role
  )
  WITH CHECK (
    id = (SELECT public.get_user_store_id())
    AND (
      SELECT u.role
      FROM public.users u
      WHERE u.id = (SELECT auth.uid())
    ) = 'owner'::public.user_role
  );

DROP POLICY IF EXISTS "Owners can delete their own store record" ON public.stores;
CREATE POLICY "Owners can delete their own store record"
  ON public.stores
  FOR DELETE
  TO authenticated
  USING (
    id = (SELECT public.get_user_store_id())
    AND (
      SELECT u.role
      FROM public.users u
      WHERE u.id = (SELECT auth.uid())
    ) = 'owner'::public.user_role
  );

DROP POLICY IF EXISTS "Owners can read store activity" ON public.activity_events;
DROP POLICY IF EXISTS "Cashiers can read own activity" ON public.activity_events;
CREATE POLICY "Users can read permitted activity events"
  ON public.activity_events
  FOR SELECT
  TO authenticated
  USING (
    store_id = (SELECT public.get_user_store_id())
    AND (
      actor_user_id = (SELECT auth.uid())
      OR (
        SELECT u.role
        FROM public.users u
        WHERE u.id = (SELECT auth.uid())
          AND u.status = 'active'::public.user_status
      ) = 'owner'::public.user_role
    )
  );

DROP POLICY IF EXISTS "Owners can read store privilege delegations" ON public.privilege_delegations;
DROP POLICY IF EXISTS "Cashiers can read own active privilege delegations" ON public.privilege_delegations;
CREATE POLICY "Users can read permitted privilege delegations"
  ON public.privilege_delegations
  FOR SELECT
  TO authenticated
  USING (
    store_id = (SELECT public.get_user_store_id())
    AND (
      (
        granted_to_user_id = (SELECT auth.uid())
        AND revoked_at IS NULL
        AND starts_at <= now()
        AND expires_at > now()
      )
      OR (
        SELECT u.role
        FROM public.users u
        WHERE u.id = (SELECT auth.uid())
          AND u.status = 'active'::public.user_status
      ) = 'owner'::public.user_role
    )
  );

-- -------------------------------------------------------------------------
-- 4. FK-support indexes for scale and cascade/update safety.
-- -------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_invoices_sold_with_delegation_id_fk
  ON public.invoices(sold_with_delegation_id)
  WHERE sold_with_delegation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_sold_by_user_id_fk
  ON public.invoices(sold_by_user_id)
  WHERE sold_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_staff_step_up_proofs_store_id_fk
  ON public.staff_step_up_proofs(store_id);
