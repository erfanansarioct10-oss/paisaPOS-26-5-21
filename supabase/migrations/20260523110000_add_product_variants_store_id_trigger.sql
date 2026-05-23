-- Create a trigger function to auto-populate product_variants.store_id from the parent products table if it's not provided
CREATE OR REPLACE FUNCTION set_product_variant_store_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.store_id IS NULL THEN
    SELECT store_id INTO NEW.store_id
    FROM products
    WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the trigger BEFORE INSERT on product_variants
DROP TRIGGER IF EXISTS trg_set_product_variant_store_id ON product_variants;
CREATE TRIGGER trg_set_product_variant_store_id
  BEFORE INSERT ON product_variants
  FOR EACH ROW
  EXECUTE FUNCTION set_product_variant_store_id();
