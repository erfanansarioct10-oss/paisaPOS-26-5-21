-- 1. Drop global unique SKU constraint
ALTER TABLE product_variants DROP CONSTRAINT IF EXISTS product_variants_sku_key;

-- 2. Add store_id to product_variants (to easily enforce store-scoped SKU uniqueness)
ALTER TABLE product_variants ADD COLUMN store_id uuid REFERENCES stores(id) ON DELETE CASCADE;

-- 3. Populate existing store_id values
UPDATE product_variants pv
SET store_id = p.store_id
FROM products p
WHERE pv.product_id = p.id;

-- 4. Set store_id as NOT NULL
ALTER TABLE product_variants ALTER COLUMN store_id SET NOT NULL;

-- 5. Create unique composite constraint for store-scoped SKUs
ALTER TABLE product_variants ADD CONSTRAINT product_variants_store_sku_key UNIQUE (store_id, sku);

-- 6. Redefine upsert_product_and_variants to support inserting store_id
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
  v_product_id uuid := p_product_id;
  v_var jsonb;
  v_variant_id uuid;
BEGIN
  -- Authentication Check
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated. Only logged-in users can modify inventory.';
  END IF;

  -- Resolve store ID
  SELECT store_id INTO v_store_id FROM users WHERE id = v_user_id;
  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'User profile / store association not found.';
  END IF;

  -- Create or Update Product
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

  -- Delete variants if any
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

  -- Process variants (insert or update)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
