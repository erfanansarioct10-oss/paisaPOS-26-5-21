"use client";

import React, { useEffect } from "react";
import { useAppStore } from "@/lib/store/useAppStore";
import DashboardTab from "@/components/dashboard-tab";

export default function DashboardOverviewPage() {
  const { setTab } = useAppStore();

  // Sync active tab in global store on component mount
  useEffect(() => {
    setTab("dashboard");
  }, [setTab]);

  return <DashboardTab />;
}
