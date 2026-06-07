"use client";

import { useActionState, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { supabase } from "@/lib/supabase";
import type {
  StaffDelegationDTO,
  StaffInvitationDTO,
  StaffMemberDTO,
} from "@/server/supabase/dal";
import { ACTIVE_STAFF_DELEGATION_PRIVILEGES, formatStaffPrivilege } from "@/lib/staff-capabilities";
import {
  KeyRound,
  MailPlus,
  RotateCcw,
  UserX,
  XCircle,
} from "lucide-react";
import {
  createDelegationStepUpProofAction,
  grantPrivilegeDelegationFormAction,
  reactivateStaffAction,
  resendStaffInviteAction,
  revokePrivilegeDelegationAction,
  revokeStaffInviteAction,
  suspendStaffAction,
} from "@/features/staff/server/actions";
import type { StaffActionState } from "@/app/staff-actions";
import { getClientErrorMessage } from "@/features/staff/components/staff-management-utils";

const initialGrantState: StaffActionState = { success: false };
const initialRowActionState: StaffActionState = { success: false };

function SubmitButton({
  children,
  icon,
  tone = "neutral",
}: {
  children: ReactNode;
  icon: ReactNode;
  tone?: "neutral" | "danger" | "primary";
}) {
  const { pending } = useFormStatus();
  const className = tone === "danger"
    ? "border-red-500/20 text-red-600 hover:bg-red-500/10 dark:text-red-400"
    : tone === "primary"
      ? "border-primary/20 text-primary hover:bg-primary/10"
      : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground";

  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {icon}
      <span>{pending ? "Working..." : children}</span>
    </button>
  );
}

function RowActionMessage({ state }: { state: StaffActionState }) {
  if (!state.error && !(state.success && state.message)) return null;

  const isSuccess = state.success && state.message;
  return (
    <div
      aria-live="polite"
      className={`max-w-xs rounded-lg border px-3 py-2 text-[11px] leading-normal ${
        isSuccess
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-400"
      }`}
    >
      {isSuccess ? state.message : state.error}
    </div>
  );
}

function DestructiveConfirmField({ expected }: { expected: "REVOKE" | "SUSPEND" }) {
  return (
    <label className="block space-y-1">
      <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Confirm</span>
      <input
        name="confirmText"
        type="text"
        required
        autoComplete="off"
        spellCheck={false}
        placeholder={`Type ${expected}`}
        className="h-9 w-full min-w-[170px] rounded-lg border border-border bg-card px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}

function SuspendStaffForm({ member }: { member: StaffMemberDTO }) {
  const [state, formAction] = useActionState(suspendStaffAction, initialRowActionState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="userId" value={member.id} />
      <DestructiveConfirmField expected="SUSPEND" />
      <SubmitButton tone="danger" icon={<UserX className="w-3.5 h-3.5" />}>Suspend access</SubmitButton>
      <RowActionMessage state={state} />
    </form>
  );
}

function ReactivateStaffForm({ member }: { member: StaffMemberDTO }) {
  const [state, formAction] = useActionState(reactivateStaffAction, initialRowActionState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="userId" value={member.id} />
      <SubmitButton tone="primary" icon={<RotateCcw className="w-3.5 h-3.5" />}>Reactivate</SubmitButton>
      <RowActionMessage state={state} />
    </form>
  );
}

function DelegationGrantForm({ member }: { member: StaffMemberDTO }) {
  const [grantState, grantAction, grantPending] = useActionState(grantPrivilegeDelegationFormAction, initialGrantState);
  const [clientError, setClientError] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [stepUpPending, setStepUpPending] = useState(false);
  const [grantTransitionPending, startGrantTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const pending = grantPending || stepUpPending || grantTransitionPending;

  async function prepareStepUpProof() {
    const code = mfaCode.trim();
    if (!/^\d{6}$/.test(code)) {
      throw new Error("Enter a valid 6-digit MFA code.");
    }

    const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
    if (factorError) {
      throw new Error(factorError.message);
    }

    const factor = factors.totp.find((item) => item.status === "verified");
    if (!factor) {
      throw new Error("Set up MFA before granting temporary access.");
    }

    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code,
    });
    if (verifyError) {
      throw new Error("MFA code was not accepted.");
    }

    const proof = await createDelegationStepUpProofAction();
    if (!proof.success || !proof.proofId) {
      throw new Error(proof.error ?? "Step-up verification could not be completed.");
    }

    return proof.proofId;
  }

  async function handleGrantSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setClientError(null);
    setStepUpPending(true);

    try {
      const proofId = await prepareStepUpProof();
      const form = formRef.current;
      if (!form) {
        throw new Error("Temporary access form is unavailable.");
      }

      const formData = new FormData(form);
      formData.set("stepUpProofId", proofId);
      formData.delete("mfaCode");
      setMfaCode("");
      startGrantTransition(() => {
        grantAction(formData);
      });
    } catch (error: unknown) {
      setClientError(getClientErrorMessage(error));
    } finally {
      setStepUpPending(false);
    }
  }

  return (
    <details className="group rounded-lg border border-border bg-background/60">
      <summary className="flex h-9 cursor-pointer list-none items-center justify-center gap-2 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 [&::-webkit-details-marker]:hidden">
        <KeyRound className="w-3.5 h-3.5" />
        <span>Grant Access</span>
      </summary>
      <form ref={formRef} action={grantAction} onSubmit={handleGrantSubmit} className="border-t border-border p-3 space-y-3 min-w-[250px]">
        <input type="hidden" name="userId" value={member.id} />
        <input type="hidden" name="stepUpProofId" value="" readOnly />

        {grantState.success && grantState.message && (
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-2 text-[11px] text-emerald-600 dark:text-emerald-400">
            {grantState.message}
          </div>
        )}
        {clientError && (
          <div className="rounded-lg border border-red-500/25 bg-red-500/10 p-2 text-[11px] text-red-600 dark:text-red-400">
            {clientError}
          </div>
        )}
        {grantState.error && (
          <div className="rounded-lg border border-red-500/25 bg-red-500/10 p-2 text-[11px] text-red-600 dark:text-red-400">
            {grantState.error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-2">
          <label className="space-y-1">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Scope</span>
            <select
              name="scope"
              defaultValue="inventory.adjust"
              className="h-9 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {ACTIVE_STAFF_DELEGATION_PRIVILEGES.map((scope) => (
                <option key={scope} value={scope}>{formatStaffPrivilege(scope)}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Duration</span>
            <select
              name="durationHours"
              defaultValue="2"
              className="h-9 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="1">1 hour</option>
              <option value="2">2 hours</option>
              <option value="4">4 hours</option>
              <option value="8">8 hours</option>
              <option value="24">24 hours</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Reason</span>
            <input
              name="reason"
              type="text"
              required
              minLength={5}
              maxLength={300}
              placeholder="Owner away from shop"
              className="h-9 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>

          <label className="space-y-1">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">MFA Code</span>
            <input
              name="mfaCode"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={mfaCode}
              onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              className="h-9 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>

          <label className="space-y-1">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Confirm</span>
            <input
              name="confirmText"
              type="text"
              required
              placeholder="Type GRANT"
              className="h-9 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span>{stepUpPending ? "Verifying..." : grantPending ? "Granting..." : "Verify & Grant"}</span>
        </button>
      </form>
    </details>
  );
}

export function StaffActions({ member }: { member: StaffMemberDTO }) {
  if (member.role === "owner" || member.isCurrentUser) {
    return <span className="text-xs text-muted-foreground">Owner account</span>;
  }

  if (member.status === "active") {
    return (
      <div className="flex flex-col gap-2">
        <DelegationGrantForm member={member} />
        <SuspendStaffForm member={member} />
      </div>
    );
  }

  return <ReactivateStaffForm member={member} />;
}

function ResendInviteForm({ invitation }: { invitation: StaffInvitationDTO }) {
  const [state, formAction] = useActionState(resendStaffInviteAction, initialRowActionState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="invitationId" value={invitation.id} />
      <SubmitButton tone="primary" icon={<MailPlus className="w-3.5 h-3.5" />}>Resend</SubmitButton>
      <RowActionMessage state={state} />
    </form>
  );
}

function RevokeInviteForm({ invitation }: { invitation: StaffInvitationDTO }) {
  const [state, formAction] = useActionState(revokeStaffInviteAction, initialRowActionState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="invitationId" value={invitation.id} />
      <DestructiveConfirmField expected="REVOKE" />
      <SubmitButton tone="danger" icon={<XCircle className="w-3.5 h-3.5" />}>Revoke invite</SubmitButton>
      <RowActionMessage state={state} />
    </form>
  );
}

export function InviteActions({ invitation }: { invitation: StaffInvitationDTO }) {
  if (invitation.status !== "pending") {
    return <span className="text-xs text-muted-foreground">No action</span>;
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
      <ResendInviteForm invitation={invitation} />
      <RevokeInviteForm invitation={invitation} />
    </div>
  );
}

export function RevokeDelegationForm({ delegation }: { delegation: StaffDelegationDTO }) {
  const [state, formAction] = useActionState(revokePrivilegeDelegationAction, initialRowActionState);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="delegationId" value={delegation.id} />
      <DestructiveConfirmField expected="REVOKE" />
      <SubmitButton tone="danger" icon={<XCircle className="w-3.5 h-3.5" />}>Revoke access</SubmitButton>
      <RowActionMessage state={state} />
    </form>
  );
}
