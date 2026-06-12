"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useAppStore, type Invoice } from "@/lib/store/useAppStore";
import { resolveReceiptInvoiceItems } from "@/features/invoices/utils/receipt-invoice-items";
import type {
  InvoiceDateFilter,
  InvoicePaymentMethodFilter,
} from "@/features/invoices/utils/invoice-history-utils";

export function useInvoiceHistory() {
  const {
    products,
    variants,
    invoiceItems,
    setActiveInvoice,
    historyFilters,
    historyInvoices,
    historyTotalCount,
    historyTotalSales,
    historyMethodBreakdown,
    historyLoading,
    setHistoryFilters,
    fetchHistoryData,
    store,
  } = useAppStore();

  useEffect(() => {
    if (store?.id) {
      fetchHistoryData();
    }
  }, [fetchHistoryData, store?.id]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(historyTotalCount / 20));
  }, [historyTotalCount]);

  const isAllTransactions = useMemo(() => {
    return (
      historyFilters.searchQuery === "" &&
      historyFilters.paymentMethodFilter === "All" &&
      historyFilters.dateFilter === "All Time"
    );
  }, [historyFilters]);

  const handleReprint = useCallback(
    async (invoice: Invoice) => {
      const { fetchInvoiceItems } = useAppStore.getState();
      const filledItems = await resolveReceiptInvoiceItems({
        fetchInvoiceItems,
        invoiceId: invoice.id,
        invoiceItemsByInvoiceId: invoiceItems,
        products,
        variants,
      });

      setActiveInvoice(invoice, filledItems);
    },
    [invoiceItems, products, setActiveInvoice, variants],
  );

  const handleSearchQueryChange = useCallback(
    (value: string) => {
      setHistoryFilters({ searchQuery: value });
    },
    [setHistoryFilters],
  );

  const handlePaymentMethodChange = useCallback(
    (value: InvoicePaymentMethodFilter) => {
      setHistoryFilters({ paymentMethodFilter: value });
    },
    [setHistoryFilters],
  );

  const handleDateFilterChange = useCallback(
    (value: InvoiceDateFilter) => {
      setHistoryFilters({ dateFilter: value });
    },
    [setHistoryFilters],
  );

  const handleLoadMore = useCallback(async () => {
    // Disable loadedInvoiceCount to hide load more, but keep function signature.
  }, []);

  const handlePreviousPage = useCallback(() => {
    setHistoryFilters({ page: Math.max(1, historyFilters.page - 1) });
  }, [historyFilters.page, setHistoryFilters]);

  const handleNextPage = useCallback(() => {
    setHistoryFilters({ page: Math.min(totalPages, historyFilters.page + 1) });
  }, [historyFilters.page, totalPages, setHistoryFilters]);

  return {
    dateFilter: historyFilters.dateFilter as InvoiceDateFilter,
    filteredInvoices: historyInvoices,
    handleDateFilterChange,
    handleLoadMore,
    handleNextPage,
    handlePaymentMethodChange,
    handlePreviousPage,
    handleReprint,
    handleSearchQueryChange,
    isAllTransactions,
    loadedInvoiceCount: 0, // Disable Load More scrolling panel in favor of pagination
    methodBreakdown: historyMethodBreakdown,
    paginatedInvoices: historyInvoices,
    paymentMethodFilter: historyFilters.paymentMethodFilter as InvoicePaymentMethodFilter,
    safePage: historyFilters.page,
    searchQuery: historyFilters.searchQuery,
    totalCount: historyTotalCount,
    totalPages,
    totalSales: historyTotalSales,
    historyLoading,
  };
}
