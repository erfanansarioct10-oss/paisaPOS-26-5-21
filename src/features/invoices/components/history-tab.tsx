"use client";

import { InvoiceHistoryFilters } from "./invoice-history-filters";
import { InvoiceHistoryHeader } from "./invoice-history-header";
import { InvoiceHistoryResults } from "./invoice-history-results";
import { InvoiceHistorySummaryCards } from "./invoice-history-summary-cards";
import { useInvoiceHistory } from "@/features/invoices/hooks/use-invoice-history";
import { useAppStore } from "@/lib/store/useAppStore";
import { AlertCircle } from "lucide-react";

export default function HistoryTab() {
  const history = useInvoiceHistory();
  const errorMsg = useAppStore((state) => state.errorMsg);

  return (
    <div className="space-y-6">
      <InvoiceHistoryHeader />

      {errorMsg && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <InvoiceHistoryFilters
        searchQuery={history.searchQuery}
        paymentMethodFilter={history.paymentMethodFilter}
        dateFilter={history.dateFilter}
        onSearchQueryChange={history.handleSearchQueryChange}
        onPaymentMethodChange={history.handlePaymentMethodChange}
        onDateFilterChange={history.handleDateFilterChange}
      />

      <InvoiceHistorySummaryCards
        totalSales={history.totalSales}
        totalCount={history.totalCount}
        methodBreakdown={history.methodBreakdown}
        isAllTransactions={history.isAllTransactions}
      />

      <InvoiceHistoryResults
        filteredInvoices={history.filteredInvoices}
        loadedInvoiceCount={history.loadedInvoiceCount}
        paginatedInvoices={history.paginatedInvoices}
        safePage={history.safePage}
        totalPages={history.totalPages}
        onLoadMore={history.handleLoadMore}
        onPreviousPage={history.handlePreviousPage}
        onNextPage={history.handleNextPage}
        onReprint={history.handleReprint}
      />
    </div>
  );
}
