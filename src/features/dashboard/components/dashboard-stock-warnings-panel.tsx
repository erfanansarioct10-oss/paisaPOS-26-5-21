import { useMemo, type SVGProps } from "react";
import type { Product, ProductVariant } from "@/lib/store/useAppStore";

type DashboardStockWarningsPanelProps = {
  lowStockVariants: ProductVariant[];
  lowStockCount: number;
  products: Product[];
};

export function DashboardStockWarningsPanel({
  lowStockVariants,
  lowStockCount,
  products,
}: DashboardStockWarningsPanelProps) {
  const productsMap = useMemo(() => {
    return new Map(products.map((p) => [p.id, p]));
  }, [products]);

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm flex flex-col p-5">
      <div className="pb-3 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Stock Warnings</h3>
        <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 text-xs font-bold border border-amber-500/10">
          {lowStockCount} alert{lowStockCount !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto mt-4 space-y-3 max-h-[360px] pr-1">
        {lowStockVariants.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center h-full">
            <CheckCircleSkeleton className="w-8 h-8 text-emerald-500 mb-2 opacity-50" />
            <p className="text-sm font-semibold text-muted-foreground">All Stock Healthy</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              All variants are above low-stock limits.
            </p>
          </div>
        ) : (
          lowStockVariants.map((variant) => {
            const parent = productsMap.get(variant.product_id);
            const isOutOfStock = (variant.stock ?? 0) === 0;

            return (
              <div
                key={variant.id}
                className={`flex items-center justify-between p-3 rounded-lg border text-xs leading-normal ${
                  isOutOfStock
                    ? "bg-red-500/5 border-red-500/20 text-red-700 dark:text-red-400"
                    : "bg-amber-500/5 border-amber-500/10 text-amber-700 dark:text-amber-400"
                }`}
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-bold truncate text-foreground">{parent?.name || "Product SKU"}</span>
                  <span className="text-[10px] text-muted-foreground font-mono mt-0.5">
                    {variant.sku} (Size {variant.size} / {variant.color})
                  </span>
                </div>

                <div className="text-right shrink-0">
                  <p className="font-bold text-sm text-foreground">{variant.stock ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {isOutOfStock ? "Out of Stock" : "Low Stock"}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function CheckCircleSkeleton(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={2}
      stroke="currentColor"
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}
