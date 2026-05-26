import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  adjustStockAction,
  bulkUpsertProductsAction,
  checkoutAction,
  deleteProductAction,
  toggleProductFavoriteAction,
  updateProfileAction,
  updateStoreAction,
  upsertProductAction,
} from "../actions";
import {
  grantPrivilegeDelegationFormAction,
  inviteStaffFormAction,
  reactivateStaffAction,
  revokePrivilegeDelegationAction,
  revokeStaffInviteAction,
  suspendStaffAction,
} from "../staff-actions";
import {
  getInvoiceReceiptDTO,
  getSupabaseServerClient,
  requireTenantContext,
} from "@/lib/server/dal";
import { getSupabaseAdminClient } from "@/lib/server/admin-supabase";
import { recordActivityEvent } from "@/lib/server/activity";
import { enforceRateLimit } from "@/lib/rate-limiter";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/lib/logger", () => ({
  writeLog: vi.fn(async () => undefined),
}));

vi.mock("@/lib/server/activity", () => ({
  recordActivityEvent: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/rate-limiter", () => ({
  checkoutLimiter: {},
  productMutationLimiter: {},
  bulkImportLimiter: {},
  uiMutationLimiter: {},
  staffInviteLimiter: {},
  staffLifecycleLimiter: {},
  delegationGrantLimiter: {},
  delegationRevokeLimiter: {},
  enforceRateLimit: vi.fn(async () => undefined),
}));

vi.mock("@/lib/server/admin-supabase", () => ({
  getSupabaseAdminClient: vi.fn(),
}));

vi.mock("@/lib/server/dal", () => ({
  getInvoiceReceiptDTO: vi.fn(),
  getSupabaseServerClient: vi.fn(),
  requireTenantContext: vi.fn(),
}));

const ownerId = "11111111-1111-4111-8111-111111111111";
const cashierId = "22222222-2222-4222-8222-222222222222";
const storeId = "33333333-3333-4333-8333-333333333333";
const productId = "44444444-4444-4444-8444-444444444444";
const variantId = "55555555-5555-4555-8555-555555555555";
const invoiceId = "66666666-6666-4666-8666-666666666666";
const invitationId = "77777777-7777-4777-8777-777777777777";
const otherStoreId = "88888888-8888-4888-8888-888888888888";
const staffUserId = "99999999-9999-4999-8999-999999999999";

const validProductPayload = {
  productId: null,
  name: "Cotton Tee",
  category: "Apparel",
  lowStockThreshold: 5,
  deletedVariantIds: [],
  variants: [
    {
      size: "M",
      color: "Black",
      sku: "tee-blk-m",
      price: 1200,
      stock: 10,
    },
  ],
};

const validCheckoutPayload = {
  storeId,
  invoiceNumber: "INV-1001",
  customerName: "Walk-in Customer",
  customerPhone: null,
  totalAmount: 1200,
  discountAmount: 0,
  paidAmount: 1200,
  paymentMethod: "Cash" as const,
  items: [
    {
      variant_id: variantId,
      custom_name: null,
      quantity: 1,
      unit_price: 1200,
      subtotal: 1200,
    },
  ],
};

function mockTenant(role: "owner" | "cashier", status: "active" | "suspended" = "active") {
  vi.mocked(requireTenantContext).mockResolvedValue({
    user: {
      id: role === "owner" ? ownerId : cashierId,
      name: role === "owner" ? "Owner User" : "Cashier User",
      email: role === "owner" ? "owner@example.com" : "cashier@example.com",
      store_id: storeId,
      role,
      status,
    },
    store: {
      id: storeId,
      name: "KTM Boutique",
      phone: "",
      address: "",
      pan_vat: "",
    },
  });
}

function makeForm(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

function createAwaitableQuery<T>(result: T) {
  const query: {
    update: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    then: Promise<T>["then"];
  } = {
    update: vi.fn(() => query),
    eq: vi.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

function createVariantLookup(result: { data: Record<string, unknown> | null; error: { message: string } | null }) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    single: vi.fn(async () => result),
  };
  return query;
}

function createMaybeSingleQuery<T>(result: { data: T | null; error: { message: string } | null }) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
  };
  return query;
}

function createInsertSingleQuery<T>(result: { data: T | null; error: { message: string } | null }) {
  const query = {
    insert: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(async () => result),
  };
  return query;
}

function createActiveDelegationLookup(rows: Array<Record<string, unknown>>) {
  const query: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    is: ReturnType<typeof vi.fn>;
    lte: ReturnType<typeof vi.fn>;
    gt: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    then: Promise<{ data: Array<Record<string, unknown>>; error: null }>["then"];
  } = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    lte: vi.fn(() => query),
    gt: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    then: (resolve, reject) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  };
  return query;
}

function createDelegationLookup(rows: Array<Record<string, unknown>>, error: { message: string } | null = null) {
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

function expectNoPrivilegedSideEffects(options: { allowDelegationLookup?: boolean } = {}) {
  expect(getSupabaseServerClient).not.toHaveBeenCalled();
  if (!options.allowDelegationLookup) {
    expect(getSupabaseAdminClient).not.toHaveBeenCalled();
  }
  expect(enforceRateLimit).not.toHaveBeenCalled();
  expect(recordActivityEvent).not.toHaveBeenCalled();
}

describe("Server Action permission abuse gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test.each([
    {
      name: "upsert product",
      call: () => upsertProductAction(validProductPayload),
      reason: "insufficient_role",
      delegationLookup: false,
    },
    {
      name: "bulk catalog import",
      call: () => bulkUpsertProductsAction([validProductPayload]),
      reason: "insufficient_role",
      delegationLookup: false,
    },
    {
      name: "delete product",
      call: () => deleteProductAction(productId),
      reason: "insufficient_role",
      delegationLookup: false,
    },
    {
      name: "toggle product favorite",
      call: () => toggleProductFavoriteAction(productId, true),
      reason: "insufficient_role",
      delegationLookup: false,
    },
    {
      name: "adjust inventory",
      call: () => adjustStockAction(variantId, 7),
      reason: "insufficient_role",
      delegationLookup: true,
    },
    {
      name: "update store settings",
      call: () => updateStoreAction({
        name: "KTM Boutique",
        phone: "9800000000",
        address: "Kathmandu",
        panVat: "PAN-123",
      }),
      reason: "insufficient_role",
      delegationLookup: false,
    },
  ])("denies a direct cashier call to $name before privileged side effects", async ({ call, reason, delegationLookup }) => {
    mockTenant("cashier");
    if (delegationLookup) {
      createDelegationLookup([]);
    }

    await expect(call()).rejects.toMatchObject({
      name: "PermissionDeniedError",
      reason,
    });

    expect(requireTenantContext).toHaveBeenCalledTimes(1);
    expectNoPrivilegedSideEffects({ allowDelegationLookup: delegationLookup });
  });

  test.each([
    {
      name: "revoke staff invitation",
      call: () => revokeStaffInviteAction(makeForm({ invitationId })),
    },
    {
      name: "suspend staff account",
      call: () => suspendStaffAction(makeForm({ userId: staffUserId })),
    },
    {
      name: "reactivate staff account",
      call: () => reactivateStaffAction(makeForm({ userId: staffUserId })),
    },
    {
      name: "grant temporary access",
      call: () => grantPrivilegeDelegationFormAction({ success: false }, makeForm({
        userId: staffUserId,
        scope: "inventory.adjust",
        durationHours: "2",
        reason: "Owner away",
        confirmText: "GRANT",
      })),
    },
    {
      name: "revoke temporary access",
      call: () => revokePrivilegeDelegationAction(makeForm({ delegationId: invitationId })),
    },
  ])("denies a direct cashier call to $name before admin-client access", async ({ call }) => {
    mockTenant("cashier");

    let result: unknown;
    try {
      result = await call();
    } catch (error: unknown) {
      expect(error).toMatchObject({
        name: "PermissionDeniedError",
        reason: "insufficient_role",
      });
    }
    if (result) {
      expect(result).toMatchObject({
        success: false,
        error: "Unauthorized: Missing privilege staff.manage.",
      });
    }

    expect(requireTenantContext).toHaveBeenCalledTimes(1);
    expectNoPrivilegedSideEffects();
  });

  test("denies a direct cashier staff invite form without touching the admin client", async () => {
    mockTenant("cashier");

    const result = await inviteStaffFormAction(
      { success: false },
      makeForm({ email: "new.cashier@example.com" }),
    );

    expect(result).toMatchObject({
      success: false,
      error: "Unauthorized: Missing privilege staff.manage.",
    });
    expect(requireTenantContext).toHaveBeenCalledTimes(1);
    expectNoPrivilegedSideEffects();
  });

  test("rejects unreleased temporary access scopes before authorization side effects", async () => {
    mockTenant("owner");

    const result = await grantPrivilegeDelegationFormAction(
      { success: false },
      makeForm({
        userId: staffUserId,
        scope: "catalog.manage",
        durationHours: "2",
        reason: "Owner away",
        confirmText: "GRANT",
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Choose an allowed temporary access scope.");
    expect(requireTenantContext).not.toHaveBeenCalled();
    expectNoPrivilegedSideEffects();
  });

  test("denies a missing-auth direct action before privileged side effects", async () => {
    vi.mocked(requireTenantContext).mockRejectedValue(new Error("Store profile not found"));

    await expect(upsertProductAction(validProductPayload)).rejects.toThrow("Store profile not found");

    expect(requireTenantContext).toHaveBeenCalledTimes(1);
    expectNoPrivilegedSideEffects();
  });

  test("ignores forged role and actor fields on direct action payloads", async () => {
    mockTenant("cashier");
    createDelegationLookup([]);

    await expect(
      upsertProductAction({
        ...validProductPayload,
        actorUserId: ownerId,
        role: "owner",
        privilegeSource: "owner_role",
      }),
    ).rejects.toMatchObject({
      name: "PermissionDeniedError",
      reason: "insufficient_role",
    });

    expect(requireTenantContext).toHaveBeenCalledTimes(1);
    expectNoPrivilegedSideEffects({ allowDelegationLookup: true });
  });

  test("denies suspended cashier checkout before Supabase RPC access", async () => {
    mockTenant("cashier", "suspended");

    await expect(checkoutAction(validCheckoutPayload)).rejects.toMatchObject({
      name: "PermissionDeniedError",
      reason: "inactive_profile",
    });

    expect(requireTenantContext).toHaveBeenCalledTimes(1);
    expectNoPrivilegedSideEffects();
  });

  test("denies checkout store-id tampering before Supabase RPC access", async () => {
    mockTenant("owner");

    await expect(
      checkoutAction({
        ...validCheckoutPayload,
        storeId: otherStoreId,
      }),
    ).rejects.toMatchObject({
      name: "PermissionDeniedError",
      reason: "store_mismatch",
    });

    expect(requireTenantContext).toHaveBeenCalledTimes(1);
    expectNoPrivilegedSideEffects();
  });

  test("denies expired and revoked database-backed delegations before business database access", async () => {
    mockTenant("cashier");
    createDelegationLookup([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        scope: "inventory.adjust",
        granted_by_user_id: ownerId,
        starts_at: "2026-05-25T00:00:00.000Z",
        expires_at: "2000-05-25T00:00:00.000Z",
        revoked_at: null,
      },
    ]);

    await expect(adjustStockAction(variantId, 7)).rejects.toMatchObject({
      name: "PermissionDeniedError",
      reason: "delegation_expired",
    });
    expectNoPrivilegedSideEffects({ allowDelegationLookup: true });

    vi.clearAllMocks();
    mockTenant("cashier");
    createDelegationLookup([
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        scope: "inventory.adjust",
        granted_by_user_id: ownerId,
        starts_at: "2026-05-25T00:00:00.000Z",
        expires_at: "2999-05-25T00:00:00.000Z",
        revoked_at: "2026-05-25T12:00:00.000Z",
      },
    ]);

    await expect(adjustStockAction(variantId, 7)).rejects.toMatchObject({
      name: "PermissionDeniedError",
      reason: "delegation_revoked",
    });
    expectNoPrivilegedSideEffects({ allowDelegationLookup: true });
  });

  test("allows a delegated cashier inventory adjustment and records delegation authority", async () => {
    mockTenant("cashier");
    const delegationQuery = createDelegationLookup([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        scope: "inventory.adjust",
        granted_by_user_id: ownerId,
        starts_at: "2026-05-25T00:00:00.000Z",
        expires_at: "2999-05-25T00:00:00.000Z",
        revoked_at: null,
      },
    ]).query;

    const variantQuery = createVariantLookup({
      data: { id: variantId, store_id: storeId },
      error: null,
    });
    const inventoryQuery = createAwaitableQuery({ error: null });
    let delegationLookupCount = 0;
    const from = vi.fn((table: string) => {
      if (table === "privilege_delegations") {
        delegationLookupCount += 1;
        return delegationQuery;
      }
      if (table === "product_variants") return variantQuery;
      if (table === "inventory") return inventoryQuery;
      throw new Error(`Unexpected table ${table}`);
    });
    vi.mocked(getSupabaseAdminClient).mockReturnValue({ from } as never);

    await expect(adjustStockAction(variantId, 7)).resolves.toBe(true);

    expect(getSupabaseServerClient).not.toHaveBeenCalled();
    expect(delegationLookupCount).toBe(1);
    expect(from).toHaveBeenCalledWith("privilege_delegations");
    expect(from).toHaveBeenCalledWith("product_variants");
    expect(from).toHaveBeenCalledWith("inventory");
    expect(enforceRateLimit).toHaveBeenCalledTimes(1);
    expect(recordActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "inventory.adjusted",
        actionScope: "inventory.adjust",
        privilegeSource: "delegation",
        delegationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        metadata: {
          delegationGrantorUserId: ownerId,
        },
      }),
    );
  });

  test("allows an owner to grant temporary access with activity proof", async () => {
    mockTenant("owner");
    const profileQuery = createMaybeSingleQuery({
      data: {
        id: staffUserId,
        name: "Cashier User",
        store_id: storeId,
        role: "cashier",
        status: "active",
        invited_by_user_id: ownerId,
        suspended_at: null,
        suspended_by_user_id: null,
        created_at: "2026-05-25T00:00:00.000Z",
      },
      error: null,
    });
    const activeDelegationsQuery = createActiveDelegationLookup([]);
    const insertQuery = createInsertSingleQuery({
      data: {
        id: invitationId,
        expires_at: "2999-05-25T00:00:00.000Z",
      },
      error: null,
    });
    let delegationCallCount = 0;
    const from = vi.fn((table: string) => {
      if (table === "users") return profileQuery;
      if (table === "privilege_delegations") {
        delegationCallCount += 1;
        return delegationCallCount === 1 ? activeDelegationsQuery : insertQuery;
      }
      throw new Error(`Unexpected table ${table}`);
    });
    vi.mocked(getSupabaseAdminClient).mockReturnValue({ from } as never);

    const result = await grantPrivilegeDelegationFormAction(
      { success: false },
      makeForm({
        userId: staffUserId,
        scope: "inventory.adjust",
        durationHours: "2",
        reason: "Owner away",
        confirmText: "GRANT",
      }),
    );

    expect(result).toMatchObject({ success: true });
    expect(insertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        store_id: storeId,
        granted_to_user_id: staffUserId,
        granted_by_user_id: ownerId,
        scope: "inventory.adjust",
        reason: "Owner away",
      }),
    );
    expect(recordActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delegation.granted",
        actionScope: "staff.manage",
        privilegeSource: "owner_role",
        targetType: "privilege_delegation",
        targetId: invitationId,
      }),
    );
  });

  test("allows an owner to revoke same-store temporary access with activity proof", async () => {
    mockTenant("owner");
    const delegationQuery = createMaybeSingleQuery({
      data: {
        id: invitationId,
        store_id: storeId,
        granted_to_user_id: staffUserId,
        granted_by_user_id: ownerId,
        scope: "inventory.adjust",
        reason: "Owner away",
        starts_at: "2026-05-25T00:00:00.000Z",
        expires_at: "2999-05-25T00:00:00.000Z",
        revoked_at: null,
        revoked_by_user_id: null,
        created_at: "2026-05-25T00:00:00.000Z",
      },
      error: null,
    });
    const profileQuery = createMaybeSingleQuery({
      data: {
        id: staffUserId,
        name: "Cashier User",
        store_id: storeId,
        role: "cashier",
        status: "active",
        invited_by_user_id: ownerId,
        suspended_at: null,
        suspended_by_user_id: null,
        created_at: "2026-05-25T00:00:00.000Z",
      },
      error: null,
    });
    const updateQuery = createAwaitableQuery({ error: null });
    let delegationCallCount = 0;
    const from = vi.fn((table: string) => {
      if (table === "users") return profileQuery;
      if (table === "privilege_delegations") {
        delegationCallCount += 1;
        return delegationCallCount === 1 ? delegationQuery : updateQuery;
      }
      throw new Error(`Unexpected table ${table}`);
    });
    vi.mocked(getSupabaseAdminClient).mockReturnValue({ from } as never);

    await expect(revokePrivilegeDelegationAction(makeForm({ delegationId: invitationId }))).resolves.toBeUndefined();

    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        revoked_by_user_id: ownerId,
      }),
    );
    expect(recordActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delegation.revoked",
        actionScope: "staff.manage",
        privilegeSource: "owner_role",
        targetType: "privilege_delegation",
        targetId: invitationId,
      }),
    );
  });

  test("allows an active cashier checkout and records cashier privilege source", async () => {
    mockTenant("cashier");
    const rpc = vi.fn(async () => ({ data: invoiceId, error: null }));
    vi.mocked(getSupabaseServerClient).mockResolvedValue({ rpc } as never);
    vi.mocked(getInvoiceReceiptDTO).mockResolvedValue({
      id: invoiceId,
      store_id: storeId,
      invoice_number: "INV-1001",
      customer_name: "Walk-in Customer",
      customer_phone: null,
      total_amount: 1200,
      discount_amount: 0,
      paid_amount: 1200,
      payment_method: "Cash",
      sold_by_user_id: cashierId,
      sold_by_name: "Cashier User",
      sold_by_role: "cashier",
      sold_with_delegation_id: null,
      created_at: "2026-05-25T12:00:00.000Z",
      invoice_items: [],
    } as never);

    const invoice = await checkoutAction(validCheckoutPayload);

    expect(invoice).toMatchObject({ id: invoiceId, invoice_number: "INV-1001" });
    expect(
      vi.mocked(requireTenantContext).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(getSupabaseServerClient).mock.invocationCallOrder[0]);
    expect(rpc).toHaveBeenCalledWith(
      "create_invoice_and_deduct_stock",
      expect.objectContaining({
        p_store_id: storeId,
        p_invoice_number: "INV-1001",
      }),
    );
    expect(enforceRateLimit).toHaveBeenCalledTimes(1);
    expect(recordActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "checkout.created",
        actionScope: "checkout.create",
        privilegeSource: "cashier_role",
        delegationId: null,
      }),
    );
  });

  test("allows an active cashier profile update without granting store settings", async () => {
    mockTenant("cashier");
    const usersQuery = createAwaitableQuery({ error: null });
    const from = vi.fn(() => usersQuery);
    vi.mocked(getSupabaseServerClient).mockResolvedValue({ from } as never);

    await expect(updateProfileAction({ name: "Mina Cashier" })).resolves.toBe(true);

    expect(
      vi.mocked(requireTenantContext).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(getSupabaseServerClient).mock.invocationCallOrder[0]);
    expect(from).toHaveBeenCalledWith("users");
    expect(usersQuery.update).toHaveBeenCalledWith({ name: "Mina Cashier" });
    expect(usersQuery.eq).toHaveBeenCalledWith("id", cashierId);
    expect(recordActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "profile.updated",
        privilegeSource: "cashier_role",
        delegationId: null,
      }),
    );
  });
});
