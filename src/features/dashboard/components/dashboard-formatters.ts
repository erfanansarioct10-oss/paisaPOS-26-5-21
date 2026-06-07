import type { Invoice } from "@/lib/store/useAppStore";

export function formatDashboardCurrency(amount: number) {
  return `Rs. ${amount.toLocaleString()}`;
}

export function formatDashboardDate(isoString: string) {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString("en-NP", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

export function formatDashboardSeller(invoice: Invoice) {
  const sellerName = invoice.sold_by_name?.trim();
  const sellerRole =
    invoice.sold_by_role === "owner"
      ? "Owner"
      : invoice.sold_by_role === "cashier"
        ? "Cashier"
        : null;

  if (!sellerName) {
    return "Sold by: Not recorded";
  }

  return `Sold by: ${sellerName}${sellerRole ? ` (${sellerRole})` : ""}`;
}
