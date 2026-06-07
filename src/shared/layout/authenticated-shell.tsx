"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAppStore } from "@/lib/store/useAppStore";
import { filterActiveStaffDelegations, formatStaffPrivilege } from "@/lib/staff-capabilities";
import Sidebar from "@/shared/layout/sidebar";
import ReceiptModal from "@/shared/ui/receipt-modal";
import { Clock3, KeyRound, Loader2, Store, WifiOff } from "lucide-react";
import { ErrorBoundary } from "@/shared/ui/error-boundary";

export default function AuthenticatedShell({
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
    activeDelegations,
    sessionStatus,
  } = useAppStore();

  useEffect(() => {
    initializeSession();
  }, [initializeSession]);

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

  useEffect(() => {
    if (errorMsg) {
      const timer = setTimeout(() => {
        clearError();
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg, clearError]);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/");
    }
  }, [user, isLoading, router]);

  if (isLoading && !user) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-center p-6">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-50 dark:opacity-20 pointer-events-none" />

        <div className="relative z-10 space-y-4">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary flex items-center justify-center shadow-lg border border-primary/20 animate-pulse">
            <Store className="w-6 h-6 text-primary-foreground" />
          </div>

          <div className="flex items-center justify-center gap-2 text-foreground">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="font-semibold text-sm">Syncing PaisaPOS database...</span>
          </div>

          <p className="text-xs text-muted-foreground max-w-xs leading-normal">
            Verifying store session credentials and downloading real-time variant stock balances.
          </p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const isBillingRoute = pathname === "/billing";
  const releasedActiveDelegations = filterActiveStaffDelegations(activeDelegations);

  return (
    <div className="flex flex-col md:flex-row h-dvh bg-background md:overflow-hidden overflow-y-auto relative">
      <Sidebar />

      <main className="flex-1 flex flex-col min-h-0 overflow-hidden bg-background">
        {!isOnline && (
          <div id="offline-warning-banner" className="bg-amber-500/90 backdrop-blur text-slate-950 px-4 py-2.5 text-xs font-semibold flex items-center justify-center gap-2 border-b border-amber-600/30 animate-slide-down shrink-0">
            <WifiOff className="w-4 h-4 text-slate-950 animate-pulse" />
            <span>Offline Mode - Connection lost. All actions will fail until internet access is restored.</span>
          </div>
        )}

        {isOnline && sessionStatus === "degraded" && (
          <div id="degraded-session-banner" className="bg-amber-500/90 backdrop-blur text-slate-950 px-4 py-2.5 text-xs font-semibold flex items-center justify-center gap-2 border-b border-amber-600/30 shrink-0">
            <WifiOff className="w-4 h-4 text-slate-950" />
            <span>Session sync is temporarily unavailable. Existing workspace data is preserved while we reconnect.</span>
          </div>
        )}

        {user.role === "cashier" && releasedActiveDelegations.length > 0 && (
          <div className="bg-primary/10 text-primary px-4 py-2.5 text-xs font-semibold flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-primary/20 shrink-0">
            <span className="inline-flex items-center gap-2">
              <KeyRound className="w-4 h-4" />
              Temporary access active
            </span>
            <span className="inline-flex items-center gap-1.5 text-foreground/80">
              {releasedActiveDelegations.map((delegation) => formatStaffPrivilege(delegation.scope)).join(", ")}
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Clock3 className="w-3.5 h-3.5" />
              Expires {new Date(releasedActiveDelegations[0].expires_at).toLocaleTimeString("en-NP", {
                timeZone: "Asia/Kathmandu",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        )}

        <div className={`flex-1 flex flex-col min-h-0 ${
          isBillingRoute ? "md:overflow-hidden overflow-y-auto" : "overflow-y-auto"
        } px-4 py-5 sm:p-6 lg:p-8`}>
          <ErrorBoundary fallbackName="Workspace Panel">
            {children}
          </ErrorBoundary>
        </div>
      </main>

      <ReceiptModal />
    </div>
  );
}
