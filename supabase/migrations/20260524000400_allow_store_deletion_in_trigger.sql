-- =========================================================================
-- PaisaPOS Store ID Protection Cascade Fix
-- Deployed: 2026-05-24
--
-- Updates the protect_user_store_id trigger function to allow changing
-- store_id if the referenced store has been deleted. This preserves the
-- BOLA tenant-hijacking defense while enabling clean store deletion cascade.
-- =========================================================================

CREATE OR REPLACE FUNCTION protect_user_store_id()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.store_id IS DISTINCT FROM NEW.store_id AND OLD.store_id IS NOT NULL THEN
    -- If the old store still exists in the database, block the change (BOLA protection).
    -- If the old store has been deleted, allow the change (system ON DELETE SET NULL cascade).
    IF EXISTS (SELECT 1 FROM public.stores WHERE id = OLD.store_id) THEN
      RAISE EXCEPTION 'Changing store_id is not allowed.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
