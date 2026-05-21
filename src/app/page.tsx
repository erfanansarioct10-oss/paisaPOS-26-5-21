"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store/useAppStore";
import { supabase, hasSupabaseConfig } from "@/lib/supabase";
import { Store, ShieldCheck, Mail, Lock, User, AlertCircle, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const {
    user,
    isLoading,
    errorMsg,
    initializeSession,
    setDemoMode,
  } = useAppStore();

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [storeName, setStoreName] = useState("");
  
  const [localError, setLocalError] = useState<string | null>(null);
  const [localLoading, setLocalLoading] = useState(false);

  // Initialize session on load
  useEffect(() => {
    initializeSession();
  }, [initializeSession]);

  // If user session is active, redirect to dashboard automatically
  useEffect(() => {
    if (user) {
      router.push("/dashboard");
    }
  }, [user, router]);

  const handleDemoMode = async () => {
    setDemoMode(true);
    await initializeSession();
    router.push("/dashboard");
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!hasSupabaseConfig()) {
      setLocalError("Supabase credentials are not configured in your environment variables. Please use the Demo Mode to try PaisaPOS.");
      return;
    }

    if (!email || !password) {
      setLocalError("Please fill in all standard credentials.");
      return;
    }

    setLocalLoading(true);

    try {
      if (isLogin) {
        // Sign in
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        // Sign up
        if (!fullName || !storeName) {
          throw new Error("Full name and Store name are required to register.");
        }

        // 1. Trigger Supabase auth sign up
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) throw signUpError;
        if (!signUpData.user) throw new Error("Registration failed. Please check your credentials.");

        // 2. Create the store & user profile atomically via security definer RPC (resolves RLS onboarding deadlock)
        const { error: onboardingError } = await supabase.rpc("register_store_and_user", {
          p_user_id: signUpData.user.id,
          p_full_name: fullName,
          p_store_name: storeName,
        });

        if (onboardingError) throw onboardingError;

        // Force a brief sign-out and re-signin or show confirmation
        setLocalError("Account registered successfully! Logging you in...");
      }

      // Re-initialize Zustand state which pulls the auth user details and routes them
      await initializeSession();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An authentication error occurred.";
      setLocalError(message);
    } finally {
      setLocalLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Subtle background grids */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30 pointer-events-none" />

      {/* TOP BRANDING */}
      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center">
        <div className="mx-auto h-12 w-12 rounded-xl bg-primary flex items-center justify-center shadow-lg border border-primary/20">
          <Store className="w-6 h-6 text-primary-foreground" />
        </div>
        <h1 className="mt-4 font-outfit text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          PaisaPOS
        </h1>
        <p className="mt-2 text-sm text-slate-400 max-w-xs mx-auto">
          High-speed real-time billing and inventory sync for Nepalese boutiques.
        </p>
      </div>

      {/* CORE CONTAINER */}
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl p-8 space-y-6">
          {/* DEMO BYPASS BANNER */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center space-y-3">
            <div className="flex items-center justify-center gap-2 text-amber-500">
              <ShieldCheck className="w-5 h-5 shrink-0" />
              <span className="text-xs font-semibold uppercase tracking-wider font-mono">
                Instant Walkthrough
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Skip setup entirely. Test the POS billing terminal, bulk variant generation, and low stock alerts with our pre-loaded boutique datasets.
            </p>
            <button
              onClick={handleDemoMode}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 text-slate-950 font-bold text-sm rounded-lg hover:bg-amber-400 active:scale-[0.99] shadow transition-all focus:outline-none"
            >
              <span>Explore Demo Store</span>
            </button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center" aria-hidden="true">
              <div className="w-full border-t border-slate-800" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-slate-900 px-3 text-slate-500 font-mono">OR USE YOUR STORE</span>
            </div>
          </div>

          {/* DYNAMIC ERROR STRIPS */}
          {(localError || errorMsg) && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-3 flex items-start gap-2.5 text-xs text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="leading-normal">{localError || errorMsg}</p>
            </div>
          )}

          {/* CREDENTIALS FORM */}
          <form onSubmit={handleAuth} className="space-y-4">
            {!isLogin && (
              <>
                <div>
                  <label htmlFor="name" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Your Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      id="name"
                      type="text"
                      required
                      placeholder="e.g. Sunil Shrestha"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="block w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="store" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Clothing Store Name
                  </label>
                  <div className="relative">
                    <Store className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                      id="store"
                      type="text"
                      required
                      placeholder="e.g. KTM Boutique Hub"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      className="block w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Store Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id="email"
                  type="email"
                  required
                  placeholder="name@store.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                />
              </div>
            </div>

            <div>
              <label htmlFor="pass" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id="pass"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={localLoading || isLoading}
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
              }}
              className="text-xs font-medium text-slate-400 hover:text-white transition-all underline"
            >
              {isLogin ? "Need a new store account? Register here" : "Already have a store account? Sign In"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
