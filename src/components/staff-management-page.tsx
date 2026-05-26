"use client";

import React, { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useAppStore } from "@/lib/store/useAppStore";
import type { StaffDelegationDTO, StaffInvitationDTO, StaffManagementDTO, StaffMemberDTO } from "@/lib/server/dal";
import { ACTIVE_STAFF_DELEGATION_PRIVILEGES, formatStaffPrivilege } from "@/lib/staff-capabilities";
import {
  AlertCircle,
  CheckCircle,
  Clock3,
  KeyRound,
  MailPlus,
  RotateCcw,
  ShieldCheck,
  UserRound,
  UserX,
  UsersRound,
  XCircle,
} from "lucide-react";
import {
  inviteStaffFormAction,
  grantPrivilegeDelegationFormAction,
  reactivateStaffAction,
  revokePrivilegeDelegationAction,
  revokeStaffInviteAction,
  suspendStaffAction,
  type StaffActionState,
} from "@/app/staff-actions";

type StaffManagementPageProps = {
  staffManagement: StaffManagementDTO;
};

const initialInviteState: StaffActionState = { success: false };
const initialGrantState: StaffActionState = { success: false };

function formatDateTime(value: string | null) {
  if (!value) return "Not recorded";
  try {
    return new Date(value).toLocaleString("en-NP", {
      timeZone: "Asia/Kathmandu",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function roleLabel(role: StaffMemberDTO["role"] | StaffInvitationDTO["role"]) {
  return role === "owner" ? "Owner" : "Cashier";
}

function statusBadge(status: StaffMemberDTO["status"] | StaffInvitationDTO["displayStatus"]) {
  if (status === "active" || status === "accepted") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  }
  if (status === "pending") {
    return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  return "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400";
}

function statusLabel(status: StaffMemberDTO["status"] | StaffInvitationDTO["displayStatus"]) {
  if (status === "active") return "Active";
  if (status === "accepted") return "Accepted";
  if (status === "pending") return "Pending";
  if (status === "expired") return "Expired";
  if (status === "revoked") return "Revoked";
  return "Suspended";
}

function SubmitButton({
  children,
  icon,
  tone = "neutral",
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
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

function StaffActions({ member }: { member: StaffMemberDTO }) {
  if (member.role === "owner" || member.isCurrentUser) {
    return <span className="text-xs text-muted-foreground">Owner account</span>;
  }

  if (member.status === "active") {
    return (
      <div className="flex flex-col gap-2">
        <DelegationGrantForm member={member} />
        <form action={suspendStaffAction}>
          <input type="hidden" name="userId" value={member.id} />
          <SubmitButton tone="danger" icon={<UserX className="w-3.5 h-3.5" />}>Suspend</SubmitButton>
        </form>
      </div>
    );
  }

  return (
    <form action={reactivateStaffAction}>
      <input type="hidden" name="userId" value={member.id} />
      <SubmitButton tone="primary" icon={<RotateCcw className="w-3.5 h-3.5" />}>Reactivate</SubmitButton>
    </form>
  );
}

function DelegationGrantForm({ member }: { member: StaffMemberDTO }) {
  const [grantState, grantAction, grantPending] = useActionState(grantPrivilegeDelegationFormAction, initialGrantState);

  return (
    <details className="group rounded-lg border border-border bg-background/60">
      <summary className="flex h-9 cursor-pointer list-none items-center justify-center gap-2 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 [&::-webkit-details-marker]:hidden">
        <KeyRound className="w-3.5 h-3.5" />
        <span>Grant Access</span>
      </summary>
      <form action={grantAction} className="border-t border-border p-3 space-y-3 min-w-[250px]">
        <input type="hidden" name="userId" value={member.id} />

        {grantState.success && grantState.message && (
          <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-2 text-[11px] text-emerald-600 dark:text-emerald-400">
            {grantState.message}
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
          disabled={grantPending}
          className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span>{grantPending ? "Granting..." : "Grant Temporary Access"}</span>
        </button>
      </form>
    </details>
  );
}

function InviteActions({ invitation }: { invitation: StaffInvitationDTO }) {
  if (invitation.displayStatus !== "pending") {
    return <span className="text-xs text-muted-foreground">No action</span>;
  }

  return (
    <form action={revokeStaffInviteAction}>
      <input type="hidden" name="invitationId" value={invitation.id} />
      <SubmitButton tone="danger" icon={<XCircle className="w-3.5 h-3.5" />}>Revoke</SubmitButton>
    </form>
  );
}

function ActiveDelegations({ delegations }: { delegations: StaffDelegationDTO[] }) {
  return (
    <section className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
        <KeyRound className="w-4 h-4 text-primary" />
        <div>
          <h2 className="font-semibold text-foreground">Temporary Access</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Active owner-granted scopes that expire automatically.</p>
        </div>
      </div>

      {delegations.length === 0 ? (
        <div className="py-10 px-5 text-center">
          <ShieldCheck className="w-10 h-10 mx-auto text-muted-foreground opacity-30" />
          <h3 className="text-sm font-bold text-foreground mt-3">No Active Temporary Access</h3>
          <p className="text-xs text-muted-foreground mt-1">Grant access from an active cashier row when needed.</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {delegations.map((delegation) => (
            <div key={delegation.id} className="p-4 sm:px-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-foreground truncate">{delegation.staffName}</p>
                  <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                    {delegation.scopeLabel}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Granted by {delegation.grantedByName} - Expires {formatDateTime(delegation.expiresAt)}
                </p>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  Reason: {delegation.reason}
                </p>
              </div>
              <form action={revokePrivilegeDelegationAction}>
                <input type="hidden" name="delegationId" value={delegation.id} />
                <SubmitButton tone="danger" icon={<XCircle className="w-3.5 h-3.5" />}>Revoke</SubmitButton>
              </form>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function StaffManagementPage({ staffManagement }: StaffManagementPageProps) {
  const { setTab } = useAppStore();
  const [inviteState, inviteFormAction, invitePending] = useActionState(inviteStaffFormAction, initialInviteState);
  const cashiers = staffManagement.staff.filter((member) => member.role === "cashier");
  const owners = staffManagement.staff.filter((member) => member.role === "owner");

  useEffect(() => {
    setTab("staff");
  }, [setTab]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="font-outfit font-extrabold text-2xl sm:text-3xl text-foreground tracking-tight flex items-center gap-2.5">
            <UsersRound className="w-7 h-7 text-primary" />
            Staff
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Staff access for <span className="font-semibold text-foreground">{staffManagement.storeName}</span>.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <div className="min-w-28 rounded-lg border border-border bg-card px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Active</p>
            <p className="mt-0.5 text-lg font-black text-foreground tabular-nums">{staffManagement.counts.activeCashiers}</p>
          </div>
          <div className="min-w-28 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">Pending</p>
            <p className="mt-0.5 text-lg font-black text-foreground tabular-nums">{staffManagement.counts.pendingInvites}</p>
          </div>
          <div className="min-w-28 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">Suspended</p>
            <p className="mt-0.5 text-lg font-black text-foreground tabular-nums">{staffManagement.counts.suspendedCashiers}</p>
          </div>
          <div className="min-w-28 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Access</p>
            <p className="mt-0.5 text-lg font-black text-foreground tabular-nums">{staffManagement.counts.activeDelegations}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,420px)_1fr] gap-6 items-start">
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

        <section className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-5 py-4 border-b border-border">
            <div>
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <UserRound className="w-4 h-4 text-primary" />
                Active Directory
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">{owners.length} owner, {cashiers.length} cashier accounts</p>
            </div>
            <Link href="/activity?action=staff.invited" className="text-xs font-semibold text-primary hover:underline">
              View Staff Activity
            </Link>
          </div>

          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/20 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Joined</th>
                  <th className="px-5 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {staffManagement.staff.map((member) => (
                  <tr key={member.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-foreground">{member.name}</p>
                      {member.isCurrentUser && <p className="text-[10px] text-muted-foreground mt-0.5">Current session</p>}
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{member.email ?? "Unavailable"}</td>
                    <td className="px-5 py-4 text-foreground">{roleLabel(member.role)}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusBadge(member.status)}`}>
                        {statusLabel(member.status)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(member.createdAt)}</td>
                    <td className="px-5 py-4">
                      <StaffActions member={member} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="lg:hidden divide-y divide-border">
            {staffManagement.staff.map((member) => (
              <div key={member.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{member.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{member.email ?? "Email unavailable"}</p>
                  </div>
                  <span className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusBadge(member.status)}`}>
                    {statusLabel(member.status)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Role</p>
                    <p className="text-sm font-semibold text-foreground mt-0.5">{roleLabel(member.role)}</p>
                  </div>
                  <StaffActions member={member} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <ActiveDelegations delegations={staffManagement.activeDelegations} />

      <section className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
          <Clock3 className="w-4 h-4 text-primary" />
          <div>
            <h2 className="font-semibold text-foreground">Invitations</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Recent cashier invites and their current state.</p>
          </div>
        </div>

        {staffManagement.invitations.length === 0 ? (
          <div className="py-12 px-5 text-center">
            <ShieldCheck className="w-10 h-10 mx-auto text-muted-foreground opacity-30" />
            <h3 className="text-sm font-bold text-foreground mt-3">No Invitations Yet</h3>
            <p className="text-xs text-muted-foreground mt-1">New cashier invites will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {staffManagement.invitations.map((invitation) => (
              <div key={invitation.id} className="p-4 sm:px-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-foreground truncate">{invitation.email}</p>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusBadge(invitation.displayStatus)}`}>
                      {statusLabel(invitation.displayStatus)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Invited {formatDateTime(invitation.createdAt)} - Expires {formatDateTime(invitation.expiresAt)}
                  </p>
                </div>
                <InviteActions invitation={invitation} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
