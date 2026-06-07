import type { Invoice } from "@/lib/store/useAppStore";

export const PAGE_SIZE = 20;
export const PAYMENT_METHODS = ["All", "Cash", "eSewa", "Khalti", "Fonepay"] as const;
export const DATE_FILTERS = ["All Time", "Today", "Yesterday", "This Week"] as const;

export type InvoicePaymentMethodFilter = (typeof PAYMENT_METHODS)[number];
export type InvoiceDateFilter = (typeof DATE_FILTERS)[number];

export type InvoiceSeller = {
  name: string;
  role: "Owner" | "Cashier" | null;
};

export function formatInvoiceCurrency(amount: number) {
  return `Rs. ${amount.toLocaleString()}`;
}

export function formatInvoiceDate(isoString: string) {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString("en-NP", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

export function formatInvoiceSeller(invoice: Invoice): InvoiceSeller {
  return {
    name: invoice.sold_by_name?.trim() || "Not recorded",
    role:
      invoice.sold_by_role === "owner"
        ? "Owner"
        : invoice.sold_by_role === "cashier"
          ? "Cashier"
          : null,
  };
}

export function filterInvoices(
  invoices: Invoice[],
  searchQuery: string,
  paymentMethodFilter: InvoicePaymentMethodFilter,
  dateFilter: InvoiceDateFilter,
) {
  return invoices.filter((invoice) => {
    const query = searchQuery.toLowerCase();
    const matchesNumber = invoice.invoice_number.toLowerCase().includes(query);
    const matchesName = invoice.customer_name?.toLowerCase().includes(query) ?? false;
    const matchesPhone = invoice.customer_phone?.toLowerCase().includes(query) ?? false;
    const matchesMethod = invoice.payment_method.toLowerCase().includes(query);
    const matchesSellerName = invoice.sold_by_name?.toLowerCase().includes(query) ?? false;
    const matchesSellerRole = invoice.sold_by_role?.toLowerCase().includes(query) ?? false;
    const matchesSearch =
      searchQuery === "" ||
      matchesNumber ||
      matchesName ||
      matchesPhone ||
      matchesMethod ||
      matchesSellerName ||
      matchesSellerRole;

    const matchesPaymentMethod =
      paymentMethodFilter === "All" ||
      invoice.payment_method.toLowerCase() === paymentMethodFilter.toLowerCase();

    let matchesDate = true;
    if (dateFilter !== "All Time") {
      const invoiceDate = new Date(invoice.created_at);
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      if (dateFilter === "Today") {
        matchesDate = invoiceDate >= startOfToday && invoiceDate <= endOfToday;
      } else if (dateFilter === "Yesterday") {
        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);
        const endOfYesterday = new Date(endOfToday);
        endOfYesterday.setDate(endOfYesterday.getDate() - 1);
        matchesDate = invoiceDate >= startOfYesterday && invoiceDate <= endOfYesterday;
      } else if (dateFilter === "This Week") {
        const startOfWeek = new Date(startOfToday);
        const day = startOfWeek.getDay();
        startOfWeek.setDate(startOfWeek.getDate() - day);
        matchesDate = invoiceDate >= startOfWeek && invoiceDate <= endOfToday;
      }
    }

    return matchesSearch && matchesPaymentMethod && matchesDate;
  });
}

export function getInvoiceMethodBreakdown(invoices: Invoice[]) {
  return invoices.reduce(
    (acc, invoice) => {
      let method = "Cash";
      const lowerMethod = invoice.payment_method.toLowerCase();
      if (lowerMethod === "esewa") method = "eSewa";
      else if (lowerMethod === "khalti") method = "Khalti";
      else if (lowerMethod === "fonepay") method = "Fonepay";
      else if (lowerMethod === "cash") method = "Cash";
      acc[method] = (acc[method] || 0) + invoice.total_amount;
      return acc;
    },
    {} as Record<string, number>,
  );
}
