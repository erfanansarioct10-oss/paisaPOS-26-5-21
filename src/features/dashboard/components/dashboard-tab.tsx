"use client";

import { useRouter } from "next/navigation";
import { useAppStore, type Invoice } from "@/lib/store/useAppStore";
import { DashboardMetricCards } from "./dashboard-metric-cards";
import { DashboardPageHeader } from "./dashboard-page-header";
import { DashboardRecentInvoicesPanel } from "./dashboard-recent-invoices-panel";
import { DashboardStockWarningsPanel } from "./dashboard-stock-warnings-panel";
import { buildDashboardMetrics } from "@/features/dashboard/utils/dashboard-metrics";
import { resolveReceiptInvoiceItems } from "@/features/invoices/utils/receipt-invoice-items";

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

  const {
    lowStockCount,
    lowStockVariants,
    outOfStockCount,
    productCount,
    todayInvoicesCount,
    todaySalesSum,
    variantCount,
  } = buildDashboardMetrics({ invoices, products, variants });

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
