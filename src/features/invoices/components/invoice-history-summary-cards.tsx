import { CreditCard, DollarSign, Layers, Sparkles } from "lucide-react";
import { formatInvoiceCurrency } from "@/features/invoices/utils/invoice-history-utils";

type InvoiceHistorySummaryCardsProps = {
  totalSales: number;
  totalCount: number;
  methodBreakdown: Record<string, number>;
  isAllTransactions: boolean;
};

export function InvoiceHistorySummaryCards({
  totalSales,
  totalCount,
  methodBreakdown,
  isAllTransactions,
}: InvoiceHistorySummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-sm">
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Revenue</p>
          <h3 className="text-xl sm:text-2xl font-black text-foreground font-mono">
            {formatInvoiceCurrency(totalSales)}
          </h3>
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
            {isAllTransactions ? "All transactions" : "Filtered subset"}
          </p>
        </div>
        <div className="p-3 rounded-lg bg-primary/10 text-primary border border-primary/10">
          <Layers className="w-5 h-5" />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between shadow-sm">
        <div className="space-y-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Cash Drawer</p>
          <h3 className="text-xl sm:text-2xl font-black text-amber-500 font-mono">
            {formatInvoiceCurrency(methodBreakdown["Cash"] || 0)}
          </h3>
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
            {formatInvoiceCurrency(
              (methodBreakdown["eSewa"] || 0) +
                (methodBreakdown["Khalti"] || 0) +
                (methodBreakdown["Fonepay"] || 0),
            )}
          </h3>
          <p className="text-[10px] text-muted-foreground">eSewa, Khalti, Fonepay sum</p>
        </div>
        <div className="p-3 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/10">
          <Sparkles className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}
