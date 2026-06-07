"use client";

import { useCallback, useMemo, useState } from "react";
import { useAppStore, type Invoice } from "@/lib/store/useAppStore";
import { resolveReceiptInvoiceItems } from "@/features/invoices/utils/receipt-invoice-items";
import {
  filterInvoices,
  getInvoiceMethodBreakdown,
  PAGE_SIZE,
  type InvoiceDateFilter,
  type InvoicePaymentMethodFilter,
} from "@/features/invoices/utils/invoice-history-utils";

export function useInvoiceHistory() {
  const { invoices, products, variants, invoiceItems, setActiveInvoice } = useAppStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<InvoicePaymentMethodFilter>("All");
  const [dateFilter, setDateFilter] = useState<InvoiceDateFilter>("All Time");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredInvoices = useMemo(
    () => filterInvoices(invoices, searchQuery, paymentMethodFilter, dateFilter),
    [dateFilter, invoices, paymentMethodFilter, searchQuery],
  );
  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedInvoices = useMemo(
    () => filteredInvoices.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredInvoices, safePage],
  );

  const totalSales = useMemo(
    () => filteredInvoices.reduce((sum, invoice) => sum + invoice.total_amount, 0),
    [filteredInvoices],
  );
  const methodBreakdown = useMemo(() => getInvoiceMethodBreakdown(filteredInvoices), [filteredInvoices]);

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

  const handleSearchQueryChange = useCallback((value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  }, []);

  const handlePaymentMethodChange = useCallback((value: InvoicePaymentMethodFilter) => {
    setPaymentMethodFilter(value);
    setCurrentPage(1);
  }, []);

  const handleDateFilterChange = useCallback((value: InvoiceDateFilter) => {
    setDateFilter(value);
    setCurrentPage(1);
  }, []);

  const handleLoadMore = useCallback(async () => {
    const { loadMoreInvoices } = useAppStore.getState();
    await loadMoreInvoices();
  }, []);

  const handlePreviousPage = useCallback(() => {
    setCurrentPage((page) => Math.max(1, page - 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage((page) => Math.min(totalPages, page + 1));
  }, [totalPages]);

  return {
    dateFilter,
    filteredInvoices,
    handleDateFilterChange,
    handleLoadMore,
    handleNextPage,
    handlePaymentMethodChange,
    handlePreviousPage,
    handleReprint,
    handleSearchQueryChange,
    isAllTransactions: filteredInvoices.length === invoices.length,
    loadedInvoiceCount: invoices.length,
    methodBreakdown,
    paginatedInvoices,
    paymentMethodFilter,
    safePage,
    searchQuery,
    totalCount: filteredInvoices.length,
    totalPages,
    totalSales,
  };
}
