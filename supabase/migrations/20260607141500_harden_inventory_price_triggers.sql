-- =========================================================================
-- Task 3 (Part 1): Trigger Hardening for bulk imports
-- Deployed: 2026-06-07
-- =========================================================================

-- Recreate log_inventory_adjustment trigger function with app.bulk_import_active check
CREATE OR REPLACE FUNCTION public.log_inventory_adjustment()
RETURNS TRIGGER AS $$
DECLARE
  v_store_id uuid;
  v_user_id uuid;
BEGIN
  -- Skip if bulk import is active
  IF current_setting('app.bulk_import_active', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Skip if this is part of checkout
  IF current_setting('app.checkout_active', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Only log if quantity actually changed
  IF OLD.quantity IS DISTINCT FROM NEW.quantity THEN
    -- Resolve store_id from product
    SELECT p.store_id INTO v_store_id
    FROM product_variants pv
    JOIN products p ON pv.product_id = p.id
    WHERE pv.id = NEW.variant_id;

    v_user_id := auth.uid();

    INSERT INTO audit_logs (store_id, user_id, operation, affected_entity, result, created_at)
    VALUES (
      v_store_id,
      v_user_id,
      'STOCK_ADJUSTMENT',
      'Variant ID: ' || NEW.variant_id || ' (Stock: ' || OLD.quantity || ' → ' || NEW.quantity || ')',
      'SUCCESS',
      now()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate log_price_update trigger function with app.bulk_import_active check
CREATE OR REPLACE FUNCTION public.log_price_update()
RETURNS TRIGGER AS $$
DECLARE
  v_store_id uuid;
  v_user_id uuid;
BEGIN
  -- Skip if bulk import is active
  IF current_setting('app.bulk_import_active', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Only log if price actually changed
  IF OLD.price IS DISTINCT FROM NEW.price THEN
    -- Resolve store_id
    SELECT p.store_id INTO v_store_id
    FROM products p
    WHERE p.id = NEW.product_id;

    v_user_id := auth.uid();

    INSERT INTO audit_logs (store_id, user_id, operation, affected_entity, result, created_at)
    VALUES (
      v_store_id,
      v_user_id,
      'PRICE_UPDATE',
      'SKU: ' || NEW.sku || ' (Price: Rs. ' || OLD.price || ' → Rs. ' || NEW.price || ')',
      'SUCCESS',
      now()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
