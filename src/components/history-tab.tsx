"use client";

import React, { useState } from "react";
import { useAppStore, Invoice } from "@/lib/store/useAppStore";
import { Search, Eye, History } from "lucide-react";

export default function HistoryTab() {
  const { invoices, products, variants, invoiceItems, setActiveInvoice } = useAppStore();
  const [searchQuery, setSearchQuery] = useState("");

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

  // Filter invoices based on customer details or invoice number
  const filteredInvoices = invoices.filter((inv) => {
    const query = searchQuery.toLowerCase();
    const matchesNumber = inv.invoice_number.toLowerCase().includes(query);
    const matchesName = inv.customer_name?.toLowerCase().includes(query) ?? false;
    const matchesPhone = inv.customer_phone?.toLowerCase().includes(query) ?? false;
    const matchesMethod = inv.payment_method.toLowerCase().includes(query);

    return matchesNumber || matchesName || matchesPhone || matchesMethod;
  });

  const handleReprint = (invoice: Invoice) => {
    const items = invoiceItems[invoice.id] || [];

    // Map dynamic description fields
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
      <div>
        <h1 className="font-outfit font-extrabold text-2xl sm:text-3xl text-foreground tracking-tight">
          Invoice History
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          View, search, and reprint past invoice records.
        </p>
      </div>

      {/* SEARCH BAR */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by Invoice No, Name, Phone or Method..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="block w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-white placeholder-slate-600 transition-all shadow-sm"
        />
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
                    <th className="px-5 py-3">Date & Time</th>
                    <th className="px-5 py-3 text-right">Discount</th>
                    <th className="px-5 py-3 text-right">Net Total</th>
                    <th className="px-5 py-3 text-center">Method</th>
                    <th className="px-5 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-muted/10 transition-colors">
                      <td className="px-5 py-4 font-mono text-xs font-bold text-foreground">
                        {inv.invoice_number}
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-foreground leading-normal">
                          {inv.customer_name || "General Customer"}
                        </p>
                        {inv.customer_phone && (
                          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                            {inv.customer_phone}
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4 text-xs text-muted-foreground">
                        {formatDate(inv.created_at)}
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-xs text-red-500 font-bold">
                        {inv.discount_amount > 0 ? `- Rs. ${inv.discount_amount.toLocaleString()}` : "Rs. 0"}
                      </td>
                      <td className="px-5 py-4 text-right font-bold text-foreground">
                        {formatCurrency(inv.total_amount)}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary border border-primary/10">
                          {inv.payment_method}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => handleReprint(inv)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-border hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground transition-all"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View & Reprint</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card Stack View */}
            <div className="block md:hidden divide-y divide-border">
              {filteredInvoices.map((inv) => (
                <div key={inv.id} className="p-4 space-y-3 hover:bg-muted/5 transition-colors">
                  {/* Card Header: Invoice No & Method */}
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-foreground">
                      {inv.invoice_number}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary border border-primary/10">
                      {inv.payment_method}
                    </span>
                  </div>

                  {/* Customer and Date Details */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground font-medium">Customer</p>
                      <p className="font-semibold text-foreground truncate">
                        {inv.customer_name || "General Customer"}
                      </p>
                      {inv.customer_phone && (
                        <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                          {inv.customer_phone}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-muted-foreground font-medium">Date & Time</p>
                      <p className="text-foreground mt-0.5">
                        {formatDate(inv.created_at)}
                      </p>
                    </div>
                  </div>

                  {/* Financial Details */}
                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/50">
                    <div>
                      <p className="text-muted-foreground font-medium">Discount</p>
                      <p className="font-mono text-red-500 font-bold mt-0.5">
                        {inv.discount_amount > 0 ? `- Rs. ${inv.discount_amount.toLocaleString()}` : "Rs. 0"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground font-medium">Net Total</p>
                      <p className="font-bold text-foreground text-sm mt-0.5">
                        {formatCurrency(inv.total_amount)}
                      </p>
                    </div>
                  </div>

                  {/* Touch Action Target */}
                  <div className="pt-1">
                    <button
                      onClick={() => handleReprint(inv)}
                      className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold border border-border hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground transition-all h-10"
                    >
                      <Eye className="w-4 h-4" />
                      <span>View & Reprint Receipt</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
