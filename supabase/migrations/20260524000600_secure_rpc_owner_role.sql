-- =========================================================================
-- PaisaPOS SECURITY DEFINER RPC Role Enforcement Hardening
-- Deployed: 2026-05-24
--
-- Hardens the upsert_product_and_variants RPC function (which runs as
-- SECURITY DEFINER and bypasses RLS) to explicitly check that the caller's
-- role is 'owner'. This seals the cashier privilege escalation vector.
-- =========================================================================

CREATE OR REPLACE FUNCTION upsert_product_and_variants(
  p_product_id uuid, -- NULL for create, non-NULL for update
  p_name text,
  p_category text,
  p_low_stock_threshold integer,
  p_deleted_variant_ids uuid[],
  p_variants jsonb -- Array of {id: uuid (opt), size: text, color: text, sku: text, price: numeric, stock: integer}
) RETURNS uuid AS $$
DECLARE
  v_user_id uuid;
  v_store_id uuid;
  v_role user_role;
  v_product_id uuid := p_product_id;
  v_var jsonb;
  v_variant_id uuid;
BEGIN
  -- 1. Authentication Check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated. Only logged-in users can modify inventory.';
  END IF;

  -- 2. Resolve store ID & user role
  SELECT store_id, role INTO v_store_id, v_role FROM users WHERE id = v_user_id;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'User profile / store association not found.';
  END IF;

  -- 3. Enforce Role Privileges Gating (Only owners are permitted to write)
  IF v_role IS DISTINCT FROM 'owner'::user_role THEN
    RAISE EXCEPTION 'Unauthorized. Only store owners can add or modify products.';
  END IF;

  -- 4. Create or Update Product
  IF v_product_id IS NULL THEN
    -- Insert Product
    INSERT INTO products (store_id, name, category, low_stock_threshold)
    VALUES (v_store_id, p_name, p_category, p_low_stock_threshold)
    RETURNING id INTO v_product_id;

    -- Log to audit
    INSERT INTO audit_logs (store_id, user_id, operation, affected_entity, result, created_at)
    VALUES (v_store_id, v_user_id, 'PRODUCT_CREATE', 'Product: ' || p_name || ' (ID: ' || v_product_id || ')', 'SUCCESS', now());
  ELSE
    -- Verify ownership: product must belong to user's store
    IF NOT EXISTS (
      SELECT 1 FROM products WHERE id = v_product_id AND store_id = v_store_id
    ) THEN
      RAISE EXCEPTION 'Unauthorized. Product does not belong to your store.';
    END IF;

    -- Update Product
    UPDATE products
    SET name = p_name,
        category = p_category,
        low_stock_threshold = p_low_stock_threshold
    WHERE id = v_product_id;

    -- Log to audit
    INSERT INTO audit_logs (store_id, user_id, operation, affected_entity, result, created_at)
    VALUES (v_store_id, v_user_id, 'PRODUCT_UPDATE', 'Product: ' || p_name || ' (ID: ' || v_product_id || ')', 'SUCCESS', now());
  END IF;

  -- 5. Delete variants if any
  IF p_deleted_variant_ids IS NOT NULL AND array_length(p_deleted_variant_ids, 1) > 0 THEN
    -- Verify variant ownership before deleting
    IF EXISTS (
      SELECT 1 FROM product_variants pv
      WHERE pv.id = ANY(p_deleted_variant_ids) AND pv.store_id != v_store_id
    ) THEN
      RAISE EXCEPTION 'Unauthorized. Some variants to delete do not belong to your store.';
    END IF;

    DELETE FROM product_variants WHERE id = ANY(p_deleted_variant_ids);
  END IF;

  -- 6. Process variants (insert or update)
  FOR v_var IN SELECT * FROM jsonb_array_elements(p_variants) LOOP
    v_variant_id := (v_var->>'id')::uuid;

    IF v_variant_id IS NOT NULL THEN
      -- Verify variant ownership before updating
      IF NOT EXISTS (
        SELECT 1 FROM product_variants pv
        WHERE pv.id = v_variant_id AND pv.store_id = v_store_id
      ) THEN
        RAISE EXCEPTION 'Unauthorized. Variant with ID % does not belong to your store.', v_variant_id;
      END IF;

      -- Update variant details
      UPDATE product_variants
      SET size = v_var->>'size',
          color = v_var->>'color',
          sku = v_var->>'sku',
          price = (v_var->>'price')::numeric
      WHERE id = v_variant_id;

      -- Upsert inventory
      INSERT INTO inventory (variant_id, quantity, updated_at)
      VALUES (v_variant_id, (v_var->>'stock')::integer, now())
      ON CONFLICT (variant_id) DO UPDATE
      SET quantity = EXCLUDED.quantity,
          updated_at = now();
    ELSE
      -- Insert variant details
      INSERT INTO product_variants (product_id, store_id, size, color, sku, price)
      VALUES (v_product_id, v_store_id, v_var->>'size', v_var->>'color', v_var->>'sku', (v_var->>'price')::numeric)
      RETURNING id INTO v_variant_id;

      -- Insert inventory
      INSERT INTO inventory (variant_id, quantity, updated_at)
      VALUES (v_variant_id, (v_var->>'stock')::integer, now());
    END IF;
  END LOOP;

  RETURN v_product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
