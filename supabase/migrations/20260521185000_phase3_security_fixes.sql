-- 1. Create atomic product upsert and variant management function
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
      JOIN products p ON pv.product_id = p.id
      WHERE pv.id = ANY(p_deleted_variant_ids) AND p.store_id != v_store_id
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
        JOIN products p ON pv.product_id = p.id
        WHERE pv.id = v_variant_id AND p.store_id = v_store_id
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
      INSERT INTO product_variants (product_id, size, color, sku, price)
      VALUES (v_product_id, v_var->>'size', v_var->>'color', v_var->>'sku', (v_var->>'price')::numeric)
      RETURNING id INTO v_variant_id;

      -- Insert inventory
      INSERT INTO inventory (variant_id, quantity, updated_at)
      VALUES (v_variant_id, (v_var->>'stock')::integer, now());
    END IF;
  END LOOP;

  RETURN v_product_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Trigger function for inventory adjustments
CREATE OR REPLACE FUNCTION log_inventory_adjustment()
RETURNS TRIGGER AS $$
DECLARE
  v_store_id uuid;
  v_user_id uuid;
BEGIN
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

DROP TRIGGER IF EXISTS trg_log_inventory_adjustment ON inventory;
CREATE TRIGGER trg_log_inventory_adjustment
  AFTER UPDATE OF quantity ON inventory
  FOR EACH ROW
  EXECUTE FUNCTION log_inventory_adjustment();


-- 3. Trigger function for price updates
CREATE OR REPLACE FUNCTION log_price_update()
RETURNS TRIGGER AS $$
DECLARE
  v_store_id uuid;
  v_user_id uuid;
BEGIN
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

DROP TRIGGER IF EXISTS trg_log_price_update ON product_variants;
CREATE TRIGGER trg_log_price_update
  AFTER UPDATE OF price ON product_variants
  FOR EACH ROW
  EXECUTE FUNCTION log_price_update();


-- 4. Trigger function for store registrations
CREATE OR REPLACE FUNCTION log_store_registration()
RETURNS TRIGGER AS $$
DECLARE
  v_store_name text;
BEGIN
  SELECT name INTO v_store_name FROM stores WHERE id = NEW.store_id;

  INSERT INTO audit_logs (store_id, user_id, operation, affected_entity, result, created_at)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_store_registration ON users;
CREATE TRIGGER trg_log_store_registration
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION log_store_registration();


-- 5. Update checkout function to set checkout context local variable
CREATE OR REPLACE FUNCTION create_invoice_and_deduct_stock(
  p_store_id uuid,
  p_invoice_number text,
  p_customer_name text,
  p_customer_phone text,
  p_total_amount numeric,
  p_discount_amount numeric,
  p_paid_amount numeric,
  p_payment_method text,
  p_items jsonb
) RETURNS uuid AS $$
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
BEGIN
  -- Resolve and validate authenticated user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated. Only logged-in users can perform checkout.';
  END IF;

  -- Set checkout context local parameter to prevent stock trigger audit duplication
  PERFORM set_config('app.checkout_active', 'true', true);

  -- Verify store ownership to prevent cross-tenant billing/checkout
  IF NOT EXISTS (
    SELECT 1 FROM users 
    WHERE id = v_user_id AND store_id = p_store_id
  ) THEN
    -- Reset setting just in case, though rollback will handle it
    PERFORM set_config('app.checkout_active', 'false', true);
    RAISE EXCEPTION 'Unauthorized. You do not have permission to checkout for this store.';
  END IF;

  -- Acquire an exclusive lock on the store row to serialize checkouts *only* for this store
  PERFORM id FROM stores WHERE id = p_store_id FOR UPDATE;

  -- Calculate the next sequential number for this specific store
  SELECT count(*) + 1 INTO v_store_invoice_count
  FROM invoices
  WHERE store_id = p_store_id;

  -- Construct sequential, tenant-scoped invoice number: e.g. INV-2026-0001
  v_invoice_number := 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(v_store_invoice_count::text, 4, '0');

  -- 1. Insert Core Invoice
  INSERT INTO invoices (
    store_id, invoice_number, customer_name, customer_phone, 
    total_amount, discount_amount, paid_amount, payment_method
  ) VALUES (
    p_store_id, v_invoice_number, p_customer_name, p_customer_phone, 
    p_total_amount, p_discount_amount, p_paid_amount, p_payment_method
  ) RETURNING id INTO v_invoice_id;

  -- 2. Iterate invoice line items, perform atomic stock checks & reductions
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    -- Verify variant ownership
    IF NOT EXISTS (
      SELECT 1 FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      WHERE pv.id = (v_item->>'variant_id')::uuid AND p.store_id = p_store_id
    ) THEN
      RAISE EXCEPTION 'Variant with ID % does not belong to your store', (v_item->>'variant_id');
    END IF;

    -- Resolve variant details and lock matching inventory row
    SELECT quantity INTO v_current_stock
    FROM inventory
    WHERE variant_id = (v_item->>'variant_id')::uuid
    FOR UPDATE; 

    SELECT price, sku INTO v_db_price, v_sku
    FROM product_variants
    WHERE id = (v_item->>'variant_id')::uuid;

    IF v_current_stock IS NULL THEN
      RAISE EXCEPTION 'Variant with SKU % does not exist in inventory', v_sku;
    END IF;

    -- Atomic safety check
    IF v_current_stock < (v_item->>'quantity')::int THEN
      RAISE EXCEPTION 'Insufficient stock for SKU %. Available: %, Requested: %', 
        v_sku, v_current_stock, (v_item->>'quantity')::int;
    END IF;

    -- Decrement matching stock level
    UPDATE inventory
    SET quantity = quantity - (v_item->>'quantity')::int,
        updated_at = now()
    WHERE variant_id = (v_item->>'variant_id')::uuid;

    -- Recalculate subtotal using authentic database price
    v_item_subtotal := v_db_price * (v_item->>'quantity')::int;
    v_calculated_subtotal := v_calculated_subtotal + v_item_subtotal;

    -- Record Invoice Item using server-verified values
    INSERT INTO invoice_items (
      invoice_id, variant_id, quantity, unit_price, subtotal
    ) VALUES (
      v_invoice_id,
      (v_item->>'variant_id')::uuid,
      (v_item->>'quantity')::int,
      v_db_price,
      v_item_subtotal
    );
  END LOOP;

  -- 3. Price Tampering Integrity Verification
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

  -- 4. Record successful operation to audit log
  INSERT INTO audit_logs (store_id, user_id, operation, affected_entity, result, created_at)
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
