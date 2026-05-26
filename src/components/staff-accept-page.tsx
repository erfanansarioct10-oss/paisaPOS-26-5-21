"use client";

import React, { useActionState } from "react";
import Link from "next/link";
import { acceptStaffInviteFormAction, type StaffActionState } from "@/app/staff-actions";
import { AlertCircle, CheckCircle, LogIn, Store, UserCheck } from "lucide-react";

type StaffAcceptPageProps = {
  invitationId: string;
  currentEmail: string | null;
};

const initialState: StaffActionState = { success: false };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function StaffAcceptPage({ invitationId, currentEmail }: StaffAcceptPageProps) {
  const [state, formAction, pending] = useActionState(acceptStaffInviteFormAction, initialState);
  const hasValidInvitation = UUID_PATTERN.test(invitationId);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-outfit text-xl font-extrabold tracking-tight text-foreground">
              Accept Staff Invite
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              PaisaPOS cashier access
            </p>
          </div>
        </div>

        {!hasValidInvitation && (
          <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 flex items-start gap-2.5 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>This invitation link is invalid.</p>
          </div>
        )}

        {hasValidInvitation && !currentEmail && (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 flex items-start gap-2.5 text-xs text-amber-700 dark:text-amber-300">
              <LogIn className="w-4 h-4 mt-0.5 shrink-0" />
              <p>Sign in with the invited email, then open this invite link again.</p>
            </div>
            <Link
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow transition-all hover:opacity-95"
            >
              Go To Sign In
            </Link>
          </div>
        )}

        {state.success && state.message && (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 flex items-start gap-2.5 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>{state.message}</p>
          </div>
        )}

        {state.error && (
          <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 flex items-start gap-2.5 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>{state.error}</p>
          </div>
        )}

        {hasValidInvitation && currentEmail && !state.success && (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="invitationId" value={invitationId} />
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Signed in as</p>
              <p className="mt-1 text-sm font-semibold text-foreground break-all">{currentEmail}</p>
            </div>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>{pending ? "Accepting..." : "Accept Invite"}</span>
            </button>
          </form>
        )}

        {state.success && (
          <Link
            href="/dashboard"
            className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow transition-all hover:opacity-95"
          >
            Open Dashboard
          </Link>
        )}
      </div>
    </main>
  );
}
