"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  getAuthRedirectErrorFromHash,
  getAuthRedirectSessionFromHash,
  getInvitationIdFromStaffAcceptPath,
  staffAcceptPath,
  type AuthRedirectHashError,
} from "@/lib/invite-redirect";
import { getFriendlyErrorMessage, validateRedirectPath } from "@/lib/security";

type CallbackRecoveryState = "default" | "opening" | "failed";

type AuthCallbackErrorContentProps = {
  reason?: string;
};

function callbackErrorCopy(reason: string | undefined, hashError?: AuthRedirectHashError | null) {
  if (hashError?.errorCode === "otp_expired") {
    return "This email link has expired or was already used. Ask the store owner to send a new invitation, then open the newest email.";
  }
  if (hashError?.errorDescription) {
    return hashError.errorDescription;
  }
  if (reason === "rate_limited") {
    return "Too many sign-in link attempts were made from this connection. Please wait a moment and try the link again.";
  }
  if (reason === "missing_code") {
    return "This sign-in link is incomplete. Open the latest email from PaisaPOS or ask the store owner to resend the invitation.";
  }
  if (reason === "exchange_failed") {
    return "This sign-in link could not be verified. It may have expired or already been used.";
  }
  return "We could not complete this sign-in link. Please try again from the latest email.";
}

function getHashSessionDestination() {
  const hashSession = getAuthRedirectSessionFromHash(window.location.hash);
  if (!hashSession) return null;

  const searchParams = new URLSearchParams(window.location.search);
  const next = validateRedirectPath(searchParams.get("next"), "/dashboard");
  const type = hashSession.type ?? searchParams.get("type");

  if (type === "invite") {
    const invitationId = hashSession.invitationId ?? getInvitationIdFromStaffAcceptPath(next);
    return invitationId ? staffAcceptPath(invitationId) : null;
  }

  if (type === "recovery") {
    return "/auth/update-password";
  }

  return next;
}

export default function AuthCallbackErrorContent({ reason }: AuthCallbackErrorContentProps) {
  const router = useRouter();
  const [state, setState] = useState<CallbackRecoveryState>("default");
  const [message, setMessage] = useState(callbackErrorCopy(reason));

  useEffect(() => {
    let cancelled = false;

    const recoverHashSession = async () => {
      const hashSession = getAuthRedirectSessionFromHash(window.location.hash);
      const hashError = getAuthRedirectErrorFromHash(window.location.hash);
      const destination = getHashSessionDestination();
      if (!hashSession && hashError) {
        window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
        setState("failed");
        setMessage(callbackErrorCopy(reason, hashError));
        return;
      }

      if (!hashSession || !destination) return;

      setState("opening");
      setMessage("Opening this sign-in link...");

      try {
        const { supabase } = await import("@/lib/supabase");
        const { error } = await supabase.auth.setSession({
          access_token: hashSession.accessToken,
          refresh_token: hashSession.refreshToken,
        });

        if (error) {
          throw error;
        }

        if (cancelled) return;

        window.history.replaceState(null, "", destination);
        router.replace(destination);
        router.refresh();
      } catch (error: unknown) {
        if (cancelled) return;

        window.history.replaceState(null, "", "/auth/callback-error?reason=exchange_failed");
        setState("failed");
        setMessage(
          getFriendlyErrorMessage(error) ||
            "This sign-in link could not be opened. It may have expired or already been used.",
        );
      }
    };

    void recoverHashSession();

    return () => {
      cancelled = true;
    };
  }, [reason, router]);

  const isOpening = state === "opening";

  return (
    <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
        {isOpening ? <Loader2 className="h-5 w-5 animate-spin" /> : <AlertTriangle className="h-5 w-5" />}
      </div>
      <h1 className="mt-4 font-outfit text-xl font-bold text-foreground">
        {isOpening ? "Opening sign-in link" : "Sign-in link needs attention"}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>
      {!isOpening && (
        <Link
          href="/"
          className="mt-5 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-95"
        >
          Back to sign in
        </Link>
      )}
    </section>
  );
}
