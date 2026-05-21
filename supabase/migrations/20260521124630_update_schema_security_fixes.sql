-- DROP old signatures first to avoid conflicts
DROP FUNCTION IF EXISTS register_store_and_user(uuid, text, text);
DROP FUNCTION IF EXISTS create_invoice_and_deduct_stock(uuid, text, text, text, numeric, numeric, numeric, text, jsonb);

-- 1. Updated register_store_and_user onboarding RPC function
CREATE OR REPLACE FUNCTION register_store_and_user(
  p_full_name text,
  p_store_name text
) RETURNS uuid AS $$
DECLARE
  v_store_id uuid;
  v_user_id uuid;
BEGIN
  -- Resolve authenticated user ID
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated. Only logged-in users can register a store.';
  END IF;

  -- Prevent duplicate registration: check if profile already exists
  IF EXISTS (SELECT 1 FROM users WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'User is already registered and associated with a store.';
  END IF;

  -- 1. Insert store bypasses initial RLS since this is a security definer function
  INSERT INTO stores (name, phone, address, pan_vat)
  VALUES (p_store_name, '', '', '')
  RETURNING id INTO v_store_id;

  -- 2. Insert user profile linking to store
  INSERT INTO users (id, name, store_id)
  VALUES (v_user_id, p_full_name, v_store_id);

  RETURN v_store_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Updated create_invoice_and_deduct_stock checkout RPC function
CREATE OR REPLACE FUNCTION create_invoice_and_deduct_stock(
  p_store_id uuid,
  p_invoice_number text,
  p_customer_name text,
  p_customer_phone text,
  p_total_amount numeric,
  p_discount_amount numeric,
  p_paid_amount numeric,
  p_payment_method text,
  p_items jsonb -- Array of {variant_id: uuid, quantity: int, unit_price: numeric, subtotal: numeric}
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

  -- Verify store ownership to prevent cross-tenant billing/checkout
  IF NOT EXISTS (
    SELECT 1 FROM users 
    WHERE id = v_user_id AND store_id = p_store_id
  ) THEN
    RAISE EXCEPTION 'Unauthorized. You do not have permission to checkout for this store.';
  END IF;

  -- Acquire an exclusive lock on the store row to serialize checkouts *only* for this store
  -- to prevent concurrent count race conditions.
  PERFORM id FROM stores WHERE id = p_store_id FOR UPDATE;

  -- Calculate the next sequential number for this specific store
  SELECT count(*) + 1 INTO v_store_invoice_count
  FROM invoices
  WHERE store_id = p_store_id;

  -- Construct sequential, tenant-scoped invoice number: e.g. INV-2026-0001
  v_invoice_number := 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(v_store_invoice_count::text, 4, '0');

  -- 1. Insert Core Invoice (using server-generated sequential, race-condition-free invoice number)
  INSERT INTO invoices (
    store_id, invoice_number, customer_name, customer_phone, 
    total_amount, discount_amount, paid_amount, payment_method
  ) VALUES (
    p_store_id, v_invoice_number, p_customer_name, p_customer_phone, 
    p_total_amount, p_discount_amount, p_paid_amount, p_payment_method
  ) RETURNING id INTO v_invoice_id;

  -- 2. Iterate invoice line items, perform atomic stock checks & reductions
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    -- Verify variant ownership (the variant must belong to the user's store)
    IF NOT EXISTS (
      SELECT 1 FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      WHERE pv.id = (v_item->>'variant_id')::uuid AND p.store_id = p_store_id
    ) THEN
      RAISE EXCEPTION 'Variant with ID % does not belong to your store', (v_item->>'variant_id');
    END IF;

    -- Resolve variant details and lock matching inventory row to prevent concurrent race conditions
    SELECT quantity INTO v_current_stock
    FROM inventory
    WHERE variant_id = (v_item->>'variant_id')::uuid
    FOR UPDATE; 

    SELECT price, sku INTO v_db_price, v_sku
    from product_variants
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
  -- Cap/validate discount to the subtotal of items to prevent negative totals or excessive discount exploits
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
