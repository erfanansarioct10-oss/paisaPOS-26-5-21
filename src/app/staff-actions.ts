"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordActivityEvent } from "@/lib/server/activity";
import { getSupabaseAdminClient, type StaffInvitationRow, type StaffProfileRow } from "@/lib/server/admin-supabase";
import { getSupabaseServerClient } from "@/lib/server/dal";
import { requirePrivilege } from "@/lib/server/permissions";
import { ACTIVE_STAFF_DELEGATION_PRIVILEGES, formatStaffPrivilege } from "@/lib/staff-capabilities";
import {
  delegationGrantLimiter,
  delegationRevokeLimiter,
  enforceRateLimit,
  staffInviteLimiter,
  staffLifecycleLimiter,
} from "@/lib/rate-limiter";
import {
  MAX_EMAIL_LENGTH,
  formatZodError,
  getFriendlyErrorMessage,
  normalizeEmail,
  sanitizeString,
  validateAuthStringSafety,
} from "@/lib/security";

export type StaffActionState = {
  success: boolean;
  message?: string;
  error?: string;
  updatedAt?: number;
};

const staffInitialError = "We could not update staff access. Please try again.";

const staffEmailSchema = z.preprocess(
  (value) => (typeof value === "string" ? normalizeEmail(value) : value),
  z.string()
    .min(1, "Email is required.")
    .max(MAX_EMAIL_LENGTH, "Email must be 254 characters or fewer.")
    .refine(validateAuthStringSafety, "Email contains unsupported control characters.")
    .email("Enter a valid email address."),
);

const inviteStaffSchema = z.object({
  email: staffEmailSchema,
});

const invitationIdSchema = z.object({
  invitationId: z.string().uuid("Invalid invitation id."),
});

const staffUserIdSchema = z.object({
  userId: z.string().uuid("Invalid staff user id."),
});

const privilegeDelegationIdSchema = z.object({
  delegationId: z.string().uuid("Invalid delegation id."),
});

const grantDelegationSchema = z.object({
  userId: z.string().uuid("Invalid staff user id."),
  scope: z.enum(ACTIVE_STAFF_DELEGATION_PRIVILEGES, {
    message: "Choose an allowed temporary access scope.",
  }),
  durationHours: z.preprocess(
    (value) => Number(value),
    z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(8), z.literal(24)], {
      message: "Choose a valid duration.",
    }),
  ),
  reason: z.string()
    .min(5, "Reason must be at least 5 characters.")
    .max(300, "Reason must be 300 characters or fewer.")
    .refine(validateAuthStringSafety, "Reason contains unsupported control characters.")
    .transform(sanitizeString),
  confirmText: z.string().transform((value) => value.trim().toUpperCase()),
}).refine((value) => value.confirmText === "GRANT", {
  message: "Type GRANT to confirm temporary access.",
  path: ["confirmText"],
});

type AuthAdminUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

type DelegatableStaffPrivilege = (typeof ACTIVE_STAFF_DELEGATION_PRIVILEGES)[number];

function errorState(error: unknown, fallback = staffInitialError): StaffActionState {
  return {
    success: false,
    error: getFriendlyErrorMessage(error) || fallback,
    updatedAt: Date.now(),
  };
}

async function getAppUrl() {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.NEXT_PUBLIC_VERCEL_URL) return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
  if (process.env.NODE_ENV !== "production") {
    const head = await headers();
    const host = head.get("host") || "localhost:3000";
    const proto = head.get("x-forwarded-proto") || "http";
    return `${proto}://${host}`;
  }
  return "https://paisa-pos-26-5-21.vercel.app";
}

function fallbackNameFromEmail(email: string) {
  const localPart = email.split("@")[0] || "Cashier";
  return sanitizeString(localPart.replace(/[._-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())).slice(0, 100) || "Cashier";
}

function displayNameFromAuthUser(user: AuthAdminUser, email: string) {
  const metadataName = user.user_metadata?.full_name ?? user.user_metadata?.name;
  if (typeof metadataName === "string" && sanitizeString(metadataName)) {
    return sanitizeString(metadataName).slice(0, 100);
  }
  return fallbackNameFromEmail(email);
}

async function expireOldPendingInvites(storeId: string, email?: string) {
  const adminClient = getSupabaseAdminClient();
  let query = adminClient
    .from("staff_invitations")
    .update({ status: "expired" })
    .eq("store_id", storeId)
    .eq("status", "pending")
    .lte("expires_at", new Date().toISOString());

  if (email) {
    query = query.eq("email", email);
  }

  const { error } = await query;
  if (error) {
    throw new Error(error.message);
  }
}

async function getProfileForUserId(userId: string): Promise<StaffProfileRow | null> {
  const adminClient = getSupabaseAdminClient();
  const { data, error } = await adminClient
    .from("users")
    .select("id, name, store_id, role, status, invited_by_user_id, suspended_at, suspended_by_user_id, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as StaffProfileRow | null;
}

async function getPendingInvitation(invitationId: string): Promise<StaffInvitationRow | null> {
  const adminClient = getSupabaseAdminClient();
  const { data, error } = await adminClient
    .from("staff_invitations")
    .select("id, store_id, email, role, status, invited_by_user_id, accepted_by_user_id, accepted_at, revoked_by_user_id, revoked_at, expires_at, created_at")
    .eq("id", invitationId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as StaffInvitationRow | null;
}

async function findActiveDelegation(storeId: string, userId: string, scope: DelegatableStaffPrivilege) {
  const adminClient = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await adminClient
    .from("privilege_delegations")
    .select("id, expires_at")
    .eq("store_id", storeId)
    .eq("granted_to_user_id", userId)
    .eq("scope", scope)
    .is("revoked_at", null)
    .lte("starts_at", now)
    .gt("expires_at", now)
    .order("expires_at", { ascending: true })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return data?.[0] ?? null;
}

export async function inviteStaffFormAction(
  _prevState: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const validation = inviteStaffSchema.safeParse({
    email: formData.get("email"),
  });

  if (!validation.success) {
    return { success: false, error: formatZodError(validation.error), updatedAt: Date.now() };
  }

  const { email } = validation.data;

  try {
    const { user, store, privilegeSource, delegationId } = await requirePrivilege("staff.manage");
    const adminClient = getSupabaseAdminClient();
    if (normalizeEmail(user.email ?? "") === email) {
      return { success: false, error: "Owners cannot invite their own email as cashier.", updatedAt: Date.now() };
    }

    await enforceRateLimit(staffInviteLimiter, `staff_invite:${user.id}`, "STAFF_INVITE");
    await expireOldPendingInvites(store.id, email);

    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const { data: invitation, error: inviteInsertError } = await adminClient
      .from("staff_invitations")
      .insert({
        store_id: store.id,
        email,
        role: "cashier",
        status: "pending",
        invited_by_user_id: user.id,
        expires_at: expiresAt,
      })
      .select("id, store_id, email, role, status, invited_by_user_id, accepted_by_user_id, accepted_at, revoked_by_user_id, revoked_at, expires_at, created_at")
      .single();

    if (inviteInsertError || !invitation) {
      const duplicate = inviteInsertError?.code === "23505";
      return {
        success: false,
        error: duplicate ? "That email already has a pending invite." : getFriendlyErrorMessage(inviteInsertError),
        updatedAt: Date.now(),
      };
    }

    const appUrl = await getAppUrl();
    const acceptPath = `/staff/accept?invitationId=${invitation.id}`;
    const redirectTo = `${appUrl}/auth/callback?next=${encodeURIComponent(acceptPath)}`;
    const { error: authInviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: {
        invitation_id: invitation.id,
        invited_role: "cashier",
        invited_store_id: store.id,
      },
      redirectTo,
    });

    if (authInviteError) {
      const localAuthAdminUnavailable =
        process.env.NODE_ENV !== "production" &&
        /invalid jwt|signing method/i.test(authInviteError.message);

      if (!localAuthAdminUnavailable) {
        await adminClient
          .from("staff_invitations")
          .update({
            status: "revoked",
            revoked_by_user_id: user.id,
            revoked_at: new Date().toISOString(),
          })
          .eq("id", invitation.id);

        await recordActivityEvent({
          storeId: store.id,
          actor: user,
          action: "staff.invite_failed",
          actionScope: "staff.manage",
          privilegeSource,
          delegationId,
          targetType: "staff_invitation",
          targetId: invitation.id,
          targetLabel: email,
          result: "failure",
          errorCode: "auth_invite_failed",
          summary: `${user.name} failed to invite a cashier.`,
        });

        return errorState(authInviteError, "The invite could not be sent.");
      }
    }

    const metadata: Record<string, unknown> = {
      expiresAt,
    };

    if (authInviteError) {
      metadata.emailDelivery = "skipped_local_auth_admin";
    }

    await recordActivityEvent({
      storeId: store.id,
      actor: user,
      action: "staff.invited",
      actionScope: "staff.manage",
      privilegeSource,
      delegationId,
      targetType: "staff_invitation",
      targetId: invitation.id,
      targetLabel: email,
      result: "success",
      summary: `${user.name} invited a cashier.`,
      metadata,
    });

    revalidatePath("/staff");
    revalidatePath("/activity");
    return {
      success: true,
      message: `Invitation sent to ${email}.`,
      updatedAt: Date.now(),
    };
  } catch (error: unknown) {
    return errorState(error);
  }
}

export async function revokeStaffInviteAction(formData: FormData) {
  const validation = invitationIdSchema.safeParse({
    invitationId: formData.get("invitationId"),
  });
  if (!validation.success) {
    throw new Error(formatZodError(validation.error));
  }

  const { invitationId } = validation.data;
  const { user, store, privilegeSource, delegationId } = await requirePrivilege("staff.manage");
  await enforceRateLimit(staffLifecycleLimiter, `staff_lifecycle:${user.id}`, "STAFF_INVITE_REVOKE");

  const invitation = await getPendingInvitation(invitationId);
  if (!invitation || invitation.store_id !== store.id || invitation.status !== "pending") {
    throw new Error("Pending invitation not found.");
  }

  const adminClient = getSupabaseAdminClient();
  const { error } = await adminClient
    .from("staff_invitations")
    .update({
      status: "revoked",
      revoked_by_user_id: user.id,
      revoked_at: new Date().toISOString(),
    })
    .eq("id", invitation.id)
    .eq("store_id", store.id);

  if (error) {
    throw new Error(error.message);
  }

  await recordActivityEvent({
    storeId: store.id,
    actor: user,
    action: "staff.invite_revoked",
    actionScope: "staff.manage",
    privilegeSource,
    delegationId,
    targetType: "staff_invitation",
    targetId: invitation.id,
    targetLabel: invitation.email,
    result: "success",
    summary: `${user.name} revoked a cashier invitation.`,
  });

  revalidatePath("/staff");
  revalidatePath("/activity");
}

export async function suspendStaffAction(formData: FormData) {
  const validation = staffUserIdSchema.safeParse({
    userId: formData.get("userId"),
  });
  if (!validation.success) {
    throw new Error(formatZodError(validation.error));
  }

  const { userId } = validation.data;
  const { user, store, privilegeSource, delegationId } = await requirePrivilege("staff.manage");
  if (userId === user.id) {
    throw new Error("Owners cannot suspend their own account.");
  }

  await enforceRateLimit(staffLifecycleLimiter, `staff_lifecycle:${user.id}`, "STAFF_SUSPEND");

  const staffProfile = await getProfileForUserId(userId);
  if (!staffProfile || staffProfile.store_id !== store.id || staffProfile.role !== "cashier") {
    throw new Error("Cashier profile not found.");
  }
  if (staffProfile.status === "suspended") {
    throw new Error("This cashier is already suspended.");
  }

  const adminClient = getSupabaseAdminClient();
  const suspendedAt = new Date().toISOString();
  const { error } = await adminClient
    .from("users")
    .update({
      status: "suspended",
      suspended_at: suspendedAt,
      suspended_by_user_id: user.id,
    })
    .eq("id", staffProfile.id)
    .eq("store_id", store.id);

  if (error) {
    throw new Error(error.message);
  }

  await recordActivityEvent({
    storeId: store.id,
    actor: user,
    action: "staff.suspended",
    actionScope: "staff.manage",
    privilegeSource,
    delegationId,
    targetType: "user",
    targetId: staffProfile.id,
    targetLabel: staffProfile.name,
    result: "success",
    summary: `${user.name} suspended cashier ${staffProfile.name}.`,
    metadata: {
      suspendedAt,
    },
  });

  revalidatePath("/staff");
  revalidatePath("/activity");
}

export async function reactivateStaffAction(formData: FormData) {
  const validation = staffUserIdSchema.safeParse({
    userId: formData.get("userId"),
  });
  if (!validation.success) {
    throw new Error(formatZodError(validation.error));
  }

  const { userId } = validation.data;
  const { user, store, privilegeSource, delegationId } = await requirePrivilege("staff.manage");
  await enforceRateLimit(staffLifecycleLimiter, `staff_lifecycle:${user.id}`, "STAFF_REACTIVATE");

  const staffProfile = await getProfileForUserId(userId);
  if (!staffProfile || staffProfile.store_id !== store.id || staffProfile.role !== "cashier") {
    throw new Error("Cashier profile not found.");
  }
  if (staffProfile.status === "active") {
    throw new Error("This cashier is already active.");
  }

  const adminClient = getSupabaseAdminClient();
  const { error } = await adminClient
    .from("users")
    .update({
      status: "active",
      suspended_at: null,
      suspended_by_user_id: null,
    })
    .eq("id", staffProfile.id)
    .eq("store_id", store.id);

  if (error) {
    throw new Error(error.message);
  }

  await recordActivityEvent({
    storeId: store.id,
    actor: user,
    action: "staff.reactivated",
    actionScope: "staff.manage",
    privilegeSource,
    delegationId,
    targetType: "user",
    targetId: staffProfile.id,
    targetLabel: staffProfile.name,
    result: "success",
    summary: `${user.name} reactivated cashier ${staffProfile.name}.`,
  });

  revalidatePath("/staff");
  revalidatePath("/activity");
}

export async function grantPrivilegeDelegationFormAction(
  _prevState: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const validation = grantDelegationSchema.safeParse({
    userId: formData.get("userId"),
    scope: formData.get("scope"),
    durationHours: formData.get("durationHours"),
    reason: formData.get("reason"),
    confirmText: formData.get("confirmText"),
  });

  if (!validation.success) {
    return { success: false, error: formatZodError(validation.error), updatedAt: Date.now() };
  }

  try {
    const { user, store, privilegeSource, delegationId } = await requirePrivilege("staff.manage");
    await enforceRateLimit(delegationGrantLimiter, `delegation_grant:${user.id}`, "DELEGATION_GRANT");

    const { userId, scope, durationHours, reason } = validation.data;
    if (userId === user.id) {
      return { success: false, error: "Owners cannot delegate temporary access to themselves.", updatedAt: Date.now() };
    }

    const staffProfile = await getProfileForUserId(userId);
    if (!staffProfile || staffProfile.store_id !== store.id || staffProfile.role !== "cashier") {
      return { success: false, error: "Active cashier profile not found.", updatedAt: Date.now() };
    }
    if (staffProfile.status !== "active") {
      return { success: false, error: "Temporary access can only be granted to active cashiers.", updatedAt: Date.now() };
    }

    const existingDelegation = await findActiveDelegation(store.id, staffProfile.id, scope);
    if (existingDelegation) {
      return {
        success: false,
        error: `${formatStaffPrivilege(scope)} is already active for ${staffProfile.name}.`,
        updatedAt: Date.now(),
      };
    }

    const startsAt = new Date();
    const expiresAt = new Date(startsAt.getTime() + durationHours * 60 * 60 * 1000);
    const adminClient = getSupabaseAdminClient();
    const { data: delegation, error } = await adminClient
      .from("privilege_delegations")
      .insert({
        store_id: store.id,
        granted_to_user_id: staffProfile.id,
        granted_by_user_id: user.id,
        scope,
        reason,
        starts_at: startsAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      })
      .select("id, expires_at")
      .single();

    if (error || !delegation) {
      throw new Error(error?.message ?? "Temporary access could not be granted.");
    }

    await recordActivityEvent({
      storeId: store.id,
      actor: user,
      action: "delegation.granted",
      actionScope: "staff.manage",
      privilegeSource,
      delegationId,
      targetType: "privilege_delegation",
      targetId: delegation.id,
      targetLabel: staffProfile.name,
      result: "success",
      summary: `${user.name} granted temporary ${formatStaffPrivilege(scope)} to ${staffProfile.name}.`,
      metadata: {
        grantedToUserId: staffProfile.id,
        grantedScope: scope,
        startsAt: startsAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        durationHours,
        reason,
      },
    });

    revalidatePath("/staff");
    revalidatePath("/activity");

    return {
      success: true,
      message: `${formatStaffPrivilege(scope)} granted to ${staffProfile.name} for ${durationHours} hour(s).`,
      updatedAt: Date.now(),
    };
  } catch (error: unknown) {
    return errorState(error, "Temporary access could not be granted.");
  }
}

export async function revokePrivilegeDelegationAction(formData: FormData) {
  const validation = privilegeDelegationIdSchema.safeParse({
    delegationId: formData.get("delegationId"),
  });
  if (!validation.success) {
    throw new Error(formatZodError(validation.error));
  }

  const { delegationId: targetDelegationId } = validation.data;
  const { user, store, privilegeSource, delegationId } = await requirePrivilege("staff.manage");
  await enforceRateLimit(delegationRevokeLimiter, `delegation_revoke:${user.id}`, "DELEGATION_REVOKE");

  const adminClient = getSupabaseAdminClient();
  const { data: delegation, error: delegationError } = await adminClient
    .from("privilege_delegations")
    .select("id, store_id, granted_to_user_id, scope, reason, starts_at, expires_at, revoked_at")
    .eq("id", targetDelegationId)
    .maybeSingle();

  if (delegationError) {
    throw new Error(delegationError.message);
  }
  if (!delegation || delegation.store_id !== store.id) {
    throw new Error("Temporary access record not found.");
  }
  if (delegation.revoked_at) {
    throw new Error("Temporary access is already revoked.");
  }

  const staffProfile = await getProfileForUserId(delegation.granted_to_user_id);
  if (!staffProfile || staffProfile.store_id !== store.id) {
    throw new Error("Cashier profile not found.");
  }

  const revokedAt = new Date().toISOString();
  const { error: revokeError } = await adminClient
    .from("privilege_delegations")
    .update({
      revoked_at: revokedAt,
      revoked_by_user_id: user.id,
    })
    .eq("id", delegation.id)
    .eq("store_id", store.id);

  if (revokeError) {
    throw new Error(revokeError.message);
  }

  await recordActivityEvent({
    storeId: store.id,
    actor: user,
    action: "delegation.revoked",
    actionScope: "staff.manage",
    privilegeSource,
    delegationId,
    targetType: "privilege_delegation",
    targetId: delegation.id,
    targetLabel: staffProfile.name,
    result: "success",
    summary: `${user.name} revoked temporary ${formatStaffPrivilege(delegation.scope)} from ${staffProfile.name}.`,
    metadata: {
      grantedToUserId: staffProfile.id,
      grantedScope: delegation.scope,
      startsAt: delegation.starts_at,
      expiresAt: delegation.expires_at,
      revokedAt,
    },
  });

  revalidatePath("/staff");
  revalidatePath("/activity");
}

export async function acceptStaffInviteFormAction(
  _prevState: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const validation = invitationIdSchema.safeParse({
    invitationId: formData.get("invitationId"),
  });

  if (!validation.success) {
    return { success: false, error: formatZodError(validation.error), updatedAt: Date.now() };
  }

  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser?.email) {
      return { success: false, error: "Please sign in with the invited email first.", updatedAt: Date.now() };
    }

    const email = normalizeEmail(authUser.email);
    const invitation = await getPendingInvitation(validation.data.invitationId);
    if (!invitation) {
      return { success: false, error: "Invitation not found.", updatedAt: Date.now() };
    }
    if (invitation.status !== "pending") {
      return { success: false, error: "This invitation is no longer pending.", updatedAt: Date.now() };
    }
    if (new Date(invitation.expires_at).getTime() <= Date.now()) {
      await expireOldPendingInvites(invitation.store_id, invitation.email);
      return { success: false, error: "This invitation has expired. Ask the owner to send a new one.", updatedAt: Date.now() };
    }
    if (normalizeEmail(invitation.email) !== email) {
      return { success: false, error: "This invite belongs to a different email address.", updatedAt: Date.now() };
    }

    const adminClient = getSupabaseAdminClient();
    const existingProfile = await getProfileForUserId(authUser.id);
    let actorName = displayNameFromAuthUser(authUser as AuthAdminUser, email);

    if (existingProfile?.store_id && existingProfile.store_id !== invitation.store_id) {
      return {
        success: false,
        error: "This account is already connected to another store.",
        updatedAt: Date.now(),
      };
    }

    if (existingProfile?.store_id === invitation.store_id) {
      if (existingProfile.status !== "active") {
        return { success: false, error: "This staff account is suspended.", updatedAt: Date.now() };
      }
      if (existingProfile.role !== "cashier") {
        return { success: false, error: "This invite can only be accepted by a cashier account.", updatedAt: Date.now() };
      }
      actorName = existingProfile.name;
    } else if (existingProfile && !existingProfile.store_id) {
      const { error: profileUpdateError } = await adminClient
        .from("users")
        .update({
          name: actorName,
          store_id: invitation.store_id,
          role: "cashier",
          status: "active",
          invited_by_user_id: invitation.invited_by_user_id,
          suspended_at: null,
          suspended_by_user_id: null,
        })
        .eq("id", authUser.id);

      if (profileUpdateError) {
        throw new Error(profileUpdateError.message);
      }
    } else {
      const { error: profileInsertError } = await adminClient
        .from("users")
        .insert({
          id: authUser.id,
          name: actorName,
          store_id: invitation.store_id,
          role: "cashier",
          status: "active",
          invited_by_user_id: invitation.invited_by_user_id,
        });

      if (profileInsertError) {
        throw new Error(profileInsertError.message);
      }
    }

    const acceptedAt = new Date().toISOString();
    const { error: invitationUpdateError } = await adminClient
      .from("staff_invitations")
      .update({
        status: "accepted",
        accepted_by_user_id: authUser.id,
        accepted_at: acceptedAt,
      })
      .eq("id", invitation.id)
      .eq("status", "pending");

    if (invitationUpdateError) {
      throw new Error(invitationUpdateError.message);
    }

    await recordActivityEvent({
      storeId: invitation.store_id,
      actor: {
        id: authUser.id,
        name: actorName,
        email,
        role: "cashier",
      },
      action: "staff.invite_accepted",
      actionScope: "staff.manage",
      targetType: "user",
      targetId: authUser.id,
      targetLabel: actorName,
      result: "success",
      summary: `${actorName} accepted a cashier invitation.`,
      metadata: {
        invitationId: invitation.id,
        acceptedAt,
      },
    });

    revalidatePath("/staff");
    revalidatePath("/activity");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: "Invitation accepted. You can open the dashboard now.",
      updatedAt: Date.now(),
    };
  } catch (error: unknown) {
    return errorState(error);
  }
}
