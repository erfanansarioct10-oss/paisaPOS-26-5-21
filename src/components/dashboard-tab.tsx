"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useAppStore, Invoice } from "@/lib/store/useAppStore";
import {
  TrendingUp,
  AlertTriangle,
  Package,
  Plus,
  ShoppingBag,
  ArrowRight,
  Eye,
  Store,
} from "lucide-react";

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



  // -------------------------------------------------------------------------
  // FINANCIALS MATH
  // -------------------------------------------------------------------------
  
  // Filter invoices completed today (UTC-agnostic local day check)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayInvoices = invoices.filter(
    (inv) => new Date(inv.created_at) >= todayStart
  );

  const todaySalesSum = todayInvoices.reduce((sum, inv) => sum + inv.total_amount, 0);
  const todayInvoicesCount = todayInvoices.length;

  // Calculate low stock active counts
  // A variant is low stock if its stock <= parent product's low_stock_threshold
  const lowStockVariants = variants.filter((v) => {
    const parent = products.find((p) => p.id === v.product_id);
    const threshold = parent?.low_stock_threshold ?? 5;
    const stock = v.stock ?? 0;
    return stock <= threshold;
  });

  const lowStockCount = lowStockVariants.length;
  const outOfStockCount = variants.filter((v) => (v.stock ?? 0) === 0).length;

  // Format currencies
  const formatCurrency = (amount: number) => {
    return `Rs. ${amount.toLocaleString()}`;
  };

  // Format Date for Nepal display
  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString("en-NP", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  // View receipt detail
  const handleViewReceipt = (invoice: Invoice) => {
    // Search cached line items or map from variants
    const items = invoiceItems[invoice.id] || [];
    
    // If empty (e.g. freshly fetched from DB), attempt to construct from state variants
    const filledItems = items.map(item => {
      const v = variants.find(vr => vr.id === item.variant_id);
      const p = products.find(pr => pr.id === v?.product_id);
      return {
        ...item,
        product_name: p?.name ?? "Clothing Item",
        size: v?.size ?? "-",
        color: v?.color ?? "-",
      };
    });

    setActiveInvoice(invoice, filledItems);
  };

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-outfit font-extrabold text-2xl sm:text-3xl text-foreground tracking-tight">
            Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Operational overview for <span className="font-semibold text-foreground">{store?.name || "KTM Streetwear"}</span>.
          </p>
        </div>

        <button
          onClick={() => router.push("/billing")}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:opacity-95 shadow transition-all active:scale-[0.99] shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Sale (POS)</span>
        </button>
      </div>

      {/* METRIC CARD WIDGETS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* TODAY SALES CARD */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Today&apos;s Sales
            </span>
            <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold text-foreground">
              {formatCurrency(todaySalesSum)}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {todayInvoicesCount} transaction{todayInvoicesCount !== 1 ? "s" : ""} completed today
            </p>
          </div>
        </div>

        {/* ACTIVE LOW STOCK CARD */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Low Stock Alerts
            </span>
            <div className={`p-2 rounded-lg ${lowStockCount > 0 ? "bg-amber-500/10 text-amber-500" : "bg-slate-500/10 text-slate-400"}`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold text-foreground">{lowStockCount}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {outOfStockCount} variant{outOfStockCount !== 1 ? "s are" : " is"} completely out-of-stock
            </p>
          </div>
        </div>

        {/* TOTAL ACTIVE PRODUCTS CARD */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Products
            </span>
            <div className="p-2 bg-primary/10 text-primary rounded-lg">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold text-foreground">{products.length}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Tracking {variants.length} unique size/color variants
            </p>
          </div>
        </div>

        {/* STORE INFO CARD */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Store Info
            </span>
            <div className="p-2 bg-slate-500/10 text-muted-foreground rounded-lg">
              <Store className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-sm font-bold text-foreground truncate">
              {store?.name || "KTM Boutique"}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 truncate">
              PAN/VAT: {store?.pan_vat || "Not Specified"}
            </p>
          </div>
        </div>
      </div>

      {/* RECENT ACTIVITY & LOW STOCK ALERTS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* RECENT INVOICES PANEL */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl shadow-sm flex flex-col">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Recent Invoices</h3>
            <button
              onClick={() => router.push("/invoices")}
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-x-auto">
            {invoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ShoppingBag className="w-8 h-8 text-muted-foreground mb-2 opacity-40" />
                <p className="text-sm font-semibold text-muted-foreground">No invoices generated yet</p>
                <p className="text-xs text-muted-foreground mt-0.5">Click &quot;New Sale&quot; to process your first bill.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/20 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <th className="px-5 py-3">Invoice No</th>
                    <th className="px-5 py-3">Customer</th>
                    <th className="px-5 py-3">Amount</th>
                    <th className="px-5 py-3">Method</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {invoices.slice(0, 5).map((inv) => (
                    <tr key={inv.id} className="hover:bg-muted/10 transition-colors">
                      <td className="px-5 py-3.5 font-mono text-xs font-bold text-foreground">
                        {inv.invoice_number}
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="text-sm font-medium text-foreground">
                          {inv.customer_name || "General Customer"}
                        </p>
                        {inv.customer_phone && (
                          <p className="text-xs text-muted-foreground">{inv.customer_phone}</p>
                        )}
                      </td>
                      <td className="px-5 py-3.5 font-bold text-foreground">
                        {formatCurrency(inv.total_amount)}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary border border-primary/10">
                          {inv.payment_method}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-muted-foreground">
                        {formatDate(inv.created_at)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => handleViewReceipt(inv)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold border border-border hover:bg-secondary rounded text-muted-foreground hover:text-foreground transition-all"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Reprint</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* LOW STOCK LEDGER SIDEBAR */}
        <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col p-5">
          <div className="pb-3 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Stock Warnings</h3>
            <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 text-xs font-bold border border-amber-500/10">
              {lowStockCount} alert{lowStockCount !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto mt-4 space-y-3 max-h-[360px] pr-1">
            {lowStockVariants.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center h-full">
                <CheckCircleSkeleton className="w-8 h-8 text-emerald-500 mb-2 opacity-50" />
                <p className="text-sm font-semibold text-muted-foreground">All Stock Healthy</p>
                <p className="text-xs text-muted-foreground mt-0.5">All variants are above low-stock limits.</p>
              </div>
            ) : (
              lowStockVariants.map((v) => {
                const parent = products.find((p) => p.id === v.product_id);
                const isOutOfStock = (v.stock ?? 0) === 0;

                return (
                  <div
                    key={v.id}
                    className={`flex items-center justify-between p-3 rounded-lg border text-xs leading-normal ${
                      isOutOfStock
                        ? "bg-red-500/5 border-red-500/20 text-red-700 dark:text-red-400"
                        : "bg-amber-500/5 border-amber-500/10 text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="font-bold truncate text-foreground">
                        {parent?.name || "Product SKU"}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        {v.sku} (Size {v.size} / {v.color})
                      </span>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="font-bold text-sm text-foreground">
                        {v.stock ?? 0}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {isOutOfStock ? "Out of Stock" : "Low Stock"}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
        </div>
      </div>
    </div>
    </div>
  );
}

// Simple internal icon helper
function CheckCircleSkeleton(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      {...props}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
