"use server";

// =========================================================================
// PaisaPOS — Dashboard Server Actions
// Provides server-side aggregated metrics that bypass the 50-invoice client
// cache limit, ensuring accurate Today's Sales/Transaction counts.
// =========================================================================

import { getSupabaseServerClient, requireTenantContext } from "@/server/supabase/dal";

/**
 * Returns today's sales sum and transaction count by querying the database
 * directly. Uses Nepal Standard Time (UTC+5:45) to calculate the "today"
 * boundary, matching the POS's operational timezone.
 *
 * This replaces the client-side buildDashboardMetrics computation for
 * today's numbers, which was limited to the first 50 cached invoices.
 */
export async function fetchTodayDashboardMetrics(): Promise<{
  todaySalesSum: number;
  todayInvoicesCount: number;
}> {
  const tenant = await requireTenantContext();
  const supabase = await getSupabaseServerClient();

  // Calculate today's start boundary in Nepal Standard Time (UTC+5:45).
  // NST is a fixed offset — no DST — so this is safe to hardcode.
  const NEPAL_OFFSET_MS = 5.75 * 3600_000; // 5 hours 45 minutes
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const nepalNow = new Date(utcMs + NEPAL_OFFSET_MS);

  // Build "start of today" in Nepal time, then convert back to UTC
  const todayStartNepal = new Date(nepalNow);
  todayStartNepal.setUTCHours(0, 0, 0, 0);
  const todayStartUTC = new Date(todayStartNepal.getTime() - NEPAL_OFFSET_MS);

  const { data, error } = await supabase
    .from("invoices")
    .select("total_amount")
    .eq("store_id", tenant.store.id)
    .gte("created_at", todayStartUTC.toISOString());

  if (error) {
    throw new Error("Failed to load dashboard metrics: " + error.message);
  }

  const invoices = data || [];
  return {
    todaySalesSum: invoices.reduce((sum, inv) => sum + inv.total_amount, 0),
    todayInvoicesCount: invoices.length,
  };
}
