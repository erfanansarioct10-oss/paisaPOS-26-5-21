"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle, MailPlus } from "lucide-react";
import { inviteStaffFormAction } from "@/features/staff/server/actions";
import type { StaffActionState } from "@/app/staff-actions";

const initialInviteState: StaffActionState = { success: false };

export function StaffInvitePanel() {
  const [inviteState, inviteFormAction, invitePending] = useActionState(inviteStaffFormAction, initialInviteState);

  return (
    <form action={inviteFormAction} className="bg-card border border-border rounded-xl p-5 sm:p-6 shadow-sm space-y-5">
      <div className="flex items-center gap-2.5 pb-3 border-b border-border">
        <div className="p-2 bg-primary/10 text-primary rounded-lg">
          <MailPlus className="w-4 h-4" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground">Invite Cashier</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cashiers can sell, but cannot edit catalog/settings unless delegated.
          </p>
        </div>
      </div>

      {inviteState.success && inviteState.message && (
        <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3 flex items-center gap-2.5 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <p>{inviteState.message}</p>
        </div>
      )}
      {inviteState.error && (
        <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-3 flex items-start gap-2.5 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>{inviteState.error}</p>
        </div>
      )}

      <div>
        <label htmlFor="staff-email" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
          Email
        </label>
        <input
          id="staff-email"
          name="email"
          type="email"
          required
          maxLength={254}
          placeholder="cashier@example.com"
          className="block h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm transition-all placeholder-slate-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:placeholder-slate-600"
        />
      </div>

      <button
        type="submit"
        disabled={invitePending}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <MailPlus className="w-3.5 h-3.5" />
        <span>{invitePending ? "Sending..." : "Send Invite"}</span>
      </button>
    </form>
  );
}
