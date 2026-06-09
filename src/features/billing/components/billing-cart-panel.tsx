"use client";

import { AlertTriangle, Check, Loader2, Percent, Phone, Plus, ShoppingCart, Trash2, User } from "lucide-react";
import type { CartItem } from "@/lib/store/useAppStore";
import type { BillingSubTab } from "@/features/billing/components/billing-ui-types";
import { useAppStore } from "@/lib/store/useAppStore";

type BillingCartPanelProps = {
  activeSubTab: BillingSubTab;
  cart: CartItem[];
  cartDiscount: number;
  customerName: string;
  customerPhone: string;
  errorMsg: string | null;
  isLoading: boolean;
  onCheckout: () => void | Promise<void>;
  onOpenCustomItem: () => void;
  paymentMethod: string;
  paymentOptions: readonly string[];
  removeFromCart: (variantId: string) => void;
  setCartDiscount: (discount: number) => void;
  setCustomerDetails: (name: string, phone: string) => void;
  setPaymentMethod: (method: string) => void;
  subtotal: number;
  totalAmount: number;
  totalItemsCount: number;
  updateCartQuantity: (variantId: string, quantity: number) => void;
};

export function BillingCartPanel({
  activeSubTab,
  cart,
  cartDiscount,
  customerName,
  customerPhone,
  errorMsg,
  isLoading,
  onCheckout,
  onOpenCustomItem,
  paymentMethod,
  paymentOptions,
  removeFromCart,
  setCartDiscount,
  setCustomerDetails,
  setPaymentMethod,
  subtotal,
  totalAmount,
  totalItemsCount,
  updateCartQuantity,
}: BillingCartPanelProps) {
  const user = useAppStore((state) => state.user);

  return (
    <div className={`lg:col-span-5 bg-card border border-border rounded-xl shadow-sm flex flex-col h-full min-h-0 overflow-hidden ${activeSubTab === "cart" ? "flex" : "hidden lg:flex"}`}>
      <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0 bg-muted/20">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-foreground">Billing Cart</h3>
        </div>
        <div className="flex items-center gap-2">
          {user?.role === "owner" && (
            <button
              type="button"
              onClick={onOpenCustomItem}
              className="text-[10px] sm:text-[11px] font-bold px-2 py-1 sm:px-2.5 sm:py-1.5 border border-border bg-card text-muted-foreground hover:text-foreground rounded-lg transition-all flex items-center gap-1 shadow-sm"
            >
              <Plus className="w-3 h-3" />
              <span>Custom</span>
            </button>
          )}
          <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/10">
            {totalItemsCount} Item{totalItemsCount !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 divide-y divide-border space-y-3">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center h-full">
            <ShoppingCart className="w-12 h-12 text-muted-foreground mb-3 opacity-30 animate-pulse" />
            <p className="text-sm font-semibold text-muted-foreground">POS Cart is Empty</p>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-[200px] mx-auto">
              Taps on product sizes/colors in the grid to add them to this checkout sheet.
            </p>
          </div>
        ) : (
          cart.map((item) => (
            <div key={item.variant_id} className="pt-3 first:pt-0 flex items-start justify-between gap-3 text-xs leading-normal">
              <div className="flex flex-col min-w-0">
                <span className="font-bold text-foreground truncate">{item.name}</span>
                {item.is_custom ? (
                  <span className="text-[10px] text-amber-500 font-semibold mt-0.5">
                    Ad-hoc Custom Item
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                    SKU: {item.sku} (Size {item.size} / {item.color})
                  </span>
                )}
                <span className="text-[10px] text-primary font-bold mt-1">
                  Rs. {item.price.toLocaleString()} each
                </span>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center border border-border bg-slate-50 dark:bg-slate-950 rounded-lg shadow-sm">
                  <button
                    onClick={() => updateCartQuantity(item.variant_id, item.quantity - 1)}
                    className="w-11 h-11 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-900 text-muted-foreground hover:text-foreground font-extrabold text-sm focus:outline-none transition-colors border-r border-border"
                  >
                    -
                  </button>
                  <span className="w-10 text-center font-bold font-mono text-xs text-slate-900 dark:text-white">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateCartQuantity(item.variant_id, item.quantity + 1)}
                    className="w-11 h-11 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-900 text-muted-foreground hover:text-foreground font-extrabold text-sm focus:outline-none transition-colors border-l border-border"
                  >
                    +
                  </button>
                </div>

                <button
                  onClick={() => removeFromCart(item.variant_id)}
                  className="p-3 min-w-[44px] min-h-[44px] flex items-center justify-center text-red-500 border border-transparent hover:border-red-500/20 hover:bg-red-500/10 rounded-lg transition-all"
                  title="Remove Item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {errorMsg && (
        <div className="px-5 py-2.5 bg-red-500/10 border-t border-b border-red-500/20 flex items-start gap-2.5 text-xs text-red-400 shrink-0">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="leading-normal">{errorMsg}</p>
        </div>
      )}

      <div className="px-5 py-4 border-t border-border space-y-4 shrink-0 bg-muted/10">
        <div className="flex flex-col sm:grid sm:grid-cols-2 gap-3">
          <div className="relative w-full">
            <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Customer Name"
              maxLength={100}
              value={customerName}
              onChange={(event) => setCustomerDetails(event.target.value, customerPhone)}
              className="block w-full pl-8 pr-2 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs focus:outline-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 h-11"
            />
          </div>
          <div className="relative w-full">
            <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Phone Number"
              maxLength={20}
              value={customerPhone}
              onChange={(event) => {
                const cleaned = event.target.value.replace(/[^0-9+\-\s]/g, "");
                setCustomerDetails(customerName, cleaned);
              }}
              className="block w-full pl-8 pr-2 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs focus:outline-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 h-11"
            />
          </div>
        </div>

        <div className="flex flex-col sm:grid sm:grid-cols-12 gap-3 items-center">
          <div className="w-full sm:col-span-5 relative">
            <Percent className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="number"
              min={0}
              max={subtotal}
              placeholder="Discount Rs."
              value={cartDiscount || ""}
              onChange={(event) => {
                const raw = event.target.value;
                // Guard against NaN from empty, "e", or invalid numeric strings
                const parsed = Number(raw);
                const val = Number.isFinite(parsed) ? parsed : 0;
                if (val < 0) {
                  setCartDiscount(0);
                } else if (val > subtotal) {
                  setCartDiscount(subtotal);
                } else {
                  setCartDiscount(val);
                }
              }}
              className="block w-full pl-8 pr-2 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs focus:outline-none font-bold text-red-500 placeholder-slate-400 dark:placeholder-slate-600 h-11"
            />
          </div>

          <div className="w-full sm:col-span-7 flex gap-1 justify-between">
            {paymentOptions.map((option) => {
              const isSelected = paymentMethod === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setPaymentMethod(option)}
                  className={`flex-1 text-xs font-bold py-2 rounded-lg border text-center transition-all h-11 min-h-[44px] flex items-center justify-center ${
                    isSelected
                      ? "bg-primary border-primary text-primary-foreground shadow-sm"
                      : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-900"
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3 pt-2 border-t border-border/80">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Subtotal:</span>
            <span>Rs. {subtotal.toLocaleString()}</span>
          </div>
          {cartDiscount > 0 && (
            <div className="flex justify-between text-xs text-red-500 font-bold">
              <span>Discount Applied:</span>
              <span>- Rs. {cartDiscount.toLocaleString()}</span>
            </div>
          )}

          <button
            onClick={onCheckout}
            disabled={cart.length === 0 || isLoading}
            className="w-full flex items-center justify-between px-4 py-3.5 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:opacity-95 shadow transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {isLoading ? (
              <div className="flex items-center gap-2 mx-auto">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processing Checkout...</span>
              </div>
            ) : (
              <>
                <span className="flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>Checkout <span className="hidden lg:inline text-xs opacity-80 font-normal ml-1">(Ctrl+Enter)</span></span>
                </span>
                <span className="font-bold text-base font-mono">
                  Rs. {totalAmount.toLocaleString()}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
