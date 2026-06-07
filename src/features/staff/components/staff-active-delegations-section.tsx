"use client";

import { KeyRound, ShieldCheck } from "lucide-react";
import type {
  StaffDelegationDTO,
  StaffManagementDTO,
  StaffManagementListPaginationDTO,
} from "@/server/supabase/dal";
import { RevokeDelegationForm } from "@/features/staff/components/staff-row-actions";
import { StaffPaginationControls } from "@/features/staff/components/staff-pagination-controls";
import { formatDateTime } from "@/features/staff/components/staff-management-utils";

type StaffActiveDelegationsSectionProps = {
  delegations: StaffDelegationDTO[];
  pagination: StaffManagementListPaginationDTO;
  staffManagement: StaffManagementDTO;
};

export function StaffActiveDelegationsSection({
  delegations,
  pagination,
  staffManagement,
}: StaffActiveDelegationsSectionProps) {
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
              <RevokeDelegationForm delegation={delegation} />
            </div>
          ))}
        </div>
      )}
      <StaffPaginationControls
        staffManagement={staffManagement}
        section="activeDelegations"
        pagination={pagination}
      />
    </section>
  );
}
