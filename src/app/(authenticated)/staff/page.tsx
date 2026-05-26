import type { Metadata } from "next";
import { redirect } from "next/navigation";
import StaffManagementPage from "@/components/staff-management-page";
import { getStaffManagementDTO, requireTenantContext } from "@/lib/server/dal";
import { canUsePrivilege } from "@/lib/server/permissions";

export const metadata: Metadata = {
  title: "Staff | PaisaPOS",
};

export default async function StaffPage() {
  const context = await requireTenantContext();
  if (!canUsePrivilege(context.user, "staff.manage")) {
    redirect("/dashboard");
  }

  const staffManagement = await getStaffManagementDTO();
  return <StaffManagementPage staffManagement={staffManagement} />;
}
