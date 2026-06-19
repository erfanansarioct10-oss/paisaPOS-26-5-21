"use client";

import React, { useActionState, useState, useEffect, useTransition } from "react";
import { useAppStore } from "@/lib/store/useAppStore";
import { updateProfileFormAction, updateStoreFormAction, updateSecurityPinAction } from "@/features/settings/server/actions";
import type { SettingsFormState } from "@/app/actions";
import { useTheme } from "@/shared/layout/theme-provider";
import { getStaffCapabilities } from "@/lib/staff-capabilities";
import { supabase } from "@/lib/supabase";
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
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
} from "lucide-react";

const initialFormState: SettingsFormState = { success: false };

export default function SettingsPage() {
  const { store, user, signOut, setTab, updateLocalStore, updateLocalUser } = useAppStore();
  const { theme, setTheme } = useTheme();
  const [themeMounted, setThemeMounted] = useState(false);
  const {
    canManageStoreSettings,
    canUpdateProfile,
  } = getStaffCapabilities(user);

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
  const [storeActionState, storeFormAction, storeSaving] = useActionState(updateStoreFormAction, initialFormState);

  // Profile fields
  const [profileName, setProfileName] = useState(user?.name || "");
  const [profileActionState, profileFormAction, profileSaving] = useActionState(updateProfileFormAction, initialFormState);

  useEffect(() => {
    if (storeActionState.success && storeActionState.savedAt) {
      updateLocalStore({
        name: storeName,
        phone: storePhone,
        address: storeAddress,
        pan_vat: storePanVat,
      });
    }
  }, [storeActionState.success, storeActionState.savedAt, storeName, storePhone, storeAddress, storePanVat, updateLocalStore]);

  useEffect(() => {
    if (profileActionState.success && profileActionState.savedAt) {
      updateLocalUser({
        name: profileName,
      });
    }
  }, [profileActionState.success, profileActionState.savedAt, profileName, updateLocalUser]);

  // Security PIN State
  const [pinSaving, startPinTransition] = useTransition();
  const [securityPin, setSecurityPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinPassword, setPinPassword] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);

  const [disablingPin, setDisablingPin] = useState(false);
  const [pinDisableModal, setPinDisableModal] = useState({ isOpen: false });
  const [pinDisablePassword, setPinDisablePassword] = useState("");
  const [pinDisableError, setPinDisableError] = useState<string | null>(null);

  const handleSaveSecurityPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    setPinSuccess(null);

    if (securityPin.length < 4 || securityPin.length > 6) {
      setPinError("Security PIN must be between 4 and 6 digits.");
      return;
    }
    if (securityPin !== confirmPin) {
      setPinError("New Security PIN and Confirmation PIN do not match.");
      return;
    }
    if (!pinPassword) {
      setPinError("Please enter your account password to authorize this change.");
      return;
    }

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user?.email || "",
        password: pinPassword,
      });

      if (authError) {
        setPinError("Incorrect password. Please try again.");
        return;
      }

      startPinTransition(async () => {
        try {
          await updateSecurityPinAction({ pin: securityPin });
          updateLocalUser({ has_security_pin: true });
          setPinSuccess("Security PIN updated successfully.");
          setSecurityPin("");
          setConfirmPin("");
          setPinPassword("");
          setPinError(null);
        } catch (err: unknown) {
          setPinError(err instanceof Error ? err.message : String(err));
        }
      });
    } catch (err: unknown) {
      setPinError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleConfirmDisablePin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinDisableError(null);
    setDisablingPin(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user?.email || "",
        password: pinDisablePassword,
      });

      if (authError) {
        setPinDisableError("Incorrect password. Please try again.");
        return;
      }

      await updateSecurityPinAction({ pin: "" });

      setPinDisableModal({ isOpen: false });
      setPinDisablePassword("");
      updateLocalUser({ has_security_pin: false });
      setPinSuccess("Security PIN has been disabled.");
    } catch (err: unknown) {
      setPinDisableError(err instanceof Error ? err.message : String(err));
    } finally {
      setDisablingPin(false);
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
          {canManageStoreSettings
            ? "Manage your store information and account preferences."
            : "Manage your account preferences."}
        </p>
      </div>

      {/* SETTINGS GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* STORE INFORMATION CARD */}
        {canManageStoreSettings && (
          <form key={store?.id || "loading-store"} action={storeFormAction} className="bg-card border border-border rounded-xl p-5 sm:p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2.5 pb-3 border-b border-border">
              <div className="p-2 bg-primary/10 text-primary rounded-lg">
                <Store className="w-4 h-4" />
              </div>
              <h2 className="font-semibold text-foreground">Store Information</h2>
            </div>

            {storeActionState.success && storeActionState.message && (
              <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3 flex items-center gap-2.5 text-xs text-emerald-400">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <p>{storeActionState.message}</p>
              </div>
            )}
            {storeActionState.error && (
              <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-3 flex items-start gap-2.5 text-xs text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p>{storeActionState.error}</p>
              </div>
            )}

            <div>
              <label htmlFor="store-name" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Store Name *</label>
              <input id="store-name" name="name" type="text" required value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="e.g. KTM Boutique Hub" className="block w-full px-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
            </div>

            <div>
              <label htmlFor="store-phone" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Phone Number</label>
              <input id="store-phone" name="phone" type="text" value={storePhone} onChange={(e) => setStorePhone(e.target.value)} placeholder="e.g. +977-9812345678" className="block w-full px-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
            </div>

            <div>
              <label htmlFor="store-address" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Address</label>
              <input id="store-address" name="address" type="text" value={storeAddress} onChange={(e) => setStoreAddress(e.target.value)} placeholder="e.g. New Road, Kathmandu" className="block w-full px-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
            </div>

            <div>
              <label htmlFor="store-panvat" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">PAN / VAT Number</label>
              <input id="store-panvat" name="panVat" type="text" value={storePanVat} onChange={(e) => setStorePanVat(e.target.value)} placeholder="e.g. 123456789" className="block w-full px-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
            </div>

            <button type="submit" disabled={storeSaving} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:opacity-95 shadow transition-all disabled:opacity-50">
              {storeSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{storeSaving ? "Saving..." : "Save Store Info"}</span>
            </button>
          </form>
        )}

        {/* ACCOUNT SETTINGS CARD */}
        <form key={user?.id || "loading-profile"} action={profileFormAction} className="bg-card border border-border rounded-xl p-5 sm:p-6 shadow-sm space-y-5 h-fit">
          <div className="flex items-center gap-2.5 pb-3 border-b border-border">
            <div className="p-2 bg-primary/10 text-primary rounded-lg">
              <User className="w-4 h-4" />
            </div>
            <h2 className="font-semibold text-foreground">Account Settings</h2>
          </div>

          {profileActionState.success && profileActionState.message && (
            <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3 flex items-center gap-2.5 text-xs text-emerald-400">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <p>{profileActionState.message}</p>
            </div>
          )}
          {profileActionState.error && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-3 flex items-start gap-2.5 text-xs text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{profileActionState.error}</p>
            </div>
          )}

          <div>
            <label htmlFor="profile-name" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Display Name *</label>
            <input id="profile-name" name="name" type="text" required value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="e.g. Sunil Shrestha" className="block w-full px-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Email Address</label>
            <div className="px-4 py-2.5 bg-slate-100 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800/50 rounded-lg text-sm text-slate-500 dark:text-slate-400">{user?.email || "—"}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Email cannot be changed from settings.</p>
          </div>

          <button type="submit" disabled={profileSaving || !canUpdateProfile} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:opacity-95 shadow transition-all disabled:opacity-50">
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
            Choose how Chlorif looks on your device. This preference is saved locally on this browser.
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

        {/* SECURITY PIN CARD */}
        <div className="bg-card border border-border rounded-xl p-5 sm:p-6 shadow-sm space-y-5 h-fit">
          <div className="flex items-center gap-2.5 pb-3 border-b border-border">
            <div className="p-2 bg-primary/10 text-primary rounded-lg">
              <Shield className="w-4 h-4" />
            </div>
            <h2 className="font-semibold text-foreground">Security PIN</h2>
          </div>

          {pinError && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-3 flex items-start gap-2.5 text-xs text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{pinError}</p>
            </div>
          )}

          {pinSuccess && (
            <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3 flex items-center gap-2.5 text-xs text-emerald-400">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <p>{pinSuccess}</p>
            </div>
          )}

          {user?.has_security_pin ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3.5 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-emerald-500" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">Security PIN is Active</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Your account is secured with a static Security PIN.</p>
                  </div>
                </div>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Secured
                </span>
              </div>

              <p className="text-xs text-muted-foreground leading-normal">
                This Security PIN is required when granting temporary access to cashier staff members.
              </p>

              <form onSubmit={handleSaveSecurityPin} className="space-y-4 pt-2 border-t border-border">
                <h3 className="text-xs font-bold text-foreground">Change Security PIN</h3>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="new-security-pin" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">New PIN (4-6 digits)</label>
                    <input
                      id="new-security-pin"
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]{4,6}"
                      maxLength={6}
                      required
                      value={securityPin}
                      onChange={(e) => setSecurityPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="Enter new PIN"
                      className="block w-full px-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-center tracking-[0.2em]"
                    />
                  </div>
                  <div>
                    <label htmlFor="confirm-security-pin" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Confirm New PIN</label>
                    <input
                      id="confirm-security-pin"
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]{4,6}"
                      maxLength={6}
                      required
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="Confirm new PIN"
                      className="block w-full px-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-center tracking-[0.2em]"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="pin-auth-password" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Account Password</label>
                  <input
                    id="pin-auth-password"
                    type="password"
                    required
                    value={pinPassword}
                    onChange={(e) => setPinPassword(e.target.value)}
                    placeholder="Enter your password to save changes"
                    className="block w-full px-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setPinDisableModal({ isOpen: true })}
                    className="flex-1 inline-flex h-11 items-center justify-center border border-red-500/20 hover:bg-red-500/10 text-red-600 dark:text-red-400 text-sm font-semibold rounded-lg transition-all active:scale-[0.98]"
                  >
                    Disable PIN
                  </button>
                  <button
                    type="submit"
                    disabled={pinSaving || securityPin.length < 4 || confirmPin.length < 4 || !pinPassword}
                    className="flex-1 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-95 shadow transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {pinSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span>Update PIN</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 p-3.5 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-foreground">Security PIN is Not Set</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Your account has no temporary access security PIN.</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-normal">
                Set a static 4-to-6 digit Security PIN to authorize temporary privilege grants.
              </p>

              <form onSubmit={handleSaveSecurityPin} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="new-security-pin" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Security PIN (4-6 digits)</label>
                    <input
                      id="new-security-pin"
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]{4,6}"
                      maxLength={6}
                      required
                      value={securityPin}
                      onChange={(e) => setSecurityPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="Enter PIN"
                      className="block w-full px-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-center tracking-[0.2em]"
                    />
                  </div>
                  <div>
                    <label htmlFor="confirm-security-pin" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Confirm PIN</label>
                    <input
                      id="confirm-security-pin"
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]{4,6}"
                      maxLength={6}
                      required
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="Confirm PIN"
                      className="block w-full px-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-center tracking-[0.2em]"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="pin-auth-password" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Account Password</label>
                  <input
                    id="pin-auth-password"
                    type="password"
                    required
                    value={pinPassword}
                    onChange={(e) => setPinPassword(e.target.value)}
                    placeholder="Enter your password to authorize"
                    className="block w-full px-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={pinSaving || securityPin.length < 4 || confirmPin.length < 4 || !pinPassword}
                  className="w-full inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-95 shadow transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Set Security PIN</span>
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* SECURITY PIN DISABLE RE-AUTH MODAL */}
      {pinDisableModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-sm shadow-lg">
            <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
              <div className="p-2 bg-red-500/10 text-red-500 rounded-lg">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm">Confirm Identity</h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">Re-enter your password to disable Security PIN</p>
              </div>
            </div>

            <form onSubmit={handleConfirmDisablePin} className="p-5 space-y-4">
              {pinDisableError && (
                <div className="bg-red-500/10 border border-red-500/25 rounded-lg p-3 flex items-start gap-2.5 text-xs text-red-400">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>{pinDisableError}</p>
                </div>
              )}

              <div>
                <label htmlFor="pin-disable-password" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Account Password
                </label>
                <input
                  id="pin-disable-password"
                  type="password"
                  required
                  autoFocus
                  value={pinDisablePassword}
                  onChange={(e) => setPinDisablePassword(e.target.value)}
                  placeholder="Enter your password"
                  className="block w-full px-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                />
              </div>

              <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
                <p className="text-[10px] text-amber-600 dark:text-amber-400 leading-normal">
                  <strong>Warning:</strong> Disabling the Security PIN will allow temporary privilege grants without any secondary verification checks.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPinDisableModal({ isOpen: false });
                    setPinDisablePassword("");
                    setPinDisableError(null);
                  }}
                  className="flex-1 h-11 flex items-center justify-center border border-border text-sm font-semibold rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={disablingPin || !pinDisablePassword}
                  className="flex-1 h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {disablingPin ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
                  <span>{disablingPin ? "Verifying..." : "Disable Security PIN"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DANGER ZONE */}
      <div className="bg-card border border-red-500/20 rounded-xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-red-500/10">
          <h2 className="font-semibold text-red-500 text-sm">Danger Zone</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Sign out of your current session. You will need to enter your credentials again to access Chlorif.
        </p>
        <button onClick={signOut} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-all">
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
}
