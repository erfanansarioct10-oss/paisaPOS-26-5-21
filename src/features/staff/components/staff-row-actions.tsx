"use client";

import { useActionState, useRef, useState, useEffect, useTransition, type FormEvent, type ReactNode } from "react";
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

function SuspendSubmitButton({ children, icon }: { children: ReactNode; icon: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex-1 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-red-600 text-white text-xs font-semibold transition-all hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {icon}
      <span>{pending ? "Suspending..." : children}</span>
    </button>
  );
}

function SuspendStaffForm({ member, onClose }: { member: StaffMemberDTO; onClose: () => void }) {
  const [state, formAction] = useActionState(suspendStaffAction, initialRowActionState);

  useEffect(() => {
    if (state.success) {
      const timer = setTimeout(() => {
        onClose();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [state.success, onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-xl w-full max-w-md flex flex-col shadow-2xl overflow-hidden scale-in-95 duration-200 animate-in zoom-in-95">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-slate-100/40 dark:bg-slate-900/30">
          <div className="p-2 bg-red-500/10 rounded-lg text-red-500 shrink-0">
            <UserX className="w-5 h-5" />
          </div>
          <h3 className="font-outfit font-extrabold text-base text-foreground">
            Suspend Cashier Access
          </h3>
        </div>

        <form action={formAction} className="p-5 space-y-4">
          <input type="hidden" name="userId" value={member.id} />
          
          <div className="text-xs text-muted-foreground leading-relaxed">
            Are you sure you want to suspend <span className="font-semibold text-foreground">{member.name}</span>? This will immediately revoke any active temporary access privileges and prevent them from performing any cash register or catalog tasks.
          </div>

          <DestructiveConfirmField expected="SUSPEND" />
          
          <RowActionMessage state={state} />

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-10 flex items-center justify-center border border-border text-xs font-semibold rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
            >
              Cancel
            </button>
            <SuspendSubmitButton icon={<UserX className="w-3.5 h-3.5" />}>
              Suspend access
            </SuspendSubmitButton>
          </div>
        </form>
      </div>
    </div>
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

function DelegationGrantForm({ member, onClose }: { member: StaffMemberDTO; onClose: () => void }) {
  const [grantState, grantAction, grantPending] = useActionState(grantPrivilegeDelegationFormAction, initialGrantState);
  const [clientError, setClientError] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [stepUpPending, setStepUpPending] = useState(false);
  const [grantTransitionPending, startGrantTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const pending = grantPending || stepUpPending || grantTransitionPending;

  useEffect(() => {
    if (grantState.success) {
      const timer = setTimeout(() => {
        onClose();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [grantState.success, onClose]);

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-xl w-full max-w-md flex flex-col shadow-2xl overflow-hidden scale-in-95 duration-200 animate-in zoom-in-95">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-slate-100/40 dark:bg-slate-900/30">
          <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <h3 className="font-outfit font-extrabold text-base text-foreground">
            Grant Temporary Access
          </h3>
        </div>

        <form ref={formRef} action={grantAction} onSubmit={handleGrantSubmit} className="p-5 space-y-4">
          <input type="hidden" name="userId" value={member.id} />
          <input type="hidden" name="stepUpProofId" value="" readOnly />

          {grantState.success && grantState.message && (
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-2.5 text-xs text-emerald-600 dark:text-emerald-400">
              {grantState.message}
            </div>
          )}
          {clientError && (
            <div className="rounded-lg border border-red-500/25 bg-red-500/10 p-2.5 text-xs text-red-600 dark:text-red-400">
              {clientError}
            </div>
          )}
          {grantState.error && (
            <div className="rounded-lg border border-red-500/25 bg-red-500/10 p-2.5 text-xs text-red-600 dark:text-red-400">
              {grantState.error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3.5">
            <div className="text-xs text-muted-foreground leading-relaxed">
              Granting elevated operational privileges to <span className="font-semibold text-foreground">{member.name}</span>.
            </div>

            <label className="space-y-1">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Scope</span>
              <select
                name="scope"
                defaultValue="inventory.adjust"
                className="h-10 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
                className="h-10 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
                className="h-10 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
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
                className="h-10 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </label>

            <label className="space-y-1">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Confirm</span>
              <input
                name="confirmText"
                type="text"
                required
                placeholder="Type GRANT"
                className="h-10 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-10 flex items-center justify-center border border-border text-xs font-semibold rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{stepUpPending ? "Verifying..." : grantPending ? "Granting..." : "Verify & Grant"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function StaffActions({ member }: { member: StaffMemberDTO }) {
  const [isGrantOpen, setIsGrantOpen] = useState(false);
  const [isSuspendOpen, setIsSuspendOpen] = useState(false);

  if (member.role === "owner" || member.isCurrentUser) {
    return <span className="text-xs text-muted-foreground">Owner account</span>;
  }

  if (member.status === "active") {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setIsGrantOpen(true)}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-primary/20 text-primary hover:bg-primary/10 px-3 text-xs font-semibold transition-all"
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span>Grant Access</span>
        </button>

        <button
          type="button"
          onClick={() => setIsSuspendOpen(true)}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-red-500/20 text-red-600 hover:bg-red-500/10 px-3 text-xs font-semibold transition-all"
        >
          <UserX className="w-3.5 h-3.5" />
          <span>Suspend</span>
        </button>

        {isGrantOpen && (
          <DelegationGrantForm member={member} onClose={() => setIsGrantOpen(false)} />
        )}

        {isSuspendOpen && (
          <SuspendStaffForm member={member} onClose={() => setIsSuspendOpen(false)} />
        )}
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
