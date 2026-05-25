-- =========================================================================
-- PaisaPOS PostgREST Relationship Disambiguation
-- Created: 2026-05-25
--
-- Composite tenant FKs are attractive for integrity, but in Supabase Data API
-- they create duplicate relationships beside the original single-column FKs.
-- That makes embedded selects such as product_variants(inventory(...))
-- ambiguous. Tenant consistency is enforced by strict triggers in the prior
-- migration instead.
-- =========================================================================

ALTER TABLE public.inventory
  DROP CONSTRAINT IF EXISTS inventory_variant_store_fk;

ALTER TABLE public.product_variants
  DROP CONSTRAINT IF EXISTS product_variants_product_store_fk;
