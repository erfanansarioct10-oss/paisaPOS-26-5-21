import { Plus } from "lucide-react";

type DashboardPageHeaderProps = {
  storeName?: string;
  onNewSale: () => void;
};

export function DashboardPageHeader({ storeName, onNewSale }: DashboardPageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 className="font-outfit font-extrabold text-2xl sm:text-3xl text-foreground tracking-tight">
          Dashboard
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          Operational overview for{" "}
          <span className="font-semibold text-foreground">{storeName || "KTM Streetwear"}</span>.
        </p>
      </div>

      <button
        onClick={onNewSale}
        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:opacity-95 shadow transition-all active:scale-[0.99] shrink-0"
      >
        <Plus className="w-4 h-4" />
        <span>New Sale (POS)</span>
      </button>
    </div>
  );
}
