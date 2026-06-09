"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore, type Invoice } from "@/lib/store/useAppStore";
import { DashboardMetricCards } from "./dashboard-metric-cards";
import { DashboardPageHeader } from "./dashboard-page-header";
import { DashboardRecentInvoicesPanel } from "./dashboard-recent-invoices-panel";
import { DashboardStockWarningsPanel } from "./dashboard-stock-warnings-panel";
import { buildDashboardMetrics } from "@/features/dashboard/utils/dashboard-metrics";
import { resolveReceiptInvoiceItems } from "@/features/invoices/utils/receipt-invoice-items";
import { fetchTodayDashboardMetrics } from "@/features/dashboard/server/dashboard-actions";
import { DashboardSkeleton } from "./dashboard-skeleton";

export default function DashboardTab() {
  const router = useRouter();
  const {
    invoices,
    products,
    variants,
    store,
    setActiveInvoice,
    invoiceItems,
  } = useAppStore();

  // ---------------------------------------------------------------------------
  // Server-side accurate today's metrics (no 50-record cap)
  // ---------------------------------------------------------------------------
  const [serverMetrics, setServerMetrics] = useState<{
    todaySalesSum: number;
    todayInvoicesCount: number;
  } | null>(null);

  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    fetchTodayDashboardMetrics()
      .then((data) => {
        if (!cancelled) setServerMetrics(data);
      })
      .catch((err) => console.error("Failed to fetch dashboard metrics:", err));
    return () => {
      cancelled = true;
    };
    // Re-fetch when invoices change (after checkout or realtime sync)
  }, [invoices.length, store]);

  // ---------------------------------------------------------------------------
  // Client-side metrics (instant fallback; also provides stock/product counts)
  // ---------------------------------------------------------------------------
  const {
    lowStockCount,
    lowStockVariants,
    outOfStockCount,
    productCount,
    todayInvoicesCount: clientTodayCount,
    todaySalesSum: clientTodaySum,
    variantCount,
  } = useMemo(
    () => buildDashboardMetrics({ invoices, products, variants }),
    [invoices, products, variants],
  );

  // Use server metrics when available; fall back to client for instant render
  const todaySalesSum = serverMetrics?.todaySalesSum ?? clientTodaySum;
  const todayInvoicesCount = serverMetrics?.todayInvoicesCount ?? clientTodayCount;

  const handleViewReceipt = async (invoice: Invoice) => {
    const { fetchInvoiceItems } = useAppStore.getState();
    const filledItems = await resolveReceiptInvoiceItems({
      fetchInvoiceItems,
      invoiceId: invoice.id,
      invoiceItemsByInvoiceId: invoiceItems,
      products,
      variants,
    });

    setActiveInvoice(invoice, filledItems);
  };

  if (!store) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-6">
      <DashboardPageHeader storeName={store?.name} onNewSale={() => router.push("/billing")} />

      <DashboardMetricCards
        todaySalesSum={todaySalesSum}
        todayInvoicesCount={todayInvoicesCount}
        lowStockCount={lowStockCount}
        outOfStockCount={outOfStockCount}
        productCount={productCount}
        variantCount={variantCount}
        store={store}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <DashboardRecentInvoicesPanel
          invoices={invoices}
          onViewAll={() => router.push("/invoices")}
          onViewReceipt={handleViewReceipt}
        />
        <DashboardStockWarningsPanel
          lowStockVariants={lowStockVariants}
          lowStockCount={lowStockCount}
          products={products}
        />
      </div>
    </div>
  );
}
