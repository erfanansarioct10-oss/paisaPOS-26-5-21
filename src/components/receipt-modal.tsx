"use client";

import React from "react";
import { useAppStore } from "@/lib/store/useAppStore";
import { X, Printer, CheckCircle } from "lucide-react";

export default function ReceiptModal() {
  const { activeInvoice, activeInvoiceItems, store, closeReceiptModal } = useAppStore();

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeReceiptModal();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeReceiptModal]);

  if (!activeInvoice || !activeInvoiceItems) return null;

  // Format date nicely for Nepal (Time & Date)
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

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const subtotal = activeInvoiceItems.reduce((sum, item) => sum + item.subtotal, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 overflow-y-auto">
      {/* MODAL WRAPPER */}
      <div className="bg-card border border-border rounded-xl w-full max-w-md flex flex-col shadow-lg max-h-[90vh]">
        {/* HEADER (Non-printable) */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border print:hidden">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-500" />
            <span className="font-semibold text-foreground">Sale Completed</span>
          </div>
          <button
            onClick={closeReceiptModal}
            className="p-1 rounded text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* RECEIPT VIEWPORT */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 font-sans">
          {/* Printable Container */}
          <div className="print-area bg-white text-black p-3 sm:p-4 border border-slate-100 rounded-md max-w-[80mm] mx-auto shadow-sm print:border-none print:shadow-none print:p-0 print:rounded-none print:mx-0">
            {/* Store branding info */}
            <div className="text-center pb-4 border-b border-dashed border-slate-300">
              <h2 className="font-outfit font-extrabold text-xl tracking-tight uppercase">
                {store?.name || "KTM Streetwear"}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {store?.address || "Civil Mall, Kathmandu"}
              </p>
              <p className="text-xs text-slate-500">Tel: {store?.phone || "9851012345"}</p>
              {store?.pan_vat && (
                <p className="text-[10px] font-mono mt-1 text-slate-600">
                  PAN/VAT: {store.pan_vat}
                </p>
              )}
            </div>

            {/* Invoice meta info */}
            <div className="py-3 text-xs space-y-1 border-b border-dashed border-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-500">Invoice No:</span>
                <span className="font-mono font-semibold">{activeInvoice.invoice_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date:</span>
                <span>{formatDate(activeInvoice.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Method:</span>
                <span className="font-medium">{activeInvoice.payment_method}</span>
              </div>

              {/* Customer details */}
              {(activeInvoice.customer_name || activeInvoice.customer_phone) && (
                <div className="pt-2 mt-1 border-t border-slate-100 text-[11px]">
                  <p className="font-semibold text-slate-700">Bill To:</p>
                  <p className="truncate">
                    {activeInvoice.customer_name || "General Customer"}
                    {activeInvoice.customer_phone && ` (${activeInvoice.customer_phone})`}
                  </p>
                </div>
              )}
            </div>

            {/* Line items table */}
            <div className="py-4 border-b border-dashed border-slate-300">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-dashed border-slate-200">
                    <th className="pb-2 font-medium">Item</th>
                    <th className="pb-2 text-center font-medium">Qty</th>
                    <th className="pb-2 text-right font-medium">Price</th>
                    <th className="pb-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeInvoiceItems.map((item, idx) => (
                    <tr key={item.id || idx}>
                      <td className="py-2.5 pr-2">
                        <p className="font-medium text-slate-800 leading-tight">
                          {item.product_name || "Jeans"}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          Size: {item.size || "-"} | Color: {item.color || "-"}
                        </p>
                      </td>
                      <td className="py-2.5 text-center text-slate-600">{item.quantity}</td>
                      <td className="py-2.5 text-right text-slate-600">
                        Rs. {item.unit_price.toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right font-medium text-slate-900">
                        Rs. {item.subtotal.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Receipt Summary */}
            <div className="py-3 text-xs space-y-1.5 border-b border-dashed border-slate-300">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span>Rs. {subtotal.toLocaleString()}</span>
              </div>
              {activeInvoice.discount_amount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Discount:</span>
                  <span>- Rs. {activeInvoice.discount_amount.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-extrabold text-slate-900 pt-1.5 border-t border-dashed border-slate-200">
                <span>Net Total:</span>
                <span>Rs. {activeInvoice.total_amount.toLocaleString()}</span>
              </div>
            </div>

            {/* Footer greeting details */}
            <div className="text-center pt-4 text-[10px] text-slate-500 space-y-1">
              <p className="font-medium">Thank you for your purchase!</p>
              <p>Items can be exchanged within 7 days with invoice.</p>
              <p className="font-mono text-[8px] text-slate-400 mt-2">
                Powered by PaisaPOS
              </p>
            </div>
          </div>
        </div>

        {/* ACTIONS BUTTONS (Non-printable) */}
        <div className="flex gap-3 px-5 py-4 border-t border-border bg-muted/30 print:hidden">
          <button
            onClick={closeReceiptModal}
            className="flex-1 px-4 py-2.5 border border-border text-sm font-semibold rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
          >
            Close Terminal
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:opacity-95 shadow transition-all focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <Printer className="w-4 h-4" />
            <span>Print Invoice</span>
          </button>
        </div>
      </div>
    </div>
  );
}
