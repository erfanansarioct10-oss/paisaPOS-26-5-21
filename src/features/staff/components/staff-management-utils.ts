import type {
  StaffInvitationDTO,
  StaffManagementDTO,
  StaffMemberDTO,
} from "@/server/supabase/dal";

export type StaffPaginationSection = "staff" | "invitations" | "activeDelegations";

const STAFF_PAGE_PARAMS: Record<StaffPaginationSection, "staffPage" | "invitePage" | "delegationPage"> = {
  staff: "staffPage",
  invitations: "invitePage",
  activeDelegations: "delegationPage",
};

export function getClientErrorMessage(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "";

  if (/valid 6-digit MFA code/i.test(message)) return "Enter a valid 6-digit MFA code.";
  if (/set up MFA/i.test(message)) return "Set up MFA before granting temporary access.";
  if (/MFA code was not accepted/i.test(message)) return "MFA code was not accepted.";
  if (/network|fetch|connection|server/i.test(message)) {
    return "We could not reach the verification service. Please check your connection and try again.";
  }
  return "We could not verify your identity. Please try again.";
}

export function formatDateTime(value: string | null) {
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

export function roleLabel(role: StaffMemberDTO["role"] | StaffInvitationDTO["role"]) {
  return role === "owner" ? "Owner" : "Cashier";
}

export function statusBadge(status: StaffMemberDTO["status"] | StaffInvitationDTO["displayStatus"]) {
  if (status === "active" || status === "accepted") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  }
  if (status === "pending") {
    return "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  return "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400";
}

export function statusLabel(status: StaffMemberDTO["status"] | StaffInvitationDTO["displayStatus"]) {
  if (status === "active") return "Active";
  if (status === "accepted") return "Accepted";
  if (status === "pending") return "Pending";
  if (status === "expired") return "Expired";
  if (status === "revoked") return "Revoked";
  return "Suspended";
}

export function staffEmailDisplay(member: StaffMemberDTO) {
  if (member.email) return member.email;
  return member.emailSource === "not_recorded" ? "No invite email recorded" : "Email not available";
}

export function buildStaffManagementHref(staffManagement: StaffManagementDTO, update: StaffPaginationSection, page: number) {
  const params = new URLSearchParams();
  const { filters } = staffManagement;
  const currentPages: Record<StaffPaginationSection, number> = {
    staff: filters.staffPage,
    invitations: filters.invitePage,
    activeDelegations: filters.delegationPage,
  };

  currentPages[update] = page;

  for (const section of Object.keys(currentPages) as StaffPaginationSection[]) {
    const value = currentPages[section];
    if (value > 1) {
      params.set(STAFF_PAGE_PARAMS[section], String(value));
    }
  }

  const query = params.toString();
  return query ? `/staff?${query}` : "/staff";
}
