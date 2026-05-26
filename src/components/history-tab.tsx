"use client";

import React, { useState } from "react";
import { useAppStore, Invoice } from "@/lib/store/useAppStore";
import { Search, Eye, History, Calendar, CreditCard, DollarSign, Layers, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 20;

export default function HistoryTab() {
  const { invoices, products, variants, invoiceItems, setActiveInvoice } = useAppStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("All Time");
  const [currentPage, setCurrentPage] = useState(1);

  const formatCurrency = (amount: number) => {
    return `Rs. ${amount.toLocaleString()}`;
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString("en-NP", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const formatSeller = (invoice: Invoice) => ({
    name: invoice.sold_by_name?.trim() || "Not recorded",
    role:
      invoice.sold_by_role === "owner"
        ? "Owner"
        : invoice.sold_by_role === "cashier"
          ? "Cashier"
          : null,
  });

  // Page is reset to 1 in the respective filter change handlers to avoid effect-based cascading renders

  // Filter invoices based on customer details, invoice number, payment method, and date boundaries
  const filteredInvoices = invoices.filter((inv) => {
    const query = searchQuery.toLowerCase();
    const matchesNumber = inv.invoice_number.toLowerCase().includes(query);
    const matchesName = inv.customer_name?.toLowerCase().includes(query) ?? false;
    const matchesPhone = inv.customer_phone?.toLowerCase().includes(query) ?? false;
    const matchesMethod = inv.payment_method.toLowerCase().includes(query);
    const matchesSellerName = inv.sold_by_name?.toLowerCase().includes(query) ?? false;
    const matchesSellerRole = inv.sold_by_role?.toLowerCase().includes(query) ?? false;
    const matchesSearch =
      searchQuery === "" ||
      matchesNumber ||
      matchesName ||
      matchesPhone ||
      matchesMethod ||
      matchesSellerName ||
      matchesSellerRole;

    const matchesPaymentMethod =
      paymentMethodFilter === "All" ||
      inv.payment_method.toLowerCase() === paymentMethodFilter.toLowerCase();

    let matchesDate = true;
    if (dateFilter !== "All Time") {
      const invDate = new Date(inv.created_at);
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      if (dateFilter === "Today") {
        matchesDate = invDate >= startOfToday && invDate <= endOfToday;
      } else if (dateFilter === "Yesterday") {
        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);
        const endOfYesterday = new Date(endOfToday);
        endOfYesterday.setDate(endOfYesterday.getDate() - 1);
        matchesDate = invDate >= startOfYesterday && invDate <= endOfYesterday;
      } else if (dateFilter === "This Week") {
        const startOfWeek = new Date(startOfToday);
        const day = startOfWeek.getDay();
        startOfWeek.setDate(startOfWeek.getDate() - day);
        matchesDate = invDate >= startOfWeek && invDate <= endOfToday;
      }
    }

    return matchesSearch && matchesPaymentMethod && matchesDate;
  });

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedInvoices = filteredInvoices.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const handleReprint = async (invoice: Invoice) => {
    let items = invoiceItems[invoice.id] || [];
    
    if (items.length === 0) {
      const { fetchInvoiceItems } = useAppStore.getState();
      items = await fetchInvoiceItems(invoice.id);
    }

    const filledItems = items.map(item => {
      if (!item.variant_id) {
        return {
          ...item,
          product_name: item.custom_name ?? "Custom Item",
          size: "-",
          color: "-",
        };
      }
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

  // Compute dynamic reconciliation statistics for currently filtered view
  const totalSales = filteredInvoices.reduce((sum, inv) => sum + inv.total_amount, 0);
  const totalCount = filteredInvoices.length;

  const methodBreakdown = filteredInvoices.reduce((acc, inv) => {
    let method = "Cash";
    const lm = inv.payment_method.toLowerCase();
    if (lm === "esewa") method = "eSewa";
    else if (lm === "khalti") method = "Khalti";
    else if (lm === "fonepay") method = "Fonepay";
    else if (lm === "cash") method = "Cash";
    acc[method] = (acc[method] || 0) + inv.total_amount;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <div>
        <h1 className="font-outfit font-extrabold text-2xl sm:text-3xl text-foreground tracking-tight">
          Invoice History
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          View, search, and reprint past invoice records with advanced period filtering.
        </p>
      </div>

      {/* ADVANCED FILTERS PANEL */}
      <div className="bg-card border border-border rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* SEARCH FIELD */}
          <div className="relative">
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              Search Invoice
            </label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search No, Name, Phone or Method..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="block w-full pl-10 pr-4 h-11 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 transition-all shadow-sm"
              />
            </div>
          </div>

          {/* DATE PRESET FILTER */}
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              Date Period
            </label>
            <div className="relative">
              <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <select
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="block w-full pl-10 pr-4 h-11 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-slate-900 dark:text-white appearance-none cursor-pointer shadow-sm transition-all"
              >
                <option value="All Time">All Time</option>
                <option value="Today">Today (Nepal local time)</option>
                <option value="Yesterday">Yesterday</option>
                <option value="This Week">This Week</option>
              </select>
            </div>
          </div>

          {/* PAYMENT CHANNEL PILLS */}
          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              Payment Channel
            </label>
            <div className="flex flex-wrap gap-2">
              {["All", "Cash", "eSewa", "Khalti", "Fonepay"].map((method) => {
                const isActive = paymentMethodFilter === method;
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => {
                      setPaymentMethodFilter(method);
                      setCurrentPage(1);
                    }}
                    className={`h-11 px-4 text-xs font-semibold rounded-xl border transition-all ${
                      isActive
                        ? "bg-primary border-primary text-primary-foreground shadow-sm"
                        : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-900"
                    }`}
                  >
                    {method}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* RECONCILIATION SUMMARY STATS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Revenue</p>
            <h3 className="text-xl sm:text-2xl font-black text-foreground font-mono">{formatCurrency(totalSales)}</h3>
            <p className="text-[10px] text-muted-foreground">For currently filtered view</p>
          </div>
          <div className="p-3 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/10">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Receipts</p>
            <h3 className="text-xl sm:text-2xl font-black text-foreground font-mono">{totalCount} bills</h3>
            <p className="text-[10px] text-muted-foreground">
              {filteredInvoices.length === invoices.length ? "All transactions" : "Filtered subset"}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-primary/10 text-primary border border-primary/10">
            <Layers className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Cash Drawer</p>
            <h3 className="text-xl sm:text-2xl font-black text-amber-500 font-mono">{formatCurrency(methodBreakdown["Cash"] || 0)}</h3>
            <p className="text-[10px] text-muted-foreground">Collected in hand</p>
          </div>
          <div className="p-3 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/10">
            <CreditCard className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Digital Channels</p>
            <h3 className="text-xl sm:text-2xl font-black text-indigo-400 font-mono">
              {formatCurrency((methodBreakdown["eSewa"] || 0) + (methodBreakdown["Khalti"] || 0) + (methodBreakdown["Fonepay"] || 0))}
            </h3>
            <p className="text-[10px] text-muted-foreground">eSewa, Khalti, Fonepay sum</p>
          </div>
          <div className="p-3 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/10">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* INVOICES TABLE/LIST CARD */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {filteredInvoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <History className="w-12 h-12 text-muted-foreground mb-3 opacity-30" />
            <h3 className="text-base font-bold text-foreground">No Invoices Matches</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              No bills found matching your search. Clear input or checkout a sale in POS to populate this log.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/20 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <th className="px-5 py-3">Invoice No</th>
                    <th className="px-5 py-3">Customer Details</th>
                    <th className="px-5 py-3">Sold By</th>
                    <th className="px-5 py-3">Date & Time</th>
                    <th className="px-5 py-3 text-right">Discount</th>
                    <th className="px-5 py-3 text-right">Net Total</th>
                    <th className="px-5 py-3 text-center">Method</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedInvoices.map((inv) => {
                    const seller = formatSeller(inv);

                    return (
                      <tr key={inv.id} className="hover:bg-muted/10 transition-colors">
                        <td className="px-5 py-4 font-mono text-xs font-bold text-foreground">{inv.invoice_number}</td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-semibold text-foreground leading-normal">{inv.customer_name || "General Customer"}</p>
                          {inv.customer_phone && <p className="text-xs text-muted-foreground mt-0.5 font-mono">{inv.customer_phone}</p>}
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-semibold text-foreground leading-normal">{seller.name}</p>
                          {seller.role && <p className="text-xs text-muted-foreground mt-0.5">{seller.role}</p>}
                        </td>
                        <td className="px-5 py-4 text-xs text-muted-foreground">{formatDate(inv.created_at)}</td>
                        <td className="px-5 py-4 text-right font-mono text-xs text-red-500 font-bold">
                          {inv.discount_amount > 0 ? `- Rs. ${inv.discount_amount.toLocaleString()}` : "Rs. 0"}
                        </td>
                        <td className="px-5 py-4 text-right font-bold text-foreground">{formatCurrency(inv.total_amount)}</td>
                        <td className="px-5 py-4 text-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary border border-primary/10">{inv.payment_method}</span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button onClick={() => handleReprint(inv)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-border hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground transition-all">
                            <Eye className="w-3.5 h-3.5" />
                            <span>View & Reprint</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card Stack View */}
            <div className="block md:hidden divide-y divide-border">
              {paginatedInvoices.map((inv) => {
                const seller = formatSeller(inv);

                return (
                  <div key={inv.id} className="p-4 space-y-3 hover:bg-muted/5 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-foreground">{inv.invoice_number}</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary border border-primary/10">{inv.payment_method}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground font-medium">Customer</p>
                        <p className="font-semibold text-foreground truncate">{inv.customer_name || "General Customer"}</p>
                        {inv.customer_phone && <p className="font-mono text-[10px] text-muted-foreground mt-0.5">{inv.customer_phone}</p>}
                      </div>
                      <div>
                        <p className="text-muted-foreground font-medium">Date & Time</p>
                        <p className="text-foreground mt-0.5">{formatDate(inv.created_at)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/50">
                      <div>
                        <p className="text-muted-foreground font-medium">Sold By</p>
                        <p className="font-semibold text-foreground truncate">{seller.name}</p>
                        {seller.role && <p className="text-[10px] text-muted-foreground mt-0.5">{seller.role}</p>}
                      </div>
                      <div>
                        <p className="text-muted-foreground font-medium">Net Total</p>
                        <p className="font-bold text-foreground text-sm mt-0.5">{formatCurrency(inv.total_amount)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/50">
                      <div>
                        <p className="text-muted-foreground font-medium">Discount</p>
                        <p className="font-mono text-red-500 font-bold mt-0.5">{inv.discount_amount > 0 ? `- Rs. ${inv.discount_amount.toLocaleString()}` : "Rs. 0"}</p>
                      </div>
                      <div className="flex items-end">
                        <button onClick={() => handleReprint(inv)} className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold border border-border hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground transition-all h-11">
                          <Eye className="w-4 h-4" />
                          <span>View Receipt</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* LOAD MORE FROM DATABASE BUTTON */}
            {invoices.length >= 50 && (
              <div className="flex justify-center py-4 border-t border-border bg-muted/5">
                <button
                  onClick={async () => {
                    const { loadMoreInvoices } = useAppStore.getState();
                    await loadMoreInvoices();
                  }}
                  className="inline-flex items-center justify-center h-10 px-6 text-xs font-semibold bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground hover:text-foreground rounded-lg transition-all active:scale-[0.98]"
                >
                  Load More from Database
                </button>
              </div>
            )}

            {/* PAGINATION CONTROLS */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/10">
                <p className="text-xs text-muted-foreground">
                  Showing {((safePage - 1) * PAGE_SIZE) + 1}–{Math.min(safePage * PAGE_SIZE, filteredInvoices.length)} of {filteredInvoices.length} invoices
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all disabled:opacity-30 disabled:pointer-events-none h-11"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Previous</span>
                  </button>
                  <span className="text-xs font-bold text-foreground tabular-nums min-w-[4rem] text-center">
                    {safePage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={safePage >= totalPages}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all disabled:opacity-30 disabled:pointer-events-none h-11"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
