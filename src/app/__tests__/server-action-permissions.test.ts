import { beforeEach, describe, expect, test, vi } from "vitest";
import { headers } from "next/headers";
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
import { loginAction, signupAction } from "../auth-actions";
import {
  acceptStaffInviteFormAction,
  createDelegationStepUpProofAction,
  grantPrivilegeDelegationFormAction,
  inviteStaffFormAction,
  reactivateStaffAction,
  resendStaffInviteAction,
  revokePrivilegeDelegationAction,
  revokeStaffInviteAction,
  suspendStaffAction,
} from "../staff-actions";
import {
  getInvoiceReceiptDTO,
  getSupabaseServerClient,
  requireTenantContext,
} from "@/server/supabase/dal";
import { getSupabaseAdminClient, getSupabaseEmailAuthClient } from "@/server/supabase/admin-supabase";
import { recordActivityEvent } from "@/server/activity/activity";
import {
  enforceRateLimit,
  getClientIp,
  loginIpLimiter,
  loginLimiter,
  staffInviteAcceptLimiter,
} from "@/server/rate-limit/rate-limiter";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("@/server/logging/logger", () => ({
  writeLog: vi.fn(async () => undefined),
}));

vi.mock("@/server/activity/activity", () => ({
  recordActivityEvent: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/server/rate-limit/rate-limiter", () => ({
  loginLimiter: {},
  loginIpLimiter: {},
  signupLimiter: {},
  passwordResetLimiter: {},
  checkoutLimiter: {},
  productMutationLimiter: {},
  bulkImportLimiter: {},
  uiMutationLimiter: {},
  staffInviteLimiter: {},
  staffInviteAcceptLimiter: {},
  staffLifecycleLimiter: {},
  delegationGrantLimiter: {},
  delegationRevokeLimiter: {},
  enforceRateLimit: vi.fn(async () => undefined),
  getClientIp: vi.fn(async () => "127.0.0.1"),
}));

vi.mock("@/server/supabase/admin-supabase", () => ({
  getSupabaseAdminClient: vi.fn(),
  getSupabaseEmailAuthClient: vi.fn(),
}));

vi.mock("@/server/supabase/dal", () => ({
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
  idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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
    select: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    then: Promise<T>["then"];
  } = {
    update: vi.fn(() => query),
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
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


function createDelegationLookup(
  rows: Array<Record<string, unknown>>,
  error: { message: string } | null = null,
  clientExtras: Record<string, unknown> = {},
) {
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
  vi.mocked(getSupabaseAdminClient).mockReturnValue({ from, ...clientExtras } as never);
  return { from, query };
}

function mockInviteeSession(
  options: {
    id?: string;
    email?: string;
    fullName?: string;
    updateError?: { message: string } | null;
  } = {},
) {
  const getUser = vi.fn(async () => ({
    data: {
      user: {
        id: options.id ?? staffUserId,
        email: options.email ?? "cashier@example.com",
        user_metadata: {
          full_name: options.fullName ?? "Mina Cashier",
        },
      },
    },
    error: null,
  }));
  const updateUser = vi.fn(async () => ({
    data: { user: null },
    error: options.updateError ?? null,
  }));

  vi.mocked(getSupabaseServerClient).mockResolvedValue({
    auth: { getUser, updateUser },
  } as never);

  return { getUser, updateUser };
}

function mockMissingInviteeSession() {
  const getUser = vi.fn(async () => ({
    data: { user: null },
    error: null,
  }));

  vi.mocked(getSupabaseServerClient).mockResolvedValue({
    auth: { getUser },
  } as never);

  return getUser;
}

function mockStaffInviteAcceptanceRpc(result: {
  data: Record<string, unknown> | null;
  error: { message: string } | null;
}, options: {
  invitation?: Record<string, unknown> | null;
  store?: Record<string, unknown> | null;
  profile?: Record<string, unknown> | null;
  rollbackResult?: {
    data: Record<string, unknown> | null;
    error: { message: string } | null;
  };
} = {}) {
  const rpc = vi.fn(async (fn: string) => {
    if (fn === "rollback_staff_invitation_acceptance") {
      return options.rollbackResult ?? {
        data: {
          ok: true,
          code: "staff_invitation_acceptance_rolled_back",
          invitationId,
          targetId: staffUserId,
        },
        error: null,
      };
    }
    return result;
  });
  const invitation = options.invitation === undefined
    ? {
        id: invitationId,
        store_id: storeId,
        email: "cashier@example.com",
        status: "pending",
        expires_at: "2999-05-26T03:29:25.000Z",
      }
    : options.invitation;
  const store = options.store === undefined
    ? { name: "KTM Boutique" }
    : options.store;
  const profile = options.profile === undefined ? null : options.profile;
  const from = vi.fn((table: string) => {
    if (table === "staff_invitations") {
      return createMaybeSingleQuery({ data: invitation, error: null });
    }
    if (table === "stores") {
      return createMaybeSingleQuery({ data: store, error: null });
    }
    if (table === "users") {
      return createMaybeSingleQuery({ data: profile, error: null });
    }
    return createMaybeSingleQuery({ data: null, error: null });
  });
  vi.mocked(getSupabaseAdminClient).mockReturnValue({ from, rpc } as never);
  return { rpc, from };
}

function mockFreshAal2Session(
  options: {
    timestampSeconds?: number;
    currentLevel?: string;
    session?: { access_token: string } | null;
    assuranceError?: { message: string } | null;
  } = {},
) {
  const getSession = vi.fn(async () => ({
    data: { session: options.session === undefined ? { access_token: "fresh-aal2-jwt" } : options.session },
    error: null,
  }));
  const getAuthenticatorAssuranceLevel = vi.fn(async () => ({
    data: {
      currentLevel: options.currentLevel ?? "aal2",
      nextLevel: "aal2",
      currentAuthenticationMethods: options.timestampSeconds === undefined
        ? [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) }]
        : [{ method: "totp", timestamp: options.timestampSeconds }],
    },
    error: options.assuranceError ?? null,
  }));

  vi.mocked(getSupabaseServerClient).mockResolvedValue({
    auth: {
      getSession,
      mfa: { getAuthenticatorAssuranceLevel },
    },
  } as never);

  return { getSession, getAuthenticatorAssuranceLevel };
}

function expectNoPrivilegedSideEffects(options: { allowDelegationLookup?: boolean } = {}) {
  expect(getSupabaseServerClient).not.toHaveBeenCalled();
  if (!options.allowDelegationLookup) {
    expect(getSupabaseAdminClient).not.toHaveBeenCalled();
  }
  expect(enforceRateLimit).not.toHaveBeenCalled();
  expect(recordActivityEvent).not.toHaveBeenCalled();
}

function activeDelegationRow(scope: "catalog.manage" | "inventory.adjust") {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    scope,
    granted_by_user_id: ownerId,
    starts_at: "2026-05-25T00:00:00.000Z",
    expires_at: "2999-05-25T00:00:00.000Z",
    revoked_at: null,
  };
}

describe("Server Action permission abuse gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(headers).mockResolvedValue(new Headers());
  });

  test.each([
    {
      name: "upsert product",
      call: () => upsertProductAction(validProductPayload),
      reason: "insufficient_role",
      delegationLookup: true,
    },
    {
      name: "bulk catalog import",
      call: () => bulkUpsertProductsAction([validProductPayload]),
      reason: "insufficient_role",
      delegationLookup: true,
    },
    {
      name: "delete product",
      call: () => deleteProductAction(productId),
      reason: "insufficient_role",
      delegationLookup: true,
    },
    {
      name: "toggle product favorite",
      call: () => toggleProductFavoriteAction(productId, true),
      reason: "insufficient_role",
      delegationLookup: true,
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
      call: () => revokeStaffInviteAction({ success: false }, makeForm({ invitationId, confirmText: "REVOKE" })),
    },
    {
      name: "resend staff invitation",
      call: () => resendStaffInviteAction({ success: false }, makeForm({ invitationId })),
    },
    {
      name: "suspend staff account",
      call: () => suspendStaffAction({ success: false }, makeForm({ userId: staffUserId, confirmText: "SUSPEND" })),
    },
    {
      name: "reactivate staff account",
      call: () => reactivateStaffAction({ success: false }, makeForm({ userId: staffUserId })),
    },
    {
      name: "grant temporary access",
      call: () => grantPrivilegeDelegationFormAction({ success: false }, makeForm({
        userId: staffUserId,
        scope: "inventory.adjust",
        durationHours: "2",
        reason: "Owner away",
        confirmText: "GRANT",
        stepUpProofId: invitationId,
      })),
    },
    {
      name: "revoke temporary access",
      call: () => revokePrivilegeDelegationAction({ success: false }, makeForm({
        delegationId: invitationId,
        confirmText: "REVOKE",
      })),
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
        error: "You do not have permission to update staff access.",
      });
    }

    expect(requireTenantContext).toHaveBeenCalledTimes(1);
    expectNoPrivilegedSideEffects();
  });

  test.each([
    {
      name: "revoke staff invitation",
      call: () => revokeStaffInviteAction({ success: false }, makeForm({ invitationId })),
      message: "Type REVOKE to revoke this invitation.",
    },
    {
      name: "suspend staff account",
      call: () => suspendStaffAction({ success: false }, makeForm({ userId: staffUserId })),
      message: "Type SUSPEND to suspend this cashier.",
    },
    {
      name: "revoke temporary access",
      call: () => revokePrivilegeDelegationAction({ success: false }, makeForm({ delegationId: invitationId })),
      message: "Type REVOKE to revoke temporary access.",
    },
  ])("rejects $name without typed confirmation before authz or admin access", async ({ call, message }) => {
    const result = await call();

    expect(result.success).toBe(false);
    expect(result.error).toContain(message);
    expect(requireTenantContext).not.toHaveBeenCalled();
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
      error: "You do not have permission to update staff access.",
    });
    expect(requireTenantContext).toHaveBeenCalledTimes(1);
    expectNoPrivilegedSideEffects();
  });

  test("rejects an invalid staff invite email before authz or admin access", async () => {
    const result = await inviteStaffFormAction(
      { success: false },
      makeForm({ email: "not-an-email" }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Enter a valid email address.");
    expect(requireTenantContext).not.toHaveBeenCalled();
    expectNoPrivilegedSideEffects();
  });

  test("allows an owner to resend a pending staff invite with a fresh auth email", async () => {
    mockTenant("owner");
    const previousAppUrl = process.env.APP_URL;
    process.env.APP_URL = "https://trusted.example";
    vi.mocked(headers).mockResolvedValue(new Headers({
      host: "attacker.example",
      "x-forwarded-host": "attacker.example",
      "x-forwarded-proto": "https",
    }));

    const inviteUserByEmail = vi.fn(async () => ({
      data: { user: { id: staffUserId } },
      error: null,
    }));
    const invitationLookup = createMaybeSingleQuery({
      data: {
        id: invitationId,
        store_id: storeId,
        email: "cashier@example.com",
        role: "cashier",
        status: "pending",
        invited_by_user_id: ownerId,
        accepted_by_user_id: null,
        accepted_at: null,
        revoked_by_user_id: null,
        revoked_at: null,
        expires_at: "2026-05-26T03:29:25.000Z",
        created_at: "2026-05-26T02:29:25.000Z",
      },
      error: null,
    });
    const from = vi.fn((table: string) => {
      if (table !== "staff_invitations") {
        throw new Error(`Unexpected table ${table}`);
      }
      return invitationLookup;
    });
    const rpc = vi.fn(
      async (
        method: string,
        args: { p_invitation_id: string; p_actor_user_id: string; p_expires_at: string },
      ) => {
        if (method === "resend_staff_invitation") {
          return {
            data: {
              ok: true,
              code: "staff_invite_resent",
              storeId,
              invitationId: args.p_invitation_id,
              targetLabel: "cashier@example.com",
              actorName: "Owner User",
              expiresAt: args.p_expires_at,
              updatedAt: "2026-05-26T02:29:25.000Z",
            },
            error: null,
          };
        }
        throw new Error(`Unexpected RPC method ${method}`);
      },
    );
    vi.mocked(getSupabaseAdminClient).mockReturnValue({
      from,
      rpc,
      auth: {
        admin: {
          inviteUserByEmail,
        },
      },
    } as never);

    let result: Awaited<ReturnType<typeof resendStaffInviteAction>> | undefined;
    try {
      result = await resendStaffInviteAction(
        { success: false },
        makeForm({ invitationId }),
      );
    } finally {
      if (previousAppUrl === undefined) {
        delete process.env.APP_URL;
      } else {
        process.env.APP_URL = previousAppUrl;
      }
    }

    expect(result).toMatchObject({
      success: true,
      message: "Invitation resent to cashier@example.com.",
    });
    expect(rpc).toHaveBeenCalledWith("resend_staff_invitation", {
      p_invitation_id: invitationId,
      p_actor_user_id: ownerId,
      p_expires_at: expect.any(String),
    });
    expect(inviteUserByEmail).toHaveBeenCalledWith(
      "cashier@example.com",
      expect.objectContaining({
        data: {
          invitation_id: invitationId,
          invited_role: "cashier",
          invited_store_id: storeId,
        },
        redirectTo: `https://trusted.example/staff/accept?invitationId=${invitationId}`,
      }),
    );
    expect(recordActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "staff.invite_resent",
        actionScope: "staff.manage",
        result: "success",
        targetId: invitationId,
        targetLabel: "cashier@example.com",
      }),
      { strict: true },
    );
  });

  test("resends a pending staff invite as a sign-in link when the auth user already exists", async () => {
    mockTenant("owner");

    const inviteUserByEmail = vi.fn(async () => ({
      data: { user: null },
      error: {
        code: "email_exists",
        message: "A user with this email address has already been registered",
        status: 422,
      },
    }));
    const signInWithOtp = vi.fn(async () => ({
      data: {},
      error: null,
    }));
    vi.mocked(getSupabaseEmailAuthClient).mockReturnValue({
      auth: { signInWithOtp },
    } as never);

    const invitationLookup = createMaybeSingleQuery({
      data: {
        id: invitationId,
        store_id: storeId,
        email: "cashier@example.com",
        role: "cashier",
        status: "pending",
        invited_by_user_id: ownerId,
        accepted_by_user_id: null,
        accepted_at: null,
        revoked_by_user_id: null,
        revoked_at: null,
        expires_at: "2026-05-26T03:29:25.000Z",
        created_at: "2026-05-26T02:29:25.000Z",
      },
      error: null,
    });
    const from = vi.fn((table: string) => {
      if (table !== "staff_invitations") {
        throw new Error(`Unexpected table ${table}`);
      }
      return invitationLookup;
    });
    const rpc = vi.fn(
      async (
        method: string,
        args: { p_invitation_id: string; p_actor_user_id: string; p_expires_at: string },
      ) => {
        if (method === "resend_staff_invitation") {
          return {
            data: {
              ok: true,
              code: "staff_invite_resent",
              storeId,
              invitationId: args.p_invitation_id,
              targetLabel: "cashier@example.com",
              actorName: "Owner User",
              expiresAt: args.p_expires_at,
              updatedAt: "2026-05-26T02:29:25.000Z",
            },
            error: null,
          };
        }
        throw new Error(`Unexpected RPC method ${method}`);
      },
    );
    vi.mocked(getSupabaseAdminClient).mockReturnValue({
      from,
      rpc,
      auth: {
        admin: {
          inviteUserByEmail,
        },
      },
    } as never);

    const result = await resendStaffInviteAction(
      { success: false },
      makeForm({ invitationId }),
    );

    expect(result).toMatchObject({
      success: true,
      message: "Invitation resent to cashier@example.com.",
    });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "cashier@example.com",
      options: {
        shouldCreateUser: false,
        emailRedirectTo: expect.stringContaining(`/staff/accept?invitationId=${invitationId}`),
      },
    });
    expect(recordActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "staff.invite_resent",
        result: "success",
        targetId: invitationId,
        targetLabel: "cashier@example.com",
      }),
      { strict: true },
    );
  });

  test("rejects a tampered staff invite accept id before auth or admin access", async () => {
    const result = await acceptStaffInviteFormAction(
      { success: false },
      makeForm({ invitationId: "not-a-real-invite" }),
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid invitation id.");
    expect(getSupabaseServerClient).not.toHaveBeenCalled();
    expect(getSupabaseAdminClient).not.toHaveBeenCalled();
    expect(recordActivityEvent).not.toHaveBeenCalled();
  });

  test("denies invite acceptance for an authenticated user with the wrong email", async () => {
    mockInviteeSession({ email: "wrong.person@example.com" });
    const { rpc } = mockStaffInviteAcceptanceRpc({
      data: null,
      error: { message: "staff_invitation_email_mismatch" },
    });

    const result = await acceptStaffInviteFormAction(
      { success: false },
      makeForm({
        invitationId,
        fullName: "Mina Cashier",
        password: "Cashier123",
        confirmPassword: "Cashier123",
      }),
    );

    expect(result).toMatchObject({
      success: false,
      error: "This invite belongs to a different email address.",
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(recordActivityEvent).not.toHaveBeenCalled();
  });

  test("requires an authenticated invited user before accepting a staff invite", async () => {
    mockMissingInviteeSession();

    const result = await acceptStaffInviteFormAction(
      { success: false },
      makeForm({
        invitationId,
        fullName: "Mina Cashier",
        password: "Cashier123",
        confirmPassword: "Cashier123",
      }),
    );

    expect(result).toMatchObject({
      success: false,
      error: "Please sign in with the invited email first.",
    });
    expect(getSupabaseAdminClient).not.toHaveBeenCalled();
    expect(recordActivityEvent).not.toHaveBeenCalled();
  });

  test("rate limits invite acceptance before preview, DB, or Auth mutation", async () => {
    const { updateUser } = mockInviteeSession({ email: "cashier@example.com" });
    vi.mocked(enforceRateLimit).mockRejectedValueOnce(
      new Error("Too many requests. Please try again in 15 minute(s)."),
    );

    const result = await acceptStaffInviteFormAction(
      { success: false },
      makeForm({
        invitationId,
        fullName: "Mina Cashier",
        password: "Cashier123",
        confirmPassword: "Cashier123",
      }),
    );

    expect(result).toMatchObject({
      success: false,
      error: "Too many attempts. Please try again in 15 minutes.",
    });
    expect(enforceRateLimit).toHaveBeenCalledWith(
      staffInviteAcceptLimiter,
      `staff_invite_accept:${staffUserId}:${invitationId}`,
      "STAFF_INVITE_ACCEPT",
    );
    expect(getClientIp).not.toHaveBeenCalled();
    expect(getSupabaseAdminClient).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
    expect(recordActivityEvent).not.toHaveBeenCalled();
  });

  test("accepts a staff invite through the transaction-safe RPC", async () => {
    const { updateUser } = mockInviteeSession({
      email: "Cashier@Example.com",
      fullName: "Mina Cashier",
    });
    const { rpc } = mockStaffInviteAcceptanceRpc({
      data: {
        invitationId,
        storeId,
        acceptedAt: "2026-05-26T03:29:25.000Z",
        actorName: "Mina Cashier",
        actorEmail: "cashier@example.com",
        profileDisposition: "created",
        previousProfile: null,
      },
      error: null,
    });

    const result = await acceptStaffInviteFormAction(
      { success: false },
      makeForm({
        invitationId,
        fullName: "Mina Cashier",
        password: "Cashier123",
        confirmPassword: "Cashier123",
      }),
    );

    expect(result).toMatchObject({
      success: true,
      message: "Staff account ready. You can open the dashboard now.",
    });
    expect(updateUser).toHaveBeenCalledWith({
      data: {
        full_name: "Mina Cashier",
        name: "Mina Cashier",
      },
      password: "Cashier123",
    });
    expect(rpc).toHaveBeenCalledWith("accept_staff_invitation", {
      p_invitation_id: invitationId,
      p_auth_user_id: staffUserId,
      p_auth_email: "cashier@example.com",
      p_actor_name: "Mina Cashier",
    });
    expect(rpc).not.toHaveBeenCalledWith("rollback_staff_invitation_acceptance", expect.any(Object));
    expect(enforceRateLimit).toHaveBeenNthCalledWith(
      1,
      staffInviteAcceptLimiter,
      `staff_invite_accept:${staffUserId}:${invitationId}`,
      "STAFF_INVITE_ACCEPT",
    );
    expect(getClientIp).toHaveBeenCalledTimes(1);
    expect(enforceRateLimit).toHaveBeenNthCalledWith(
      2,
      staffInviteAcceptLimiter,
      `staff_invite_accept_ip:127.0.0.1:${invitationId}`,
      "STAFF_INVITE_ACCEPT_IP",
    );
    expect(updateUser.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[0]);
    expect(recordActivityEvent).not.toHaveBeenCalled();
  });

  test("aborts and returns error early when Auth user setup fails", async () => {
    const { updateUser } = mockInviteeSession({
      email: "cashier@example.com",
      updateError: { message: "Auth service unavailable" },
    });
    const { rpc } = mockStaffInviteAcceptanceRpc({
      data: null,
      error: null,
    });

    const result = await acceptStaffInviteFormAction(
      { success: false },
      makeForm({
        invitationId,
        fullName: "Mina Cashier",
        password: "Cashier123",
        confirmPassword: "Cashier123",
      }),
    );

    expect(result).toMatchObject({
      success: false,
      error: "Auth service unavailable",
    });
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
    expect(recordActivityEvent).not.toHaveBeenCalled();
  });

  test("reverts Auth user setup when database invite acceptance fails", async () => {
    const { updateUser } = mockInviteeSession({
      email: "cashier@example.com",
    });
    const { rpc } = mockStaffInviteAcceptanceRpc({
      data: null,
      error: { message: "Database constraint failure" },
    });

    const result = await acceptStaffInviteFormAction(
      { success: false },
      makeForm({
        invitationId,
        fullName: "Mina Cashier",
        password: "Cashier123",
        confirmPassword: "Cashier123",
      }),
    );
    expect(result).toMatchObject({
      success: false,
      error: "An unexpected error occurred. Please try again.",
    });

    expect(updateUser).toHaveBeenCalledTimes(2);
    expect(updateUser).toHaveBeenNthCalledWith(1, {
      data: {
        full_name: "Mina Cashier",
        name: "Mina Cashier",
      },
      password: "Cashier123",
    });
    expect(updateUser).toHaveBeenNthCalledWith(2, {
      data: {
        full_name: "Mina Cashier",
      },
    });

    expect(rpc).toHaveBeenCalledWith("accept_staff_invitation", expect.objectContaining({
      p_invitation_id: invitationId,
      p_auth_user_id: staffUserId,
    }));
    expect(recordActivityEvent).not.toHaveBeenCalled();
  });

  test("requires a password for a new invited cashier profile", async () => {
    const { updateUser } = mockInviteeSession();
    const { rpc } = mockStaffInviteAcceptanceRpc({
      data: null,
      error: null,
    });

    const result = await acceptStaffInviteFormAction(
      { success: false },
      makeForm({
        invitationId,
        fullName: "Mina Cashier",
      }),
    );

    expect(result).toMatchObject({
      success: false,
      error: "Create a password to finish setting up this staff account.",
    });
    expect(updateUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("does not convert an owner account into a cashier through invite acceptance", async () => {
    const { updateUser } = mockInviteeSession();
    const { rpc } = mockStaffInviteAcceptanceRpc({
      data: null,
      error: null,
    }, {
      profile: {
        id: staffUserId,
        name: "Owner User",
        store_id: storeId,
        role: "owner",
        status: "active",
        invited_by_user_id: null,
        suspended_at: null,
        suspended_by_user_id: null,
        created_at: "2026-05-26T00:00:00.000Z",
      },
    });

    const result = await acceptStaffInviteFormAction(
      { success: false },
      makeForm({
        invitationId,
        fullName: "Owner User",
        password: "OwnerPass123",
        confirmPassword: "OwnerPass123",
      }),
    );

    expect(result).toMatchObject({
      success: false,
      error: "This invite can only be accepted by a cashier account.",
    });
    expect(updateUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  test.each([
    {
      dbError: "staff_invitation_expired",
      expected: "This invitation has expired. Ask the owner to send a new one.",
    },
    {
      dbError: "staff_invitation_email_mismatch",
      expected: "This invite belongs to a different email address.",
    },
    {
      dbError: "staff_invitation_not_pending",
      expected: "This invitation is no longer pending.",
    },
    {
      dbError: "staff_invitation_store_conflict",
      expected: "This account is already connected to another store.",
    },
    {
      dbError: "staff_invitation_role_conflict",
      expected: "This invite can only be accepted by a cashier account.",
    },
  ])("maps transaction-safe invite accept denial: $dbError", async ({ dbError, expected }) => {
    const { updateUser } = mockInviteeSession();
    const { rpc } = mockStaffInviteAcceptanceRpc({
      data: null,
      error: { message: dbError },
    });

    const result = await acceptStaffInviteFormAction(
      { success: false },
      makeForm({
        invitationId,
        fullName: "Mina Cashier",
        password: "Cashier123",
        confirmPassword: "Cashier123",
      }),
    );

    expect(result).toMatchObject({
      success: false,
      error: expected,
    });
    expect(rpc).toHaveBeenCalledWith("accept_staff_invitation", expect.any(Object));
    expect(updateUser).toHaveBeenCalledTimes(2);
    expect(recordActivityEvent).not.toHaveBeenCalled();
  });

  test("login throttling is scoped by IP and IP+email fingerprint, not email alone", async () => {
    const signInWithPassword = vi.fn(async () => ({
      data: { user: { id: ownerId } },
      error: null,
    }));
    vi.mocked(getSupabaseServerClient).mockResolvedValue({
      auth: { signInWithPassword },
    } as never);

    const result = await loginAction({
      email: " Victim@Example.com ",
      password: "Password123",
    });

    expect(result).toEqual({ success: true });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "victim@example.com",
      password: "Password123",
    });
    expect(enforceRateLimit).toHaveBeenNthCalledWith(
      1,
      loginIpLimiter,
      "login_ip:127.0.0.1",
      "LOGIN_IP",
    );
    expect(enforceRateLimit).toHaveBeenNthCalledWith(
      2,
      loginLimiter,
      expect.stringMatching(/^login_pair:127\.0\.0\.1:[a-f0-9]{32}$/),
      "LOGIN_ACCOUNT_IP",
    );
    expect(enforceRateLimit).not.toHaveBeenCalledWith(
      loginLimiter,
      "login:victim@example.com",
      expect.any(String),
    );
  });

  test("login IP throttling blocks auth calls before Supabase password verification", async () => {
    vi.mocked(enforceRateLimit).mockImplementationOnce(async () => {
      throw new Error("Too many requests. Please try again in 15 minute(s).");
    });
    const signInWithPassword = vi.fn();
    vi.mocked(getSupabaseServerClient).mockResolvedValue({
      auth: { signInWithPassword },
    } as never);

    const result = await loginAction({
      email: "owner@example.com",
      password: "Password123",
    });

    expect(result).toMatchObject({
      error: "Too many attempts. Please try again in 15 minutes.",
    });
    expect(enforceRateLimit).toHaveBeenCalledWith(
      loginIpLimiter,
      "login_ip:127.0.0.1",
      "LOGIN_IP",
    );
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  test("blocks a signed-in cashier from registering a separate owner store with the same account", async () => {
    const signUp = vi.fn();
    const rpc = vi.fn();
    const getUser = vi.fn(async () => ({
      data: {
        user: {
          id: cashierId,
          email: "cashier@example.com",
        },
      },
      error: null,
    }));
    const from = vi.fn(() => createMaybeSingleQuery({
      data: {
        store_id: storeId,
        role: "cashier",
        status: "active",
      },
      error: null,
    }));
    vi.mocked(getSupabaseServerClient).mockResolvedValue({
      auth: { getUser, signUp },
      from,
      rpc,
    } as never);

    const result = await signupAction({
      email: "cashier@example.com",
      password: "Password123",
      fullName: "Mina Cashier",
      storeName: "Mina Shop",
    });

    expect(result).toMatchObject({
      error: "This account is already connected to a store as staff. Use a different email to create your own shop.",
    });
    expect(signUp).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  test("denies owner cross-store staff invite revoke before mutation", async () => {
    mockTenant("owner");
    const rpc = vi.fn(async () => ({
      data: {
        ok: false,
        code: "staff_invitation_not_found",
        message: "Invitation not found.",
      },
      error: null,
    }));
    vi.mocked(getSupabaseAdminClient).mockReturnValue({ rpc } as never);

    await expect(
      revokeStaffInviteAction({ success: false }, makeForm({ invitationId, confirmText: "REVOKE" })),
    ).resolves.toMatchObject(
      {
        success: false,
        error: "Invitation not found.",
      },
    );

    expect(requireTenantContext).toHaveBeenCalledTimes(1);
    expect(enforceRateLimit).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("revoke_staff_invitation", {
      p_invitation_id: invitationId,
      p_actor_user_id: ownerId,
    });
    expect(recordActivityEvent).not.toHaveBeenCalled();
  });

  test("suspends staff through the lifecycle RPC that revokes active delegations", async () => {
    mockTenant("owner");
    const rpc = vi.fn(async () => ({
      data: {
        ok: true,
        code: "staff_suspended",
        storeId,
        targetId: staffUserId,
        targetLabel: "Cashier User",
        actorName: "Owner User",
        revokedDelegationCount: 2,
        revokedDelegationIds: [
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        ],
        revokedDelegationScopes: ["catalog.manage", "inventory.adjust"],
      },
      error: null,
    }));
    const signOut = vi.fn(async () => ({ error: null }));
    vi.mocked(getSupabaseAdminClient).mockReturnValue({
      rpc,
      auth: {
        admin: {
          signOut,
        },
      },
    } as never);

    await expect(
      suspendStaffAction({ success: false }, makeForm({ userId: staffUserId, confirmText: "SUSPEND" })),
    ).resolves.toMatchObject({
      success: true,
      message: "Cashier User suspended.",
    });

    expect(rpc).toHaveBeenCalledWith("suspend_staff_user", {
      p_target_user_id: staffUserId,
      p_actor_user_id: ownerId,
    });
    expect(signOut).toHaveBeenCalledWith(staffUserId, "global");
    expect(recordActivityEvent).not.toHaveBeenCalled();
  });

  test("rejects unreleased temporary access scopes before authorization side effects", async () => {
    mockTenant("owner");

    const result = await grantPrivilegeDelegationFormAction(
      { success: false },
      makeForm({
        userId: staffUserId,
        scope: "reports.export",
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

  test("denies suspended cashier delegated actions before delegation lookup", async () => {
    mockTenant("cashier", "suspended");

    await expect(adjustStockAction(variantId, 7)).rejects.toMatchObject({
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

  test("rejects overlarge checkout payloads before authz or RPC access", async () => {
    await expect(
      checkoutAction({
        ...validCheckoutPayload,
        items: Array.from({ length: 101 }, () => ({ ...validCheckoutPayload.items[0] })),
      }),
    ).rejects.toThrow("Checkout can include at most 100 items.");

    expect(requireTenantContext).not.toHaveBeenCalled();
    expectNoPrivilegedSideEffects();
  });

  test("rejects overlarge catalog payloads before authz or RPC access", async () => {
    await expect(
      upsertProductAction({
        ...validProductPayload,
        variants: Array.from({ length: 101 }, (_, index) => ({
          ...validProductPayload.variants[0],
          sku: `SKU-${index}`,
        })),
      }),
    ).rejects.toThrow("A product can include at most 100 variants.");

    await expect(
      bulkUpsertProductsAction(Array.from({ length: 1001 }, () => validProductPayload)),
    ).rejects.toThrow("Bulk import can include at most 1000 products.");

    expect(requireTenantContext).not.toHaveBeenCalled();
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

  test("allows a delegated cashier inventory adjustment through the activity-coupled RPC", async () => {
    mockTenant("cashier");
    const rpc = vi.fn(async () => ({ data: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", error: null }));
    const { from } = createDelegationLookup([
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        scope: "inventory.adjust",
        granted_by_user_id: ownerId,
        starts_at: "2026-05-25T00:00:00.000Z",
        expires_at: "2999-05-25T00:00:00.000Z",
        revoked_at: null,
      },
    ], null, { rpc });

    await expect(adjustStockAction(variantId, 7)).resolves.toBe(true);

    expect(getSupabaseServerClient).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("privilege_delegations");
    expect(from).not.toHaveBeenCalledWith("product_variants");
    expect(from).not.toHaveBeenCalledWith("inventory");
    expect(rpc).toHaveBeenCalledWith(
      "adjust_inventory_for_delegation",
      {
        p_store_id: storeId,
        p_actor_user_id: cashierId,
        p_delegation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        p_variant_id: variantId,
        p_new_stock: 7,
      },
    );
    expect(enforceRateLimit).toHaveBeenCalledTimes(1);
    expect(recordActivityEvent).not.toHaveBeenCalled();
  });

  test("rejects delegated inventory adjustment when the RPC revalidation fails", async () => {
    mockTenant("cashier");
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "Unauthorized. Active inventory delegation was not found." },
    }));
    const { from } = createDelegationLookup([
      activeDelegationRow("inventory.adjust"),
    ], null, { rpc });

    await expect(adjustStockAction(variantId, 7)).rejects.toThrow(
      "Unauthorized. Active inventory delegation was not found.",
    );

    expect(getSupabaseServerClient).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("privilege_delegations");
    expect(from).not.toHaveBeenCalledWith("product_variants");
    expect(from).not.toHaveBeenCalledWith("inventory");
    expect(rpc).toHaveBeenCalledWith(
      "adjust_inventory_for_delegation",
      {
        p_store_id: storeId,
        p_actor_user_id: cashierId,
        p_delegation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        p_variant_id: variantId,
        p_new_stock: 7,
      },
    );
    expect(recordActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "inventory.adjust_failed",
        actionScope: "inventory.adjust",
        privilegeSource: "delegation",
        delegationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        errorCode: "stock_adjust_rpc_error",
      }),
    );
  });

  test("allows a delegated cashier catalog upsert through the internal RPC", async () => {
    mockTenant("cashier");
    const rpc = vi.fn(async () => ({ data: productId, error: null }));
    createDelegationLookup([activeDelegationRow("catalog.manage")], null, { rpc });

    await expect(upsertProductAction(validProductPayload)).resolves.toBe(productId);

    expect(getSupabaseServerClient).not.toHaveBeenCalled();
    expect(enforceRateLimit).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "upsert_product_and_variants_for_delegation",
      expect.objectContaining({
        p_store_id: storeId,
        p_actor_user_id: cashierId,
        p_delegation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        p_product_id: null,
        p_name: "Cotton Tee",
        p_variants: [
          expect.objectContaining({
            sku: "TEE-BLK-M",
            stock: 10,
          }),
        ],
      }),
    );
    expect(recordActivityEvent).not.toHaveBeenCalled();
  });

  test("allows a delegated cashier catalog import through the internal RPC", async () => {
    mockTenant("cashier");
    const rpc = vi.fn(async () => ({ data: 1, error: null }));
    createDelegationLookup([activeDelegationRow("catalog.manage")], null, { rpc });

    await expect(bulkUpsertProductsAction([validProductPayload])).resolves.toMatchObject({
      succeededCount: 1,
      failedProducts: [],
    });

    expect(getSupabaseServerClient).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "bulk_upsert_products_and_variants_for_delegation",
      expect.objectContaining({
        p_store_id: storeId,
        p_actor_user_id: cashierId,
        p_delegation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        p_products: [
          expect.objectContaining({
            name: "Cotton Tee",
            variants: [
              expect.objectContaining({
                sku: "TEE-BLK-M",
                stock: 10,
              }),
            ],
          }),
        ],
      }),
    );
    expect(recordActivityEvent).not.toHaveBeenCalled();
  });

  test("allows a delegated cashier product delete through the internal RPC", async () => {
    mockTenant("cashier");
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    createDelegationLookup([activeDelegationRow("catalog.manage")], null, { rpc });

    await expect(deleteProductAction(productId)).resolves.toBe(true);

    expect(getSupabaseServerClient).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "delete_product_for_delegation",
      expect.objectContaining({
        p_store_id: storeId,
        p_actor_user_id: cashierId,
        p_delegation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        p_product_id: productId,
      }),
    );
    expect(recordActivityEvent).not.toHaveBeenCalled();
  });

  test("allows a delegated cashier favorite toggle through the internal RPC", async () => {
    mockTenant("cashier");
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    createDelegationLookup([activeDelegationRow("catalog.manage")], null, { rpc });

    await expect(toggleProductFavoriteAction(productId, true)).resolves.toBe(true);

    expect(getSupabaseServerClient).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "set_product_favorite_for_delegation",
      expect.objectContaining({
        p_store_id: storeId,
        p_actor_user_id: cashierId,
        p_delegation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        p_product_id: productId,
        p_is_favorite: true,
      }),
    );
    expect(recordActivityEvent).not.toHaveBeenCalled();
  });

  test("mints a one-time delegation step-up proof after fresh AAL2 MFA", async () => {
    mockTenant("owner");
    mockFreshAal2Session();
    const insertQuery = createInsertSingleQuery({
      data: {
        id: invitationId,
        expires_at: "2026-05-26T03:55:00.000Z",
      },
      error: null,
    });
    const from = vi.fn((table: string) => {
      if (table === "staff_step_up_proofs") return insertQuery;
      throw new Error(`Unexpected table ${table}`);
    });
    vi.mocked(getSupabaseAdminClient).mockReturnValue({ from } as never);

    const result = await createDelegationStepUpProofAction();

    expect(result).toMatchObject({
      success: true,
      proofId: invitationId,
      expiresAt: "2026-05-26T03:55:00.000Z",
    });
    expect(insertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        store_id: storeId,
        user_id: ownerId,
        purpose: "delegation.grant",
        assurance_level: "aal2",
        authentication_method: "totp",
      }),
    );
  });

  test("does not mint a delegation step-up proof for stale MFA", async () => {
    mockTenant("owner");
    mockFreshAal2Session({
      timestampSeconds: Math.floor((Date.now() - 11 * 60 * 1000) / 1000),
    });

    const result = await createDelegationStepUpProofAction();

    expect(result).toMatchObject({
      success: false,
      error: "Enter a fresh MFA code before granting temporary access.",
    });
    expect(getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  test("denies owner delegation grants without a step-up proof", async () => {
    mockTenant("owner");
    const rpc = vi.fn(async () => ({
      data: {
        ok: false,
        code: "step_up_required",
        message: "Verify your identity with MFA before granting temporary access.",
      },
      error: null,
    }));
    vi.mocked(getSupabaseAdminClient).mockReturnValue({ rpc } as never);

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

    expect(result).toMatchObject({
      success: false,
      error: "Verify your identity with MFA before granting temporary access.",
    });
    expect(rpc).toHaveBeenCalledWith("grant_privilege_delegation", {
      p_store_id: storeId,
      p_actor_user_id: ownerId,
      p_target_user_id: staffUserId,
      p_scope: "catalog.manage",
      p_duration_hours: 2,
      p_reason: "Owner away",
      p_step_up_proof_id: null,
    });
    expect(recordActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delegation.grant_denied",
        actionScope: "staff.manage",
        result: "failure",
        errorCode: "step_up_required",
      }),
      { strict: true },
    );
  });

  test("denies owner delegation grants with expired or reused step-up proof", async () => {
    mockTenant("owner");
    const rpc = vi.fn(async () => ({
      data: {
        ok: false,
        code: "step_up_invalid_or_expired",
        message: "Your identity verification expired. Enter a fresh MFA code and try again.",
      },
      error: null,
    }));
    vi.mocked(getSupabaseAdminClient).mockReturnValue({ rpc } as never);

    const result = await grantPrivilegeDelegationFormAction(
      { success: false },
      makeForm({
        userId: staffUserId,
        scope: "catalog.manage",
        durationHours: "2",
        reason: "Owner away",
        confirmText: "GRANT",
        stepUpProofId: invitationId,
      }),
    );

    expect(result).toMatchObject({
      success: false,
      error: "Your identity verification expired. Enter a fresh MFA code and try again.",
    });
    expect(rpc).toHaveBeenCalledWith(
      "grant_privilege_delegation",
      expect.objectContaining({
        p_store_id: storeId,
        p_actor_user_id: ownerId,
        p_target_user_id: staffUserId,
        p_scope: "catalog.manage",
        p_duration_hours: 2,
        p_reason: "Owner away",
        p_step_up_proof_id: invitationId,
      }),
    );
    expect(recordActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delegation.grant_denied",
        result: "failure",
        errorCode: "step_up_invalid_or_expired",
      }),
      { strict: true },
    );
  });

  test("allows an owner to grant temporary access with activity proof", async () => {
    mockTenant("owner");
    const rpc = vi.fn(async () => ({
      data: {
        ok: true,
        code: "delegation_granted",
        storeId,
        delegationId: invitationId,
        targetId: staffUserId,
        targetLabel: "Cashier User",
        scope: "catalog.manage",
        actorName: "Owner User",
        expiresAt: "2999-05-25T00:00:00.000Z",
        updatedAt: "2026-05-26T00:00:00.000Z",
      },
      error: null,
    }));
    vi.mocked(getSupabaseAdminClient).mockReturnValue({ rpc } as never);

    const result = await grantPrivilegeDelegationFormAction(
      { success: false },
      makeForm({
        userId: staffUserId,
        scope: "catalog.manage",
        durationHours: "2",
        reason: "Owner away",
        confirmText: "GRANT",
        stepUpProofId: invitationId,
      }),
    );

    expect(result).toMatchObject({ success: true });
    expect(rpc).toHaveBeenCalledWith(
      "grant_privilege_delegation",
      {
        p_store_id: storeId,
        p_actor_user_id: ownerId,
        p_target_user_id: staffUserId,
        p_scope: "catalog.manage",
        p_duration_hours: 2,
        p_reason: "Owner away",
        p_step_up_proof_id: invitationId,
      },
    );
    expect(recordActivityEvent).not.toHaveBeenCalled();
  });

  test("denies overlapping delegation grants at the RPC boundary", async () => {
    mockTenant("owner");
    const rpc = vi.fn(async () => ({
      data: {
        ok: false,
        code: "delegation_already_active",
        delegationId: invitationId,
        targetId: staffUserId,
        targetLabel: "Cashier User",
        scope: "catalog.manage",
        expiresAt: "2999-05-25T00:00:00.000Z",
      },
      error: null,
    }));
    vi.mocked(getSupabaseAdminClient).mockReturnValue({ rpc } as never);

    const result = await grantPrivilegeDelegationFormAction(
      { success: false },
      makeForm({
        userId: staffUserId,
        scope: "catalog.manage",
        durationHours: "2",
        reason: "Owner away",
        confirmText: "GRANT",
        stepUpProofId: invitationId,
      }),
    );

    expect(result).toMatchObject({
      success: false,
      error: "Catalog Management is already active for Cashier User.",
    });
    expect(rpc).toHaveBeenCalledWith(
      "grant_privilege_delegation",
      expect.objectContaining({
        p_store_id: storeId,
        p_actor_user_id: ownerId,
        p_target_user_id: staffUserId,
        p_scope: "catalog.manage",
        p_step_up_proof_id: invitationId,
      }),
    );
    expect(recordActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delegation.grant_denied",
        actionScope: "staff.manage",
        privilegeSource: "owner_role",
        targetType: "user",
        targetId: staffUserId,
        errorCode: "delegation_already_active",
      }),
      { strict: true },
    );
  });

  test("allows an owner to revoke same-store temporary access with activity proof", async () => {
    mockTenant("owner");
    const rpc = vi.fn(async () => ({
      data: {
        ok: true,
        code: "delegation_revoked",
        delegationId: invitationId,
        targetId: staffUserId,
        targetLabel: "Cashier User",
        scope: "inventory.adjust",
      },
      error: null,
    }));
    vi.mocked(getSupabaseAdminClient).mockReturnValue({ rpc } as never);

    await expect(
      revokePrivilegeDelegationAction({ success: false }, makeForm({
        delegationId: invitationId,
        confirmText: "REVOKE",
      })),
    ).resolves.toMatchObject({
      success: true,
      message: "Temporary access revoked from Cashier User.",
    });

    expect(rpc).toHaveBeenCalledWith("revoke_privilege_delegation", {
      p_delegation_id: invitationId,
      p_actor_user_id: ownerId,
    });
    expect(recordActivityEvent).not.toHaveBeenCalled();
  });

  test("allows an active cashier checkout and records cashier privilege source", async () => {
    mockTenant("cashier");
    const rpc = vi.fn(async () => ({
      data: { invoice_id: invoiceId, was_replayed: false },
      error: null,
    }));
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
        p_idempotency_key: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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

  test("returns an idempotent checkout replay without duplicating activity", async () => {
    mockTenant("cashier");
    const rpc = vi.fn(async () => ({
      data: { invoice_id: invoiceId, was_replayed: true },
      error: null,
    }));
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
    expect(rpc).toHaveBeenCalledWith(
      "create_invoice_and_deduct_stock",
      expect.objectContaining({
        p_idempotency_key: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    );
    expect(recordActivityEvent).not.toHaveBeenCalled();
  });

  test("allows an active cashier profile update without granting store settings", async () => {
    mockTenant("cashier");
    const usersQuery = createAwaitableQuery({ error: null });
    const from = vi.fn(() => usersQuery);
    vi.mocked(getSupabaseAdminClient).mockReturnValue({ from } as never);

    await expect(updateProfileAction({ name: "Mina Cashier" })).resolves.toBe(true);

    expect(getSupabaseServerClient).not.toHaveBeenCalled();
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
