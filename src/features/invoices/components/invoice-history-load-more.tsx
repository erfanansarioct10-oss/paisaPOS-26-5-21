type InvoiceHistoryLoadMoreProps = {
  shouldShow: boolean;
  onLoadMore: () => void | Promise<void>;
};

export function InvoiceHistoryLoadMore({ shouldShow, onLoadMore }: InvoiceHistoryLoadMoreProps) {
  if (!shouldShow) return null;

  return (
    <div className="flex justify-center py-4 border-t border-border bg-muted/5">
      <button
        onClick={onLoadMore}
        className="inline-flex items-center justify-center h-10 px-6 text-xs font-semibold bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground hover:text-foreground rounded-lg transition-all active:scale-[0.98]"
      >
        Load More from Database
      </button>
    </div>
  );
}
