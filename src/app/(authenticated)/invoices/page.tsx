"use client";

import React, { useEffect } from "react";
import { useAppStore } from "@/lib/store/useAppStore";
import HistoryTab from "@/components/history-tab";

export default function InvoicesPage() {
  const { setTab } = useAppStore();

  // Sync active tab in global store on component mount
  // Maps the flat URL path '/invoices' to the store tab 'history'
  useEffect(() => {
    setTab("history");
  }, [setTab]);

  return <HistoryTab />;
}
