export type StaffRole = "owner" | "cashier";
export type StaffStatus = "active" | "suspended";

export type StaffPrivilege =
  | "checkout.create"
  | "catalog.manage"
  | "inventory.adjust"
  | "staff.manage"
  | "store.settings"
  | "activity.read"
  | "reports.export"
  | "invoice.correct"
  | "profile.update";

export type StaffPrivilegeSource = "owner_role" | "cashier_role";

export type StaffCapabilityUser = {
  role?: StaffRole | null;
  status?: StaffStatus | null;
};

export type StaffCapabilityDelegation = {
  scope?: string | null;
  starts_at?: string | Date | null;
  expires_at?: string | Date | null;
  revoked_at?: string | Date | null;
};

export type StaffCapabilities = {
  canCreateCheckout: boolean;
  canManageCatalog: boolean;
  canAdjustInventory: boolean;
  canManageStaff: boolean;
  canManageStoreSettings: boolean;
  canReadActivity: boolean;
  canExportReports: boolean;
  canCorrectInvoice: boolean;
  canUpdateProfile: boolean;
};

const ownerPrivileges = new Set<StaffPrivilege>([
  "checkout.create",
  "catalog.manage",
  "inventory.adjust",
  "staff.manage",
  "store.settings",
  "activity.read",
  "reports.export",
  "invoice.correct",
  "profile.update",
]);

const cashierBaselinePrivileges = new Set<StaffPrivilege>([
  "checkout.create",
  "profile.update",
]);

const delegatablePrivileges = new Set<StaffPrivilege>([
  "catalog.manage",
  "inventory.adjust",
  "reports.export",
  "invoice.correct",
]);

export const DELEGATABLE_STAFF_PRIVILEGES = [
  "catalog.manage",
  "inventory.adjust",
  "reports.export",
  "invoice.correct",
] as const satisfies readonly StaffPrivilege[];

export const ACTIVE_STAFF_DELEGATION_PRIVILEGES = [
  "catalog.manage",
  "inventory.adjust",
] as const satisfies readonly StaffPrivilege[];

export type ActiveStaffDelegationPrivilege = (typeof ACTIVE_STAFF_DELEGATION_PRIVILEGES)[number];

const privilegeLabels: Record<StaffPrivilege, string> = {
  "checkout.create": "Checkout",
  "catalog.manage": "Catalog Management",
  "inventory.adjust": "Inventory Adjustment",
  "staff.manage": "Staff Management",
  "store.settings": "Store Settings",
  "activity.read": "Activity Log",
  "reports.export": "Report Export",
  "invoice.correct": "Invoice Correction",
  "profile.update": "Profile Update",
};

export function getRolePrivilegeSource(
  user: StaffCapabilityUser | null | undefined,
  privilege: StaffPrivilege,
): StaffPrivilegeSource | null {
  if (!user?.role || user.status !== "active") {
    return null;
  }

  if (user.role === "owner" && ownerPrivileges.has(privilege)) {
    return "owner_role";
  }

  if (user.role === "cashier" && cashierBaselinePrivileges.has(privilege)) {
    return "cashier_role";
  }

  return null;
}

export function canUseRolePrivilege(
  user: StaffCapabilityUser | null | undefined,
  privilege: StaffPrivilege,
) {
  return getRolePrivilegeSource(user, privilege) !== null;
}

export function isDelegatablePrivilege(privilege: StaffPrivilege) {
  return delegatablePrivileges.has(privilege);
}

export function isActiveDelegationPrivilege(
  privilege: StaffPrivilege,
): privilege is ActiveStaffDelegationPrivilege {
  return isActiveDelegationScope(privilege);
}

export function isActiveDelegationScope(
  scope: string | null | undefined,
): scope is ActiveStaffDelegationPrivilege {
  return (ACTIVE_STAFF_DELEGATION_PRIVILEGES as readonly string[]).includes(scope ?? "");
}

export function filterActiveStaffDelegations<T extends { scope?: string | null }>(
  delegations: readonly T[],
): Array<T & { scope: ActiveStaffDelegationPrivilege }> {
  return delegations.filter((delegation): delegation is T & { scope: ActiveStaffDelegationPrivilege } =>
    isActiveDelegationScope(delegation.scope),
  );
}

export function formatStaffPrivilege(privilege: StaffPrivilege) {
  return privilegeLabels[privilege] ?? privilege;
}

function toTime(value: string | Date | null | undefined) {
  if (!value) return Number.NaN;
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export function hasActiveDelegatedPrivilege(
  user: StaffCapabilityUser | null | undefined,
  privilege: StaffPrivilege,
  delegations: StaffCapabilityDelegation[] = [],
  now: Date = new Date(),
) {
  if (user?.role !== "cashier" || user.status !== "active" || !isActiveDelegationPrivilege(privilege)) {
    return false;
  }

  const current = now.getTime();
  return delegations.some((delegation) => {
    if (delegation.scope !== privilege || delegation.revoked_at) return false;

    const startsAt = toTime(delegation.starts_at);
    const expiresAt = toTime(delegation.expires_at);

    return Number.isFinite(startsAt) && Number.isFinite(expiresAt) && startsAt <= current && current < expiresAt;
  });
}

export function getStaffCapabilities(user: StaffCapabilityUser | null | undefined): StaffCapabilities {
  return {
    canCreateCheckout: canUseRolePrivilege(user, "checkout.create"),
    canManageCatalog: canUseRolePrivilege(user, "catalog.manage"),
    canAdjustInventory: canUseRolePrivilege(user, "inventory.adjust"),
    canManageStaff: canUseRolePrivilege(user, "staff.manage"),
    canManageStoreSettings: canUseRolePrivilege(user, "store.settings"),
    canReadActivity: canUseRolePrivilege(user, "activity.read"),
    canExportReports: canUseRolePrivilege(user, "reports.export"),
    canCorrectInvoice: canUseRolePrivilege(user, "invoice.correct"),
    canUpdateProfile: canUseRolePrivilege(user, "profile.update"),
  };
}
