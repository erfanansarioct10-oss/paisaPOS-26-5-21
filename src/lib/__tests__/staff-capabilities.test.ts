import { describe, expect, test } from "vitest";
import {
  ACTIVE_STAFF_DELEGATION_PRIVILEGES,
  DELEGATABLE_STAFF_PRIVILEGES,
  canUseRolePrivilege,
  filterActiveStaffDelegations,
  formatStaffPrivilege,
  getRolePrivilegeSource,
  getStaffCapabilities,
  hasActiveDelegatedPrivilege,
  isActiveDelegationPrivilege,
  isActiveDelegationScope,
  isDelegatablePrivilege,
} from "../staff-capabilities";

describe("staff capability helper", () => {
  test("maps an active owner to management UI capabilities", () => {
    const capabilities = getStaffCapabilities({ role: "owner", status: "active" });

    expect(capabilities).toMatchObject({
      canCreateCheckout: true,
      canManageCatalog: true,
      canAdjustInventory: true,
      canManageStaff: true,
      canManageStoreSettings: true,
      canReadActivity: true,
      canUpdateProfile: true,
    });
    expect(getRolePrivilegeSource({ role: "owner", status: "active" }, "catalog.manage")).toBe("owner_role");
  });

  test("keeps active cashier UI capabilities to checkout and profile updates", () => {
    const cashier = { role: "cashier" as const, status: "active" as const };
    const capabilities = getStaffCapabilities(cashier);

    expect(capabilities).toMatchObject({
      canCreateCheckout: true,
      canManageCatalog: false,
      canAdjustInventory: false,
      canManageStaff: false,
      canManageStoreSettings: false,
      canReadActivity: false,
      canUpdateProfile: true,
    });
    expect(getRolePrivilegeSource(cashier, "checkout.create")).toBe("cashier_role");
    expect(canUseRolePrivilege(cashier, "catalog.manage")).toBe(false);
  });

  test("grants no UI capabilities to suspended or missing profiles", () => {
    expect(Object.values(getStaffCapabilities({ role: "owner", status: "suspended" }))).not.toContain(true);
    expect(Object.values(getStaffCapabilities(null))).not.toContain(true);
  });

  test("documents which future scopes may be delegated", () => {
    expect(DELEGATABLE_STAFF_PRIVILEGES).toEqual([
      "catalog.manage",
      "inventory.adjust",
      "reports.export",
      "invoice.correct",
    ]);
    expect(isDelegatablePrivilege("catalog.manage")).toBe(true);
    expect(isDelegatablePrivilege("inventory.adjust")).toBe(true);
    expect(isDelegatablePrivilege("staff.manage")).toBe(false);
    expect(isDelegatablePrivilege("activity.read")).toBe(false);
    expect(formatStaffPrivilege("inventory.adjust")).toBe("Inventory Adjustment");
  });

  test("exposes proven delegated action scopes for current staff grants", () => {
    expect(ACTIVE_STAFF_DELEGATION_PRIVILEGES).toEqual(["catalog.manage", "inventory.adjust"]);
    expect(isActiveDelegationPrivilege("catalog.manage")).toBe(true);
    expect(isActiveDelegationPrivilege("inventory.adjust")).toBe(true);
    expect(isActiveDelegationPrivilege("reports.export")).toBe(false);
    expect(isActiveDelegationScope("invoice.correct")).toBe(false);
  });

  test("recognizes only active cashier delegations for UI affordances", () => {
    const cashier = { role: "cashier" as const, status: "active" as const };
    const now = new Date("2026-05-25T12:00:00.000Z");

    expect(
      hasActiveDelegatedPrivilege(
        cashier,
        "inventory.adjust",
        [
          {
            scope: "inventory.adjust",
            starts_at: "2026-05-25T11:00:00.000Z",
            expires_at: "2026-05-25T13:00:00.000Z",
          },
        ],
        now,
      ),
    ).toBe(true);

    expect(
      hasActiveDelegatedPrivilege(
        cashier,
        "inventory.adjust",
        [
          {
            scope: "inventory.adjust",
            starts_at: "2026-05-25T11:00:00.000Z",
            expires_at: "2026-05-25T13:00:00.000Z",
            revoked_at: "2026-05-25T11:30:00.000Z",
          },
        ],
        now,
      ),
    ).toBe(false);
    expect(hasActiveDelegatedPrivilege({ role: "owner", status: "active" }, "inventory.adjust", [], now)).toBe(false);
    expect(hasActiveDelegatedPrivilege(cashier, "staff.manage", [], now)).toBe(false);
    expect(
      hasActiveDelegatedPrivilege(
        cashier,
        "reports.export",
        [
          {
            scope: "reports.export",
            starts_at: "2026-05-25T11:00:00.000Z",
            expires_at: "2026-05-25T13:00:00.000Z",
          },
        ],
        now,
      ),
    ).toBe(false);

    expect(
      hasActiveDelegatedPrivilege(
        cashier,
        "catalog.manage",
        [
          {
            scope: "catalog.manage",
            starts_at: "2026-05-25T11:00:00.000Z",
            expires_at: "2026-05-25T13:00:00.000Z",
          },
        ],
        now,
      ),
    ).toBe(true);
  });

  test("filters active delegation rows down to released V1.1 scopes", () => {
    expect(
      filterActiveStaffDelegations([
        { id: "1", scope: "catalog.manage" },
        { id: "2", scope: "reports.export" },
        { id: "3", scope: "inventory.adjust" },
        { id: "4", scope: "invoice.correct" },
        { id: "5", scope: null },
      ]),
    ).toEqual([
      { id: "1", scope: "catalog.manage" },
      { id: "3", scope: "inventory.adjust" },
    ]);
  });
});
