"use client";

import React, { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { acceptStaffInviteFormAction } from "@/features/staff/server/actions";
import type { StaffActionState } from "@/app/staff-actions";
import type { StaffInvitePreview } from "@/server/staff/staff-invite-preview";
import { supabase } from "@/lib/supabase";
import {
  getAuthRedirectErrorFromHash,
  getAuthRedirectSessionFromHash,
  staffAcceptLoginPath,
  staffAcceptPath,
  type AuthRedirectHashError,
} from "@/lib/invite-redirect";
import { AlertCircle, CheckCircle, KeyRound, LogIn, LogOut, Store, UserCheck } from "lucide-react";

type StaffAcceptPageProps = {
  invitationId: string;
  currentEmail: string | null;
  invitePreview: StaffInvitePreview;
};

const initialState: StaffActionState = { success: false };

function sameEmail(left: string | null | undefined, right: string | null | undefined) {
  return (left ?? "").trim().toLowerCase() === (right ?? "").trim().toLowerCase();
}

function inviteRedirectErrorMessage(hashError: AuthRedirectHashError) {
  if (hashError.errorCode === "otp_expired") {
    return "This invitation email link has expired or was already used. Ask the owner to resend the invite, then open the newest email.";
  }
  if (hashError.errorDescription) {
    return hashError.errorDescription;
  }
  return "This invitation sign-in link could not be opened. Ask the owner to send a new invite.";
}

export default function StaffAcceptPage({ invitationId, currentEmail, invitePreview }: StaffAcceptPageProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(acceptStaffInviteFormAction, initialState);
  const [preparedEmail, setPreparedEmail] = useState<string | null>(currentEmail);
  const [isPreparingInviteSession, setIsPreparingInviteSession] = useState(false);
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const isPendingInvite = invitePreview.state === "pending";
  const signedInEmail = currentEmail ?? preparedEmail;
  const emailMismatch = Boolean(isPendingInvite && signedInEmail && !sameEmail(signedInEmail, invitePreview.email));
  const canAccept = Boolean(isPendingInvite && signedInEmail && !emailMismatch && !state.success);
  const showInviteSessionPrompt = Boolean(isPendingInvite && !signedInEmail && !sessionError);

  useEffect(() => {
    let cancelled = false;

    const establishInviteSession = async () => {
      const inviteError = getAuthRedirectErrorFromHash(window.location.hash);
      if (inviteError) {
        window.history.replaceState(null, "", staffAcceptPath(invitationId));
        if (!cancelled) {
          setSessionError(inviteRedirectErrorMessage(inviteError));
        }
        return;
      }

      const inviteSession = getAuthRedirectSessionFromHash(window.location.hash);
      if (!inviteSession || inviteSession.type === "recovery") return;
      if (inviteSession.invitationId && inviteSession.invitationId !== invitationId) return;

      setIsPreparingInviteSession(true);
      setSessionError(null);

      try {
        const { data, error } = await supabase.auth.setSession({
          access_token: inviteSession.accessToken,
          refresh_token: inviteSession.refreshToken,
        });

        if (cancelled) return;

        const redirectInvitationId = inviteSession.invitationId ?? invitationId;
        window.history.replaceState(null, "", staffAcceptPath(redirectInvitationId));

        if (error) {
          setSessionError("This invitation sign-in link could not be opened. Ask the owner to send a new invite.");
          setIsPreparingInviteSession(false);
          return;
        }

        let sessionEmail = data.session?.user.email ?? null;
        if (!sessionEmail) {
          const { data: userData } = await supabase.auth.getUser();
          sessionEmail = userData.user?.email ?? null;
        }

        if (cancelled) return;

        setPreparedEmail(sessionEmail);
        setIsPreparingInviteSession(false);
        router.refresh();
      } catch {
        if (cancelled) return;
        const redirectInvitationId = inviteSession.invitationId ?? invitationId;
        window.history.replaceState(null, "", staffAcceptPath(redirectInvitationId));
        setSessionError("This invitation sign-in link could not be opened. Ask the owner to send a new invite.");
        setIsPreparingInviteSession(false);
      }
    };

    void establishInviteSession();

    return () => {
      cancelled = true;
    };
  }, [invitationId, router]);

  const handleSwitchAccount = async () => {
    setIsSwitchingAccount(true);
    setSessionError(null);

    try {
      await supabase.auth.signOut();
      router.replace(staffAcceptLoginPath(invitationId));
      router.refresh();
    } catch {
      setSessionError("We could not sign out this browser session. Please try again.");
      setIsSwitchingAccount(false);
    }
  };

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

        {!isPendingInvite && (
          <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 flex items-start gap-2.5 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>{invitePreview.message}</p>
          </div>
        )}

        {isPendingInvite && (
          <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Store invite</p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {invitePreview.storeName ?? "PaisaPOS store"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Invited email</p>
              <p className="mt-1 text-sm font-semibold text-foreground break-all">{invitePreview.email}</p>
            </div>
          </div>
        )}

        {showInviteSessionPrompt && (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 flex items-start gap-2.5 text-xs text-amber-700 dark:text-amber-300">
              <LogIn className="w-4 h-4 mt-0.5 shrink-0" />
              <p>{isPreparingInviteSession ? "Preparing your staff invite..." : "Open the invitation from your email inbox. If you already set a password, sign in with the invited email and return to this link."}</p>
            </div>
            {!isPreparingInviteSession && (
              <Link
                href={staffAcceptLoginPath(invitationId)}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow transition-all hover:opacity-95"
              >
                Open Sign In
              </Link>
            )}
          </div>
        )}

        {emailMismatch && (
          <div className="space-y-3 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p>This invite belongs to {invitePreview.email}. Switch accounts to continue with that email.</p>
                <p className="text-red-600/80 dark:text-red-300/80">You are signed in as {signedInEmail}.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleSwitchAccount}
              disabled={isSwitchingAccount}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white shadow transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>{isSwitchingAccount ? "Signing out..." : "Switch Account"}</span>
            </button>
          </div>
        )}

        {sessionError && (
          <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 flex items-start gap-2.5 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>{sessionError}</p>
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

        {canAccept && (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="invitationId" value={invitationId} />
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Signed in as</p>
              <p className="mt-1 text-sm font-semibold text-foreground break-all">{signedInEmail}</p>
            </div>
            <div className="space-y-2">
              <label htmlFor="fullName" className="text-xs font-semibold text-foreground">
                Full name
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                autoComplete="name"
                required
                maxLength={100}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary"
                placeholder="Cashier name"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-xs font-semibold text-foreground">
                Password
              </label>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={256}
                  className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-primary"
                  placeholder="Create a password"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-xs font-semibold text-foreground">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={256}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary"
                placeholder="Repeat password"
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>{pending ? "Setting up..." : "Set Up Staff Account"}</span>
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
