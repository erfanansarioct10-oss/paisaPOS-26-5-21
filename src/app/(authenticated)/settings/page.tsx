"use client";

import React, { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store/useAppStore";
import { updateStoreAction, updateProfileAction } from "@/app/actions";
import { useTheme } from "@/components/theme-provider";
import {
  Settings,
  Store,
  User,
  Save,
  LogOut,
  Loader2,
  CheckCircle,
  AlertCircle,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";

export default function SettingsPage() {
  const { store, user, signOut, initializeSession, setTab } = useAppStore();
  const { theme, setTheme } = useTheme();
  const [themeMounted, setThemeMounted] = useState(false);

  useEffect(() => {
    setTimeout(() => setThemeMounted(true), 0);
  }, []);

  const isActive = (t: typeof theme) => themeMounted && theme === t;

  // Sync active tab in global store on component mount
  useEffect(() => {
    setTab("settings");
  }, [setTab]);

  // Store fields
  const [storeName, setStoreName] = useState(store?.name || "");
  const [storePhone, setStorePhone] = useState(store?.phone || "");
  const [storeAddress, setStoreAddress] = useState(store?.address || "");
  const [storePanVat, setStorePanVat] = useState(store?.pan_vat || "");
  const [storeSaving, setStoreSaving] = useState(false);
  const [storeSuccess, setStoreSuccess] = useState(false);
  const [storeError, setStoreError] = useState<string | null>(null);

  // Profile fields
  const [profileName, setProfileName] = useState(user?.name || "");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);



  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setStoreError(null);
    setStoreSuccess(false);

    if (!storeName.trim()) {
      setStoreError("Store name is required.");
      return;
    }

    setStoreSaving(true);
    try {
      await updateStoreAction({
        name: storeName.trim(),
        phone: storePhone.trim(),
        address: storeAddress.trim(),
        panVat: storePanVat.trim(),
      });
      await initializeSession();
      setStoreSuccess(true);
      setTimeout(() => setStoreSuccess(false), 3000);
    } catch (err: unknown) {
      setStoreError(err instanceof Error ? err.message : "Failed to update store information.");
    } finally {
      setStoreSaving(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(false);

    if (!profileName.trim()) {
      setProfileError("Display name is required.");
      return;
    }

    setProfileSaving(true);
    try {
      await updateProfileAction({ name: profileName.trim() });
      await initializeSession();
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err: unknown) {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* PAGE HEADER */}
      <div>
        <h1 className="font-outfit font-extrabold text-2xl sm:text-3xl text-foreground tracking-tight flex items-center gap-2.5">
          <Settings className="w-7 h-7 text-primary" />
          Settings
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          Manage your store information and account preferences.
        </p>
      </div>

      {/* SETTINGS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* STORE INFORMATION CARD */}
        <form key={store?.id || "loading-store"} onSubmit={handleSaveStore} className="bg-card border border-border rounded-xl p-5 sm:p-6 shadow-sm space-y-5">
          <div className="flex items-center gap-2.5 pb-3 border-b border-border">
            <div className="p-2 bg-primary/10 text-primary rounded-lg">
              <Store className="w-4 h-4" />
            </div>
            <h2 className="font-semibold text-foreground">Store Information</h2>
          </div>

          {storeSuccess && (
            <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3 flex items-center gap-2.5 text-xs text-emerald-400">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <p>Store information updated successfully.</p>
            </div>
          )}
          {storeError && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-3 flex items-start gap-2.5 text-xs text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{storeError}</p>
            </div>
          )}

          <div>
            <label htmlFor="store-name" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Store Name *</label>
            <input id="store-name" type="text" required value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="e.g. KTM Boutique Hub" className="block w-full px-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
          </div>

          <div>
            <label htmlFor="store-phone" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Phone Number</label>
            <input id="store-phone" type="text" value={storePhone} onChange={(e) => setStorePhone(e.target.value)} placeholder="e.g. +977-9812345678" className="block w-full px-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
          </div>

          <div>
            <label htmlFor="store-address" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Address</label>
            <input id="store-address" type="text" value={storeAddress} onChange={(e) => setStoreAddress(e.target.value)} placeholder="e.g. New Road, Kathmandu" className="block w-full px-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
          </div>

          <div>
            <label htmlFor="store-panvat" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">PAN / VAT Number</label>
            <input id="store-panvat" type="text" value={storePanVat} onChange={(e) => setStorePanVat(e.target.value)} placeholder="e.g. 123456789" className="block w-full px-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
          </div>

          <button type="submit" disabled={storeSaving} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:opacity-95 shadow transition-all disabled:opacity-50">
            {storeSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{storeSaving ? "Saving..." : "Save Store Info"}</span>
          </button>
        </form>

        {/* ACCOUNT SETTINGS CARD */}
        <form key={user?.id || "loading-profile"} onSubmit={handleSaveProfile} className="bg-card border border-border rounded-xl p-5 sm:p-6 shadow-sm space-y-5 h-fit">
          <div className="flex items-center gap-2.5 pb-3 border-b border-border">
            <div className="p-2 bg-primary/10 text-primary rounded-lg">
              <User className="w-4 h-4" />
            </div>
            <h2 className="font-semibold text-foreground">Account Settings</h2>
          </div>

          {profileSuccess && (
            <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3 flex items-center gap-2.5 text-xs text-emerald-400">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <p>Profile updated successfully.</p>
            </div>
          )}
          {profileError && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-3 flex items-start gap-2.5 text-xs text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{profileError}</p>
            </div>
          )}

          <div>
            <label htmlFor="profile-name" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Display Name *</label>
            <input id="profile-name" type="text" required value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="e.g. Sunil Shrestha" className="block w-full px-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Email Address</label>
            <div className="px-4 py-2.5 bg-slate-100 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800/50 rounded-lg text-sm text-slate-500 dark:text-slate-400">{user?.email || "—"}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Email cannot be changed from settings.</p>
          </div>

          <button type="submit" disabled={profileSaving} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:opacity-95 shadow transition-all disabled:opacity-50">
            {profileSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{profileSaving ? "Saving..." : "Save Profile"}</span>
          </button>
        </form>

        {/* THEME SETTINGS CARD */}
        <div className="bg-card border border-border rounded-xl p-5 sm:p-6 shadow-sm space-y-5 h-fit">
          <div className="flex items-center gap-2.5 pb-3 border-b border-border">
            <div className="p-2 bg-primary/10 text-primary rounded-lg">
              <Sun className="w-4 h-4" />
            </div>
            <h2 className="font-semibold text-foreground">Theme Preferences</h2>
          </div>

          <p className="text-xs text-muted-foreground leading-normal">
            Choose how PaisaPOS looks on your device. This preference is saved locally on this browser.
          </p>

          <div className="grid grid-cols-3 gap-3">
            {/* Light Mode Option */}
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={`flex flex-col items-center gap-2.5 p-3.5 rounded-xl border text-center transition-all cursor-pointer ${
                isActive("light")
                  ? "border-primary bg-primary/5 text-primary ring-1 ring-primary"
                  : "border-border bg-slate-50 dark:bg-slate-950/40 hover:bg-slate-100 dark:hover:bg-slate-950/80 text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sun className={`w-5 h-5 ${isActive("light") ? "text-primary" : "text-slate-400"}`} />
              <span className="text-xs font-semibold">Light</span>
            </button>

            {/* Dark Mode Option */}
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={`flex flex-col items-center gap-2.5 p-3.5 rounded-xl border text-center transition-all cursor-pointer ${
                isActive("dark")
                  ? "border-primary bg-primary/5 text-primary ring-1 ring-primary"
                  : "border-border bg-slate-50 dark:bg-slate-950/40 hover:bg-slate-100 dark:hover:bg-slate-950/80 text-muted-foreground hover:text-foreground"
              }`}
            >
              <Moon className={`w-5 h-5 ${isActive("dark") ? "text-primary" : "text-slate-400"}`} />
              <span className="text-xs font-semibold">Dark</span>
            </button>

            {/* System Preference Option */}
            <button
              type="button"
              onClick={() => setTheme("system")}
              className={`flex flex-col items-center gap-2.5 p-3.5 rounded-xl border text-center transition-all cursor-pointer ${
                isActive("system")
                  ? "border-primary bg-primary/5 text-primary ring-1 ring-primary"
                  : "border-border bg-slate-50 dark:bg-slate-950/40 hover:bg-slate-100 dark:hover:bg-slate-950/80 text-muted-foreground hover:text-foreground"
              }`}
            >
              <Monitor className={`w-5 h-5 ${isActive("system") ? "text-primary" : "text-slate-400"}`} />
              <span className="text-xs font-semibold">System</span>
            </button>
          </div>
        </div>
      </div>

      {/* DANGER ZONE */}
      <div className="bg-card border border-red-500/20 rounded-xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-red-500/10">
          <h2 className="font-semibold text-red-500 text-sm">Danger Zone</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Sign out of your current session. You will need to enter your credentials again to access PaisaPOS.
        </p>
        <button onClick={signOut} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-all">
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}
