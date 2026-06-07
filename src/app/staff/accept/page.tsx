import type { Metadata } from "next";
import StaffAcceptPage from "@/features/staff/components/staff-accept-page";
import { getCurrentUser } from "@/server/supabase/dal";
import { getStaffInvitePreview } from "@/server/staff/staff-invite-preview";

export const metadata: Metadata = {
  title: "Accept Staff Invite | PaisaPOS",
};

type StaffAcceptRouteProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function StaffAcceptRoute({ searchParams }: StaffAcceptRouteProps) {
  const params = await searchParams;
  const invitationId = firstParam(params.invitationId) ?? "";
  const [currentUser, invitePreview] = await Promise.all([
    getCurrentUser(),
    getStaffInvitePreview(invitationId),
  ]);

  return (
    <StaffAcceptPage
      invitationId={invitationId}
      currentEmail={currentUser?.email ?? null}
      invitePreview={invitePreview}
    />
  );
}
