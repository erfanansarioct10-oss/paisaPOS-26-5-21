import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import type { Invoice, InvoiceItem, Product, ProductVariant, Profile, StoreMetadata } from "@/lib/store/types";
import type { Database } from "@/shared/supabase/database.types";
import {
  ACTIVE_STAFF_DELEGATION_PRIVILEGES,
  canUseRolePrivilege,
  filterActiveStaffDelegations,
  formatStaffPrivilege,
  type StaffPrivilege,
} from "@/lib/staff-capabilities";
import {
  getSupabaseAdminClient,
  type PrivilegeDelegationRow,
  type StaffInvitationRow,
  type StaffProfileRow,
} from "@/server/supabase/admin-supabase";
import { logRawServerError } from "@/server/logging/error-logging";

type ActivityRole = "owner" | "cashier";
type ActivityResult = "success" | "failure";
type UserStatus = "active" | "suspended";
type StaffInvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export type CurrentUserDTO = {
  id: string;
  email?: string;
};

export type TenantContextDTO = {
  user: Profile;
  store: StoreMetadata;
};

export type CurrentUserFailureReason = "unauthenticated" | "auth_unavailable";
export type CurrentUserResult =
  | { ok: true; user: CurrentUserDTO }
  | { ok: false; reason: CurrentUserFailureReason; message: string };

export type TenantContextFailureReason =
  | CurrentUserFailureReason
  | "missing_profile"
  | "inactive_profile"
  | "store_missing"
  | "database_unavailable";

export type TenantContextResult =
  | { ok: true; context: TenantContextDTO }
  | { ok: false; reason: TenantContextFailureReason; message: string };

export class TenantContextError extends Error {
  readonly reason: TenantContextFailureReason;

  constructor(reason: TenantContextFailureReason, message: string) {
    super(message);
    this.name = "TenantContextError";
    this.reason = reason;
  }
}

export type StoreSnapshotDTO = {
  products: Product[];
  variants: ProductVariant[];
  invoices: Invoice[];
};

export type CheckoutInvoiceDTO = Invoice & {
  invoice_items: InvoiceItem[];
};

export type ActivityEventDTO = {
  id: string;
  actorUserId: string | null;
  actorName: string;
  actorRole: ActivityRole | null;
  privilegeSource: string | null;
  delegationId: string | null;
  action: string;
  actionLabel: string;
  actionScope: string | null;
  targetType: string;
  targetId: string | null;
  targetLabel: string | null;
  summary: string;
  result: ActivityResult;
  errorCode: string | null;
  occurredAt: string;
};

export type ActivityActorFilterDTO = {
  id: string;
  name: string;
  role: ActivityRole | null;
};

export type ActivityActionFilterDTO = {
  action: string;
  label: string;
};

export type ActivityEventFilterInput = {
  q?: string | string[];
  actor?: string | string[];
  action?: string | string[];
  result?: string | string[];
  from?: string | string[];
  to?: string | string[];
  cursor?: string | string[];
  limit?: string | string[] | number;
};

export type ActivityEventFiltersDTO = {
  search: string;
  actorId: string;
  action: string;
  result: "all" | ActivityResult;
  fromDate: string;
  toDate: string;
  cursor: string;
  limit: number;
};

export type ActivityEventsDTO = {
  events: ActivityEventDTO[];
  actors: ActivityActorFilterDTO[];
  actions: ActivityActionFilterDTO[];
  filters: ActivityEventFiltersDTO;
  nextCursor: string | null;
  storeName: string;
};

export type StaffMemberDTO = {
  id: string;
  name: string;
  email: string | null;
  emailSource: "current_user" | "accepted_invitation" | "not_recorded";
  role: ActivityRole;
  status: UserStatus;
  invitedByUserId: string | null;
  suspendedAt: string | null;
  suspendedByUserId: string | null;
  createdAt: string;
  isCurrentUser: boolean;
};

export type StaffInvitationDTO = {
  id: string;
  email: string;
  role: ActivityRole;
  status: StaffInvitationStatus;
  displayStatus: StaffInvitationStatus;
  invitedByUserId: string;
  acceptedByUserId: string | null;
  acceptedAt: string | null;
  revokedByUserId: string | null;
  revokedAt: string | null;
  expiresAt: string;
  createdAt: string;
};

export type StaffDelegationDTO = {
  id: string;
  staffUserId: string;
  staffName: string;
  grantedByUserId: string;
  grantedByName: string;
  scope: StaffPrivilege;
  scopeLabel: string;
  reason: string;
  startsAt: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
};

export type StaffManagementFilterInput = {
  staffPage?: string | string[] | number;
  invitePage?: string | string[] | number;
  delegationPage?: string | string[] | number;
  staffLimit?: string | string[] | number;
  inviteLimit?: string | string[] | number;
  delegationLimit?: string | string[] | number;
};

export type StaffManagementFiltersDTO = {
  staffPage: number;
  invitePage: number;
  delegationPage: number;
  staffLimit: number;
  inviteLimit: number;
  delegationLimit: number;
};

export type StaffManagementListPaginationDTO = {
  page: number;
  pageSize: number;
  total: number;
  hasPrevious: boolean;
  hasNext: boolean;
  previousPage: number | null;
  nextPage: number | null;
};

export type StaffManagementDTO = {
  storeName: string;
  currentUserId: string;
  staff: StaffMemberDTO[];
  invitations: StaffInvitationDTO[];
  activeDelegations: StaffDelegationDTO[];
  filters: StaffManagementFiltersDTO;
  pagination: {
    staff: StaffManagementListPaginationDTO;
    invitations: StaffManagementListPaginationDTO;
    activeDelegations: StaffManagementListPaginationDTO;
  };
  counts: {
    activeCashiers: number;
    suspendedCashiers: number;
    pendingInvites: number;
    activeDelegations: number;
  };
};

type ActivityCursor = {
  id: string;
  occurredAt: string;
};

type ActivityEventSelectRow = {
  id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  privilege_source: string | null;
  delegation_id: string | null;
  action: string;
  action_scope: string | null;
  target_type: string;
  target_id: string | null;
  target_label: string | null;
  summary: string;
  result: string;
  error_code: string | null;
  occurred_at: string;
};

type ActivityLookupRow = {
  actor_user_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
};

const ACTIVITY_PAGE_SIZE = 25;
const MAX_ACTIVITY_PAGE_SIZE = 100;
const STAFF_DIRECTORY_PAGE_SIZE = 50;
const STAFF_INVITATION_PAGE_SIZE = 50;
const STAFF_DELEGATION_PAGE_SIZE = 50;
const MAX_STAFF_LIST_PAGE_SIZE = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ACTION_PATTERN = /^[a-z0-9._:-]{3,80}$/i;

const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  "checkout.created": "Checkout Created",
  "checkout.failed": "Checkout Failed",
  "product.created": "Product Created",
  "product.updated": "Product Updated",
  "product.deleted": "Product Deleted",
  "product.create_failed": "Product Create Failed",
  "product.update_failed": "Product Update Failed",
  "product.delete_failed": "Product Delete Failed",
  "product.imported": "Catalog Imported",
  "product.import_failed": "Catalog Import Failed",
  "inventory.adjusted": "Inventory Adjusted",
  "inventory.adjust_failed": "Inventory Adjust Failed",
  "favorite.toggled": "Favorite Updated",
  "favorite.toggle_failed": "Favorite Update Failed",
  "store.updated": "Store Updated",
  "store.update_failed": "Store Update Failed",
  "profile.updated": "Profile Updated",
  "profile.update_failed": "Profile Update Failed",
  "staff.invited": "Staff Invited",
  "staff.invite_failed": "Staff Invite Failed",
  "staff.invite_resent": "Staff Invite Resent",
  "staff.invite_resend_failed": "Staff Invite Resend Failed",
  "staff.invite_accepted": "Staff Invite Accepted",
  "staff.invite_revoked": "Staff Invite Revoked",
  "staff.suspended": "Staff Suspended",
  "staff.reactivated": "Staff Reactivated",
  "delegation.granted": "Delegation Granted",
  "delegation.revoked": "Delegation Revoked",
};

function firstParam(value: string | string[] | number | undefined): string {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : "";
  }
  if (typeof value === "number") {
    return String(value);
  }
  return typeof value === "string" ? value : "";
}

function sanitizeSearchParam(value: string): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/[%,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function normalizeDateParam(value: string): string {
  const trimmed = value.trim();
  if (!DATE_PATTERN.test(trimmed)) {
    return "";
  }
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? "" : trimmed;
}

function nepalDateToUtcIso(date: string, boundary: "start" | "end"): string {
  const time = boundary === "start" ? "00:00:00.000" : "23:59:59.999";
  return new Date(`${date}T${time}+05:45`).toISOString();
}

function normalizeActivityRole(value: string | null): ActivityRole | null {
  if (value === "owner" || value === "cashier") {
    return value;
  }
  return null;
}

function normalizeActivityResult(value: string): ActivityResult {
  return value === "failure" ? "failure" : "success";
}

export function formatActivityAction(action: string): string {
  if (ACTIVITY_ACTION_LABELS[action]) {
    return ACTIVITY_ACTION_LABELS[action];
  }

  return action
    .replace(/[._:-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function normalizeActivityFilters(input: ActivityEventFilterInput = {}): ActivityEventFiltersDTO {
  const rawLimit = Number.parseInt(firstParam(input.limit), 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), MAX_ACTIVITY_PAGE_SIZE)
    : ACTIVITY_PAGE_SIZE;

  const actorId = firstParam(input.actor).trim();
  const action = firstParam(input.action).trim();
  const result = firstParam(input.result).trim();
  const fromDate = normalizeDateParam(firstParam(input.from));
  const toDate = normalizeDateParam(firstParam(input.to));
  const cursor = firstParam(input.cursor).trim();

  return {
    search: sanitizeSearchParam(firstParam(input.q)),
    actorId: UUID_PATTERN.test(actorId) ? actorId : "",
    action: ACTION_PATTERN.test(action) ? action : "",
    result: result === "success" || result === "failure" ? result : "all",
    fromDate,
    toDate,
    cursor,
    limit,
  };
}

function normalizePositiveInteger(value: string | string[] | number | undefined, fallback: number, max: number): number {
  const parsed = Number.parseInt(firstParam(value), 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, 1), max);
}

export function normalizeStaffManagementFilters(
  input: StaffManagementFilterInput = {},
): StaffManagementFiltersDTO {
  return {
    staffPage: normalizePositiveInteger(input.staffPage, 1, 10_000),
    invitePage: normalizePositiveInteger(input.invitePage, 1, 10_000),
    delegationPage: normalizePositiveInteger(input.delegationPage, 1, 10_000),
    staffLimit: normalizePositiveInteger(input.staffLimit, STAFF_DIRECTORY_PAGE_SIZE, MAX_STAFF_LIST_PAGE_SIZE),
    inviteLimit: normalizePositiveInteger(input.inviteLimit, STAFF_INVITATION_PAGE_SIZE, MAX_STAFF_LIST_PAGE_SIZE),
    delegationLimit: normalizePositiveInteger(input.delegationLimit, STAFF_DELEGATION_PAGE_SIZE, MAX_STAFF_LIST_PAGE_SIZE),
  };
}

function getPageRange(page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  return {
    from,
    to: from + pageSize - 1,
  };
}

function getListPagination(page: number, pageSize: number, total: number): StaffManagementListPaginationDTO {
  const hasPrevious = page > 1;
  const hasNext = page * pageSize < total;

  return {
    page,
    pageSize,
    total,
    hasPrevious,
    hasNext,
    previousPage: hasPrevious ? page - 1 : null,
    nextPage: hasNext ? page + 1 : null,
  };
}

export function encodeActivityCursor(event: Pick<ActivityEventDTO, "id" | "occurredAt">): string {
  const payload: ActivityCursor = {
    id: event.id,
    occurredAt: event.occurredAt,
  };

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeActivityCursor(cursor: string): ActivityCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<ActivityCursor>;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.occurredAt !== "string" ||
      !UUID_PATTERN.test(parsed.id) ||
      Number.isNaN(new Date(parsed.occurredAt).getTime())
    ) {
      return null;
    }

    return {
      id: parsed.id,
      occurredAt: parsed.occurredAt,
    };
  } catch {
    return null;
  }
}

function mapActivityEvent(row: ActivityEventSelectRow): ActivityEventDTO {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name?.trim() || "Unknown user",
    actorRole: normalizeActivityRole(row.actor_role),
    privilegeSource: row.privilege_source,
    delegationId: row.delegation_id,
    action: row.action,
    actionLabel: formatActivityAction(row.action),
    actionScope: row.action_scope,
    targetType: row.target_type,
    targetId: row.target_id,
    targetLabel: row.target_label,
    summary: row.summary,
    result: normalizeActivityResult(row.result),
    errorCode: row.error_code,
    occurredAt: row.occurred_at,
  };
}

function normalizeStaffRole(value: string | null | undefined): ActivityRole {
  return value === "owner" ? "owner" : "cashier";
}

function normalizeUserStatus(value: string | null | undefined): UserStatus {
  return value === "suspended" ? "suspended" : "active";
}

function normalizeInvitationStatus(value: string | null | undefined): StaffInvitationStatus {
  if (value === "accepted" || value === "expired" || value === "revoked") {
    return value;
  }
  return "pending";
}

function mapInvitation(row: StaffInvitationRow): StaffInvitationDTO {
  const status = normalizeInvitationStatus(row.status);
  const isExpired = status === "pending" && new Date(row.expires_at).getTime() <= Date.now();

  return {
    id: row.id,
    email: row.email,
    role: normalizeStaffRole(row.role),
    status,
    displayStatus: isExpired ? "expired" : status,
    invitedByUserId: row.invited_by_user_id,
    acceptedByUserId: row.accepted_by_user_id,
    acceptedAt: row.accepted_at,
    revokedByUserId: row.revoked_by_user_id,
    revokedAt: row.revoked_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export const getSupabaseServerClient = cache(async () => {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // The same client is used in read-only server component contexts.
        }
      },
    },
  });
});

function isMissingAuthSession(message: string | undefined) {
  return /auth session missing/i.test(message ?? "");
}

export const getCurrentUserResult = cache(async (): Promise<CurrentUserResult> => {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      if (isMissingAuthSession(error?.message) || !user) {
        return {
          ok: false,
          reason: "unauthenticated",
          message: "Please sign in to continue.",
        };
      }

      await logRawServerError("AUTH_USER_LOOKUP_FAILED", "Current user lookup failed", error);
      return {
        ok: false,
        reason: "auth_unavailable",
        message: "Authentication is temporarily unavailable. Please try again.",
      };
    }

    return {
      ok: true,
      user: {
        id: user.id,
        email: user.email,
      },
    };
  } catch (error: unknown) {
    unstable_rethrow(error);
    await logRawServerError("AUTH_USER_LOOKUP_EXCEPTION", "Current user lookup threw", error);
    return {
      ok: false,
      reason: "auth_unavailable",
      message: "Authentication is temporarily unavailable. Please try again.",
    };
  }
});

export const getCurrentUser = cache(async (): Promise<CurrentUserDTO | null> => {
  const result = await getCurrentUserResult();
  return result.ok ? result.user : null;
});

export async function requireCurrentUser(): Promise<CurrentUserDTO> {
  const result = await getCurrentUserResult();
  if (!result.ok) {
    throw new TenantContextError(result.reason, result.message);
  }
  return result.user;
}

export const getCurrentTenantContextResult = cache(async (): Promise<TenantContextResult> => {
  const userResult = await getCurrentUserResult();
  if (!userResult.ok) {
    return userResult;
  }

  const user = userResult.user;

  try {
    const supabase = await getSupabaseServerClient();
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("id, name, store_id, role, status")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      await logRawServerError("TENANT_PROFILE_LOOKUP_FAILED", "Profile lookup failed", profileError, {
        userId: user.id,
      });
      return {
        ok: false,
        reason: "database_unavailable",
        message: "Store profile lookup is temporarily unavailable. Please try again.",
      };
    }

    if (!profile?.store_id) {
      return {
        ok: false,
        reason: "missing_profile",
        message: "Store profile not found",
      };
    }

    const status = normalizeUserStatus(profile.status);
    if (status !== "active") {
      return {
        ok: false,
        reason: "inactive_profile",
        message: "This staff account is suspended. Please contact the store owner.",
      };
    }

    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select("id, name, phone, address, pan_vat")
      .eq("id", profile.store_id)
      .maybeSingle();

    if (storeError) {
      await logRawServerError("TENANT_STORE_LOOKUP_FAILED", "Store lookup failed", storeError, {
        userId: user.id,
        storeId: profile.store_id,
      });
      return {
        ok: false,
        reason: "database_unavailable",
        message: "Store metadata is temporarily unavailable. Please try again.",
      };
    }

    if (!store) {
      return {
        ok: false,
        reason: "store_missing",
        message: "Store profile not found",
      };
    }

    return {
      ok: true,
      context: {
        user: {
          id: profile.id,
          name: profile.name,
          store_id: profile.store_id,
          email: user.email,
          role: profile.role,
          status,
        },
        store: {
          id: store.id,
          name: store.name,
          phone: store.phone ?? "",
          address: store.address ?? "",
          pan_vat: store.pan_vat ?? "",
        },
      },
    };
  } catch (error: unknown) {
    unstable_rethrow(error);
    await logRawServerError("TENANT_CONTEXT_LOOKUP_EXCEPTION", "Tenant context lookup threw", error, {
      userId: user.id,
    });
    return {
      ok: false,
      reason: "database_unavailable",
      message: "Store data is temporarily unavailable. Please try again.",
    };
  }
});

export const getCurrentTenantContext = cache(async (): Promise<TenantContextDTO | null> => {
  const result = await getCurrentTenantContextResult();
  return result.ok ? result.context : null;
});

export async function requireTenantContext(): Promise<TenantContextDTO> {
  const result = await getCurrentTenantContextResult();
  if (!result.ok) {
    throw new TenantContextError(result.reason, result.message);
  }
  return result.context;
}

function assertRolePrivilegeContext(context: TenantContextDTO, privilege: StaffPrivilege): TenantContextDTO {
  if (!canUseRolePrivilege(context.user, privilege)) {
    throw new Error(`Unauthorized: Missing privilege ${privilege}.`);
  }
  return context;
}

export async function requireRolePrivilegeContext(privilege: StaffPrivilege): Promise<TenantContextDTO> {
  return assertRolePrivilegeContext(await requireTenantContext(), privilege);
}

export async function requireOwnerContext(): Promise<TenantContextDTO> {
  return requireRolePrivilegeContext("staff.manage");
}

export async function assertStoreAccess(storeId: string): Promise<TenantContextDTO> {
  const context = await requireTenantContext();
  if (context.store.id !== storeId) {
    throw new Error("Unauthorized: Store ownership mismatch");
  }
  return context;
}

export async function getStoreSnapshotDTO(): Promise<StoreSnapshotDTO> {
  const context = await requireTenantContext();
  const supabase = await getSupabaseServerClient();

  const [productsResult, variantsResult, invoicesResult] = await Promise.all([
    supabase
      .from("products")
      .select("id, store_id, name, category, image_url, low_stock_threshold, is_favorite, created_at")
      .eq("store_id", context.store.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("product_variants")
      .select("id, product_id, size, color, sku, price, created_at, inventory(quantity)")
      .eq("store_id", context.store.id),
    supabase
      .from("invoices")
      .select("id, store_id, invoice_number, customer_name, customer_phone, total_amount, discount_amount, paid_amount, payment_method, sold_by_user_id, sold_by_name, sold_by_role, sold_with_delegation_id, created_at")
      .eq("store_id", context.store.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (productsResult.error) throw new Error(productsResult.error.message);
  if (variantsResult.error) throw new Error(variantsResult.error.message);
  if (invoicesResult.error) throw new Error(invoicesResult.error.message);

  const variants = (variantsResult.data ?? []).map((variant: unknown) => {
    const item = variant as ProductVariant & {
      price: string | number;
      inventory?: { quantity: number }[] | { quantity: number } | null;
    };
    const inventory = Array.isArray(item.inventory) ? item.inventory[0] : item.inventory;

    return {
      id: item.id,
      product_id: item.product_id,
      size: item.size,
      color: item.color,
      sku: item.sku,
      price: Number(item.price),
      stock: inventory?.quantity ?? 0,
      created_at: item.created_at,
    };
  });

  return {
    products: (productsResult.data ?? []) as Product[],
    variants,
    invoices: (invoicesResult.data ?? []) as Invoice[],
  };
}

export async function getInvoiceReceiptDTO(invoiceId: string): Promise<CheckoutInvoiceDTO> {
  const context = await requireTenantContext();
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from("invoices")
    .select(`
      id,
      store_id,
      invoice_number,
      customer_name,
      customer_phone,
      total_amount,
      discount_amount,
      paid_amount,
      payment_method,
      sold_by_user_id,
      sold_by_name,
      sold_by_role,
      sold_with_delegation_id,
      created_at,
      invoice_items (
        id,
        invoice_id,
        variant_id,
        custom_name,
        quantity,
        unit_price,
        subtotal
      )
    `)
    .eq("id", invoiceId)
    .eq("store_id", context.store.id)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Invoice not found");
  }

  const { invoice_items: invoiceItems, ...invoice } = data as CheckoutInvoiceDTO;
  return {
    ...invoice,
    invoice_items: invoiceItems ?? [],
  };
}

export async function getActivityEventsDTO(
  input: ActivityEventFilterInput = {},
  tenantContext?: TenantContextDTO,
): Promise<ActivityEventsDTO> {
  const context = tenantContext
    ? assertRolePrivilegeContext(tenantContext, "activity.read")
    : await requireRolePrivilegeContext("activity.read");
  const supabase = await getSupabaseServerClient();
  const filters = normalizeActivityFilters(input);

  let eventsQuery = supabase
    .from("activity_events")
    .select(`
      id,
      actor_user_id,
      actor_name,
      actor_role,
      privilege_source,
      delegation_id,
      action,
      action_scope,
      target_type,
      target_id,
      target_label,
      summary,
      result,
      error_code,
      occurred_at
    `)
    .eq("store_id", context.store.id)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(filters.limit + 1);

  if (filters.search) {
    eventsQuery = eventsQuery.textSearch("search_vector", filters.search, {
      config: "simple",
      type: "websearch",
    });
  }

  if (filters.actorId) {
    eventsQuery = eventsQuery.eq("actor_user_id", filters.actorId);
  }

  if (filters.action) {
    eventsQuery = eventsQuery.eq("action", filters.action);
  }

  if (filters.result !== "all") {
    eventsQuery = eventsQuery.eq("result", filters.result);
  }

  if (filters.fromDate) {
    eventsQuery = eventsQuery.gte("occurred_at", nepalDateToUtcIso(filters.fromDate, "start"));
  }

  if (filters.toDate) {
    eventsQuery = eventsQuery.lte("occurred_at", nepalDateToUtcIso(filters.toDate, "end"));
  }

  const cursor = filters.cursor ? decodeActivityCursor(filters.cursor) : null;
  if (cursor) {
    eventsQuery = eventsQuery.or(
      `occurred_at.lt.${cursor.occurredAt},and(occurred_at.eq.${cursor.occurredAt},id.lt.${cursor.id})`,
    );
  }

  const lookupQuery = supabase
    .from("activity_events")
    .select("actor_user_id, actor_name, actor_role, action")
    .eq("store_id", context.store.id)
    .order("occurred_at", { ascending: false })
    .limit(500);

  const [eventsResult, lookupResult] = await Promise.all([eventsQuery, lookupQuery]);

  if (eventsResult.error) {
    throw new Error(eventsResult.error.message);
  }
  if (lookupResult.error) {
    throw new Error(lookupResult.error.message);
  }

  const rows = ((eventsResult.data ?? []) as ActivityEventSelectRow[]).map(mapActivityEvent);
  const events = rows.slice(0, filters.limit);
  const nextCursor = rows.length > filters.limit ? encodeActivityCursor(events[events.length - 1]) : null;

  const actorsById = new Map<string, ActivityActorFilterDTO>();
  const actionsByName = new Map<string, ActivityActionFilterDTO>();
  for (const row of (lookupResult.data ?? []) as ActivityLookupRow[]) {
    if (row.actor_user_id && !actorsById.has(row.actor_user_id)) {
      actorsById.set(row.actor_user_id, {
        id: row.actor_user_id,
        name: row.actor_name?.trim() || "Unknown user",
        role: normalizeActivityRole(row.actor_role),
      });
    }
    if (row.action && !actionsByName.has(row.action)) {
      actionsByName.set(row.action, {
        action: row.action,
        label: formatActivityAction(row.action),
      });
    }
  }

  if (filters.action && !actionsByName.has(filters.action)) {
    actionsByName.set(filters.action, {
      action: filters.action,
      label: formatActivityAction(filters.action),
    });
  }

  return {
    events,
    actors: [...actorsById.values()].sort((a, b) => a.name.localeCompare(b.name)),
    actions: [...actionsByName.values()].sort((a, b) => a.label.localeCompare(b.label)),
    filters,
    nextCursor,
    storeName: context.store.name,
  };
}

export async function getStaffManagementDTO(
  input: StaffManagementFilterInput = {},
  tenantContext?: TenantContextDTO,
): Promise<StaffManagementDTO> {
  const context = tenantContext
    ? assertRolePrivilegeContext(tenantContext, "staff.manage")
    : await requireRolePrivilegeContext("staff.manage");
  const adminClient = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const filters = normalizeStaffManagementFilters(input);
  const staffRange = getPageRange(filters.staffPage, filters.staffLimit);
  const invitationRange = getPageRange(filters.invitePage, filters.inviteLimit);
  const delegationRange = getPageRange(filters.delegationPage, filters.delegationLimit);

  const [
    staffResult,
    invitationResult,
    delegationResult,
    activeCashiersCountResult,
    suspendedCashiersCountResult,
    pendingInvitesCountResult,
  ] = await Promise.all([
    adminClient
      .from("users")
      .select("id, name, store_id, role, status, invited_by_user_id, suspended_at, suspended_by_user_id, created_at", {
        count: "exact",
      })
      .eq("store_id", context.store.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(staffRange.from, staffRange.to),
    adminClient
      .from("staff_invitations")
      .select("id, store_id, email, role, status, invited_by_user_id, accepted_by_user_id, accepted_at, revoked_by_user_id, revoked_at, expires_at, created_at", {
        count: "exact",
      })
      .eq("store_id", context.store.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(invitationRange.from, invitationRange.to),
    adminClient
      .from("privilege_delegations")
      .select("id, store_id, granted_to_user_id, granted_by_user_id, scope, reason, starts_at, expires_at, revoked_at, revoked_by_user_id, created_at", {
        count: "exact",
      })
      .eq("store_id", context.store.id)
      .in("scope", [...ACTIVE_STAFF_DELEGATION_PRIVILEGES])
      .is("revoked_at", null)
      .lte("starts_at", now)
      .gt("expires_at", now)
      .order("expires_at", { ascending: true })
      .order("id", { ascending: true })
      .range(delegationRange.from, delegationRange.to),
    adminClient
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("store_id", context.store.id)
      .eq("role", "cashier")
      .eq("status", "active"),
    adminClient
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("store_id", context.store.id)
      .eq("role", "cashier")
      .eq("status", "suspended"),
    adminClient
      .from("staff_invitations")
      .select("id", { count: "exact", head: true })
      .eq("store_id", context.store.id)
      .eq("status", "pending")
      .gt("expires_at", now),
  ]);

  if (staffResult.error) {
    throw new Error(staffResult.error.message);
  }
  if (invitationResult.error) {
    throw new Error(invitationResult.error.message);
  }
  if (delegationResult.error) {
    throw new Error(delegationResult.error.message);
  }
  if (activeCashiersCountResult.error) {
    throw new Error(activeCashiersCountResult.error.message);
  }
  if (suspendedCashiersCountResult.error) {
    throw new Error(suspendedCashiersCountResult.error.message);
  }
  if (pendingInvitesCountResult.error) {
    throw new Error(pendingInvitesCountResult.error.message);
  }

  const staffRows = (staffResult.data ?? []) as StaffProfileRow[];
  const staffNames = new Map(staffRows.map((row) => [row.id, row.name]));
  const staffEmailByUserId = new Map<string, string>();
  if (context.user.email) {
    staffEmailByUserId.set(context.user.id, context.user.email);
  }

  const staffUserIds = staffRows.map((row) => row.id);
  if (staffUserIds.length > 0) {
    const { data: acceptedEmailRows, error: acceptedEmailError } = await adminClient
      .from("staff_invitations")
      .select("id, accepted_by_user_id, accepted_at, email")
      .eq("store_id", context.store.id)
      .eq("status", "accepted")
      .in("accepted_by_user_id", staffUserIds)
      .order("accepted_at", { ascending: false })
      .order("id", { ascending: false });

    if (acceptedEmailError) {
      throw new Error(acceptedEmailError.message);
    }

    for (const row of (acceptedEmailRows ?? []) as Array<
      Pick<StaffInvitationRow, "accepted_by_user_id" | "accepted_at" | "email" | "id">
    >) {
      if (row.accepted_by_user_id && !staffEmailByUserId.has(row.accepted_by_user_id)) {
        staffEmailByUserId.set(row.accepted_by_user_id, row.email);
      }
    }
  }

  const delegationRows = filterActiveStaffDelegations((delegationResult.data ?? []) as PrivilegeDelegationRow[]);
  const missingDelegationUserIds = [
    ...new Set(delegationRows.flatMap((delegation) => [delegation.granted_to_user_id, delegation.granted_by_user_id])),
  ].filter((userId) => !staffNames.has(userId));

  if (missingDelegationUserIds.length > 0) {
    const { data: delegationUserRows, error: delegationUserError } = await adminClient
      .from("users")
      .select("id, name")
      .eq("store_id", context.store.id)
      .in("id", missingDelegationUserIds);

    if (delegationUserError) {
      throw new Error(delegationUserError.message);
    }

    for (const row of (delegationUserRows ?? []) as Array<Pick<StaffProfileRow, "id" | "name">>) {
      staffNames.set(row.id, row.name);
    }
  }

  const staff: StaffMemberDTO[] = staffRows.map((row) => ({
    id: row.id,
    name: row.name,
    email: staffEmailByUserId.get(row.id) ?? null,
    emailSource: row.id === context.user.id
      ? "current_user"
      : staffEmailByUserId.has(row.id)
        ? "accepted_invitation"
        : "not_recorded",
    role: normalizeStaffRole(row.role),
    status: normalizeUserStatus(row.status),
    invitedByUserId: row.invited_by_user_id,
    suspendedAt: row.suspended_at,
    suspendedByUserId: row.suspended_by_user_id,
    createdAt: row.created_at,
    isCurrentUser: row.id === context.user.id,
  }));

  const invitations = ((invitationResult.data ?? []) as StaffInvitationRow[]).map(mapInvitation);
  const activeDelegations = delegationRows.map((delegation) => ({
    id: delegation.id,
    staffUserId: delegation.granted_to_user_id,
    staffName: staffNames.get(delegation.granted_to_user_id) ?? "Unknown cashier",
    grantedByUserId: delegation.granted_by_user_id,
    grantedByName: staffNames.get(delegation.granted_by_user_id) ?? "Store owner",
    scope: delegation.scope,
    scopeLabel: formatStaffPrivilege(delegation.scope),
    reason: delegation.reason,
    startsAt: delegation.starts_at,
    expiresAt: delegation.expires_at,
    revokedAt: delegation.revoked_at,
    createdAt: delegation.created_at,
  }));

  return {
    storeName: context.store.name,
    currentUserId: context.user.id,
    staff,
    invitations,
    activeDelegations,
    filters,
    pagination: {
      staff: getListPagination(filters.staffPage, filters.staffLimit, staffResult.count ?? staff.length),
      invitations: getListPagination(filters.invitePage, filters.inviteLimit, invitationResult.count ?? invitations.length),
      activeDelegations: getListPagination(
        filters.delegationPage,
        filters.delegationLimit,
        delegationResult.count ?? activeDelegations.length,
      ),
    },
    counts: {
      activeCashiers: activeCashiersCountResult.count ?? 0,
      suspendedCashiers: suspendedCashiersCountResult.count ?? 0,
      pendingInvites: pendingInvitesCountResult.count ?? 0,
      activeDelegations: delegationResult.count ?? activeDelegations.length,
    },
  };
}
