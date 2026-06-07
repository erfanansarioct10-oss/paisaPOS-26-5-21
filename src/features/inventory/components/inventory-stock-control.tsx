"use client";

import type { ProductVariant } from "@/lib/store/useAppStore";

type InventoryStockControlProps = {
  canAdjustInventory: boolean;
  lowStockThreshold: number;
  mode: "desktop" | "mobile";
  onUpdateStock: (variantId: string, newStock: number) => void;
  variant: ProductVariant;
};

export function InventoryStockControl({
  canAdjustInventory,
  lowStockThreshold,
  mode,
  onUpdateStock,
  variant,
}: InventoryStockControlProps) {
  const stock = variant.stock ?? 0;
  const isLowStock = stock <= lowStockThreshold;

  if (mode === "desktop") {
    if (!canAdjustInventory) {
      return (
        <span className={`inline-flex min-w-14 justify-center rounded-md border border-border bg-card px-3 py-1 font-bold font-mono text-xs ${isLowStock ? "text-amber-500 font-extrabold" : "text-foreground"}`}>
          {stock}
        </span>
      );
    }

    return (
      <div className="inline-flex items-center border border-border bg-card rounded-md shadow-sm">
        <button
          onClick={() => onUpdateStock(variant.id, Math.max(0, stock - 1))}
          className="px-2 py-1 hover:bg-secondary text-muted-foreground hover:text-foreground font-extrabold focus:outline-none transition-colors border-r border-border"
        >
          -
        </button>
        <span className={`px-3 py-1 font-bold font-mono text-center text-xs ${isLowStock ? "text-amber-500 font-extrabold" : "text-foreground"}`}>
          {stock}
        </span>
        <button
          onClick={() => onUpdateStock(variant.id, stock + 1)}
          className="px-2 py-1 hover:bg-secondary text-muted-foreground hover:text-foreground font-extrabold focus:outline-none transition-colors border-l border-border"
        >
          +
        </button>
      </div>
    );
  }

  if (!canAdjustInventory) {
    return (
      <span className={`inline-flex h-11 min-w-12 items-center justify-center rounded-lg border border-border bg-slate-50 px-3 font-bold font-mono text-xs dark:bg-slate-950 ${isLowStock ? "text-amber-500 font-extrabold" : "text-slate-900 dark:text-white"}`}>
        {stock}
      </span>
    );
  }

  return (
    <div className="inline-flex items-center border border-border bg-slate-50 dark:bg-slate-950 rounded-lg shadow-sm">
      <button
        onClick={() => onUpdateStock(variant.id, Math.max(0, stock - 1))}
        className="w-11 h-11 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-900 text-muted-foreground hover:text-foreground font-extrabold text-sm focus:outline-none transition-colors border-r border-border"
      >
        -
      </button>
      <span className={`w-10 text-center font-bold font-mono text-xs ${isLowStock ? "text-amber-500 font-extrabold" : "text-slate-900 dark:text-white"}`}>
        {stock}
      </span>
      <button
        onClick={() => onUpdateStock(variant.id, stock + 1)}
        className="w-11 h-11 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-900 text-muted-foreground hover:text-foreground font-extrabold text-sm focus:outline-none transition-colors border-l border-border"
      >
        +
      </button>
    </div>
  );
}
