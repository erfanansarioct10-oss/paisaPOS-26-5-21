-- =========================================================================
-- PaisaPOS Bulk Product Import RPC function
-- Deployed: 2026-05-24
-- =========================================================================

CREATE OR REPLACE FUNCTION bulk_upsert_products_and_variants(
  p_products jsonb -- Array of products: {name: text, category: text, lowStockThreshold: integer, variants: Array<{size: text, color: text, sku: text, price: numeric, stock: integer}>}
) RETURNS integer AS $$
DECLARE
  v_user_id uuid;
  v_store_id uuid;
  v_role user_role;
  v_prod jsonb;
  v_var jsonb;
  v_product_id uuid;
  v_variant_id uuid;
  v_count integer := 0;
BEGIN
  -- 1. Authentication Check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated. Only logged-in users can import catalogs.';
  END IF;

  -- 2. Resolve store ID & user role
  SELECT store_id, role INTO v_store_id, v_role FROM users WHERE id = v_user_id;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'User profile / store association not found.';
  END IF;

  -- 3. Enforce Role Privileges Gating (Only owners are permitted to import)
  IF v_role IS DISTINCT FROM 'owner'::user_role THEN
    RAISE EXCEPTION 'Unauthorized. Only store owners can import product catalogs.';
  END IF;

  -- 4. Process each product in the JSONB array
  FOR v_prod IN SELECT * FROM jsonb_array_elements(p_products) LOOP
    -- Find if a product with the same name and category already exists in this store
    SELECT id INTO v_product_id 
    FROM products 
    WHERE store_id = v_store_id 
      AND LOWER(name) = LOWER(v_prod->>'name') 
      AND LOWER(category) = LOWER(v_prod->>'category')
    LIMIT 1;

    IF v_product_id IS NULL THEN
      -- Insert Product
      INSERT INTO products (store_id, name, category, low_stock_threshold)
      VALUES (
        v_store_id, 
        v_prod->>'name', 
        v_prod->>'category', 
        COALESCE((v_prod->>'lowStockThreshold')::integer, 5)
      )
      RETURNING id INTO v_product_id;

      -- Log creation to audit
      INSERT INTO audit_logs (store_id, user_id, operation, affected_entity, result, created_at)
      VALUES (
        v_store_id, 
        v_user_id, 
        'PRODUCT_CREATE', 
        'Bulk Import Product: ' || (v_prod->>'name') || ' (ID: ' || v_product_id || ')', 
        'SUCCESS', 
        now()
      );
    ELSE
      -- Update existing Product low_stock_threshold
      UPDATE products
      SET low_stock_threshold = COALESCE((v_prod->>'lowStockThreshold')::integer, low_stock_threshold)
      WHERE id = v_product_id;

      -- Log update to audit
      INSERT INTO audit_logs (store_id, user_id, operation, affected_entity, result, created_at)
      VALUES (
        v_store_id, 
        v_user_id, 
        'PRODUCT_UPDATE', 
        'Bulk Import Product (Existing): ' || (v_prod->>'name') || ' (ID: ' || v_product_id || ')', 
        'SUCCESS', 
        now()
      );
    END IF;

    -- 5. Process variants of the product
    FOR v_var IN SELECT * FROM jsonb_array_elements(v_prod->'variants') LOOP
      -- Check if variant with SKU already exists in this store
      SELECT id INTO v_variant_id 
      FROM product_variants 
      WHERE store_id = v_store_id 
        AND UPPER(sku) = UPPER(v_var->>'sku')
      LIMIT 1;

      IF v_variant_id IS NOT NULL THEN
        -- Update variant details
        UPDATE product_variants
        SET size = v_var->>'size',
            color = v_var->>'color',
            price = (v_var->>'price')::numeric
        WHERE id = v_variant_id;

        -- Upsert inventory
        INSERT INTO inventory (variant_id, quantity, updated_at)
        VALUES (v_variant_id, (v_var->>'stock')::integer, now())
        ON CONFLICT (variant_id) DO UPDATE
        SET quantity = EXCLUDED.quantity,
            updated_at = now();
      ELSE
        -- Insert new variant
        INSERT INTO product_variants (product_id, store_id, size, color, sku, price)
        VALUES (
          v_product_id, 
          v_store_id, 
          v_var->>'size', 
          v_var->>'color', 
          UPPER(v_var->>'sku'), 
          (v_var->>'price')::numeric
        )
        RETURNING id INTO v_variant_id;

        -- Insert initial inventory
        INSERT INTO inventory (variant_id, quantity, updated_at)
        VALUES (v_variant_id, (v_var->>'stock')::integer, now());
      END IF;
    END LOOP;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
