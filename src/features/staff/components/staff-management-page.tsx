"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store/useAppStore";
import type { StaffManagementDTO } from "@/server/supabase/dal";
import { StaffActiveDelegationsSection } from "@/features/staff/components/staff-active-delegations-section";
import { StaffDirectorySection } from "@/features/staff/components/staff-directory-section";
import { StaffInvitationsSection } from "@/features/staff/components/staff-invitations-section";
import { StaffInvitePanel } from "@/features/staff/components/staff-invite-panel";
import { StaffPageHeader } from "@/features/staff/components/staff-page-header";

type StaffManagementPageProps = {
  staffManagement: StaffManagementDTO;
};

export default function StaffManagementPage({ staffManagement }: StaffManagementPageProps) {
  const setTab = useAppStore((state) => state.setTab);

  useEffect(() => {
    setTab("staff");
  }, [setTab]);

  return (
    <div className="space-y-6">
      <StaffPageHeader staffManagement={staffManagement} />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,420px)_1fr] gap-6 items-start">
        <StaffInvitePanel />
        <StaffDirectorySection staffManagement={staffManagement} />
      </div>

      <StaffActiveDelegationsSection
        delegations={staffManagement.activeDelegations}
        pagination={staffManagement.pagination.activeDelegations}
        staffManagement={staffManagement}
      />

      <StaffInvitationsSection staffManagement={staffManagement} />
    </div>
  );
}
