import { History } from "lucide-react";

export function InvoiceHistoryEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <History className="w-12 h-12 text-muted-foreground mb-3 opacity-30" />
      <h3 className="text-base font-bold text-foreground">No Invoices Matches</h3>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
        No bills found matching your search. Clear input or checkout a sale in POS to populate this log.
      </p>
    </div>
  );
}
