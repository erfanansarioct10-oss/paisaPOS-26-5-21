import { Eye } from "lucide-react";
import type { Invoice } from "@/lib/store/useAppStore";
import {
  formatInvoiceCurrency,
  formatInvoiceDate,
  formatInvoiceSeller,
} from "@/features/invoices/utils/invoice-history-utils";

type InvoiceHistoryTableProps = {
  invoices: Invoice[];
  onReprint: (invoice: Invoice) => void | Promise<void>;
};

export function InvoiceHistoryTable({ invoices, onReprint }: InvoiceHistoryTableProps) {
  return (
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
          {invoices.map((invoice) => {
            const seller = formatInvoiceSeller(invoice);

            return (
              <tr key={invoice.id} className="hover:bg-muted/10 transition-colors">
                <td className="px-5 py-4 font-mono text-xs font-bold text-foreground">
                  {invoice.invoice_number}
                </td>
                <td className="px-5 py-4">
                  <p className="text-sm font-semibold text-foreground leading-normal">
                    {invoice.customer_name || "General Customer"}
                  </p>
                  {invoice.customer_phone && (
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">{invoice.customer_phone}</p>
                  )}
                </td>
                <td className="px-5 py-4">
                  <p className="text-sm font-semibold text-foreground leading-normal">{seller.name}</p>
                  {seller.role && <p className="text-xs text-muted-foreground mt-0.5">{seller.role}</p>}
                </td>
                <td className="px-5 py-4 text-xs text-muted-foreground">
                  {formatInvoiceDate(invoice.created_at)}
                </td>
                <td className="px-5 py-4 text-right font-mono text-xs text-red-500 font-bold">
                  {invoice.discount_amount > 0
                    ? `- Rs. ${invoice.discount_amount.toLocaleString()}`
                    : "Rs. 0"}
                </td>
                <td className="px-5 py-4 text-right font-bold text-foreground">
                  {formatInvoiceCurrency(invoice.total_amount)}
                </td>
                <td className="px-5 py-4 text-center">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary border border-primary/10">
                    {invoice.payment_method}
                  </span>
                </td>
                <td className="px-5 py-4 text-right">
                  <button
                    onClick={() => onReprint(invoice)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-border hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground transition-all"
                  >
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
  );
}
