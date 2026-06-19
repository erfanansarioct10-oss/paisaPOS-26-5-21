import type { Metadata } from "next";
import { redirect } from "next/navigation";
import StaffManagementPage from "@/features/staff/components/staff-management-page";
import { getStaffManagementDTO } from "@/server/supabase/dal";
import { PermissionDeniedError, requirePrivilege } from "@/server/auth/permissions";

export const metadata: Metadata = {
  title: "Staff | Chlorif",
};

type StaffPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function requireStaffPageContext() {
  try {
    return await requirePrivilege("staff.manage");
  } catch (error: unknown) {
    if (error instanceof PermissionDeniedError) {
      redirect("/dashboard");
    }
    throw error;
  }
}

export default async function StaffPage({ searchParams }: StaffPageProps) {
  const context = await requireStaffPageContext();
  const params = await searchParams;
  const staffManagement = await getStaffManagementDTO(params, context);
  return <StaffManagementPage staffManagement={staffManagement} />;
}
