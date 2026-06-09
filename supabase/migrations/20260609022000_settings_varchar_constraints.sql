-- =========================================================================
-- PaisaPOS Varchar Constraints Alignment
--
-- Restricts text column lengths in stores, users, and staff_invitations
-- to match their corresponding Zod validation schema bounds.
-- =========================================================================

-- 1. Alter stores columns
ALTER TABLE public.stores ALTER COLUMN name TYPE VARCHAR(100);
ALTER TABLE public.stores ALTER COLUMN phone TYPE VARCHAR(20);
ALTER TABLE public.stores ALTER COLUMN address TYPE VARCHAR(200);
ALTER TABLE public.stores ALTER COLUMN pan_vat TYPE VARCHAR(20);

-- 2. Alter users columns
ALTER TABLE public.users ALTER COLUMN name TYPE VARCHAR(100);

-- 3. Alter staff_invitations columns
ALTER TABLE public.staff_invitations ALTER COLUMN email TYPE VARCHAR(254);
