"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAppStore } from "@/lib/store/useAppStore";
import Sidebar from "@/components/sidebar";
import ReceiptModal from "@/components/receipt-modal";
import { Loader2, Store, WifiOff, AlertCircle, X } from "lucide-react";
import { ErrorBoundary } from "@/components/error-boundary";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOnline, setIsOnline] = useState(typeof window !== "undefined" ? window.navigator.onLine : true);

  const {
    user,
    isLoading,
    initializeSession,
    errorMsg,
    clearError,
  } = useAppStore();

  // Run session initialization on mount
  useEffect(() => {
    initializeSession();
  }, [initializeSession]);

  // Monitor connectivity state
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Auto-dismiss errorMsg toast after 6 seconds
  useEffect(() => {
    if (errorMsg) {
      const timer = setTimeout(() => {
        clearError();
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg, clearError]);

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
    <div className="flex flex-col md:flex-row h-screen bg-background overflow-hidden relative">
      {/* 1. NAVIGATION DRAWER SIDEBAR */}
      <Sidebar />

      {/* 2. DYNAMIC WORKSPACE PANEL */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden bg-background">
        {/* Offline Warning Banner */}
        {!isOnline && (
          <div className="bg-amber-500/90 backdrop-blur text-slate-950 px-4 py-2.5 text-xs font-semibold flex items-center justify-center gap-2 border-b border-amber-600/30 animate-slide-down shrink-0">
            <WifiOff className="w-4 h-4 text-slate-950 animate-pulse" />
            <span>Offline Mode — Connection lost. All actions will fail until internet access is restored.</span>
          </div>
        )}

        <div className={`flex-1 flex flex-col min-h-0 ${
          isBillingRoute ? "overflow-hidden" : "overflow-y-auto"
        } px-4 py-5 sm:p-6 lg:p-8`}>
          <ErrorBoundary fallbackName="Workspace Panel">
            {children}
          </ErrorBoundary>
        </div>
      </main>

      {/* 3. GLOBAL RECEIPT OVERLAY MODAL */}
      <ReceiptModal />

      {/* 4. GLOBAL ERROR FLOATING TOAST */}
      {errorMsg && (
        <div className="fixed top-4 right-4 z-[9999] max-w-sm w-full bg-slate-900/95 backdrop-blur-md border border-rose-500/20 text-rose-200 rounded-xl p-4 shadow-2xl flex items-start gap-3 transition-all duration-300 animate-slide-down">
          <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            <h4 className="text-xs font-bold text-rose-400">System Error Alert</h4>
            <p className="text-xs leading-normal">{errorMsg}</p>
          </div>
          <button 
            onClick={clearError}
            className="p-1 rounded-lg hover:bg-rose-500/10 text-rose-400 hover:text-rose-200 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
