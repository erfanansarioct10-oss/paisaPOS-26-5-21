"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store/useAppStore";
import {
  Search,
  ShoppingCart,
  Trash2,
  AlertTriangle,
  Loader2,
  User,
  Phone,
  Check,
  Percent,
  Keyboard,
  Plus,
  X,
  Star,
} from "lucide-react";

export default function BillingTab() {
  const router = useRouter();
  const {
    products,
    variants,
    cart,
    cartDiscount,
    customerName,
    customerPhone,
    paymentMethod,
    isLoading,
    errorMsg,
    addToCart,
    addCustomToCart,
    removeFromCart,
    updateCartQuantity,
    setCartDiscount,
    setCustomerDetails,
    setPaymentMethod,
    checkout,
  } = useAppStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  
  // Custom ad-hoc item input state
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  
  // Mobile responsiveness tab switcher state
  const [activeSubTab, setActiveSubTab] = useState<"products" | "cart">("products");
  
  // Cart bounce pulse micro-animation states
  const [pulseCart, setPulseCart] = useState(false);
  const prevItemsCountRef = useRef(0);

  // Responsive placeholder text to prevent clipping on mobile screens
  const [placeholder, setPlaceholder] = useState("Search products...");

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setPlaceholder("Type Product, Category or SKU... (Press '/' to focus, 'Esc' to clear)");
      } else {
        setPlaceholder("Search products, category, or SKU...");
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Favorites horizontal scroll tracking states
  const favScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

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
    
    // Initial check
    checkScroll();
    
    el.addEventListener("scroll", checkScroll);
    window.addEventListener("resize", checkScroll);
    
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [products, checkScroll]);

  // Auto-focus search input on tab mount (bypass on mobile touch devices)
  useEffect(() => {
    const isMobileTouch = window.matchMedia("(pointer: coarse)").matches;
    if (searchInputRef.current && !isMobileTouch) {
      searchInputRef.current.focus();
    }
  }, []);

  const handleCheckoutSubmit = useCallback(async () => {
    const success = await checkout();
    if (success) {
      // Set focus back to search after successful checkout
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 300);
    }
  }, [checkout]);

  const handleFavoriteClick = useCallback((p: typeof products[0]) => {
    const productVariants = variants.filter((v) => v.product_id === p.id);
    if (productVariants.length === 0) return;

    if (productVariants.length === 1) {
      // 1-tap addition if single variant and in stock
      const variant = productVariants[0];
      if ((variant.stock ?? 0) > 0) {
        addToCart(variant.id);
      } else {
        setSelectedProductId(p.id);
        setTimeout(() => {
          document.getElementById(`prod-card-${p.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 100);
      }
    } else {
      // Expand product variants list
      setSelectedProductId(p.id);
      setTimeout(() => {
        document.getElementById(`prod-card-${p.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 100);
    }
  }, [variants, addToCart]);

  // Keyboard navigation & hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // '/' focuses search
      if (e.key === "/" && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }

      // 'Esc' clears search
      if (e.key === "Escape" && document.activeElement === searchInputRef.current) {
        setSearchQuery("");
        setSelectedProductId(null);
      }

      // 'Ctrl+Enter' triggers checkout
      const state = useAppStore.getState();
      if (e.ctrlKey && e.key === "Enter" && state.cart.length > 0 && !state.isLoading) {
        e.preventDefault();
        handleCheckoutSubmit();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleCheckoutSubmit]);

  // -------------------------------------------------------------------------
  // FILTER PRODUCTS BY SEARCH QUERY
  // -------------------------------------------------------------------------
  const filteredProducts = products.filter((p) => {
    const query = searchQuery.toLowerCase();
    
    // Match parent product fields
    const matchesProduct =
      p.name.toLowerCase().includes(query) ||
      p.category.toLowerCase().includes(query);

    // Match variant SKUs
    const productVariants = variants.filter((v) => v.product_id === p.id);
    const matchesSku = productVariants.some((v) =>
      v.sku.toLowerCase().includes(query)
    );

    return matchesProduct || matchesSku;
  });

  // Automatically select the single product if search filters down to exactly 1 product
  useEffect(() => {
    if (filteredProducts.length === 1 && searchQuery.trim() !== "") {
      const timer = setTimeout(() => {
        setSelectedProductId(filteredProducts[0].id);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [filteredProducts, searchQuery]);

  // -------------------------------------------------------------------------
  // PRICE / TOTALS CALCULATIONS
  // -------------------------------------------------------------------------
  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const totalAmount = Math.max(0, subtotal - cartDiscount);
  const totalItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const favoriteProducts = products.filter((p) => p.is_favorite);

  // Pulse micro-animation for cart updates on mobile switcher
  useEffect(() => {
    if (totalItemsCount > prevItemsCountRef.current) {
      setPulseCart(true);
      const timer = setTimeout(() => setPulseCart(false), 500);
      return () => clearTimeout(timer);
    }
    prevItemsCountRef.current = totalItemsCount;
  }, [totalItemsCount]);



  const paymentOptions = ["Cash", "eSewa", "Khalti", "Fonepay"] as const;

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full overflow-hidden">
      
      {/* MOBILE SUB-TAB SWITCHER */}
      <div className="flex lg:hidden bg-slate-100 dark:bg-slate-950 p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 mb-4 shrink-0">
        <button
          type="button"
          onClick={() => setActiveSubTab("products")}
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
          onClick={() => setActiveSubTab("cart")}
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

      <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6 flex-1 min-h-0 overflow-hidden">
        
        {/* LEFT COLUMN: SEARCH & PRODUCTS GRID (8 Cols) */}
        <div className={`lg:col-span-7 flex flex-col h-full min-h-0 min-w-0 pr-1 ${activeSubTab === "products" ? "flex" : "hidden lg:flex"}`}>
        {/* Instant Search Bar */}
        <div className="relative shrink-0 mb-4">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder={placeholder}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              // Clear product selection when search text is edited
              if (selectedProductId) setSelectedProductId(null);
            }}
            className="block w-full pl-10 pr-4 md:pr-12 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 transition-all shadow-sm"
          />
          <div className="hidden md:flex absolute right-3.5 top-1/2 -translate-y-1/2 items-center gap-1 text-[10px] text-muted-foreground font-mono bg-secondary px-1.5 py-0.5 rounded border border-border">
            <Keyboard className="w-3 h-3" />
            <span>/</span>
          </div>
        </div>

        {/* Favorite Chips */}
        {favoriteProducts.length > 0 && (
          <div className="flex items-center gap-2 mb-4 shrink-0 select-none w-full overflow-hidden">
            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider shrink-0 mr-1 py-1 px-2.5 bg-slate-200 dark:bg-slate-800 rounded-lg">
              Favorites
            </span>
            <div className="relative flex-1 overflow-hidden flex items-center">
              {/* Left Fade Overlay */}
              <div 
                className={`absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-white to-transparent dark:from-slate-950 pointer-events-none z-10 transition-opacity duration-300 ${
                  canScrollLeft ? "opacity-100" : "opacity-0"
                }`} 
              />
              
              {/* Scrollable List */}
              <div
                ref={favScrollRef}
                onScroll={checkScroll}
                className="flex-1 flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1 w-full"
              >
                {favoriteProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleFavoriteClick(p)}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 hover:border-amber-500 rounded-full text-slate-900 dark:text-white text-xs font-semibold shadow-sm transition-all active:scale-[0.98] shrink-0 whitespace-nowrap"
                  >
                    <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500 shrink-0" />
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
              
              {/* Right Fade Overlay */}
              <div 
                className={`absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-white to-transparent dark:from-slate-950 pointer-events-none z-10 transition-opacity duration-300 ${
                  canScrollRight ? "opacity-100" : "opacity-0"
                }`} 
              />
            </div>
          </div>
        )}

        {/* Dynamic Display Grid */}
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
                onClick={() => router.push("/inventory?add=true")}
                className="mt-5 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:opacity-95 shadow transition-all active:scale-[0.99]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{products.length === 0 ? "Go to Inventory & Add Product" : "Add New SKU"}</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredProducts.map((p) => {
                const isSelected = selectedProductId === p.id;
                const productVariants = variants.filter((v) => v.product_id === p.id);
                const totalStock = productVariants.reduce((sum, v) => sum + (v.stock ?? 0), 0);

                return (
                  <div
                    key={p.id}
                    id={`prod-card-${p.id}`}
                    onClick={() => setSelectedProductId(isSelected ? null : p.id)}
                    className={`bg-card border rounded-xl p-4 transition-all duration-150 cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? "border-primary ring-1 ring-primary/50 shadow-sm"
                        : "border-border hover:border-muted-foreground/30 hover:bg-muted/5"
                    }`}
                  >
                    <div>
                      {/* Name & Category strip */}
                      <div className="flex justify-between items-start gap-2">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-secondary text-muted-foreground font-mono uppercase tracking-wider">
                          {p.category}
                        </span>
                        <span className={`text-xs font-bold font-mono ${totalStock === 0 ? "text-red-500" : "text-emerald-500"}`}>
                          {totalStock === 0 ? "Out of Stock" : `${totalStock} in stock`}
                        </span>
                      </div>

                      <h3 className="font-semibold text-sm sm:text-base text-foreground mt-2 leading-tight">
                        {p.name}
                      </h3>
                    </div>

                    {/* DYNAMIC VARIANT PICKER LIST (COLLAPSED BY DEFAULT) */}
                    <div className="mt-4 pt-3.5 border-t border-border/60">
                      {isSelected ? (
                        <div className="space-y-1.5">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">
                            Select Size/Color Variant:
                          </p>
                          <div className="flex flex-col gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                            {productVariants.map((v) => {
                              const inCartCount = cart.find(c => c.variant_id === v.id)?.quantity ?? 0;
                              const isOutOfStock = (v.stock ?? 0) === 0;

                              return (
                                <button
                                  key={v.id}
                                  disabled={isOutOfStock}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    addToCart(v.id);
                                  }}
                                  className={`w-full flex items-center justify-between p-2 rounded-lg border text-left text-xs font-medium transition-all ${
                                    isOutOfStock
                                      ? "bg-slate-100/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-950 text-slate-400 dark:text-slate-600 cursor-not-allowed"
                                      : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:border-primary hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-900 dark:text-white"
                                  }`}
                                >
                                  <div className="flex flex-col">
                                    <span className="font-bold text-slate-900 dark:text-white">
                                      Size {v.size} / {v.color}
                                    </span>
                                    <span className="text-[9px] text-slate-500 font-mono mt-0.5">
                                      SKU: {v.sku}
                                    </span>
                                  </div>

                                  <div className="text-right flex items-center gap-2">
                                    <div className="mr-1">
                                      <p className="font-bold text-slate-900 dark:text-white">Rs. {v.price.toLocaleString()}</p>
                                      <p className={`text-[9px] ${v.stock && v.stock <= p.low_stock_threshold ? "text-amber-500 font-bold" : "text-slate-500"}`}>
                                        {isOutOfStock ? "Sold Out" : `${v.stock} left`}
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

      {/* RIGHT COLUMN: HIGH-SPEED CART TERMINAL PANEL (5 Cols) */}
      <div className={`lg:col-span-5 bg-card border border-border rounded-xl shadow-sm flex flex-col h-full min-h-0 overflow-hidden ${activeSubTab === "cart" ? "flex" : "hidden lg:flex"}`}>
        
        {/* Cart Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0 bg-muted/20">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground">Billing Cart</h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsCustomOpen(true)}
              className="text-[10px] sm:text-[11px] font-bold px-2 py-1 sm:px-2.5 sm:py-1.5 border border-border bg-card text-muted-foreground hover:text-foreground rounded-lg transition-all flex items-center gap-1 shadow-sm"
            >
              <Plus className="w-3 h-3" />
              <span>Custom</span>
            </button>
            <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/10">
              {totalItemsCount} Item{totalItemsCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Dynamic Cart Ledger Items */}
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
                  {/* Quantity adjustment buttons (44x44px target compliant) */}
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

        {/* ERROR STRIP */}
        {errorMsg && (
          <div className="px-5 py-2.5 bg-red-500/10 border-t border-b border-red-500/20 flex items-start gap-2.5 text-xs text-red-400 shrink-0">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="leading-normal">{errorMsg}</p>
          </div>
        )}

        {/* CHECKOUT CONFIGURATION BLOCK (Fixed footer) */}
        <div className="px-5 py-4 border-t border-border space-y-4 shrink-0 bg-muted/10">
          
          {/* Customer Meta Row */}
          <div className="flex flex-col sm:grid sm:grid-cols-2 gap-3">
            <div className="relative w-full">
              <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Customer Name"
                maxLength={100}
                value={customerName}
                onChange={(e) => setCustomerDetails(e.target.value, customerPhone)}
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
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^0-9+\-\s]/g, "");
                  setCustomerDetails(customerName, cleaned);
                }}
                className="block w-full pl-8 pr-2 py-3 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs focus:outline-none text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 h-11"
              />
            </div>
          </div>

          {/* Discount & Payment Row */}
          <div className="flex flex-col sm:grid sm:grid-cols-12 gap-3 items-center">
            {/* Custom Discount Input */}
            <div className="w-full sm:col-span-5 relative">
              <Percent className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="number"
                min={0}
                max={subtotal}
                placeholder="Discount Rs."
                value={cartDiscount || ""}
                onChange={(e) => {
                  const val = Number(e.target.value);
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

            {/* Payment Method Selector Grid */}
            <div className="w-full sm:col-span-7 flex gap-1 justify-between">
              {paymentOptions.map((opt) => {
                const isSel = paymentMethod === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setPaymentMethod(opt)}
                    className={`flex-1 text-xs font-bold py-2 rounded-lg border text-center transition-all h-11 min-h-[44px] flex items-center justify-center ${
                      isSel
                        ? "bg-primary border-primary text-primary-foreground shadow-sm"
                        : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-muted-foreground hover:text-foreground hover:bg-slate-100 dark:hover:bg-slate-900"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Checkout Totals & Button */}
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
              onClick={handleCheckoutSubmit}
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

    </div>

      {/* ADD CUSTOM ITEM DIALOG */}
      {isCustomOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-md flex flex-col shadow-lg overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/20">
              <h3 className="font-bold text-sm text-foreground">Add Custom Cart Item</h3>
              <button
                type="button"
                onClick={() => {
                  setIsCustomOpen(false);
                  setCustomName("");
                  setCustomPrice("");
                }}
                className="text-muted-foreground hover:text-foreground p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Form Body */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!customName || !customPrice) return;
                addCustomToCart(customName, Number(customPrice));
                setIsCustomOpen(false);
                setCustomName("");
                setCustomPrice("");
              }}
              className="p-5 space-y-4"
            >
              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Item Name / Description
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  placeholder="e.g. Hemming/Alteration, Gift Wrap"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="block w-full px-3 h-10 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Price (NPR)
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  placeholder="e.g. 150"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  className="block w-full px-3 h-10 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs focus:outline-none focus:border-primary text-slate-900 dark:text-white font-bold"
                />
              </div>
              {/* Footer Buttons */}
              <div className="flex gap-3 pt-3 border-t border-border/40">
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomOpen(false);
                    setCustomName("");
                    setCustomPrice("");
                  }}
                  className="flex-1 h-10 border border-border rounded-lg text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 h-10 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:opacity-95 shadow transition-all"
                >
                  Add to Cart
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
