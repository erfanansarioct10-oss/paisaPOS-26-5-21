import { beforeEach, describe, expect, test, vi } from "vitest";
import { requireTenantContext } from "@/lib/server/dal";
import { getSupabaseAdminClient } from "@/lib/server/admin-supabase";
import {
  PermissionDeniedError,
  evaluatePrivilege,
  requirePrivilege,
  type PermissionUser,
} from "../permissions";

vi.mock("@/lib/server/dal", () => ({
  requireTenantContext: vi.fn(),
}));

vi.mock("@/lib/server/admin-supabase", () => ({
  getSupabaseAdminClient: vi.fn(),
}));

const owner: PermissionUser = {
  id: "11111111-1111-4111-8111-111111111111",
  role: "owner",
  status: "active",
};

const cashier: PermissionUser = {
  id: "22222222-2222-4222-8222-222222222222",
  role: "cashier",
  status: "active",
};

const now = new Date("2026-05-25T12:00:00.000Z");
const storeId = "33333333-3333-4333-8333-333333333333";

function mockContext(user: PermissionUser, contextStoreId = storeId) {
  vi.mocked(requireTenantContext).mockResolvedValueOnce({
    user: {
      id: user.id!,
      name: user.role === "owner" ? "Owner" : "Cashier",
      store_id: contextStoreId,
      role: user.role!,
      status: user.status!,
    },
    store: {
      id: contextStoreId,
      name: "KTM Boutique",
      phone: "",
      address: "",
      pan_vat: "",
    },
  });
}

function mockDelegationRows(rows: Array<Record<string, unknown>>, error: { message: string } | null = null) {
  const query: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    then: Promise<{ data: Array<Record<string, unknown>>; error: { message: string } | null }>["then"];
  } = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    then: (resolve, reject) => Promise.resolve({ data: rows, error }).then(resolve, reject),
  };
  const from = vi.fn(() => query);
  vi.mocked(getSupabaseAdminClient).mockReturnValue({ from } as never);
  return { from, query };
}

describe("permission helper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("allows owners to use management privileges", async () => {
    expect(evaluatePrivilege(owner, "catalog.manage").allowed).toBe(true);
    expect(evaluatePrivilege(owner, "staff.manage").allowed).toBe(true);

    mockContext(owner);
    await expect(requirePrivilege("staff.manage")).resolves.toMatchObject({
      privilege: "staff.manage",
      privilegeSource: "owner_role",
      delegationId: null,
    });
  });

  test("allows active cashiers to create checkout but not manage catalog by default", async () => {
    expect(evaluatePrivilege(cashier, "checkout.create")).toMatchObject({
      allowed: true,
      source: "cashier_role",
    });
    expect(evaluatePrivilege(cashier, "catalog.manage")).toMatchObject({
      allowed: false,
      reason: "insufficient_role",
    });

    mockContext(cashier);
    mockDelegationRows([]);
    await expect(requirePrivilege("catalog.manage")).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  test("allows a cashier through an active delegation only for delegatable scopes", () => {
    const decision = evaluatePrivilege(cashier, "catalog.manage", {
      now,
      delegations: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          scope: "catalog.manage",
          grantedByUserId: "11111111-1111-4111-8111-111111111111",
          startsAt: "2026-05-25T11:00:00.000Z",
          expiresAt: "2026-05-25T13:00:00.000Z",
        },
      ],
    });

    expect(decision).toMatchObject({
      allowed: true,
      source: "delegation",
      delegationId: "44444444-4444-4444-8444-444444444444",
      delegationGrantorUserId: "11111111-1111-4111-8111-111111111111",
    });

    expect(
      evaluatePrivilege(cashier, "staff.manage", {
        now,
        delegations: [
          {
            id: "55555555-5555-4555-8555-555555555555",
            scope: "staff.manage",
            startsAt: "2026-05-25T11:00:00.000Z",
            expiresAt: "2026-05-25T13:00:00.000Z",
          },
        ],
      }),
    ).toMatchObject({
      allowed: false,
      reason: "delegation_scope_not_allowed",
    });
  });

  test("denies expired and revoked delegations", () => {
    expect(
      evaluatePrivilege(cashier, "inventory.adjust", {
        now,
        delegations: [
          {
            id: "66666666-6666-4666-8666-666666666666",
            scope: "inventory.adjust",
            startsAt: "2026-05-25T10:00:00.000Z",
            expiresAt: "2026-05-25T11:00:00.000Z",
          },
        ],
      }),
    ).toMatchObject({
      allowed: false,
      reason: "delegation_expired",
    });

    expect(
      evaluatePrivilege(cashier, "inventory.adjust", {
        now,
        delegations: [
          {
            id: "77777777-7777-4777-8777-777777777777",
            scope: "inventory.adjust",
            startsAt: "2026-05-25T10:00:00.000Z",
            expiresAt: "2026-05-25T13:00:00.000Z",
            revokedAt: "2026-05-25T11:30:00.000Z",
          },
        ],
      }),
    ).toMatchObject({
      allowed: false,
      reason: "delegation_revoked",
    });
  });

  test("loads database-backed delegations for cashier delegatable privileges", async () => {
    mockContext(cashier);
    const { from, query } = mockDelegationRows([
      {
        id: "44444444-4444-4444-8444-444444444444",
        scope: "inventory.adjust",
        granted_by_user_id: "11111111-1111-4111-8111-111111111111",
        starts_at: "2026-05-25T00:00:00.000Z",
        expires_at: "2999-05-25T00:00:00.000Z",
        revoked_at: null,
      },
    ]);

    await expect(requirePrivilege("inventory.adjust")).resolves.toMatchObject({
      privilege: "inventory.adjust",
      privilegeSource: "delegation",
      delegationId: "44444444-4444-4444-8444-444444444444",
      delegationGrantorUserId: "11111111-1111-4111-8111-111111111111",
    });

    expect(from).toHaveBeenCalledWith("privilege_delegations");
    expect(query.eq).toHaveBeenCalledWith("store_id", storeId);
    expect(query.eq).toHaveBeenCalledWith("granted_to_user_id", cashier.id);
    expect(query.eq).toHaveBeenCalledWith("scope", "inventory.adjust");
  });

  test("loads database-backed catalog delegations for cashier catalog actions", async () => {
    mockContext(cashier);
    const { from, query } = mockDelegationRows([
      {
        id: "88888888-8888-4888-8888-888888888888",
        scope: "catalog.manage",
        granted_by_user_id: "11111111-1111-4111-8111-111111111111",
        starts_at: "2026-05-25T00:00:00.000Z",
        expires_at: "2999-05-25T00:00:00.000Z",
        revoked_at: null,
      },
    ]);

    await expect(requirePrivilege("catalog.manage")).resolves.toMatchObject({
      privilege: "catalog.manage",
      privilegeSource: "delegation",
      delegationId: "88888888-8888-4888-8888-888888888888",
      delegationGrantorUserId: "11111111-1111-4111-8111-111111111111",
    });

    expect(from).toHaveBeenCalledWith("privilege_delegations");
    expect(query.eq).toHaveBeenCalledWith("store_id", storeId);
    expect(query.eq).toHaveBeenCalledWith("granted_to_user_id", cashier.id);
    expect(query.eq).toHaveBeenCalledWith("scope", "catalog.manage");
  });

  test("does not authorize unreleased database-backed delegation scopes", async () => {
    mockContext(cashier);

    await expect(requirePrivilege("reports.export")).rejects.toMatchObject({
      reason: "insufficient_role",
    });

    expect(getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  test("denies expired and revoked database-backed delegations", async () => {
    mockContext(cashier);
    mockDelegationRows([
      {
        id: "66666666-6666-4666-8666-666666666666",
        scope: "inventory.adjust",
        granted_by_user_id: "11111111-1111-4111-8111-111111111111",
        starts_at: "2026-05-25T00:00:00.000Z",
        expires_at: "2026-05-25T00:10:00.000Z",
        revoked_at: null,
      },
    ]);

    await expect(requirePrivilege("inventory.adjust")).rejects.toMatchObject({
      reason: "delegation_expired",
    });

    mockContext(cashier);
    mockDelegationRows([
      {
        id: "77777777-7777-4777-8777-777777777777",
        scope: "inventory.adjust",
        granted_by_user_id: "11111111-1111-4111-8111-111111111111",
        starts_at: "2026-05-25T00:00:00.000Z",
        expires_at: "2999-05-25T00:00:00.000Z",
        revoked_at: "2026-05-25T12:00:00.000Z",
      },
    ]);

    await expect(requirePrivilege("inventory.adjust")).rejects.toMatchObject({
      reason: "delegation_revoked",
    });
  });

  test("denies suspended and missing profiles for every privilege", () => {
    const suspended: PermissionUser = {
      ...cashier,
      status: "suspended",
    };

    const privileges = [
      "checkout.create",
      "catalog.manage",
      "inventory.adjust",
      "staff.manage",
      "store.settings",
      "activity.read",
      "profile.update",
    ] as const;

    for (const privilege of privileges) {
      expect(evaluatePrivilege(suspended, privilege)).toMatchObject({
        allowed: false,
        reason: "inactive_profile",
      });
      expect(evaluatePrivilege(null, privilege)).toMatchObject({
        allowed: false,
        reason: "missing_profile",
      });
    }
  });

  test("denies privilege checks when the requested store does not match the session store", async () => {
    mockContext(owner, storeId);

    await expect(
      requirePrivilege("checkout.create", {
        storeId: "88888888-8888-4888-8888-888888888888",
      }),
    ).rejects.toMatchObject({
      reason: "store_mismatch",
    });
  });
});
