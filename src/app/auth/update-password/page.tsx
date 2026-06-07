"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Store, Lock, AlertCircle, Loader2, CheckCircle } from "lucide-react";
import { updatePasswordAction } from "@/features/auth/server/actions";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    setIsLoading(true);

    try {
      const result = await updatePasswordAction({
        password,
        confirmPassword,
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      setIsSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to update password. Please try again.");
    } finally {
      setIsLoading(false);
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
          Set your new password below.
        </p>
      </div>

      {/* CORE CONTAINER */}
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-card border border-border rounded-2xl shadow-xl p-8 space-y-6">
          {/* SUCCESS STATE */}
          {isSuccess ? (
            <div className="text-center space-y-4">
              <div className="mx-auto h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-emerald-500" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">
                Password Updated
              </h2>
              <p className="text-sm text-muted-foreground">
                Your password has been successfully changed. You can now sign in
                with your new password.
              </p>
              <button
                onClick={() => router.replace("/")}
                className="w-full px-4 py-2.5 bg-primary text-primary-foreground font-semibold text-sm rounded-lg hover:opacity-95 shadow transition-all focus:outline-none focus:ring-2 focus:ring-ring"
              >
                Go to Sign In
              </button>
            </div>
          ) : (
            <>
              {/* ERROR STRIP */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-3 flex items-start gap-2.5 text-xs text-red-400">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p className="leading-normal">{error}</p>
                </div>
              )}

              {/* PASSWORD FORM */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="new-password"
                    className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1"
                  >
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/80" />
                    <input
                      id="new-password"
                      type="password"
                      required
                      minLength={8}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="confirm-password"
                    className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1"
                  >
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/80" />
                    <input
                      id="confirm-password"
                      type="password"
                      required
                      minLength={8}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="block w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-semibold text-sm rounded-lg hover:opacity-95 shadow transition-all focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <span>Update Password</span>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
