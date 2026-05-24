-- =========================================================================
-- PaisaPOS Invoice Integrity Constraints Hardening
-- Deployed: 2026-05-24
-- =========================================================================

-- 1. Drop existing constraints if they exist to prevent conflict
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS check_discount_amount;
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS check_paid_amount;

-- 2. Add corrected discount_amount check constraint (discount cannot exceed total amount)
ALTER TABLE public.invoices ADD CONSTRAINT check_discount_amount CHECK (discount_amount <= total_amount);

-- 3. Add paid_amount boundary check constraint (paid amount must be between 0 and total order value)
ALTER TABLE public.invoices ADD CONSTRAINT check_paid_amount CHECK (paid_amount >= 0 AND paid_amount <= total_amount);
