import { Eye } from "lucide-react";
import type { Invoice } from "@/lib/store/useAppStore";
import {
  formatInvoiceCurrency,
  formatInvoiceDate,
  formatInvoiceSeller,
} from "@/features/invoices/utils/invoice-history-utils";

type InvoiceHistoryMobileCardsProps = {
  invoices: Invoice[];
  onReprint: (invoice: Invoice) => void | Promise<void>;
};

export function InvoiceHistoryMobileCards({ invoices, onReprint }: InvoiceHistoryMobileCardsProps) {
  return (
    <div className="block md:hidden divide-y divide-border">
      {invoices.map((invoice) => {
        const seller = formatInvoiceSeller(invoice);

        return (
          <div key={invoice.id} className="p-4 space-y-3 hover:bg-muted/5 transition-colors">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-foreground">{invoice.invoice_number}</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary border border-primary/10">
                {invoice.payment_method}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground font-medium">Customer</p>
                <p className="font-semibold text-foreground truncate">
                  {invoice.customer_name || "General Customer"}
                </p>
                {invoice.customer_phone && (
                  <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                    {invoice.customer_phone}
                  </p>
                )}
              </div>
              <div>
                <p className="text-muted-foreground font-medium">Date & Time</p>
                <p className="text-foreground mt-0.5">{formatInvoiceDate(invoice.created_at)}</p>
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
                <p className="font-bold text-foreground text-sm mt-0.5">
                  {formatInvoiceCurrency(invoice.total_amount)}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/50">
              <div>
                <p className="text-muted-foreground font-medium">Discount</p>
                <p className="font-mono text-red-500 font-bold mt-0.5">
                  {invoice.discount_amount > 0
                    ? `- Rs. ${invoice.discount_amount.toLocaleString()}`
                    : "Rs. 0"}
                </p>
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => onReprint(invoice)}
                  className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold border border-border hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground transition-all h-11"
                >
                  <Eye className="w-4 h-4" />
                  <span>View Receipt</span>
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
