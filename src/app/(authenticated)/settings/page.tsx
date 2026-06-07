"use client";

import React, { useActionState, useState, useEffect } from "react";
import { useAppStore } from "@/lib/store/useAppStore";
import { updateProfileFormAction, updateStoreFormAction } from "@/features/settings/server/actions";
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
} from "lucide-react";

const initialFormState: SettingsFormState = { success: false };

export default function SettingsPage() {
  const { store, user, signOut, initializeSession, setTab } = useAppStore();
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
      initializeSession();
    }
  }, [storeActionState.success, storeActionState.savedAt, initializeSession]);

  useEffect(() => {
    if (profileActionState.success && profileActionState.savedAt) {
      initializeSession();
    }
  }, [profileActionState.success, profileActionState.savedAt, initializeSession]);

  // MFA Enrollment State
  interface MfaFactor {
    id: string;
    friendly_name?: string;
    created_at: string;
  }
  const [mfaFactors, setMfaFactors] = useState<MfaFactor[]>([]);
  const [mfaStatus, setMfaStatus] = useState<"loading" | "disabled" | "enabled">("loading");
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaMessage, setMfaMessage] = useState<string | null>(null);

  // Setup Flow State
  const [setupStep, setSetupStep] = useState<"idle" | "enrolling" | "verifying">("idle");
  const [enrollData, setEnrollData] = useState<{ id: string; qrCode: string; secret: string } | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [disablingMfa, setDisablingMfa] = useState(false);

  // Load MFA Factors on mount
  const loadMfaFactors = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      const verified = data.totp.filter((f) => f.status === "verified");
      setMfaFactors(verified);
      setMfaStatus(verified.length > 0 ? "enabled" : "disabled");
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : String(err);
      setMfaError(message || "Failed to load MFA status.");
      setMfaStatus("disabled");
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadMfaFactors();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Start Enrollment
  const handleEnrollMfa = async () => {
    setMfaError(null);
    setMfaMessage(null);
    setSetupStep("enrolling");
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "PaisaPOS",
        friendlyName: user?.email || "User Account"
      });
      if (error) throw error;

      setEnrollData({
        id: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret
      });
      setSetupStep("verifying");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setMfaError(message || "Failed to enroll MFA TOTP factor.");
      setSetupStep("idle");
    }
  };

  // Verify and Activate
  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollData) return;
    setMfaError(null);
    setMfaMessage(null);
    setVerifyingCode(true);

    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enrollData.id,
        code: verificationCode.trim()
      });
      if (error) throw error;

      setMfaMessage("MFA successfully enabled! Your account is now secure.");
      setSetupStep("idle");
      setEnrollData(null);
      setVerificationCode("");
      await loadMfaFactors();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setMfaError(message || "Invalid verification code. Please try again.");
    } finally {
      setVerifyingCode(false);
    }
  };

  // Disable MFA
  const handleDisableMfa = async (factorId: string) => {
    if (!confirm("Are you sure you want to disable Multi-Factor Authentication? This will lower your account security.")) {
      return;
    }
    setMfaError(null);
    setMfaMessage(null);
    setDisablingMfa(true);

    try {
      const { error } = await supabase.auth.mfa.unenroll({
        factorId
      });
      if (error) throw error;

      setMfaMessage("MFA has been disabled for your account.");
      await loadMfaFactors();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setMfaError(message || "Failed to disable MFA.");
    } finally {
      setDisablingMfa(false);
    }
  };

  // Cancel Setup Flow
  const handleCancelSetup = () => {
    setSetupStep("idle");
    setEnrollData(null);
    setVerificationCode("");
    setMfaError(null);
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

        {/* MULTI-FACTOR AUTHENTICATION (MFA) CARD */}
        <div className="bg-card border border-border rounded-xl p-5 sm:p-6 shadow-sm space-y-5 h-fit">
          <div className="flex items-center gap-2.5 pb-3 border-b border-border">
            <div className="p-2 bg-primary/10 text-primary rounded-lg">
              <Shield className="w-4 h-4" />
            </div>
            <h2 className="font-semibold text-foreground">Multi-Factor Authentication (MFA)</h2>
          </div>

          {mfaError && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-3 flex items-start gap-2.5 text-xs text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{mfaError}</p>
            </div>
          )}

          {mfaMessage && (
            <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3 flex items-center gap-2.5 text-xs text-emerald-400">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <p>{mfaMessage}</p>
            </div>
          )}

          {mfaStatus === "loading" ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-xs gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span>Checking security status...</span>
            </div>
          ) : mfaStatus === "enabled" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3.5 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-emerald-500" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">MFA is Active</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Your account is secured with TOTP MFA.</p>
                  </div>
                </div>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Secured
                </span>
              </div>

              <p className="text-xs text-muted-foreground leading-normal">
                Multi-Factor Authentication adds an extra layer of security when granting temporary access or performing sensitive administrative tasks.
              </p>

              {mfaFactors.map((factor) => (
                <div key={factor.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950/40 border border-border rounded-lg text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{factor.friendly_name || "Authenticator App"}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Added on {new Date(factor.created_at).toLocaleDateString()}</p>
                  </div>
                  <button
                    type="button"
                    disabled={disablingMfa}
                    onClick={() => handleDisableMfa(factor.id)}
                    className="h-8 inline-flex items-center justify-center px-3 border border-red-500/20 hover:bg-red-500/10 text-red-600 dark:text-red-400 font-semibold rounded-md transition-all active:scale-[0.98]"
                  >
                    {disablingMfa ? "Disabling..." : "Disable"}
                  </button>
                </div>
              ))}
            </div>
          ) : setupStep === "idle" ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 p-3.5 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-foreground">MFA is Not Setup</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Your account is at higher risk of session hijack.</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-normal">
                Protect your account by adding an authenticator app (Google Authenticator, Authy, Microsoft Authenticator, etc.).
              </p>

              <button
                type="button"
                onClick={handleEnrollMfa}
                className="w-full inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-95 shadow transition-all active:scale-[0.98]"
              >
                <Shield className="w-4 h-4" />
                <span>Set up Authenticator App</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-950/40 border border-border rounded-xl space-y-4">
                <div className="text-center space-y-2">
                  <p className="text-xs font-bold text-foreground">Scan this QR Code</p>
                  <p className="text-[10px] text-muted-foreground max-w-[280px] mx-auto leading-normal">
                    Open your authenticator app, tap &quot;+&quot; or &quot;Add account&quot;, and scan the QR code below.
                  </p>
                </div>

                {enrollData?.qrCode && (
                  <div className="flex justify-center p-2 bg-white rounded-lg border border-border w-fit mx-auto">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={enrollData.qrCode} alt="MFA QR Code" className="w-40 h-40" />
                  </div>
                )}

                <div className="text-center space-y-1 block w-full">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Secret Key</p>
                  <code className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-border rounded text-xs font-mono text-foreground select-all break-all block max-w-xs mx-auto">
                    {enrollData?.secret}
                  </code>
                  <p className="text-[9px] text-muted-foreground mt-1">
                    If scanning fails, enter this code manually in your authenticator app.
                  </p>
                </div>
              </div>

              <form onSubmit={handleVerifyMfa} className="space-y-3.5">
                <div>
                  <label htmlFor="mfa-verify-code" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                    Verification Code
                  </label>
                  <input
                    id="mfa-verify-code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="Enter 6-digit code"
                    className="block w-full px-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-center tracking-[0.2em] font-bold text-base"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleCancelSetup}
                    className="flex-1 h-11 flex items-center justify-center border border-border text-sm font-semibold rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-all active:scale-[0.98]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={verifyingCode || verificationCode.length !== 6}
                    className="flex-1 h-11 inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-95 shadow transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {verifyingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    <span>{verifyingCode ? "Verifying..." : "Verify & Activate"}</span>
                  </button>
                </div>
              </form>
            </div>
          )}
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
