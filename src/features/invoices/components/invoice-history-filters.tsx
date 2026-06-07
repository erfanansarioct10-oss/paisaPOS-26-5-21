import { Calendar, Search } from "lucide-react";
import {
  DATE_FILTERS,
  PAYMENT_METHODS,
  type InvoiceDateFilter,
  type InvoicePaymentMethodFilter,
} from "@/features/invoices/utils/invoice-history-utils";

type InvoiceHistoryFiltersProps = {
  searchQuery: string;
  paymentMethodFilter: InvoicePaymentMethodFilter;
  dateFilter: InvoiceDateFilter;
  onSearchQueryChange: (value: string) => void;
  onPaymentMethodChange: (value: InvoicePaymentMethodFilter) => void;
  onDateFilterChange: (value: InvoiceDateFilter) => void;
};

export function InvoiceHistoryFilters({
  searchQuery,
  paymentMethodFilter,
  dateFilter,
  onSearchQueryChange,
  onPaymentMethodChange,
  onDateFilterChange,
}: InvoiceHistoryFiltersProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative">
          <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
            Search Invoice
          </label>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search No, Name, Phone or Method..."
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              className="block w-full pl-10 pr-4 h-11 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 transition-all shadow-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
            Date Period
          </label>
          <div className="relative">
            <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <select
              value={dateFilter}
              onChange={(event) => onDateFilterChange(event.target.value as InvoiceDateFilter)}
              className="block w-full pl-10 pr-4 h-11 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-slate-900 dark:text-white appearance-none cursor-pointer shadow-sm transition-all"
            >
              {DATE_FILTERS.map((filter) => (
                <option key={filter} value={filter}>
                  {filter === "Today" ? "Today (Nepal local time)" : filter}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
            Payment Channel
          </label>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_METHODS.map((method) => {
              const isActive = paymentMethodFilter === method;

              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => onPaymentMethodChange(method)}
                  className={`h-11 px-4 text-xs font-semibold rounded-xl border transition-all ${
                    isActive
                      ? "bg-primary border-primary text-primary-foreground shadow-sm"
                      : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-900"
                  }`}
                >
                  {method}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
