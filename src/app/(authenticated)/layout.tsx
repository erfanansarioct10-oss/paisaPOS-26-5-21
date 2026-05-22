"use client";

import React, { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAppStore } from "@/lib/store/useAppStore";
import Sidebar from "@/components/sidebar";
import ReceiptModal from "@/components/receipt-modal";
import { Loader2, Store } from "lucide-react";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    user,
    isLoading,
    initializeSession,
  } = useAppStore();

  // Run session initialization on mount
  useEffect(() => {
    initializeSession();
  }, [initializeSession]);

  // Route protection: If loaded and user profile is absent, send back to credentials page
  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/");
    }
  }, [user, isLoading, router]);

  // Loading Screen Layout
  if (isLoading && !user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-center p-6">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30 pointer-events-none" />
        
        <div className="relative z-10 space-y-4">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary flex items-center justify-center shadow-lg border border-primary/20 animate-pulse">
            <Store className="w-6 h-6 text-primary-foreground" />
          </div>
          
          <div className="flex items-center justify-center gap-2 text-white">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="font-semibold text-sm">Syncing PaisaPOS database...</span>
          </div>
          
          <p className="text-xs text-slate-500 max-w-xs leading-normal">
            Verifying store session credentials and downloading real-time variant stock balances.
          </p>
        </div>
      </div>
    );
  }

  // Double check protection bypass
  if (!user) return null;

  // Determine if we should overflow-hidden (specifically for Billing POS tab workspace)
  const isBillingRoute = pathname === "/billing";

  return (
    <div className="flex flex-col md:flex-row h-screen bg-background overflow-hidden">
      {/* 1. NAVIGATION DRAWER SIDEBAR */}
      <Sidebar />

      {/* 2. DYNAMIC WORKSPACE PANEL */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden bg-background">
        <div className={`flex-1 flex flex-col min-h-0 ${
          isBillingRoute ? "overflow-hidden" : "overflow-y-auto"
        } px-4 py-5 sm:p-6 lg:p-8`}>
          {children}
        </div>
      </main>

      {/* 3. GLOBAL RECEIPT OVERLAY MODAL */}
      <ReceiptModal />
    </div>
  );
}
