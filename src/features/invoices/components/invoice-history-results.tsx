import type { Invoice } from "@/lib/store/useAppStore";
import { InvoiceHistoryEmptyState } from "./invoice-history-empty-state";
import { InvoiceHistoryLoadMore } from "./invoice-history-load-more";
import { InvoiceHistoryMobileCards } from "./invoice-history-mobile-cards";
import { InvoiceHistoryPagination } from "./invoice-history-pagination";
import { InvoiceHistoryTable } from "./invoice-history-table";

type InvoiceHistoryResultsProps = {
  filteredInvoices: Invoice[];
  loadedInvoiceCount: number;
  paginatedInvoices: Invoice[];
  safePage: number;
  totalPages: number;
  onLoadMore: () => void | Promise<void>;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onReprint: (invoice: Invoice) => void | Promise<void>;
};

export function InvoiceHistoryResults({
  filteredInvoices,
  loadedInvoiceCount,
  paginatedInvoices,
  safePage,
  totalPages,
  onLoadMore,
  onNextPage,
  onPreviousPage,
  onReprint,
}: InvoiceHistoryResultsProps) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      {filteredInvoices.length === 0 ? (
        <InvoiceHistoryEmptyState />
      ) : (
        <>
          <InvoiceHistoryTable invoices={paginatedInvoices} onReprint={onReprint} />
          <InvoiceHistoryMobileCards invoices={paginatedInvoices} onReprint={onReprint} />
          <InvoiceHistoryLoadMore shouldShow={loadedInvoiceCount >= 50} onLoadMore={onLoadMore} />
          <InvoiceHistoryPagination
            safePage={safePage}
            totalPages={totalPages}
            filteredCount={filteredInvoices.length}
            onPreviousPage={onPreviousPage}
            onNextPage={onNextPage}
          />
        </>
      )}
    </div>
  );
}
