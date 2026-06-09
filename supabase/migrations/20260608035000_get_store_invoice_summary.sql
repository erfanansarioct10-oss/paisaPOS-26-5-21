-- =========================================================================
-- PaisaPOS Store Invoice Summary RPC
--
-- This function computes the summary sales statistics (sums and counts)
-- across all invoices matching the search and date filters directly in the DB.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_store_invoice_summary(
  p_store_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_payment_method VARCHAR DEFAULT NULL,
  p_search_query VARCHAR DEFAULT NULL
)
RETURNS TABLE (
  total_sales NUMERIC,
  total_count BIGINT,
  cash_sales NUMERIC,
  esewa_sales NUMERIC,
  khalti_sales NUMERIC,
  fonepay_sales NUMERIC
) SECURITY INVOKER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(total_amount), 0)::NUMERIC as total_sales,
    COUNT(id)::BIGINT as total_count,
    COALESCE(SUM(CASE WHEN LOWER(payment_method) = 'cash' THEN total_amount ELSE 0 END), 0)::NUMERIC as cash_sales,
    COALESCE(SUM(CASE WHEN LOWER(payment_method) = 'esewa' THEN total_amount ELSE 0 END), 0)::NUMERIC as esewa_sales,
    COALESCE(SUM(CASE WHEN LOWER(payment_method) = 'khalti' THEN total_amount ELSE 0 END), 0)::NUMERIC as khalti_sales,
    COALESCE(SUM(CASE WHEN LOWER(payment_method) = 'fonepay' THEN total_amount ELSE 0 END), 0)::NUMERIC as fonepay_sales
  FROM public.invoices
  WHERE store_id = p_store_id
    AND (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date)
    AND (p_payment_method IS NULL OR p_payment_method = 'All' OR LOWER(payment_method) = LOWER(p_payment_method))
    AND (
      p_search_query IS NULL OR p_search_query = '' OR
      LOWER(invoice_number) LIKE '%' || LOWER(p_search_query) || '%' OR
      LOWER(customer_name) LIKE '%' || LOWER(p_search_query) || '%' OR
      LOWER(customer_phone) LIKE '%' || LOWER(p_search_query) || '%' OR
      LOWER(payment_method) LIKE '%' || LOWER(p_search_query) || '%' OR
      LOWER(sold_by_name) LIKE '%' || LOWER(p_search_query) || '%' OR
      LOWER(sold_by_role::TEXT) LIKE '%' || LOWER(p_search_query) || '%'
    );
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION public.get_store_invoice_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ, VARCHAR, VARCHAR) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_invoice_summary(UUID, TIMESTAMPTZ, TIMESTAMPTZ, VARCHAR, VARCHAR) TO authenticated, service_role;
