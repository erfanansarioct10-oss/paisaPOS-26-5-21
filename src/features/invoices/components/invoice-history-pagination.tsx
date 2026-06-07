import { ChevronLeft, ChevronRight } from "lucide-react";
import { PAGE_SIZE } from "@/features/invoices/utils/invoice-history-utils";

type InvoiceHistoryPaginationProps = {
  safePage: number;
  totalPages: number;
  filteredCount: number;
  onPreviousPage: () => void;
  onNextPage: () => void;
};

export function InvoiceHistoryPagination({
  safePage,
  totalPages,
  filteredCount,
  onPreviousPage,
  onNextPage,
}: InvoiceHistoryPaginationProps) {
  if (totalPages <= 1) return null;

  const firstVisible = (safePage - 1) * PAGE_SIZE + 1;
  const lastVisible = Math.min(safePage * PAGE_SIZE, filteredCount);

  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-muted/10">
      <p className="text-xs text-muted-foreground">
        Showing {firstVisible}&ndash;{lastVisible} of {filteredCount} invoices
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={onPreviousPage}
          disabled={safePage <= 1}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all disabled:opacity-30 disabled:pointer-events-none h-11"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Previous</span>
        </button>
        <span className="text-xs font-bold text-foreground tabular-nums min-w-[4rem] text-center">
          {safePage} / {totalPages}
        </span>
        <button
          onClick={onNextPage}
          disabled={safePage >= totalPages}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-all disabled:opacity-30 disabled:pointer-events-none h-11"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
