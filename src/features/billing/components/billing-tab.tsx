"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store/useAppStore";
import { BillingCartPanel } from "@/features/billing/components/billing-cart-panel";
import { BillingCustomItemDialog } from "@/features/billing/components/billing-custom-item-dialog";
import { BillingMobileTabs } from "@/features/billing/components/billing-mobile-tabs";
import { BillingProductBrowser } from "@/features/billing/components/billing-product-browser";
import type { BillingSubTab } from "@/features/billing/components/billing-ui-types";

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
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [activeSubTab, setActiveSubTab] = useState<BillingSubTab>("products");
  const [pulseCart, setPulseCart] = useState(false);
  const [placeholder, setPlaceholder] = useState("Search products...");

  const prevItemsCountRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    const isMobileTouch = window.matchMedia("(pointer: coarse)").matches;
    if (searchInputRef.current && !isMobileTouch) {
      searchInputRef.current.focus();
    }
  }, []);

  const handleCheckoutSubmit = useCallback(async () => {
    const success = await checkout();
    if (success) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 300);
    }
  }, [checkout]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && document.activeElement !== searchInputRef.current) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }

      if (event.key === "Escape" && document.activeElement === searchInputRef.current) {
        setSearchQuery("");
        setSelectedProductId(null);
      }

      const state = useAppStore.getState();
      if (event.ctrlKey && event.key === "Enter" && state.cart.length > 0 && !state.isLoading) {
        event.preventDefault();
        void handleCheckoutSubmit();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleCheckoutSubmit]);

  const filteredProducts = useMemo(() => {
    const query = searchQuery.toLowerCase();

    return products.filter((product) => {
      const matchesProduct =
        product.name.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query);
      const productVariants = variants.filter((variant) => variant.product_id === product.id);
      const matchesSku = productVariants.some((variant) =>
        variant.sku.toLowerCase().includes(query),
      );

      return matchesProduct || matchesSku;
    });
  }, [products, searchQuery, variants]);

  useEffect(() => {
    if (filteredProducts.length === 1 && searchQuery.trim() !== "") {
      const timer = setTimeout(() => {
        setSelectedProductId(filteredProducts[0].id);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [filteredProducts, searchQuery]);

  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const totalAmount = Math.max(0, subtotal - cartDiscount);
  const totalItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

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
      <BillingMobileTabs
        activeSubTab={activeSubTab}
        onChange={setActiveSubTab}
        pulseCart={pulseCart}
        totalItemsCount={totalItemsCount}
      />

      <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6 flex-1 min-h-0 overflow-hidden">
        <BillingProductBrowser
          activeSubTab={activeSubTab}
          cart={cart}
          filteredProducts={filteredProducts}
          onAddToCart={addToCart}
          onGoToInventoryAdd={() => router.push("/inventory?add=true")}
          placeholder={placeholder}
          products={products}
          searchInputRef={searchInputRef}
          searchQuery={searchQuery}
          selectedProductId={selectedProductId}
          setSearchQuery={setSearchQuery}
          setSelectedProductId={setSelectedProductId}
          variants={variants}
        />

        <BillingCartPanel
          activeSubTab={activeSubTab}
          cart={cart}
          cartDiscount={cartDiscount}
          customerName={customerName}
          customerPhone={customerPhone}
          errorMsg={errorMsg}
          isLoading={isLoading}
          onCheckout={handleCheckoutSubmit}
          onOpenCustomItem={() => setIsCustomOpen(true)}
          paymentMethod={paymentMethod}
          paymentOptions={paymentOptions}
          removeFromCart={removeFromCart}
          setCartDiscount={setCartDiscount}
          setCustomerDetails={setCustomerDetails}
          setPaymentMethod={setPaymentMethod}
          subtotal={subtotal}
          totalAmount={totalAmount}
          totalItemsCount={totalItemsCount}
          updateCartQuantity={updateCartQuantity}
        />
      </div>

      <BillingCustomItemDialog
        customName={customName}
        customPrice={customPrice}
        isOpen={isCustomOpen}
        onAddCustomToCart={addCustomToCart}
        onClose={() => setIsCustomOpen(false)}
        setCustomName={setCustomName}
        setCustomPrice={setCustomPrice}
      />
    </div>
  );
}
