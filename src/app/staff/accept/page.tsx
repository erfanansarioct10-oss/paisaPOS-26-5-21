import type { Metadata } from "next";
import StaffAcceptPage from "@/components/staff-accept-page";
import { getCurrentUser } from "@/lib/server/dal";

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
  const currentUser = await getCurrentUser();

  return (
    <StaffAcceptPage
      invitationId={invitationId}
      currentEmail={currentUser?.email ?? null}
    />
  );
}
