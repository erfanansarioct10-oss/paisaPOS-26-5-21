-- =========================================================================
-- PaisaPOS RPC Grant & RLS Role Hardening
-- Deployed: 2026-05-24
--
-- Security goals:
--   1. Remove PUBLIC/anon EXECUTE access from SECURITY DEFINER RPCs.
--   2. Keep user-facing RPCs callable only by authenticated sessions.
--   3. Keep admin/audit-maintenance RPCs callable only by service_role.
--   4. Scope all public table RLS policies explicitly TO authenticated.
-- =========================================================================

-- 1. Remove unsafe default EXECUTE grants from privileged functions.
REVOKE EXECUTE ON PROCEDURE public.archive_and_purge_old_audit_logs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bulk_upsert_products_and_variants(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_invoice_and_deduct_stock(uuid, text, text, text, numeric, numeric, numeric, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.detect_threat_anomalies() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_store_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_email_verified_onboarding() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_inventory_adjustment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_price_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_store_registration() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_unauthenticated_security_event(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_user_role() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_user_store_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.register_store_and_user(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_product_variant_store_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_product_and_variants(uuid, text, text, integer, uuid[], jsonb) FROM PUBLIC, anon;

-- 2. Grant the minimum required callable surface.
GRANT EXECUTE ON FUNCTION public.bulk_upsert_products_and_variants(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice_and_deduct_stock(uuid, text, text, text, numeric, numeric, numeric, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_store_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_store_and_user(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_product_and_variants(uuid, text, text, integer, uuid[], jsonb) TO authenticated;

GRANT EXECUTE ON PROCEDURE public.archive_and_purge_old_audit_logs() TO service_role;
GRANT EXECUTE ON FUNCTION public.detect_threat_anomalies() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_unauthenticated_security_event(text, text, text) TO service_role;

-- 3. Scope all tenant RLS policies to authenticated sessions explicitly.
DO $$
DECLARE
  policy_pair text[];
  policy_pairs text[][] := ARRAY[
    ARRAY['audit_logs', 'Users can insert audit logs for their store'],
    ARRAY['audit_logs', 'Users can read audit logs of their store'],
    ARRAY['audit_logs_archive', 'Users can read archived audit logs of their store'],
    ARRAY['inventory', 'Users can delete inventory'],
    ARRAY['inventory', 'Users can insert inventory'],
    ARRAY['inventory', 'Users can read inventory'],
    ARRAY['inventory', 'Users can update inventory'],
    ARRAY['invoice_items', 'Users can delete invoice items'],
    ARRAY['invoice_items', 'Users can insert invoice items'],
    ARRAY['invoice_items', 'Users can read invoice items'],
    ARRAY['invoice_items', 'Users can update invoice items'],
    ARRAY['invoices', 'Users can delete invoices'],
    ARRAY['invoices', 'Users can insert invoices'],
    ARRAY['invoices', 'Users can read invoices'],
    ARRAY['invoices', 'Users can update invoices'],
    ARRAY['product_variants', 'Users can delete product variants'],
    ARRAY['product_variants', 'Users can insert product variants'],
    ARRAY['product_variants', 'Users can read product variants'],
    ARRAY['product_variants', 'Users can update product variants'],
    ARRAY['products', 'Owners can delete products in their store'],
    ARRAY['products', 'Owners can insert products in their store'],
    ARRAY['products', 'Owners can update products in their store'],
    ARRAY['products', 'Users can read products in their store'],
    ARRAY['stores', 'Owners can delete their own store record'],
    ARRAY['stores', 'Owners can update their own store record'],
    ARRAY['stores', 'Users can read their own store record'],
    ARRAY['users', 'Users can delete their own user profile'],
    ARRAY['users', 'Users can read their own user record'],
    ARRAY['users', 'Users can update their own user profile name']
  ];
BEGIN
  FOREACH policy_pair SLICE 1 IN ARRAY policy_pairs LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = policy_pair[1]
        AND policyname = policy_pair[2]
    ) THEN
      EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated', policy_pair[2], policy_pair[1]);
    END IF;
  END LOOP;
END;
$$;
