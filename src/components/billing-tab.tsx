"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAppStore, Product, ProductVariant } from "@/lib/store/useAppStore";
import {
  Search,
  ShoppingCart,
  Trash2,
  AlertTriangle,
  Loader2,
  User,
  Phone,
  Tag,
  Check,
  Percent,
  Keyboard,
} from "lucide-react";

export default function BillingTab() {
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
    removeFromCart,
    updateCartQuantity,
    setCartDiscount,
    setCustomerDetails,
    setPaymentMethod,
    checkout,
  } = useAppStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  
  // Mobile responsiveness tab switcher state
  const [activeSubTab, setActiveSubTab] = useState<"products" | "cart">("products");
  
  // Cart bounce pulse micro-animation states
  const [pulseCart, setPulseCart] = useState(false);
  const prevItemsCountRef = useRef(0);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus search input on tab mount
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

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
      if (e.ctrlKey && e.key === "Enter" && cart.length > 0 && !isLoading) {
        e.preventDefault();
        handleCheckoutSubmit();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cart, isLoading]);

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
      setSelectedProductId(filteredProducts[0].id);
    }
  }, [filteredProducts, searchQuery]);

  // -------------------------------------------------------------------------
  // PRICE / TOTALS CALCULATIONS
  // -------------------------------------------------------------------------
  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const totalAmount = Math.max(0, subtotal - cartDiscount);
  const totalItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Pulse micro-animation for cart updates on mobile switcher
  useEffect(() => {
    if (totalItemsCount > prevItemsCountRef.current) {
      setPulseCart(true);
      const timer = setTimeout(() => setPulseCart(false), 500);
      return () => clearTimeout(timer);
    }
    prevItemsCountRef.current = totalItemsCount;
  }, [totalItemsCount]);

  const handleCheckoutSubmit = async () => {
    const success = await checkout();
    if (success) {
      // Set focus back to search after successful checkout
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 300);
    }
  };

  const paymentOptions = ["Cash", "eSewa", "Khalti", "Fonepay"] as const;

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full overflow-hidden">
      
      {/* MOBILE SUB-TAB SWITCHER */}
      <div className="flex lg:hidden bg-slate-950 p-1.5 rounded-xl border border-slate-800 mb-4 shrink-0">
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
            placeholder="Type Product, Category or SKU... (Press '/' to focus, 'Esc' to clear)"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              // Clear product selection when search text is edited
              if (selectedProductId) setSelectedProductId(null);
            }}
            className="block w-full pl-10 pr-12 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-white placeholder-slate-600 transition-all shadow-sm"
          />
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] text-muted-foreground font-mono bg-secondary px-1.5 py-0.5 rounded border border-border">
            <Keyboard className="w-3 h-3" />
            <span>/</span>
          </div>
        </div>

        {/* Dynamic Display Grid */}
        <div className="flex-1 overflow-y-auto pb-6">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center bg-card border border-border rounded-xl p-6">
              <Search className="w-10 h-10 text-muted-foreground mb-3 opacity-30 animate-bounce" />
              <h3 className="text-sm font-bold text-foreground">No Products Found</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                Could not find any items matching "{searchQuery}". Check spelling or create a new SKU in the Inventory tab.
              </p>
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
                                      ? "bg-slate-900/50 border-slate-950 text-slate-600 cursor-not-allowed"
                                      : "bg-slate-950 border-slate-800 hover:border-primary hover:bg-slate-900 text-white"
                                  }`}
                                >
                                  <div className="flex flex-col">
                                    <span className="font-bold text-white">
                                      Size {v.size} / {v.color}
                                    </span>
                                    <span className="text-[9px] text-slate-500 font-mono mt-0.5">
                                      SKU: {v.sku}
                                    </span>
                                  </div>

                                  <div className="text-right flex items-center gap-2">
                                    <div className="mr-1">
                                      <p className="font-bold text-white">Rs. {v.price.toLocaleString()}</p>
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
          <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/10">
            {totalItemsCount} Item{totalItemsCount !== 1 ? "s" : ""}
          </span>
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
                  <span className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                    SKU: {item.sku} (Size {item.size} / {item.color})
                  </span>
                  <span className="text-[10px] text-primary font-bold mt-1">
                    Rs. {item.price.toLocaleString()} each
                  </span>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {/* Quantity adjustment buttons (44x44px target compliant) */}
                  <div className="flex items-center border border-border bg-slate-950 rounded-lg shadow-sm">
                    <button
                      onClick={() => updateCartQuantity(item.variant_id, item.quantity - 1)}
                      className="w-8 h-8 flex items-center justify-center hover:bg-slate-900 text-muted-foreground hover:text-foreground font-extrabold focus:outline-none transition-colors border-r border-border"
                    >
                      -
                    </button>
                    <span className="w-8 text-center font-bold font-mono text-xs text-white">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateCartQuantity(item.variant_id, item.quantity + 1)}
                      className="w-8 h-8 flex items-center justify-center hover:bg-slate-900 text-muted-foreground hover:text-foreground font-extrabold focus:outline-none transition-colors border-l border-border"
                    >
                      +
                    </button>
                  </div>

                  <button
                    onClick={() => removeFromCart(item.variant_id)}
                    className="p-2 text-red-500 border border-transparent hover:border-red-500/20 hover:bg-red-500/10 rounded-lg transition-all"
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
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Customer Name"
                value={customerName}
                onChange={(e) => setCustomerDetails(e.target.value, customerPhone)}
                className="block w-full pl-8 pr-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs focus:outline-none text-white"
              />
            </div>
            <div className="relative">
              <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Phone Number"
                value={customerPhone}
                onChange={(e) => setCustomerDetails(customerName, e.target.value)}
                className="block w-full pl-8 pr-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs focus:outline-none text-white"
              />
            </div>
          </div>

          {/* Discount & Payment Row */}
          <div className="grid grid-cols-12 gap-3 items-center">
            {/* Custom Discount Input */}
            <div className="col-span-5 relative">
              <Percent className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="number"
                min={0}
                placeholder="Discount Rs."
                value={cartDiscount || ""}
                onChange={(e) => setCartDiscount(Number(e.target.value))}
                className="block w-full pl-8 pr-2 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs focus:outline-none font-bold text-red-500"
              />
            </div>

            {/* Payment Method Selector Grid */}
            <div className="col-span-7 flex gap-1 justify-between">
              {paymentOptions.map((opt) => {
                const isSel = paymentMethod === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setPaymentMethod(opt)}
                    className={`flex-1 text-[10px] font-bold py-1.5 rounded-lg border text-center transition-all ${
                      isSel
                        ? "bg-primary border-primary text-primary-foreground shadow-sm"
                        : "bg-slate-950 border-slate-800 text-muted-foreground hover:text-foreground"
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
                    <span>Checkout (Ctrl+Enter)</span>
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

  </div>
  );
}
