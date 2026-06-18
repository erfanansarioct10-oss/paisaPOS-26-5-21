"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Store, KeyRound, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { verifyPasswordResetCodeAction } from "@/features/auth/server/actions";

export default function VerifyCodeContent({ email }: { email: string }) {
  const router = useRouter();
  const [code, setCode] = useState<string[]>(new Array(6).fill(""));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>(new Array(6).fill(null));

  useEffect(() => {
    // Focus the first input on load
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const value = e.target.value;
    if (isNaN(Number(value))) return;

    const newCode = [...code];
    // Keep only the last character entered
    newCode[index] = value.substring(value.length - 1);
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      // Move focus to previous input on Backspace
      const newCode = [...code];
      newCode[index - 1] = "";
      setCode(newCode);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasteData = e.clipboardData.getData("text");
    const cleanData = pasteData.replace(/\D/g, "").slice(0, 6);
    if (!cleanData) return;

    e.preventDefault();
    const newCode = [...code];
    for (let i = 0; i < cleanData.length; i++) {
      newCode[i] = cleanData[i];
    }
    setCode(newCode);

    // Focus the next empty or last filled input
    const focusIndex = Math.min(5, cleanData.length);
    if (inputRefs.current[focusIndex]) {
      inputRefs.current[focusIndex]?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const fullCode = code.join("");
    if (fullCode.length < 6) {
      setErrorMsg("Please enter the full 6-digit code.");
      return;
    }

    setLoading(true);

    try {
      const res = await verifyPasswordResetCodeAction(email, fullCode);
      if (res.error) {
        throw new Error(res.error);
      }

      setSuccessMsg("Code verified! Redirecting to password change page...");
      router.push(`/auth/reset-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(res.token!)}`);
    } catch (err: any) {
      setErrorMsg(err.message || "Invalid code or verification failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-50 dark:opacity-20 pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center">
        <div className="mx-auto h-12 w-12 rounded-xl bg-primary flex items-center justify-center shadow-lg border border-primary/20">
          <Store className="w-6 h-6 text-primary-foreground" />
        </div>
        <h1 className="mt-4 font-outfit text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Chlorif
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Nepali Boutique Sync
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-card border border-border rounded-2xl shadow-xl p-8 space-y-6">
          <div className="text-center space-y-1">
            <h2 className="font-outfit text-xl font-bold text-foreground">
              Verify Reset Code
            </h2>
            <p className="text-xs text-muted-foreground">
              We sent a 6-digit OTP code to <strong className="text-foreground break-all">{email}</strong>.
            </p>
          </div>

          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-3 flex items-start gap-2.5 text-xs text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="leading-normal">{errorMsg}</p>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3 flex items-start gap-2.5 text-xs text-emerald-400">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="leading-normal">{successMsg}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex justify-between items-center gap-2">
              {code.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => { inputRefs.current[idx] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(e, idx)}
                  onKeyDown={(e) => handleKeyDown(e, idx)}
                  onPaste={handlePaste}
                  className="w-12 h-14 text-center text-xl font-bold rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all shadow-sm"
                />
              ))}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground font-semibold text-sm rounded-lg hover:opacity-95 shadow transition-all focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-4 h-4" />
                  <span>Verify Code</span>
                </>
              )}
            </button>
          </form>

          <div className="text-center">
            <button
              onClick={() => router.push("/")}
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-all underline"
            >
              Back to Sign In
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
