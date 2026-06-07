"use client";

import { ShoppingCart } from "lucide-react";
import type { BillingSubTab } from "@/features/billing/components/billing-ui-types";

type BillingMobileTabsProps = {
  activeSubTab: BillingSubTab;
  onChange: (tab: BillingSubTab) => void;
  pulseCart: boolean;
  totalItemsCount: number;
};

export function BillingMobileTabs({
  activeSubTab,
  onChange,
  pulseCart,
  totalItemsCount,
}: BillingMobileTabsProps) {
  return (
    <div className="flex lg:hidden bg-slate-100 dark:bg-slate-950 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 mb-4 shrink-0">
      <button
        type="button"
        onClick={() => onChange("products")}
        className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
          activeSubTab === "products"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Browse Products
      </button>
      <button
        type="button"
        onClick={() => onChange("cart")}
        className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
          pulseCart ? "scale-[1.02] text-primary" : ""
        } ${
          activeSubTab === "cart"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <ShoppingCart className={`w-3.5 h-3.5 transition-transform ${pulseCart ? "animate-bounce" : ""}`} />
        <span>Active Cart</span>
        {totalItemsCount > 0 && (
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold transition-all ${
            pulseCart ? "scale-110 bg-amber-500 text-slate-950" : (activeSubTab === "cart" ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground")
          }`}>
            {totalItemsCount}
          </span>
        )}
      </button>
    </div>
  );
}
