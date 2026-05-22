"use client";

import React, { useEffect } from "react";
import { useAppStore } from "@/lib/store/useAppStore";
import InventoryTab from "@/components/inventory-tab";
import { ErrorBoundary } from "@/components/error-boundary";

export default function InventoryPage() {
  const { setTab } = useAppStore();

  // Sync active tab in global store on component mount
  useEffect(() => {
    setTab("inventory");
  }, [setTab]);

  return (
    <ErrorBoundary fallbackName="Inventory Workspace">
      <InventoryTab />
    </ErrorBoundary>
  );
}
