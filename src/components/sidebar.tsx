"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store/useAppStore";
import {
  LayoutDashboard,
  Calculator,
  Package,
  History,
  Settings,
  LogOut,
  Store,
  Menu,
  X,
  User,
} from "lucide-react";

export default function Sidebar() {
  const { activeTab, store, user, signOut, cart } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);

  const navItems = [
    { id: "dashboard", name: "Dashboard", icon: LayoutDashboard, path: "/dashboard" },
    { id: "billing", name: "Billing POS", icon: Calculator, path: "/billing" },
    { id: "inventory", name: "Inventory", icon: Package, path: "/inventory" },
    { id: "history", name: "Invoices", icon: History, path: "/invoices" },
    { id: "settings", name: "Settings", icon: Settings, path: "/settings" },
  ] as const;

  return (
    <>
      {/* MOBILE BAR */}
      <div className="flex md:hidden items-center justify-between px-4 py-3 bg-card border-b border-border text-foreground sticky top-0 z-40">
        <div className="flex items-center gap-2">
          <Store className="w-5 h-5 text-primary" />
          <span className="font-outfit font-bold tracking-tight text-lg">PaisaPOS</span>
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-1 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-1 focus:ring-primary rounded"
          aria-label="Toggle Menu"
        >
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* BACKDROP FOR MOBILE */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
        />
      )}

      {/* SIDEBAR CONTAINER */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-card border-r border-border flex flex-col transition-transform duration-200 ease-in-out md:translate-x-0 md:static md:h-screen ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* BRANDING HEADER */}
        <div className="h-16 flex items-center gap-2.5 px-6 border-b border-border">
          <Store className="w-6 h-6 text-primary shrink-0" />
          <div className="flex flex-col">
            <span className="font-outfit font-extrabold tracking-tight text-xl text-foreground">
               PaisaPOS
            </span>
            <span className="text-[10px] text-muted-foreground font-mono tracking-widest uppercase">
              Nepali Boutique Sync
            </span>
          </div>
        </div>

        {/* ACTIVE PROFILE STRIP */}
        <div className="px-5 py-4 border-b border-border bg-muted/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0 border border-primary/20">
              <User className="w-4 h-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold truncate text-foreground leading-tight">
                {user?.name || "Sunil Shrestha"}
              </span>
              <span className="text-xs text-muted-foreground truncate leading-normal">
                {store?.name || "KTM Streetwear"}
              </span>
            </div>
          </div>
        </div>

        {/* NAVIGATION LINKS */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const cartItemsCount = item.id === "billing" && cart && cart.length > 0
              ? cart.reduce((sum, i) => sum + i.quantity, 0)
              : 0;

            return (
              <Link
                key={item.id}
                href={item.path}
                onClick={() => setIsOpen(false)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.name}</span>
                {cartItemsCount > 0 && (
                  <span className="ml-auto px-1.5 py-0.5 rounded-full bg-rose-500 text-white font-mono text-[9px] font-bold shrink-0 shadow-sm animate-pulse">
                    {cartItemsCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* FOOTER SIGN OUT BUTTON */}
        <div className="p-4 border-t border-border mt-auto">
          <button
            onClick={signOut}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-lg text-red-500 hover:bg-red-500/10 transition-all border border-transparent hover:border-red-500/20"
          >
            <span className="flex items-center gap-2">
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
