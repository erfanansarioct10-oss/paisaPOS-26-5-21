import { TrendingUp, AlertTriangle, Package, Store as StoreIcon } from "lucide-react";

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Page Header Skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-muted rounded-lg" />
          <div className="flex items-center gap-1.5 mt-1">
            <div className="h-4 w-28 bg-muted rounded" />
            <div className="h-4 w-32 bg-muted rounded" />
          </div>
        </div>
        <div className="h-10 w-36 bg-muted rounded-lg shrink-0" />
      </div>

      {/* Metric Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Sales Card */}
        <div className="bg-card border border-border/60 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="h-3.5 w-24 bg-muted rounded" />
            <div className="p-2 bg-muted/30 rounded-lg">
              <TrendingUp className="w-4 h-4 text-muted/40" />
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <div className="h-8 w-32 bg-muted rounded-lg" />
            <div className="h-3 w-40 bg-muted rounded" />
          </div>
        </div>

        {/* Low Stock Card */}
        <div className="bg-card border border-border/60 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="h-3.5 w-28 bg-muted rounded" />
            <div className="p-2 bg-muted/30 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-muted/40" />
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <div className="h-8 w-16 bg-muted rounded-lg" />
            <div className="h-3 w-36 bg-muted rounded" />
          </div>
        </div>

        {/* Tracked Products Card */}
        <div className="bg-card border border-border/60 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="h-3.5 w-32 bg-muted rounded" />
            <div className="p-2 bg-muted/30 rounded-lg">
              <Package className="w-4 h-4 text-muted/40" />
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <div className="h-8 w-20 bg-muted rounded-lg" />
            <div className="h-3 w-44 bg-muted rounded" />
          </div>
        </div>

        {/* Store Info Card */}
        <div className="bg-card border border-border/60 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="h-3.5 w-20 bg-muted rounded" />
            <div className="p-2 bg-muted/30 rounded-lg">
              <StoreIcon className="w-4 h-4 text-muted/40" />
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <div className="h-5 w-28 bg-muted rounded" />
            <div className="h-3 w-36 bg-muted rounded" />
          </div>
        </div>
      </div>

      {/* Panels Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Invoices Panel */}
        <div className="bg-card border border-border/60 rounded-xl p-5 shadow-sm lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-border/40">
            <div className="h-5 w-32 bg-muted rounded" />
            <div className="h-4 w-16 bg-muted rounded" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border/20 last:border-0">
                <div className="space-y-1.5">
                  <div className="h-4 w-24 bg-muted rounded" />
                  <div className="h-3 w-36 bg-muted rounded" />
                </div>
                <div className="flex items-center gap-4">
                  <div className="h-4 w-20 bg-muted rounded" />
                  <div className="h-8 w-16 bg-muted rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Stock Warnings Panel */}
        <div className="bg-card border border-border/60 rounded-xl p-5 shadow-sm space-y-4">
          <div className="pb-2 border-b border-border/40">
            <div className="h-5 w-36 bg-muted rounded" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border/20 last:border-0">
                <div className="space-y-1.5">
                  <div className="h-4 w-32 bg-muted rounded" />
                  <div className="h-3 w-24 bg-muted rounded" />
                </div>
                <div className="h-6 w-16 bg-muted rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
