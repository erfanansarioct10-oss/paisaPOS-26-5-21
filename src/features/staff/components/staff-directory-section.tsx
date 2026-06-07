"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import type { StaffManagementDTO, StaffMemberDTO } from "@/server/supabase/dal";
import { StaffActions } from "@/features/staff/components/staff-row-actions";
import { StaffPaginationControls } from "@/features/staff/components/staff-pagination-controls";
import {
  formatDateTime,
  roleLabel,
  staffEmailDisplay,
  statusBadge,
  statusLabel,
} from "@/features/staff/components/staff-management-utils";

type StaffDirectorySectionProps = {
  staffManagement: StaffManagementDTO;
};

function StaffDirectoryList({ staff }: { staff: StaffMemberDTO[] }) {
  return (
    <div>
      <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_100px_120px_150px_minmax(210px,auto)] gap-4 border-b border-border bg-muted/20 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground xl:grid">
        <span>Name</span>
        <span>Email</span>
        <span>Role</span>
        <span>Status</span>
        <span>Joined</span>
        <span>Action</span>
      </div>
      <div className="divide-y divide-border">
        {staff.map((member) => (
          <div
            key={member.id}
            data-testid="staff-directory-row"
            className="grid gap-3 p-4 transition-colors hover:bg-muted/10 sm:px-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.3fr)_100px_120px_150px_minmax(210px,auto)] xl:items-start xl:gap-4 xl:py-4"
          >
            <div className="min-w-0">
              <p className="font-semibold text-foreground truncate">{member.name}</p>
              {member.isCurrentUser && <p className="text-[10px] text-muted-foreground mt-0.5">Current session</p>}
            </div>

            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground xl:hidden">Email</p>
              <p className="truncate text-sm text-muted-foreground" title={staffEmailDisplay(member)}>
                {staffEmailDisplay(member)}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground xl:hidden">Role</p>
              <p className="text-sm font-semibold text-foreground xl:font-normal">{roleLabel(member.role)}</p>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground xl:hidden">Status</p>
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusBadge(member.status)}`}>
                {statusLabel(member.status)}
              </span>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground xl:hidden">Joined</p>
              <p className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(member.createdAt)}</p>
            </div>

            <StaffActions member={member} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function StaffDirectorySection({ staffManagement }: StaffDirectorySectionProps) {
  return (
    <section className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-5 py-4 border-b border-border">
        <div>
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <UserRound className="w-4 h-4 text-primary" />
            Active Directory
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Showing {staffManagement.staff.length} of {staffManagement.pagination.staff.total} staff accounts
          </p>
        </div>
        <Link href="/activity?action=staff.invited" className="text-xs font-semibold text-primary hover:underline">
          View Staff Activity
        </Link>
      </div>

      <StaffDirectoryList staff={staffManagement.staff} />
      <StaffPaginationControls
        staffManagement={staffManagement}
        section="staff"
        pagination={staffManagement.pagination.staff}
      />
    </section>
  );
}
