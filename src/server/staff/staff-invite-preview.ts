import "server-only";

import { getSupabaseAdminClient } from "@/server/supabase/admin-supabase";
import { logRawServerError } from "@/server/logging/error-logging";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type StaffInvitePreview =
  | {
      state: "pending";
      invitationId: string;
      storeId: string;
      email: string;
      storeName: string | null;
      expiresAt: string;
      message: string;
    }
  | {
      state: "invalid" | "not_found" | "not_pending" | "expired" | "unavailable";
      invitationId?: string;
      storeId?: string;
      email?: string;
      storeName?: string | null;
      expiresAt?: string;
      message: string;
    };

type InvitationPreviewRow = {
  id: string;
  store_id: string;
  email: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  expires_at: string;
};

function notPendingMessage(status: InvitationPreviewRow["status"]) {
  if (status === "accepted") return "This invitation has already been accepted.";
  if (status === "revoked") return "This invitation has been revoked by the store owner.";
  if (status === "expired") return "This invitation has expired. Ask the owner to send a new one.";
  return "This invitation is no longer pending.";
}

export async function getStaffInvitePreview(invitationId: string): Promise<StaffInvitePreview> {
  if (!UUID_PATTERN.test(invitationId)) {
    return {
      state: "invalid",
      message: "This invitation link is invalid.",
    };
  }

  try {
    const adminClient = getSupabaseAdminClient();
    const { data: invitation, error: invitationError } = await adminClient
      .from("staff_invitations")
      .select("id, store_id, email, status, expires_at")
      .eq("id", invitationId)
      .maybeSingle();

    if (invitationError) {
      await logRawServerError("STAFF_INVITE_PREVIEW_FAILED", "Staff invite preview lookup failed", invitationError, {
        invitationId,
      });
      return {
        state: "unavailable",
        invitationId,
        message: "Invitation details are temporarily unavailable. Please try again.",
      };
    }

    if (!invitation) {
      return {
        state: "not_found",
        invitationId,
        message: "Invitation not found.",
      };
    }

    const row = invitation as InvitationPreviewRow;
    const { data: store, error: storeError } = await adminClient
      .from("stores")
      .select("name")
      .eq("id", row.store_id)
      .maybeSingle();

    if (storeError) {
      await logRawServerError("STAFF_INVITE_STORE_PREVIEW_FAILED", "Staff invite store preview lookup failed", storeError, {
        invitationId,
        storeId: row.store_id,
      });
    }

    const storeName = typeof store?.name === "string" ? store.name : null;

    if (row.status !== "pending") {
      return {
        state: "not_pending",
        invitationId: row.id,
        storeId: row.store_id,
        email: row.email,
        storeName,
        expiresAt: row.expires_at,
        message: notPendingMessage(row.status),
      };
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      return {
        state: "expired",
        invitationId: row.id,
        storeId: row.store_id,
        email: row.email,
        storeName,
        expiresAt: row.expires_at,
        message: "This invitation has expired. Ask the owner to send a new one.",
      };
    }

    return {
      state: "pending",
      invitationId: row.id,
      storeId: row.store_id,
      email: row.email,
      storeName,
      expiresAt: row.expires_at,
      message: "Set up your staff account to join this store.",
    };
  } catch (error: unknown) {
    await logRawServerError("STAFF_INVITE_PREVIEW_UNEXPECTED", "Staff invite preview lookup threw", error, {
      invitationId,
    });
    return {
      state: "unavailable",
      invitationId,
      message: "Invitation details are temporarily unavailable. Please try again.",
    };
  }
}
