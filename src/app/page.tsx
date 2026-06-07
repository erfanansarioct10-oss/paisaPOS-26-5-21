"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store/useAppStore";
import { supabase } from "@/lib/supabase";
import { Store, Mail, Lock, User, AlertCircle, Loader2, CheckCircle } from "lucide-react";
import { loginAction, signupAction, requestPasswordResetAction } from "@/features/auth/server/actions";
import { getFriendlyErrorMessage, normalizeEmail, validateRedirectPath } from "@/lib/security";
import { getInviteRedirectSessionFromHash, getStaffAcceptReturnPath, staffAcceptPath } from "@/lib/invite-redirect";

// ---------------------------------------------------------------------------
// Client-side rate-limiting constants (defense-in-depth, not a security boundary)
// Primary rate-limiting is enforced server-side by Supabase Auth (30 req / 5 min / IP)
// ---------------------------------------------------------------------------
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_SECONDS = 30;

const formatLockoutTime = (seconds: number): string => {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
};

function getStaffInviteNextPathFromLocation() {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const safeNextPath = validateRedirectPath(params.get("next"), "");
  return getStaffAcceptReturnPath(safeNextPath);
}

export default function LoginPage() {
  const router = useRouter();
  const {
    user,
    isLoading,
    errorMsg,
    initializeSession,
  } = useAppStore();

  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [storeName, setStoreName] = useState("");
  
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const [isHandlingInviteRedirect, setIsHandlingInviteRedirect] = useState(false);

  // Rate limiting state
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const lockoutTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isLockedOut = lockoutRemaining > 0;

  // Initialize session on load, but intercept Supabase implicit invite links first.
  useEffect(() => {
    let cancelled = false;

    const bootstrapSession = async () => {
      const inviteSession = getInviteRedirectSessionFromHash(window.location.hash);
      if (!inviteSession) {
        const staffInviteNextPath = getStaffInviteNextPathFromLocation();
        if (staffInviteNextPath) {
          const { data } = await supabase.auth.getUser();
          if (!cancelled && data.user) {
            router.replace(staffInviteNextPath);
            return;
          }
        }

        await initializeSession();
        return;
      }

      setIsHandlingInviteRedirect(true);
      setLocalError(null);
      setSuccessMsg("Opening staff invite...");

      try {
        const { error } = await supabase.auth.setSession({
          access_token: inviteSession.accessToken,
          refresh_token: inviteSession.refreshToken,
        });

        if (error) {
          throw error;
        }

        if (!cancelled) {
          router.replace(staffAcceptPath(inviteSession.invitationId));
        }
      } catch (error: unknown) {
        if (!cancelled) {
          window.history.replaceState(null, "", "/");
          setSuccessMsg(null);
          setLocalError(getFriendlyErrorMessage(error) || "This invitation could not be opened. Ask the owner to send a new invite.");
          setIsHandlingInviteRedirect(false);
        }
      }
    };

    void bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, [initializeSession, router]);

  // If user session is active, redirect to dashboard automatically
  useEffect(() => {
    if (user && !isHandlingInviteRedirect) {
      router.replace(getStaffInviteNextPathFromLocation() ?? "/dashboard");
    }
  }, [isHandlingInviteRedirect, user, router]);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutRemaining <= 0) {
      if (lockoutTimerRef.current) {
        clearInterval(lockoutTimerRef.current);
        lockoutTimerRef.current = null;
      }
      return;
    }

    lockoutTimerRef.current = setInterval(() => {
      setLockoutRemaining((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (lockoutTimerRef.current) {
        clearInterval(lockoutTimerRef.current);
        lockoutTimerRef.current = null;
      }
    };
  }, [lockoutRemaining]);

  const triggerLockout = useCallback(() => {
    setLockoutRemaining(LOCKOUT_DURATION_SECONDS);
    setFailedAttempts(0);
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSuccessMsg(null);

    if (isLockedOut) {
      setLocalError(`Too many failed attempts. Please wait ${lockoutRemaining}s.`);
      return;
    }

    if (!email || !password) {
      setLocalError("Please fill in all standard credentials.");
      return;
    }

    setLocalLoading(true);

    try {
      const normalizedEmail = normalizeEmail(email);
      if (isLogin) {
        // Sign in using server action
        try {
          const res = await loginAction({ email: normalizedEmail, password });
          if (res?.error) {
            throw new Error(res.error);
          }
          setFailedAttempts(0);
          const staffInviteNextPath = getStaffInviteNextPathFromLocation();
          if (staffInviteNextPath) {
            setSuccessMsg("Opening staff invite...");
            router.replace(staffInviteNextPath);
            router.refresh();
            return;
          }
        } catch (error: unknown) {
          // Track failed login attempts for client-side rate limiting
          const newCount = failedAttempts + 1;
          setFailedAttempts(newCount);
          if (newCount >= MAX_FAILED_ATTEMPTS) {
            triggerLockout();
          }
          throw error;
        }
      } else {
        // Sign up using server action
        if (!fullName || !storeName) {
          throw new Error("Full name and Store name are required to register.");
        }

        const signupRes = await signupAction({
          email: normalizedEmail,
          password,
          fullName,
          storeName,
        });
        if (signupRes?.error) {
          throw new Error(signupRes.error);
        }

        // The server action created the auth user and store/profile, but the
        // client-side Supabase instance doesn't have the session yet (cookies
        // were set server-side). Sign in on the client to establish the session
        // so initializeSession() can find the user and redirect to dashboard.
        setSuccessMsg("Account registered successfully! Logging you in...");
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (signInError) {
          console.warn("Auto-login after signup failed:", signInError.message);
          // Non-fatal: user can manually sign in
        }
      }

      // Re-initialize Zustand state which pulls the auth user details and routes them
      await initializeSession();
    } catch (err: unknown) {
      const friendlyError = getFriendlyErrorMessage(err);
      setLocalError(friendlyError);

      const lowercaseErr = friendlyError.toLowerCase();
      if (lowercaseErr.includes("too many attempts") || lowercaseErr.includes("too many requests")) {
        const minMatch = friendlyError.match(/(\d+)\s*minute/i);
        const secMatch = friendlyError.match(/(\d+)\s*second/i);
        const hourMatch = friendlyError.match(/(\d+)\s*hour/i);

        let durationSeconds = 0;
        if (hourMatch) durationSeconds += parseInt(hourMatch[1], 10) * 3600;
        if (minMatch) durationSeconds += parseInt(minMatch[1], 10) * 60;
        if (secMatch) durationSeconds += parseInt(secMatch[1], 10);

        if (durationSeconds === 0) {
          const simpleMatch = friendlyError.match(/(\d+)\s*(second|minute|hour)/i);
          if (simpleMatch) {
            const val = parseInt(simpleMatch[1], 10);
            const unit = simpleMatch[2].toLowerCase();
            if (unit.startsWith("second")) durationSeconds = val;
            else if (unit.startsWith("minute")) durationSeconds = val * 60;
            else if (unit.startsWith("hour")) durationSeconds = val * 3600;
          } else {
            durationSeconds = 5 * 60; // 5 minutes fallback
          }
        }

        setLockoutRemaining(durationSeconds);
        setFailedAttempts(0);
      }
    } finally {
      setLocalLoading(false);
    }
  };

  // Password reset rate limiting state (client-side, 3 per 15 min)
  const resetTimestampsRef = useRef<number[]>([]);
  const RESET_MAX = 3;
  const RESET_WINDOW_MS = 15 * 60 * 1000;

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setSuccessMsg(null);

    if (!email) {
      setLocalError("Please enter your email address.");
      return;
    }

    // Client-side rate limiting for password reset
    const now = Date.now();
    resetTimestampsRef.current = resetTimestampsRef.current.filter(
      (ts) => ts > now - RESET_WINDOW_MS
    );
    if (resetTimestampsRef.current.length >= RESET_MAX) {
      const oldestTs = resetTimestampsRef.current[0];
      const waitMin = Math.ceil((oldestTs + RESET_WINDOW_MS - now) / 60000);
      setLocalError(`Too many password reset requests. Please wait ${waitMin} minute(s) and try again.`);
      return;
    }
    resetTimestampsRef.current.push(now);

    setLocalLoading(true);

    try {
      const result = await requestPasswordResetAction(normalizeEmail(email));
      if (result?.error) throw new Error(result.error);
      if (!result.success) throw new Error("Failed to send reset email.");

      setSuccessMsg(
        "If an account exists for that email, a password reset link has been sent."
      );
    } catch (err: unknown) {
      const friendlyError = getFriendlyErrorMessage(err);
      setLocalError(friendlyError);

      const lowercaseErr = friendlyError.toLowerCase();
      if (lowercaseErr.includes("too many attempts") || lowercaseErr.includes("too many requests")) {
        const minMatch = friendlyError.match(/(\d+)\s*minute/i);
        const secMatch = friendlyError.match(/(\d+)\s*second/i);
        const hourMatch = friendlyError.match(/(\d+)\s*hour/i);

        let durationSeconds = 0;
        if (hourMatch) durationSeconds += parseInt(hourMatch[1], 10) * 3600;
        if (minMatch) durationSeconds += parseInt(minMatch[1], 10) * 60;
        if (secMatch) durationSeconds += parseInt(secMatch[1], 10);

        if (durationSeconds === 0) {
          const simpleMatch = friendlyError.match(/(\d+)\s*(second|minute|hour)/i);
          if (simpleMatch) {
            const val = parseInt(simpleMatch[1], 10);
            const unit = simpleMatch[2].toLowerCase();
            if (unit.startsWith("second")) durationSeconds = val;
            else if (unit.startsWith("minute")) durationSeconds = val * 60;
            else if (unit.startsWith("hour")) durationSeconds = val * 3600;
          } else {
            durationSeconds = 5 * 60; // 5 minutes fallback
          }
        }

        setLockoutRemaining(durationSeconds);
        setFailedAttempts(0);
      }
    } finally {
      setLocalLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Subtle background grids */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-50 dark:opacity-20 pointer-events-none" />

      {/* TOP BRANDING */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center">
        <div className="mx-auto h-12 w-12 rounded-xl bg-primary flex items-center justify-center shadow-lg border border-primary/20">
          <Store className="w-6 h-6 text-primary-foreground" />
        </div>
        <h1 className="mt-4 font-outfit text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl flex items-center justify-center gap-2">
          <span>PaisaPOS</span>
          <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-xs font-bold uppercase tracking-wider">
            Beta
          </span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-xs mx-auto">
          High-speed real-time billing and inventory sync for Nepalese boutiques.
        </p>
      </div>

      {/* CORE CONTAINER */}
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-card border border-border rounded-2xl shadow-xl p-8 space-y-6">

          {/* DYNAMIC ERROR STRIPS */}
          {!isLockedOut && (localError || errorMsg) && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-3 flex items-start gap-2.5 text-xs text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="leading-normal">{localError || errorMsg}</p>
            </div>
          )}

          {/* SUCCESS MESSAGE */}
          {successMsg && (
            <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3 flex items-start gap-2.5 text-xs text-emerald-400">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="leading-normal">{successMsg}</p>
            </div>
          )}

          {/* LOCKOUT WARNING */}
          {isLockedOut && (
            <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="leading-normal">
                Too many failed login attempts. Please wait{" "}
                <span className="font-bold tabular-nums">{formatLockoutTime(lockoutRemaining)}</span>{" "}
                before trying again.
              </p>
            </div>
          )}

          {/* ============================================================== */}
          {/* FORGOT PASSWORD FORM                                            */}
          {/* ============================================================== */}
          {isForgotPassword ? (
            <>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label htmlFor="reset-email" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Store Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/80" />
                    <input
                      id="reset-email"
                      type="email"
                      required
                      placeholder="name@store.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={localLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-semibold text-sm rounded-lg hover:opacity-95 shadow transition-all focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                >
                  {localLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sending...</span>
                    </>
                  ) : (
                    <span>Send Password Reset Link</span>
                  )}
                </button>
              </form>

              <div className="text-center">
                <button
                  onClick={() => {
                    setIsForgotPassword(false);
                    setLocalError(null);
                    setSuccessMsg(null);
                  }}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground transition-all underline"
                >
                  Back to Sign In
                </button>
              </div>
            </>
          ) : (
            <>
              {/* ============================================================== */}
              {/* CREDENTIALS FORM (Login / Register)                             */}
              {/* ============================================================== */}
              <form onSubmit={handleAuth} className="space-y-4">
                {!isLogin && (
                  <>
                    <div>
                      <label htmlFor="name" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                        Your Name
                      </label>
                      <div className="relative">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/80" />
                        <input
                          id="name"
                          type="text"
                          required
                          placeholder="e.g. Sunil Shrestha"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="block w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="store" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                        Clothing Store Name
                      </label>
                      <div className="relative">
                        <Store className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/80" />
                        <input
                          id="store"
                          type="text"
                          required
                          placeholder="e.g. KTM Boutique Hub"
                          value={storeName}
                          onChange={(e) => setStoreName(e.target.value)}
                          className="block w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label htmlFor="email" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Store Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/80" />
                    <input
                      id="email"
                      type="email"
                      required
                      placeholder="name@store.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="pass" className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/80" />
                    <input
                      id="pass"
                      type="password"
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    />
                  </div>
                </div>

                {/* FORGOT PASSWORD LINK (login mode only) */}
                {isLogin && (
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setIsForgotPassword(true);
                        setLocalError(null);
                        setSuccessMsg(null);
                      }}
                      className="text-xs font-medium text-muted-foreground hover:text-foreground transition-all underline"
                    >
                      Forgot your password?
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={localLoading || isLoading || isLockedOut}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-semibold text-sm rounded-lg hover:opacity-95 shadow transition-all focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                >
                  {(localLoading || isLoading) ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Please wait...</span>
                    </>
                  ) : (
                    <span>{isLogin ? "Sign In to Store" : "Register Store & Owner"}</span>
                  )}
                </button>
              </form>

              {/* TOGGLE TAB */}
              <div className="text-center">
                <button
                  onClick={() => {
                    setIsLogin(!isLogin);
                    setLocalError(null);
                    setSuccessMsg(null);
                  }}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground transition-all underline"
                >
                  {isLogin ? "Need a new store account? Register here" : "Already have a store account? Sign In"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
