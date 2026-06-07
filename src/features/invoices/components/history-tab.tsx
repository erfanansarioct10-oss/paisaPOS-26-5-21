"use client";

import { InvoiceHistoryFilters } from "./invoice-history-filters";
import { InvoiceHistoryHeader } from "./invoice-history-header";
import { InvoiceHistoryResults } from "./invoice-history-results";
import { InvoiceHistorySummaryCards } from "./invoice-history-summary-cards";
import { useInvoiceHistory } from "@/features/invoices/hooks/use-invoice-history";

export default function HistoryTab() {
  const history = useInvoiceHistory();

  return (
    <div className="space-y-6">
      <InvoiceHistoryHeader />

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
