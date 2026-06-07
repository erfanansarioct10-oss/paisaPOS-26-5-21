import { ArrowRight, Eye, ShoppingBag } from "lucide-react";
import type { Invoice } from "@/lib/store/useAppStore";
import {
  formatDashboardCurrency,
  formatDashboardDate,
  formatDashboardSeller,
} from "./dashboard-formatters";

type DashboardRecentInvoicesPanelProps = {
  invoices: Invoice[];
  onViewAll: () => void;
  onViewReceipt: (invoice: Invoice) => void | Promise<void>;
};

export function DashboardRecentInvoicesPanel({
  invoices,
  onViewAll,
  onViewReceipt,
}: DashboardRecentInvoicesPanelProps) {
  return (
    <div className="lg:col-span-2 bg-card border border-border rounded-xl shadow-sm flex flex-col">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Recent Invoices</h3>
        <button
          onClick={onViewAll}
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
            <p className="text-xs text-muted-foreground mt-0.5">
              Click &quot;New Sale&quot; to process your first bill.
            </p>
          </div>
        ) : (
          <table className="w-full min-w-[600px] text-left text-sm border-collapse">
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
              {invoices.slice(0, 5).map((invoice) => (
                <tr key={invoice.id} className="hover:bg-muted/10 transition-colors">
                  <td className="px-5 py-3.5 font-mono text-xs font-bold text-foreground">
                    {invoice.invoice_number}
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="text-sm font-medium text-foreground">
                      {invoice.customer_name || "General Customer"}
                    </p>
                    {invoice.customer_phone && (
                      <p className="text-xs text-muted-foreground">{invoice.customer_phone}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                      {formatDashboardSeller(invoice)}
                    </p>
                  </td>
                  <td className="px-5 py-3.5 font-bold text-foreground">
                    {formatDashboardCurrency(invoice.total_amount)}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary border border-primary/10">
                      {invoice.payment_method}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs text-muted-foreground">
                    {formatDashboardDate(invoice.created_at)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => onViewReceipt(invoice)}
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
  );
}
