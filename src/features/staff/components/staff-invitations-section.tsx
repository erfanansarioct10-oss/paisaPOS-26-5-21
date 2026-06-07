"use client";

import { Clock3, ShieldCheck } from "lucide-react";
import type { StaffManagementDTO } from "@/server/supabase/dal";
import { InviteActions } from "@/features/staff/components/staff-row-actions";
import { StaffPaginationControls } from "@/features/staff/components/staff-pagination-controls";
import {
  formatDateTime,
  statusBadge,
  statusLabel,
} from "@/features/staff/components/staff-management-utils";

type StaffInvitationsSectionProps = {
  staffManagement: StaffManagementDTO;
};

export function StaffInvitationsSection({ staffManagement }: StaffInvitationsSectionProps) {
  return (
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
      <StaffPaginationControls
        staffManagement={staffManagement}
        section="invitations"
        pagination={staffManagement.pagination.invitations}
      />
    </section>
  );
}
