import { AlertTriangle, Package, Store as StoreIcon, TrendingUp } from "lucide-react";
import type { StoreMetadata } from "@/lib/store/useAppStore";
import { formatDashboardCurrency } from "./dashboard-formatters";

type DashboardMetricCardsProps = {
  todaySalesSum: number;
  todayInvoicesCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  productCount: number;
  variantCount: number;
  store: StoreMetadata | null;
};

export function DashboardMetricCards({
  todaySalesSum,
  todayInvoicesCount,
  lowStockCount,
  outOfStockCount,
  productCount,
  variantCount,
  store,
}: DashboardMetricCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Today&apos;s Sales
          </span>
          <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-lg">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <h3 className="text-2xl font-bold text-foreground">
            {formatDashboardCurrency(todaySalesSum)}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {todayInvoicesCount} transaction{todayInvoicesCount !== 1 ? "s" : ""} completed today
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Low Stock Alerts
          </span>
          <div
            className={`p-2 rounded-lg ${
              lowStockCount > 0 ? "bg-amber-500/10 text-amber-500" : "bg-slate-500/10 text-slate-400"
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <h3 className="text-2xl font-bold text-foreground">{lowStockCount}</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {outOfStockCount} variant{outOfStockCount !== 1 ? "s are" : " is"} completely out-of-stock
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Total Products
          </span>
          <div className="p-2 bg-primary/10 text-primary rounded-lg">
            <Package className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <h3 className="text-2xl font-bold text-foreground">{productCount}</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Tracking {variantCount} unique size/color variants
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Store Info
          </span>
          <div className="p-2 bg-slate-500/10 text-muted-foreground rounded-lg">
            <StoreIcon className="w-4 h-4" />
          </div>
        </div>
        <div className="mt-3">
          <h3 className="text-sm font-bold text-foreground truncate">{store?.name || "No Store"}</h3>
          <p className="text-xs text-muted-foreground mt-1 truncate">
            PAN/VAT: {store?.pan_vat || "Not Specified"}
          </p>
        </div>
      </div>
    </div>
  );
}
