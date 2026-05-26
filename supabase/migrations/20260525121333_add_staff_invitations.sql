-- =========================================================================
-- PaisaPOS Beta V1.1 Staff Directory And Invitations
--
-- Adds a staff lifecycle without granting browser clients direct invitation
-- writes. Server Actions use the service role for staff mutations, while RLS
-- keeps owner-visible reads store-scoped.
-- =========================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
    CREATE TYPE public.user_status AS ENUM ('active', 'suspended');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'staff_invitation_status') THEN
    CREATE TYPE public.staff_invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');
  END IF;
END $$;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS status public.user_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS invited_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.staff_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.user_role NOT NULL DEFAULT 'cashier',
  status public.staff_invitation_status NOT NULL DEFAULT 'pending',
  invited_by_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  accepted_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  revoked_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_invitation_role_check CHECK (role = 'cashier'::public.user_role),
  CONSTRAINT staff_invitation_email_normalized_check CHECK (
    email = lower(btrim(email))
    AND char_length(email) BETWEEN 3 AND 254
    AND position('@' in email) > 1
  ),
  CONSTRAINT staff_invitation_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT staff_invitation_accepted_timestamp_check CHECK (
    (status = 'accepted'::public.staff_invitation_status AND accepted_at IS NOT NULL AND accepted_by_user_id IS NOT NULL)
    OR status <> 'accepted'::public.staff_invitation_status
  ),
  CONSTRAINT staff_invitation_revoked_timestamp_check CHECK (
    (status = 'revoked'::public.staff_invitation_status AND revoked_at IS NOT NULL AND revoked_by_user_id IS NOT NULL)
    OR status <> 'revoked'::public.staff_invitation_status
  )
);

COMMENT ON TABLE public.staff_invitations IS 'Owner-created cashier invitations for a store.';
COMMENT ON COLUMN public.users.status IS 'Suspended users keep historical attribution but cannot access active store data.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_invitations_pending_email_store
  ON public.staff_invitations(store_id, email)
  WHERE status = 'pending'::public.staff_invitation_status;

CREATE INDEX IF NOT EXISTS idx_staff_invitations_store_status_created
  ON public.staff_invitations(store_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_staff_invitations_email_status
  ON public.staff_invitations(email, status);

CREATE INDEX IF NOT EXISTS idx_users_store_status_role
  ON public.users(store_id, status, role);

ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.staff_invitations TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.staff_invitations TO service_role;
REVOKE ALL ON TABLE public.staff_invitations FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.staff_invitations FROM authenticated;

DROP POLICY IF EXISTS "Owners can read staff invitations in their store" ON public.staff_invitations;
CREATE POLICY "Owners can read staff invitations in their store"
  ON public.staff_invitations
  FOR SELECT
  TO authenticated
  USING (
    store_id = (SELECT public.get_user_store_id())
    AND (
      SELECT u.role
      FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'active'::public.user_status
    ) = 'owner'::public.user_role
  );

-- Store helpers and privileged RPCs must ignore suspended profiles.
CREATE OR REPLACE FUNCTION public.get_user_store_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT store_id
  FROM public.users
  WHERE id = (SELECT auth.uid())
    AND status = 'active'::public.user_status;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_store_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_store_id() TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_user_staff_lifecycle_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role public.user_role;
  v_caller_store_id uuid;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
    OR OLD.invited_by_user_id IS DISTINCT FROM NEW.invited_by_user_id
    OR OLD.suspended_at IS DISTINCT FROM NEW.suspended_at
    OR OLD.suspended_by_user_id IS DISTINCT FROM NEW.suspended_by_user_id
  THEN
    IF (SELECT auth.uid()) IS NOT NULL THEN
      SELECT u.role, u.store_id
      INTO v_caller_role, v_caller_store_id
      FROM public.users u
      WHERE u.id = (SELECT auth.uid())
        AND u.status = 'active'::public.user_status;

      IF v_caller_role IS DISTINCT FROM 'owner'::public.user_role
        OR v_caller_store_id IS DISTINCT FROM OLD.store_id
      THEN
        RAISE EXCEPTION 'Unauthorized. Only active store owners can change staff lifecycle fields.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.protect_user_staff_lifecycle_fields() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_user_staff_lifecycle_fields() TO service_role;

DROP TRIGGER IF EXISTS trg_protect_user_staff_lifecycle_fields ON public.users;
CREATE TRIGGER trg_protect_user_staff_lifecycle_fields
  BEFORE UPDATE OF status, invited_by_user_id, suspended_at, suspended_by_user_id ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_staff_lifecycle_fields();

CREATE OR REPLACE FUNCTION public.create_invoice_and_deduct_stock(
  p_store_id uuid,
  p_invoice_number text,
  p_customer_name text,
  p_customer_phone text,
  p_total_amount numeric,
  p_discount_amount numeric,
  p_paid_amount numeric,
  p_payment_method text,
  p_items jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_item jsonb;
  v_current_stock int;
  v_sku text;
  v_db_price numeric(10,2);
  v_item_subtotal numeric(10,2);
  v_calculated_subtotal numeric(10,2) := 0.00;
  v_expected_total numeric(10,2);
  v_store_invoice_count int;
  v_invoice_number text;
  v_user_id uuid;
  v_seller_name text;
  v_seller_role public.user_role;
BEGIN
  -- Backward-compatible payload field; the database generates the authoritative invoice number.
  PERFORM p_invoice_number;

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated. Only logged-in users can perform checkout.';
  END IF;

  PERFORM set_config('app.checkout_active', 'true', true);

  SELECT u.name, u.role
  INTO v_seller_name, v_seller_role
  FROM public.users u
  WHERE u.id = v_user_id
    AND u.store_id = p_store_id
    AND u.status = 'active'::public.user_status;

  IF v_seller_name IS NULL OR v_seller_role IS NULL THEN
    PERFORM set_config('app.checkout_active', 'false', true);
    RAISE EXCEPTION 'Unauthorized. You do not have permission to checkout for this store.';
  END IF;

  PERFORM id FROM public.stores WHERE id = p_store_id FOR UPDATE;

  SELECT count(*) + 1 INTO v_store_invoice_count
  FROM public.invoices
  WHERE store_id = p_store_id;

  v_invoice_number := 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(v_store_invoice_count::text, 4, '0');

  INSERT INTO public.invoices (
    store_id,
    invoice_number,
    customer_name,
    customer_phone,
    total_amount,
    discount_amount,
    paid_amount,
    payment_method,
    sold_by_user_id,
    sold_by_name,
    sold_by_role
  ) VALUES (
    p_store_id,
    v_invoice_number,
    p_customer_name,
    p_customer_phone,
    p_total_amount,
    p_discount_amount,
    p_paid_amount,
    p_payment_method,
    v_user_id,
    v_seller_name,
    v_seller_role
  ) RETURNING id INTO v_invoice_id;

  FOR v_item IN
    SELECT x.val
    FROM jsonb_array_elements(p_items) AS x(val)
    ORDER BY (x.val->>'variant_id') ASC NULLS LAST
  LOOP
    IF (v_item->>'variant_id') IS NULL THEN
      v_sku := coalesce(v_item->>'custom_name', 'Custom Item');
      v_db_price := (v_item->>'unit_price')::numeric;

      IF (v_item->>'quantity')::int <= 0 THEN
        RAISE EXCEPTION 'Invalid quantity % for custom item %', (v_item->>'quantity')::int, v_sku;
      END IF;

      v_item_subtotal := v_db_price * (v_item->>'quantity')::int;
      v_calculated_subtotal := v_calculated_subtotal + v_item_subtotal;

      INSERT INTO public.invoice_items (
        invoice_id, variant_id, custom_name, quantity, unit_price, subtotal
      ) VALUES (
        v_invoice_id,
        null,
        v_sku,
        (v_item->>'quantity')::int,
        v_db_price,
        v_item_subtotal
      );
    ELSE
      IF NOT EXISTS (
        SELECT 1 FROM public.product_variants pv
        JOIN public.products p ON pv.product_id = p.id
        WHERE pv.id = (v_item->>'variant_id')::uuid
          AND p.store_id = p_store_id
      ) THEN
        RAISE EXCEPTION 'Variant with ID % does not belong to your store', (v_item->>'variant_id');
      END IF;

      SELECT quantity INTO v_current_stock
      FROM public.inventory
      WHERE variant_id = (v_item->>'variant_id')::uuid
      FOR UPDATE;

      SELECT price, sku INTO v_db_price, v_sku
      FROM public.product_variants
      WHERE id = (v_item->>'variant_id')::uuid;

      IF v_current_stock IS NULL THEN
        RAISE EXCEPTION 'Variant with SKU % does not exist in inventory', v_sku;
      END IF;

      IF (v_item->>'quantity')::int <= 0 THEN
        RAISE EXCEPTION 'Invalid quantity % for SKU %', (v_item->>'quantity')::int, v_sku;
      END IF;

      IF v_current_stock < (v_item->>'quantity')::int THEN
        RAISE EXCEPTION 'Insufficient stock for SKU %. Available: %, Requested: %',
          v_sku, v_current_stock, (v_item->>'quantity')::int;
      END IF;

      UPDATE public.inventory
      SET quantity = quantity - (v_item->>'quantity')::int,
          updated_at = now()
      WHERE variant_id = (v_item->>'variant_id')::uuid;

      v_item_subtotal := v_db_price * (v_item->>'quantity')::int;
      v_calculated_subtotal := v_calculated_subtotal + v_item_subtotal;

      INSERT INTO public.invoice_items (
        invoice_id, variant_id, custom_name, quantity, unit_price, subtotal
      ) VALUES (
        v_invoice_id,
        (v_item->>'variant_id')::uuid,
        null,
        (v_item->>'quantity')::int,
        v_db_price,
        v_item_subtotal
      );
    END IF;
  END LOOP;

  IF p_discount_amount > v_calculated_subtotal THEN
    RAISE EXCEPTION 'Discount amount % exceeds the subtotal %', p_discount_amount, v_calculated_subtotal;
  END IF;

  v_expected_total := v_calculated_subtotal - p_discount_amount;
  IF v_expected_total < 0.00 THEN
    v_expected_total := 0.00;
  END IF;

  IF abs(v_expected_total - p_total_amount) > 0.01 THEN
    RAISE EXCEPTION 'Price tampering detected! Client reported total of %, but recalculated total is %',
      p_total_amount, v_expected_total;
  END IF;

  INSERT INTO public.audit_logs (store_id, user_id, operation, affected_entity, result, created_at)
  VALUES (
    p_store_id,
    v_user_id,
    'CHECKOUT',
    'Invoice: ' || v_invoice_number,
    'SUCCESS',
    now()
  );

  RETURN v_invoice_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_invoice_and_deduct_stock(uuid, text, text, text, numeric, numeric, numeric, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_and_deduct_stock(uuid, text, text, text, numeric, numeric, numeric, text, jsonb) TO authenticated;
