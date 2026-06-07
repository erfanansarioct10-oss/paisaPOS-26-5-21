"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { Keyboard, Plus, Search, Star } from "lucide-react";
import type { CartItem, Product, ProductVariant } from "@/lib/store/useAppStore";
import type { BillingSubTab } from "@/features/billing/components/billing-ui-types";

type BillingProductBrowserProps = {
  activeSubTab: BillingSubTab;
  cart: CartItem[];
  filteredProducts: Product[];
  onAddToCart: (variantId: string) => void;
  onGoToInventoryAdd: () => void;
  placeholder: string;
  products: Product[];
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  selectedProductId: string | null;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  setSelectedProductId: Dispatch<SetStateAction<string | null>>;
  variants: ProductVariant[];
};

export function BillingProductBrowser({
  activeSubTab,
  cart,
  filteredProducts,
  onAddToCart,
  onGoToInventoryAdd,
  placeholder,
  products,
  searchInputRef,
  searchQuery,
  selectedProductId,
  setSearchQuery,
  setSelectedProductId,
  variants,
}: BillingProductBrowserProps) {
  const favScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const favoriteProducts = products.filter((product) => product.is_favorite);

  const checkScroll = useCallback(() => {
    const el = favScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      setCanScrollLeft(el.scrollLeft > 2);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    });
  }, []);

  useEffect(() => {
    const el = favScrollRef.current;
    if (!el) return;

    checkScroll();

    el.addEventListener("scroll", checkScroll);
    window.addEventListener("resize", checkScroll);

    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [products, checkScroll]);

  const handleFavoriteClick = useCallback((product: Product) => {
    const productVariants = variants.filter((variant) => variant.product_id === product.id);
    if (productVariants.length === 0) return;

    if (productVariants.length === 1) {
      const variant = productVariants[0];
      if ((variant.stock ?? 0) > 0) {
        onAddToCart(variant.id);
        return;
      }
    }

    setSelectedProductId(product.id);
    setTimeout(() => {
      document.getElementById(`prod-card-${product.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 100);
  }, [variants, onAddToCart, setSelectedProductId]);

  return (
    <div className={`lg:col-span-7 flex flex-col h-full min-h-0 min-w-0 pr-1 ${activeSubTab === "products" ? "flex" : "hidden lg:flex"}`}>
      <div className="relative shrink-0 mb-4">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          ref={searchInputRef}
          id="pos-search-input"
          type="text"
          placeholder={placeholder}
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            if (selectedProductId) setSelectedProductId(null);
          }}
          className="block w-full pl-10 pr-4 md:pr-12 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 transition-all shadow-sm"
        />
        <div className="hidden md:flex absolute right-3.5 top-1/2 -translate-y-1/2 items-center gap-1 text-[10px] text-muted-foreground font-mono bg-secondary px-1.5 py-0.5 rounded border border-border">
          <Keyboard className="w-3 h-3" />
          <span>/</span>
        </div>
      </div>

      {favoriteProducts.length > 0 && (
        <div className="flex items-center gap-2 mb-4 shrink-0 select-none w-full overflow-hidden">
          <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider shrink-0 mr-1 py-1 px-2.5 bg-slate-200 dark:bg-slate-800 rounded-lg">
            Favorites
          </span>
          <div className="relative flex-1 overflow-hidden flex items-center">
            <div
              className={`absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-white to-transparent dark:from-slate-950 pointer-events-none z-10 transition-opacity duration-300 ${
                canScrollLeft ? "opacity-100" : "opacity-0"
              }`}
            />

            <div
              ref={favScrollRef}
              onScroll={checkScroll}
              className="flex-1 flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1 w-full"
            >
              {favoriteProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => handleFavoriteClick(product)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 hover:border-amber-500 rounded-full text-slate-900 dark:text-white text-xs font-semibold shadow-sm transition-all active:scale-[0.98] shrink-0 whitespace-nowrap"
                >
                  <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500 shrink-0" />
                  <span>{product.name}</span>
                </button>
              ))}
            </div>

            <div
              className={`absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-white to-transparent dark:from-slate-950 pointer-events-none z-10 transition-opacity duration-300 ${
                canScrollRight ? "opacity-100" : "opacity-0"
              }`}
            />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto pb-6">
        {filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-card border border-border rounded-xl p-6">
            <Search className="w-10 h-10 text-muted-foreground mb-3 opacity-30 animate-bounce" />
            <h3 className="text-sm font-bold text-foreground">
              {products.length === 0 ? "No Inventory Found" : "No Products Found"}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              {products.length === 0
                ? "Your inventory is currently empty. Add products to start generating bills."
                : `Could not find any items matching "${searchQuery}". Check spelling or create a new SKU in the Inventory tab.`}
            </p>
            <button
              onClick={onGoToInventoryAdd}
              className="mt-5 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:opacity-95 shadow transition-all active:scale-[0.99]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{products.length === 0 ? "Go to Inventory & Add Product" : "Add New SKU"}</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredProducts.map((product) => {
              const isSelected = selectedProductId === product.id;
              const productVariants = variants.filter((variant) => variant.product_id === product.id);
              const totalStock = productVariants.reduce((sum, variant) => sum + (variant.stock ?? 0), 0);

              return (
                <div
                  key={product.id}
                  id={`prod-card-${product.id}`}
                  onClick={() => setSelectedProductId(isSelected ? null : product.id)}
                  className={`bg-card border rounded-xl p-4 transition-all duration-150 cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? "border-primary ring-1 ring-primary/50 shadow-sm"
                      : "border-border hover:border-muted-foreground/30 hover:bg-muted/5"
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-secondary text-muted-foreground font-mono uppercase tracking-wider">
                        {product.category}
                      </span>
                      <span className={`text-xs font-bold font-mono ${totalStock === 0 ? "text-red-500" : "text-emerald-500"}`}>
                        {totalStock === 0 ? "Out of Stock" : `${totalStock} in stock`}
                      </span>
                    </div>

                    <h3 className="font-semibold text-sm sm:text-base text-foreground mt-2 leading-tight">
                      {product.name}
                    </h3>
                  </div>

                  <div className="mt-4 pt-3.5 border-t border-border/60">
                    {isSelected ? (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                          Select Size/Color Variant:
                        </p>
                        <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                          {productVariants.map((variant) => {
                            const inCartCount = cart.find((cartItem) => cartItem.variant_id === variant.id)?.quantity ?? 0;
                            const isOutOfStock = (variant.stock ?? 0) === 0;

                            return (
                              <button
                                key={variant.id}
                                disabled={isOutOfStock}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onAddToCart(variant.id);
                                }}
                                className={`w-full flex items-center justify-between p-2 rounded-lg border text-left text-xs font-medium transition-all ${
                                  isOutOfStock
                                    ? "bg-slate-100/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-950 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                                    : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-primary hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-900 dark:text-white"
                                }`}
                              >
                                <div className="flex flex-col">
                                  <span className="font-bold text-slate-900 dark:text-white">
                                    Size {variant.size} / {variant.color}
                                  </span>
                                  <span className="text-[9px] text-slate-500 font-mono mt-0.5">
                                    SKU: {variant.sku}
                                  </span>
                                </div>

                                <div className="text-right flex items-center gap-2">
                                  <div className="mr-1">
                                    <p className="font-bold text-slate-900 dark:text-white">Rs. {variant.price.toLocaleString()}</p>
                                    <p className={`text-[9px] ${variant.stock && variant.stock <= product.low_stock_threshold ? "text-amber-500 font-bold" : "text-slate-500"}`}>
                                      {isOutOfStock ? "Sold Out" : `${variant.stock} left`}
                                    </p>
                                  </div>

                                  {inCartCount > 0 && (
                                    <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold font-mono text-[10px]">
                                      {inCartCount}
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>View variants ({productVariants.length})</span>
                        <span className="font-mono text-[10px] text-slate-500 bg-secondary px-1 py-0.5 rounded border border-border">
                          Tap to expand
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
