-- =========================================================================
-- Task 4: Denormalize invoice_items with store_id
-- Deployed: 2026-06-07
-- =========================================================================

-- 1. Add store_id column (initially nullable to allow backfill)
ALTER TABLE public.invoice_items
  ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;

-- 2. Backfill existing rows from invoices
UPDATE public.invoice_items ii
SET store_id = i.store_id
FROM public.invoices i
WHERE ii.invoice_id = i.id;

-- 3. Enforce NOT NULL constraint now that everything is backfilled
ALTER TABLE public.invoice_items
  ALTER COLUMN store_id SET NOT NULL;

-- 4. Create an index on the new denormalized tenant key
CREATE INDEX IF NOT EXISTS idx_invoice_items_store_id
  ON public.invoice_items(store_id);

-- 5. Rewrite RLS SELECT policy to filter directly by get_user_store_id()
DROP POLICY IF EXISTS "Users can read invoice items" ON public.invoice_items;
CREATE POLICY "Users can read invoice items" ON public.invoice_items
  FOR SELECT TO authenticated
  USING (store_id = public.get_user_store_id());

-- 6. Trigger to auto-populate store_id on insert
CREATE OR REPLACE FUNCTION public.set_invoice_item_store_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.store_id IS NULL THEN
    SELECT store_id INTO NEW.store_id
    FROM public.invoices
    WHERE id = NEW.invoice_id;
  END IF;
  
  IF NEW.store_id IS NULL THEN
    RAISE EXCEPTION 'Parent invoice not found or store_id could not be resolved.';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_set_invoice_item_store_id ON public.invoice_items;
CREATE TRIGGER trg_set_invoice_item_store_id
  BEFORE INSERT ON public.invoice_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_invoice_item_store_id();
