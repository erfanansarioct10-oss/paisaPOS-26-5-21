"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordActivityEvent } from "@/server/activity/activity";
import {
  getSupabaseAdminClient,
  getSupabaseEmailAuthClient,
  type StaffLifecycleRpcResult,
  type StaffProfileRow,
} from "@/server/supabase/admin-supabase";
import { getSupabaseServerClient } from "@/server/supabase/dal";
import { logRawServerError } from "@/server/logging/error-logging";
import { requirePrivilege } from "@/server/auth/permissions";
import { ACTIVE_STAFF_DELEGATION_PRIVILEGES, formatStaffPrivilege } from "@/lib/staff-capabilities";
import {
  delegationGrantLimiter,
  delegationRevokeLimiter,
  enforceRateLimit,
  getClientIp,
  staffInviteAcceptLimiter,
  staffInviteLimiter,
  staffLifecycleLimiter,
} from "@/server/rate-limit/rate-limiter";
import {
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  formatZodError,
  getFriendlyErrorMessage,
  normalizeEmail,
  sanitizeString,
  validateAuthStringSafety,
  validatePasswordComplexity,
} from "@/lib/security";
import { staffAcceptPath } from "@/lib/invite-redirect";
import { getStaffInvitePreview } from "@/server/staff/staff-invite-preview";

export type StaffActionState = {
  success: boolean;
  message?: string;
  error?: string;
  updatedAt?: number;
};

const staffInitialError = "We could not update staff access. Please try again.";
const delegationStepUpPurpose = "delegation.grant";
const delegationStepUpMaxAgeMs = 10 * 60 * 1000;
const delegationStepUpProofTtlMs = 5 * 60 * 1000;
const staffInviteValidityMs = 48 * 60 * 60 * 1000;

export type DelegationStepUpProofState = {
  success: boolean;
  proofId?: string;
  expiresAt?: string;
  error?: string;
  updatedAt?: number;
};

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

const staffAcceptPasswordSchema = z.preprocess(
  (value) => (typeof value === "string" && value.length > 0 ? value : undefined),
  z.string()
    .min(8, "Password must be at least 8 characters.")
    .max(MAX_PASSWORD_LENGTH, "Password must be 256 characters or fewer.")
    .refine(validateAuthStringSafety, "Password contains unsupported control characters.")
    .refine(
      validatePasswordComplexity,
      "Password must contain at least one lowercase letter, one uppercase letter, and one number.",
    )
    .optional(),
);

const staffAcceptInviteSchema = z.object({
  invitationId: z.string().uuid("Invalid invitation id."),
  fullName: z.string()
    .min(1, "Full name is required.")
    .max(100, "Full name must be 100 characters or fewer.")
    .refine(validateAuthStringSafety, "Full name contains unsupported control characters.")
    .transform(sanitizeString)
    .refine((value) => value.length > 0, "Full name is required."),
  password: staffAcceptPasswordSchema,
  confirmPassword: z.preprocess(
    (value) => (typeof value === "string" && value.length > 0 ? value : undefined),
    z.string().optional(),
  ),
}).refine((value) => !value.password || value.password === value.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

const staffUserIdSchema = z.object({
  userId: z.string().uuid("Invalid staff user id."),
});

const privilegeDelegationIdSchema = z.object({
  delegationId: z.string().uuid("Invalid delegation id."),
});

function confirmTextSchema(expected: string, message: string) {
  return z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toUpperCase() : ""),
    z.string().refine((value) => value === expected, { message }),
  );
}

const revokeStaffInviteSchema = invitationIdSchema.extend({
  confirmText: confirmTextSchema("REVOKE", "Type REVOKE to revoke this invitation."),
});

const suspendStaffSchema = staffUserIdSchema.extend({
  confirmText: confirmTextSchema("SUSPEND", "Type SUSPEND to suspend this cashier."),
});

const revokePrivilegeDelegationSchema = privilegeDelegationIdSchema.extend({
  confirmText: confirmTextSchema("REVOKE", "Type REVOKE to revoke temporary access."),
});

const optionalStepUpProofIdSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined),
  z.string().uuid("Invalid step-up proof.").optional(),
);

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
  confirmText: confirmTextSchema("GRANT", "Type GRANT to confirm temporary access."),
  stepUpProofId: optionalStepUpProofIdSchema,
});

const staffInviteAcceptanceResultSchema = z.object({
  invitationId: z.string().uuid(),
  storeId: z.string().uuid(),
  acceptedAt: z.string().min(1),
  actorName: z.string().min(1),
  actorEmail: staffEmailSchema,
  profileDisposition: z.enum(["created", "attached", "existing"]),
  previousProfile: z.unknown().nullable(),
});

const staffLifecycleRpcResultSchema = z.object({
  ok: z.boolean(),
  code: z.string().min(1),
  message: z.string().optional(),
  storeId: z.string().uuid().optional(),
  invitationId: z.string().uuid().optional(),
  delegationId: z.string().uuid().optional(),
  targetId: z.string().uuid().optional(),
  targetLabel: z.string().nullable().optional(),
  email: z.string().optional(),
  scope: z.enum(ACTIVE_STAFF_DELEGATION_PRIVILEGES).optional(),
  actorName: z.string().optional(),
  expiresAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

function parseStaffLifecycleRpcResult(value: unknown): StaffLifecycleRpcResult | null {
  return staffLifecycleRpcResultSchema.nullable().parse(value) as StaffLifecycleRpcResult | null;
}

function errorState(error: unknown, fallback = staffInitialError): StaffActionState {
  return {
    success: false,
    error: getFriendlyErrorMessage(error) || fallback,
    updatedAt: Date.now(),
  };
}

function getInviteAcceptanceErrorMessage(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");

  if (/staff_invitation_auth_required/i.test(message)) {
    return "Please sign in with the invited email first.";
  }
  if (/staff_invitation_not_found/i.test(message)) {
    return "Invitation not found.";
  }
  if (/staff_invitation_not_pending/i.test(message)) {
    return "This invitation is no longer pending.";
  }
  if (/staff_invitation_expired/i.test(message)) {
    return "This invitation has expired. Ask the owner to send a new one.";
  }
  if (/staff_invitation_email_mismatch/i.test(message)) {
    return "This invite belongs to a different email address.";
  }
  if (/staff_invitation_store_conflict/i.test(message)) {
    return "This account is already connected to another store.";
  }
  if (/staff_invitation_suspended_profile/i.test(message)) {
    return "This staff account is suspended.";
  }
  if (/staff_invitation_role_conflict/i.test(message)) {
    return "This invite can only be accepted by a cashier account.";
  }
  if (/staff_invitation_store_missing/i.test(message)) {
    return "This invitation is no longer valid. Ask the owner to send a new one.";
  }

  return null;
}

function inviteAcceptanceErrorState(error: unknown): StaffActionState {
  return {
    success: false,
    error: getInviteAcceptanceErrorMessage(error) ?? getFriendlyErrorMessage(error) ?? staffInitialError,
    updatedAt: Date.now(),
  };
}

function staffLifecycleRpcMessage(result: StaffLifecycleRpcResult | null, fallback = staffInitialError) {
  if (!result) return fallback;
  if (result.message) return getFriendlyErrorMessage(result.message);

  switch (result.code) {
    case "staff_invitation_not_found":
      return "Invitation not found.";
    case "staff_invitation_not_pending":
      return "This invitation is no longer pending.";
    case "staff_lifecycle_unauthorized":
      return "You do not have permission to update staff access.";
    case "staff_self_suspension_denied":
      return "Owners cannot suspend their own account.";
    case "staff_profile_not_found":
      return "Cashier profile not found.";
    case "staff_already_suspended":
      return "This cashier is already suspended.";
    case "staff_already_active":
      return "This cashier is already active.";
    case "delegation_not_found":
      return "Temporary access record not found.";
    case "delegation_already_revoked":
      return "Temporary access is already revoked.";
    case "delegation_self_grant_denied":
      return "Owners cannot delegate temporary access to themselves.";
    case "delegation_scope_not_allowed":
      return "Choose an allowed temporary access scope.";
    case "delegation_duration_invalid":
      return "Choose a valid duration.";
    case "delegation_reason_invalid":
      return "Reason must be at least 5 characters.";
    case "step_up_required":
      return "Verify your identity with MFA before granting temporary access.";
    case "step_up_invalid_or_expired":
      return "Your identity verification expired. Enter a fresh MFA code and try again.";
    case "staff_not_active":
      return "Temporary access can only be granted to active cashiers.";
    case "delegation_already_active":
      return result.targetLabel && result.scope
        ? `${formatStaffPrivilege(result.scope)} is already active for ${result.targetLabel}.`
        : "Temporary access is already active for this cashier.";
    default:
      return fallback;
  }
}

function lifecycleFailureState(result: StaffLifecycleRpcResult | null, fallback = staffInitialError): StaffActionState {
  return {
    success: false,
    error: staffLifecycleRpcMessage(result, fallback),
    updatedAt: Date.now(),
  };
}

async function logStaffActionError(
  category: string,
  error: unknown,
  metadata: Record<string, unknown> = {},
) {
  await logRawServerError(category, "Staff action failed", error, metadata);
}

async function recordStaffActivityEvent(input: Parameters<typeof recordActivityEvent>[0]) {
  return recordActivityEvent(input, { strict: true });
}

function getStaffInviteExpiresAt() {
  return new Date(Date.now() + staffInviteValidityMs).toISOString();
}

function isLocalAuthAdminUnavailable(error: { message?: string } | null | undefined) {
  return Boolean(
    process.env.NODE_ENV !== "production" &&
      error?.message &&
      /invalid jwt|signing method/i.test(error.message),
  );
}

const productionAppOriginFallback = "https://paisa-pos-26-5-21.vercel.app";

function normalizeAppOrigin(value: string | null | undefined) {
  if (!value) return null;

  const candidate = value.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function getVercelAppOrigin() {
  const vercelUrl = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL;
  if (!vercelUrl) return null;

  return normalizeAppOrigin(vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`);
}

async function getAppUrl() {
  const configuredOrigin = normalizeAppOrigin(process.env.APP_URL);
  const vercelOrigin = getVercelAppOrigin();
  if (process.env.VERCEL_ENV === "preview" && vercelOrigin) return vercelOrigin;
  if (configuredOrigin) return configuredOrigin;
  if (vercelOrigin) return vercelOrigin;

  if (process.env.NODE_ENV !== "production") {
    const head = await headers();
    const host = head.get("host") || "localhost:3000";
    const proto = head.get("x-forwarded-proto") === "https" ? "https" : "http";
    if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)) {
      return "http://localhost:3000";
    }
    return `${proto}://${host}`;
  }

  return productionAppOriginFallback;
}

async function sendStaffInviteEmail(
  adminClient: ReturnType<typeof getSupabaseAdminClient>,
  input: {
    email: string;
    invitationId: string;
    storeId: string;
  },
) {
  const appUrl = await getAppUrl();
  const acceptPath = staffAcceptPath(input.invitationId);
  const redirectTo = `${appUrl}${acceptPath}`;

  const inviteResult = await adminClient.auth.admin.inviteUserByEmail(input.email, {
    data: {
      invitation_id: input.invitationId,
      invited_role: "cashier",
      invited_store_id: input.storeId,
    },
    redirectTo,
  });

  if (!isAuthUserAlreadyExists(inviteResult.error)) {
    return inviteResult;
  }

  const emailAuthClient = getSupabaseEmailAuthClient();
  return emailAuthClient.auth.signInWithOtp({
    email: input.email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectTo,
    },
  });
}

function isAuthUserAlreadyExists(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const authError = error as { code?: unknown; message?: unknown; status?: unknown };
  if (authError.code === "email_exists" || authError.code === "user_already_exists") {
    return true;
  }

  const message = typeof authError.message === "string" ? authError.message.toLowerCase() : "";
  return (
    authError.status === 422 &&
    (
      message.includes("already registered") ||
      message.includes("already been registered") ||
      message.includes("user already exists")
    )
  );
}

function getAuthMethodTimestampSeconds(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getFreshestAuthenticationMethod(methods: unknown) {
  if (!Array.isArray(methods)) return null;

  return methods.reduce<{
    method: string | null;
    timestampSeconds: number;
  } | null>((freshest, methodEntry) => {
    if (typeof methodEntry !== "object" || methodEntry === null) {
      return freshest;
    }

    const timestampSeconds = getAuthMethodTimestampSeconds(
      (methodEntry as { timestamp?: unknown }).timestamp,
    );
    if (!timestampSeconds) {
      return freshest;
    }

    const method = (methodEntry as { method?: unknown }).method;
    const candidate = {
      method: typeof method === "string" ? method : null,
      timestampSeconds,
    };

    if (!freshest || candidate.timestampSeconds > freshest.timestampSeconds) {
      return candidate;
    }
    return freshest;
  }, null);
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

export async function createDelegationStepUpProofAction(): Promise<DelegationStepUpProofState> {
  try {
    const { user, store } = await requirePrivilege("staff.manage");
    await enforceRateLimit(delegationGrantLimiter, `delegation_step_up:${user.id}`, "DELEGATION_STEP_UP");

    const supabase = await getSupabaseServerClient();
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (sessionError || !accessToken) {
      return {
        success: false,
        error: "Please sign in again before granting temporary access.",
        updatedAt: Date.now(),
      };
    }

    const { data: assurance, error: assuranceError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel(accessToken);
    if (assuranceError || assurance?.currentLevel !== "aal2") {
      return {
        success: false,
        error: "Verify your identity with MFA before granting temporary access.",
        updatedAt: Date.now(),
      };
    }

    const freshestMethod = getFreshestAuthenticationMethod(assurance.currentAuthenticationMethods);
    const nowMs = Date.now();
    if (!freshestMethod || nowMs - freshestMethod.timestampSeconds * 1000 > delegationStepUpMaxAgeMs) {
      return {
        success: false,
        error: "Enter a fresh MFA code before granting temporary access.",
        updatedAt: nowMs,
      };
    }

    const authenticatedAtMs = freshestMethod.timestampSeconds * 1000;
    const expiresAt = new Date(Math.min(
      nowMs + delegationStepUpProofTtlMs,
      authenticatedAtMs + delegationStepUpMaxAgeMs,
    ));

    const adminClient = getSupabaseAdminClient();
    const { data: proof, error: proofError } = await adminClient
      .from("staff_step_up_proofs")
      .insert({
        store_id: store.id,
        user_id: user.id,
        purpose: delegationStepUpPurpose,
        assurance_level: "aal2",
        authentication_method: freshestMethod.method,
        authenticated_at: new Date(authenticatedAtMs).toISOString(),
        expires_at: expiresAt.toISOString(),
      })
      .select("id, expires_at")
      .single();

    if (proofError || !proof) {
      throw new Error(proofError?.message ?? "Step-up proof could not be created.");
    }

    return {
      success: true,
      proofId: proof.id,
      expiresAt: proof.expires_at,
      updatedAt: Date.now(),
    };
  } catch (error: unknown) {
    await logStaffActionError("DELEGATION_STEP_UP_PROOF_FAILED", error);
    return {
      success: false,
      error: getFriendlyErrorMessage(error) || "Step-up verification could not be completed.",
      updatedAt: Date.now(),
    };
  }
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

    const expiresAt = getStaffInviteExpiresAt();
    const { data, error: inviteInsertError } = await adminClient.rpc(
      "create_staff_invitation",
      {
        p_store_id: store.id,
        p_email: email,
        p_actor_user_id: user.id,
        p_expires_at: expiresAt,
      }
    );

    if (inviteInsertError) {
      return {
        success: false,
        error: getFriendlyErrorMessage(inviteInsertError),
        updatedAt: Date.now(),
      };
    }

    const result = parseStaffLifecycleRpcResult(data);
    if (!result?.ok || !result.invitationId) {
      return lifecycleFailureState(result, "The invite could not be sent.");
    }

    const { error: authInviteError } = await sendStaffInviteEmail(adminClient, {
      email,
      invitationId: result.invitationId,
      storeId: store.id,
    });

    if (authInviteError) {
      if (!isLocalAuthAdminUnavailable(authInviteError)) {
        await adminClient.rpc("revoke_staff_invitation", {
          p_invitation_id: result.invitationId,
          p_actor_user_id: user.id,
        });

        await recordStaffActivityEvent({
          storeId: store.id,
          actor: user,
          action: "staff.invite_failed",
          actionScope: "staff.manage",
          privilegeSource,
          delegationId,
          targetType: "staff_invitation",
          targetId: result.invitationId,
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

    await recordStaffActivityEvent({
      storeId: store.id,
      actor: user,
      action: "staff.invited",
      actionScope: "staff.manage",
      privilegeSource,
      delegationId,
      targetType: "staff_invitation",
      targetId: result.invitationId,
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
    await logStaffActionError("STAFF_INVITE_UNEXPECTED", error, { email });
    return errorState(error);
  }
}

export async function revokeStaffInviteAction(
  _prevState: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const validation = revokeStaffInviteSchema.safeParse({
    invitationId: formData.get("invitationId"),
    confirmText: formData.get("confirmText"),
  });
  if (!validation.success) {
    return { success: false, error: formatZodError(validation.error), updatedAt: Date.now() };
  }

  try {
    const { invitationId } = validation.data;
    const { user } = await requirePrivilege("staff.manage");
    await enforceRateLimit(staffLifecycleLimiter, `staff_lifecycle:${user.id}`, "STAFF_INVITE_REVOKE");

    const adminClient = getSupabaseAdminClient();
    const { data, error } = await adminClient.rpc("revoke_staff_invitation", {
      p_invitation_id: invitationId,
      p_actor_user_id: user.id,
    });

    if (error) {
      await logStaffActionError("STAFF_INVITE_REVOKE_FAILED", error, { invitationId, actorUserId: user.id });
      return errorState(error, "The invitation could not be revoked.");
    }

    const result = parseStaffLifecycleRpcResult(data);
    if (!result?.ok) {
      return lifecycleFailureState(result, "The invitation could not be revoked.");
    }

    revalidatePath("/staff");
    revalidatePath("/activity");
    return {
      success: true,
      message: `Invitation revoked${result.targetLabel ? ` for ${result.targetLabel}` : ""}.`,
      updatedAt: Date.now(),
    };
  } catch (error: unknown) {
    await logStaffActionError("STAFF_INVITE_REVOKE_UNEXPECTED", error, {
      invitationId: validation.data.invitationId,
    });
    return errorState(error, "The invitation could not be revoked.");
  }
}

export async function resendStaffInviteAction(
  _prevState: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const validation = invitationIdSchema.safeParse({
    invitationId: formData.get("invitationId"),
  });
  if (!validation.success) {
    return { success: false, error: formatZodError(validation.error), updatedAt: Date.now() };
  }

  const { invitationId } = validation.data;

  try {
    const { user, store, privilegeSource, delegationId } = await requirePrivilege("staff.manage");
    await enforceRateLimit(staffInviteLimiter, `staff_invite:${user.id}`, "STAFF_INVITE_RESEND");

    const adminClient = getSupabaseAdminClient();
    const { data: invitation, error: invitationError } = await adminClient
      .from("staff_invitations")
      .select("id, store_id, email, role, status, invited_by_user_id, accepted_by_user_id, accepted_at, revoked_by_user_id, revoked_at, expires_at, created_at")
      .eq("id", invitationId)
      .maybeSingle();

    if (invitationError) {
      throw new Error(invitationError.message);
    }

    if (!invitation || invitation.store_id !== store.id) {
      return { success: false, error: "Invitation not found.", updatedAt: Date.now() };
    }

    if (invitation.status !== "pending") {
      return { success: false, error: "This invitation is no longer pending.", updatedAt: Date.now() };
    }

    const previousExpiresAt = invitation.expires_at;
    const expiresAt = getStaffInviteExpiresAt();
    const { data, error: refreshError } = await adminClient.rpc(
      "resend_staff_invitation",
      {
        p_invitation_id: invitation.id,
        p_actor_user_id: user.id,
        p_expires_at: expiresAt,
      }
    );

    if (refreshError) {
      throw new Error(refreshError.message);
    }

    const result = parseStaffLifecycleRpcResult(data);
    if (!result?.ok) {
      return lifecycleFailureState(result, "The invitation could not be resent.");
    }

    const { error: authInviteError } = await sendStaffInviteEmail(adminClient, {
      email: invitation.email,
      invitationId: invitation.id,
      storeId: store.id,
    });

    const metadata: Record<string, unknown> = {
      previousExpiresAt,
      expiresAt,
    };

    if (authInviteError && !isLocalAuthAdminUnavailable(authInviteError)) {
      await adminClient
        .from("staff_invitations")
        .update({ expires_at: previousExpiresAt })
        .eq("id", invitation.id)
        .eq("status", "pending");

      await recordStaffActivityEvent({
        storeId: store.id,
        actor: user,
        action: "staff.invite_resend_failed",
        actionScope: "staff.manage",
        privilegeSource,
        delegationId,
        targetType: "staff_invitation",
        targetId: invitation.id,
        targetLabel: invitation.email,
        result: "failure",
        errorCode: "auth_invite_resend_failed",
        summary: `${user.name} failed to resend a cashier invitation.`,
        metadata,
      });

      return errorState(authInviteError, "The invitation could not be resent.");
    }

    if (authInviteError) {
      metadata.emailDelivery = "skipped_local_auth_admin";
    }

    await recordStaffActivityEvent({
      storeId: store.id,
      actor: user,
      action: "staff.invite_resent",
      actionScope: "staff.manage",
      privilegeSource,
      delegationId,
      targetType: "staff_invitation",
      targetId: invitation.id,
      targetLabel: invitation.email,
      result: "success",
      summary: `${user.name} resent a cashier invitation.`,
      metadata,
    });

    revalidatePath("/staff");
    revalidatePath("/activity");
    return {
      success: true,
      message: `Invitation resent to ${invitation.email}.`,
      updatedAt: Date.now(),
    };
  } catch (error: unknown) {
    await logStaffActionError("STAFF_INVITE_RESEND_UNEXPECTED", error, {
      invitationId,
    });
    return errorState(error, "The invitation could not be resent.");
  }
}

export async function suspendStaffAction(
  _prevState: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const validation = suspendStaffSchema.safeParse({
    userId: formData.get("userId"),
    confirmText: formData.get("confirmText"),
  });
  if (!validation.success) {
    return { success: false, error: formatZodError(validation.error), updatedAt: Date.now() };
  }

  try {
    const { userId } = validation.data;
    const { user } = await requirePrivilege("staff.manage");
    await enforceRateLimit(staffLifecycleLimiter, `staff_lifecycle:${user.id}`, "STAFF_SUSPEND");

    const adminClient = getSupabaseAdminClient();
    const { data, error } = await adminClient.rpc("suspend_staff_user", {
      p_target_user_id: userId,
      p_actor_user_id: user.id,
    });

    if (error) {
      await logStaffActionError("STAFF_SUSPEND_FAILED", error, { targetUserId: userId, actorUserId: user.id });
      return errorState(error, "The cashier could not be suspended.");
    }

    const result = parseStaffLifecycleRpcResult(data);
    if (!result?.ok) {
      return lifecycleFailureState(result, "The cashier could not be suspended.");
    }

    // Revoke target user sessions and refresh tokens globally in Supabase Auth
    const { error: authSignOutError } = await adminClient.auth.admin.signOut(userId, "global");
    if (authSignOutError) {
      await logStaffActionError("STAFF_SUSPEND_AUTH_SIGNOUT_FAILED", authSignOutError, { targetUserId: userId });
    }

    revalidatePath("/staff");
    revalidatePath("/activity");
    return {
      success: true,
      message: `${result.targetLabel ?? "Cashier"} suspended.`,
      updatedAt: Date.now(),
    };
  } catch (error: unknown) {
    await logStaffActionError("STAFF_SUSPEND_UNEXPECTED", error, {
      targetUserId: validation.data.userId,
    });
    return errorState(error, "The cashier could not be suspended.");
  }
}

export async function reactivateStaffAction(
  _prevState: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const validation = staffUserIdSchema.safeParse({
    userId: formData.get("userId"),
  });
  if (!validation.success) {
    return { success: false, error: formatZodError(validation.error), updatedAt: Date.now() };
  }

  try {
    const { userId } = validation.data;
    const { user } = await requirePrivilege("staff.manage");
    await enforceRateLimit(staffLifecycleLimiter, `staff_lifecycle:${user.id}`, "STAFF_REACTIVATE");

    const adminClient = getSupabaseAdminClient();
    const { data, error } = await adminClient.rpc("reactivate_staff_user", {
      p_target_user_id: userId,
      p_actor_user_id: user.id,
    });

    if (error) {
      await logStaffActionError("STAFF_REACTIVATE_FAILED", error, { targetUserId: userId, actorUserId: user.id });
      return errorState(error, "The cashier could not be reactivated.");
    }

    const result = parseStaffLifecycleRpcResult(data);
    if (!result?.ok) {
      return lifecycleFailureState(result, "The cashier could not be reactivated.");
    }

    revalidatePath("/staff");
    revalidatePath("/activity");
    return {
      success: true,
      message: `${result.targetLabel ?? "Cashier"} reactivated.`,
      updatedAt: Date.now(),
    };
  } catch (error: unknown) {
    await logStaffActionError("STAFF_REACTIVATE_UNEXPECTED", error, {
      targetUserId: validation.data.userId,
    });
    return errorState(error, "The cashier could not be reactivated.");
  }
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
    stepUpProofId: formData.get("stepUpProofId"),
  });

  if (!validation.success) {
    return { success: false, error: formatZodError(validation.error), updatedAt: Date.now() };
  }

  try {
    const { user, store, privilegeSource, delegationId } = await requirePrivilege("staff.manage");
    await enforceRateLimit(delegationGrantLimiter, `delegation_grant:${user.id}`, "DELEGATION_GRANT");

    const { userId, scope, durationHours, reason, stepUpProofId } = validation.data;
    const adminClient = getSupabaseAdminClient();
    const { data: rawResult, error: rpcError } = await adminClient.rpc("grant_privilege_delegation", {
      p_store_id: store.id,
      p_actor_user_id: user.id,
      p_target_user_id: userId,
      p_scope: scope,
      p_duration_hours: durationHours,
      p_reason: reason,
      p_step_up_proof_id: (stepUpProofId ?? null) as string,
    });

    if (rpcError) {
      throw new Error(rpcError.message);
    }

    const result = staffLifecycleRpcResultSchema.parse(rawResult);
    if (!result.ok) {
      await recordStaffActivityEvent({
        storeId: store.id,
        actor: user,
        action: "delegation.grant_denied",
        actionScope: "staff.manage",
        privilegeSource,
        delegationId,
        targetType: "user",
        targetId: userId,
        targetLabel: result.targetLabel ?? null,
        result: "failure",
        errorCode: result.code,
        summary: `${user.name} was denied a temporary ${formatStaffPrivilege(scope)} grant.`,
        metadata: {
          requestedScope: scope,
          durationHours,
          reason,
          rpcCode: result.code,
        },
      });

      return lifecycleFailureState(result, "Temporary access could not be granted.");
    }

    revalidatePath("/staff");
    revalidatePath("/activity");

    return {
      success: true,
      message: `${formatStaffPrivilege(result.scope ?? scope)} granted to ${result.targetLabel ?? "cashier"} for ${durationHours} hour(s).`,
      updatedAt: Date.now(),
    };
  } catch (error: unknown) {
    await logStaffActionError("DELEGATION_GRANT_UNEXPECTED", error);
    return errorState(error, "Temporary access could not be granted.");
  }
}

export async function revokePrivilegeDelegationAction(
  _prevState: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const validation = revokePrivilegeDelegationSchema.safeParse({
    delegationId: formData.get("delegationId"),
    confirmText: formData.get("confirmText"),
  });
  if (!validation.success) {
    return { success: false, error: formatZodError(validation.error), updatedAt: Date.now() };
  }

  try {
    const { delegationId: targetDelegationId } = validation.data;
    const { user } = await requirePrivilege("staff.manage");
    await enforceRateLimit(delegationRevokeLimiter, `delegation_revoke:${user.id}`, "DELEGATION_REVOKE");

    const adminClient = getSupabaseAdminClient();
    const { data, error } = await adminClient.rpc("revoke_privilege_delegation", {
      p_delegation_id: targetDelegationId,
      p_actor_user_id: user.id,
    });

    if (error) {
      await logStaffActionError("DELEGATION_REVOKE_FAILED", error, {
        delegationId: targetDelegationId,
        actorUserId: user.id,
      });
      return errorState(error, "Temporary access could not be revoked.");
    }

    const result = parseStaffLifecycleRpcResult(data);
    if (!result?.ok) {
      return lifecycleFailureState(result, "Temporary access could not be revoked.");
    }

    revalidatePath("/staff");
    revalidatePath("/activity");
    return {
      success: true,
      message: `Temporary access revoked${result.targetLabel ? ` from ${result.targetLabel}` : ""}.`,
      updatedAt: Date.now(),
    };
  } catch (error: unknown) {
    await logStaffActionError("DELEGATION_REVOKE_UNEXPECTED", error, {
      delegationId: validation.data.delegationId,
    });
    return errorState(error, "Temporary access could not be revoked.");
  }
}

export async function acceptStaffInviteFormAction(
  _prevState: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  const validation = staffAcceptInviteSchema.safeParse({
    invitationId: formData.get("invitationId"),
    fullName: formData.get("fullName"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!validation.success) {
    return { success: false, error: formatZodError(validation.error), updatedAt: Date.now() };
  }

  const { invitationId, fullName, password } = validation.data;

  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !authUser?.email) {
      return { success: false, error: "Please sign in with the invited email first.", updatedAt: Date.now() };
    }

    const email = normalizeEmail(authUser.email);
    await enforceRateLimit(
      staffInviteAcceptLimiter,
      `staff_invite_accept:${authUser.id}:${invitationId}`,
      "STAFF_INVITE_ACCEPT",
    );
    const clientIp = await getClientIp();
    await enforceRateLimit(
      staffInviteAcceptLimiter,
      `staff_invite_accept_ip:${clientIp}:${invitationId}`,
      "STAFF_INVITE_ACCEPT_IP",
    );

    const invitePreview = await getStaffInvitePreview(invitationId);
    if (invitePreview.state !== "pending") {
      return { success: false, error: invitePreview.message, updatedAt: Date.now() };
    }

    if (normalizeEmail(invitePreview.email) !== email) {
      return {
        success: false,
        error: "This invite belongs to a different email address.",
        updatedAt: Date.now(),
      };
    }

    const adminClient = getSupabaseAdminClient();
    const existingProfile = await getProfileForUserId(authUser.id);

    if (!existingProfile && !password) {
      return {
        success: false,
        error: "Create a password to finish setting up this staff account.",
        updatedAt: Date.now(),
      };
    }

    if (existingProfile?.role === "owner") {
      return {
        success: false,
        error: "This invite can only be accepted by a cashier account.",
        updatedAt: Date.now(),
      };
    }

    if (existingProfile?.store_id && existingProfile.store_id !== invitePreview.storeId) {
      return {
        success: false,
        error: "This account is already connected to another store.",
        updatedAt: Date.now(),
      };
    }

    if (existingProfile?.status === "suspended") {
      return {
        success: false,
        error: "This staff account is suspended.",
        updatedAt: Date.now(),
      };
    }
    const originalMetadata = authUser.user_metadata ?? {};
    const authUpdatePayload: {
      password?: string;
      data: Record<string, unknown>;
    } = {
      data: {
        ...originalMetadata,
        full_name: fullName,
        name: fullName,
      },
    };
    if (password) {
      authUpdatePayload.password = password;
    }

    const { error: authUpdateError } = await supabase.auth.updateUser(authUpdatePayload);
    if (authUpdateError) {
      await logStaffActionError("STAFF_INVITE_AUTH_UPDATE_FAILED", authUpdateError, {
        invitationId,
        authUserId: authUser.id,
      });
      return errorState(authUpdateError, "Staff account setup could not be completed.");
    }

    const { data: acceptance, error: acceptanceError } = await adminClient.rpc("accept_staff_invitation", {
      p_invitation_id: invitationId,
      p_auth_user_id: authUser.id,
      p_auth_email: email,
      p_actor_name: fullName,
    });

    if (acceptanceError) {
      const { error: compensationError } = await supabase.auth.updateUser({
        data: originalMetadata,
      });
      if (compensationError) {
        await logStaffActionError("STAFF_INVITE_COMPENSATION_FAILED", compensationError, {
          invitationId,
          authUserId: authUser.id,
        });
      }
      return inviteAcceptanceErrorState(acceptanceError);
    }

    const parsedAcceptance = staffInviteAcceptanceResultSchema.safeParse(acceptance);
    if (!parsedAcceptance.success) {
      throw new Error("Staff invite acceptance returned an invalid response.");
    }

    revalidatePath("/staff");
    revalidatePath("/activity");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: "Staff account ready. You can open the dashboard now.",
      updatedAt: Date.now(),
    };
  } catch (error: unknown) {
    await logStaffActionError("STAFF_INVITE_ACCEPT_UNEXPECTED", error, {
      invitationId,
    });
    return inviteAcceptanceErrorState(error);
  }
}
