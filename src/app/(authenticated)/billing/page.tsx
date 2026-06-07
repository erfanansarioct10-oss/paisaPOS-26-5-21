"use client";

import React, { useEffect } from "react";
import { useAppStore } from "@/lib/store/useAppStore";
import BillingTab from "@/features/billing/components/billing-tab";
import { ErrorBoundary } from "@/shared/ui/error-boundary";

export default function BillingPage() {
  const { setTab, cart } = useAppStore();

  // Sync active tab in global store on component mount
  useEffect(() => {
    setTab("billing");
  }, [setTab]);

  // Page reload / tab close warning guard
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (cart.length > 0) {
        e.preventDefault();
        e.returnValue = "You have items in your shopping cart. Are you sure you want to leave?";
        return e.returnValue;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [cart]);

  // Browser back/forward navigation warning guard
  useEffect(() => {
    if (cart.length === 0) return;

    // Push a dummy history state so we can intercept the popstate action
    window.history.pushState({ protected: true }, "", window.location.href);

    const handlePopState = () => {
      if (cart.length > 0) {
        const confirmLeave = window.confirm(
          "Abandon Active Checkout? You have items in your shopping cart. Leaving this page will keep your cart in the background."
        );
        if (!confirmLeave) {
          // Push state again to restore the navigation guard
          window.history.pushState({ protected: true }, "", window.location.href);
        } else {
          // Allow leaving: Go back in history
          window.history.back();
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [cart]);

  return (
    <ErrorBoundary fallbackName="Billing Workspace">
      <BillingTab />
    </ErrorBoundary>
  );
}
