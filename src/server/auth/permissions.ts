import "server-only";

import {
  getRolePrivilegeSource,
  isActiveDelegationPrivilege,
  isDelegatablePrivilege,
  type ActiveStaffDelegationPrivilege,
  type StaffPrivilege,
  type StaffPrivilegeSource,
  type StaffRole,
  type StaffStatus,
} from "@/lib/staff-capabilities";
import type { TenantContextDTO } from "@/server/supabase/dal";
import { requireTenantContext } from "@/server/supabase/dal";
import { getSupabaseAdminClient } from "@/server/supabase/admin-supabase";

export type Privilege = StaffPrivilege;
export type PermissionRole = StaffRole;
export type PermissionStatus = StaffStatus;
export type PermissionSource = StaffPrivilegeSource | "delegation";
export type PermissionDeniedReason =
  | "missing_profile"
  | "inactive_profile"
  | "store_mismatch"
  | "insufficient_role"
  | "delegation_expired"
  | "delegation_revoked"
  | "delegation_scope_not_allowed";

export type PermissionUser = {
  id?: string | null;
  role?: PermissionRole | null;
  status?: PermissionStatus | null;
};

export type PermissionDelegation = {
  id: string;
  scope: Privilege;
  grantedByUserId?: string | null;
  startsAt: string | Date;
  expiresAt: string | Date;
  revokedAt?: string | Date | null;
};

export type PermissionDecision = {
  allowed: boolean;
  privilege: Privilege;
  source: PermissionSource | null;
  delegationId: string | null;
  delegationGrantorUserId: string | null;
  reason?: PermissionDeniedReason;
};

export type PermissionContextDTO = TenantContextDTO & {
  privilege: Privilege;
  privilegeSource: PermissionSource;
  delegationId: string | null;
  delegationGrantorUserId: string | null;
};

type RequirePrivilegeOptions = {
  storeId?: string;
};

type PrivilegeDelegationLookupRow = {
  id: string;
  scope: ActiveStaffDelegationPrivilege;
  granted_by_user_id: string;
  starts_at: string;
  expires_at: string;
  revoked_at: string | null;
};

export class PermissionDeniedError extends Error {
  readonly code = "permission_denied";
  readonly privilege: Privilege;
  readonly reason: PermissionDeniedReason;

  constructor(privilege: Privilege, reason: PermissionDeniedReason, message?: string) {
    super(message ?? permissionDeniedMessage(privilege, reason));
    this.name = "PermissionDeniedError";
    this.privilege = privilege;
    this.reason = reason;
  }
}

function permissionDeniedMessage(privilege: Privilege, reason: PermissionDeniedReason) {
  if (reason === "store_mismatch") {
    return "Unauthorized: Store ownership mismatch";
  }
  if (reason === "inactive_profile") {
    return "Unauthorized: This staff account is not active.";
  }
  if (reason === "missing_profile") {
    return "Unauthorized: Store profile not found.";
  }
  if (reason === "delegation_revoked") {
    return "Unauthorized: This delegated access was revoked.";
  }
  if (reason === "delegation_expired") {
    return "Unauthorized: This delegated access has expired.";
  }
  if (reason === "delegation_scope_not_allowed") {
    return "Unauthorized: This privilege cannot be delegated.";
  }
  return `Unauthorized: Missing privilege ${privilege}.`;
}

function toTime(value: string | Date) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function activeDelegationFor(
  privilege: Privilege,
  delegations: PermissionDelegation[],
  now: Date,
) {
  return delegations.find((delegation) => {
    if (delegation.scope !== privilege) return false;
    if (delegation.revokedAt) return false;

    const startsAt = toTime(delegation.startsAt);
    const expiresAt = toTime(delegation.expiresAt);
    const current = now.getTime();

    return Number.isFinite(startsAt) && Number.isFinite(expiresAt) && startsAt <= current && current < expiresAt;
  });
}

function matchingDelegationReason(
  privilege: Privilege,
  delegations: PermissionDelegation[],
  now: Date,
): PermissionDeniedReason | undefined {
  const sameScope = delegations.find((delegation) => delegation.scope === privilege);
  if (!sameScope) return undefined;
  if (sameScope.revokedAt) return "delegation_revoked";
  if (toTime(sameScope.expiresAt) <= now.getTime()) return "delegation_expired";
  return undefined;
}

export function evaluatePrivilege(
  user: PermissionUser | null | undefined,
  privilege: Privilege,
  options: { delegations?: PermissionDelegation[]; now?: Date } = {},
): PermissionDecision {
  if (!user?.id || !user.role) {
    return {
      allowed: false,
      privilege,
      source: null,
      delegationId: null,
      delegationGrantorUserId: null,
      reason: "missing_profile",
    };
  }

  if (user.status !== "active") {
    return {
      allowed: false,
      privilege,
      source: null,
      delegationId: null,
      delegationGrantorUserId: null,
      reason: "inactive_profile",
    };
  }

  const roleSource = getRolePrivilegeSource(user, privilege);
  if (roleSource) {
    return { allowed: true, privilege, source: roleSource, delegationId: null, delegationGrantorUserId: null };
  }

  const delegations = options.delegations ?? [];
  if (user.role === "cashier" && delegations.length > 0) {
    if (!isDelegatablePrivilege(privilege) || !isActiveDelegationPrivilege(privilege)) {
      return {
        allowed: false,
        privilege,
        source: null,
        delegationId: null,
        delegationGrantorUserId: null,
        reason: "delegation_scope_not_allowed",
      };
    }

    const now = options.now ?? new Date();
    const delegation = activeDelegationFor(privilege, delegations, now);
    if (delegation) {
      return {
        allowed: true,
        privilege,
        source: "delegation",
        delegationId: delegation.id,
        delegationGrantorUserId: delegation.grantedByUserId ?? null,
      };
    }

    const reason = matchingDelegationReason(privilege, delegations, now);
    if (reason) {
      return {
        allowed: false,
        privilege,
        source: null,
        delegationId: null,
        delegationGrantorUserId: null,
        reason,
      };
    }
  }

  return {
    allowed: false,
    privilege,
    source: null,
    delegationId: null,
    delegationGrantorUserId: null,
    reason: "insufficient_role",
  };
}

export function canUsePrivilege(
  user: PermissionUser | null | undefined,
  privilege: Privilege,
  options: { delegations?: PermissionDelegation[]; now?: Date } = {},
) {
  return evaluatePrivilege(user, privilege, options).allowed;
}

async function loadCandidateDelegations(
  storeId: string,
  userId: string,
  privilege: ActiveStaffDelegationPrivilege,
): Promise<PermissionDelegation[]> {
  const adminClient = getSupabaseAdminClient();
  const { data, error } = await adminClient
    .from("privilege_delegations")
    .select("id, scope, granted_by_user_id, starts_at, expires_at, revoked_at")
    .eq("store_id", storeId)
    .eq("granted_to_user_id", userId)
    .eq("scope", privilege)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as PrivilegeDelegationLookupRow[]).map((delegation) => ({
    id: delegation.id,
    scope: delegation.scope,
    grantedByUserId: delegation.granted_by_user_id,
    startsAt: delegation.starts_at,
    expiresAt: delegation.expires_at,
    revokedAt: delegation.revoked_at,
  }));
}

export async function requirePrivilege(
  privilege: Privilege,
  options: RequirePrivilegeOptions = {},
): Promise<PermissionContextDTO> {
  const context = await requireTenantContext();

  if (options.storeId && context.store.id !== options.storeId) {
    throw new PermissionDeniedError(privilege, "store_mismatch");
  }

  let decision = evaluatePrivilege(context.user, privilege);
  if (
    !decision.allowed &&
    context.user.role === "cashier" &&
    context.user.status === "active" &&
    isDelegatablePrivilege(privilege) &&
    isActiveDelegationPrivilege(privilege)
  ) {
    const delegations = await loadCandidateDelegations(context.store.id, context.user.id, privilege);
    decision = evaluatePrivilege(context.user, privilege, { delegations });
  }

  if (!decision.allowed || !decision.source) {
    throw new PermissionDeniedError(privilege, decision.reason ?? "insufficient_role");
  }

  return {
    ...context,
    privilege,
    privilegeSource: decision.source,
    delegationId: decision.delegationId,
    delegationGrantorUserId: decision.delegationGrantorUserId,
  };
}
