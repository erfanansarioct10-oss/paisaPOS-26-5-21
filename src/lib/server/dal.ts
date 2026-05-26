import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Invoice, InvoiceItem, Product, ProductVariant, Profile, StoreMetadata } from "@/lib/store/types";
import { formatStaffPrivilege, type StaffPrivilege } from "@/lib/staff-capabilities";
import {
  getSupabaseAdminClient,
  type PrivilegeDelegationRow,
  type StaffInvitationRow,
  type StaffProfileRow,
} from "@/lib/server/admin-supabase";

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

export type StaffManagementDTO = {
  storeName: string;
  currentUserId: string;
  staff: StaffMemberDTO[];
  invitations: StaffInvitationDTO[];
  activeDelegations: StaffDelegationDTO[];
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

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: Record<string, unknown>) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cookieStore.set({ name, value, ...options } as any);
        } catch {
          // The same client is used in read-only server component contexts.
        }
      },
      remove(name: string, options: Record<string, unknown>) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cookieStore.set({ name, value: "", ...options } as any);
        } catch {
          // Ignore read-only contexts.
        }
      },
    },
  });
});

export const getCurrentUser = cache(async (): Promise<CurrentUserDTO | null> => {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
  };
});

export async function requireCurrentUser(): Promise<CurrentUserDTO> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthenticated");
  }
  return user;
}

export const getCurrentTenantContext = cache(async (): Promise<TenantContextDTO | null> => {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const supabase = await getSupabaseServerClient();
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, name, store_id, role, status")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.store_id || normalizeUserStatus(profile.status) !== "active") {
    return null;
  }

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, name, phone, address, pan_vat")
    .eq("id", profile.store_id)
    .single();

  if (storeError || !store) {
    return null;
  }

  return {
    user: {
      id: profile.id,
      name: profile.name,
      store_id: profile.store_id,
      email: user.email,
      role: profile.role,
      status: normalizeUserStatus(profile.status),
    },
    store: {
      id: store.id,
      name: store.name,
      phone: store.phone ?? "",
      address: store.address ?? "",
      pan_vat: store.pan_vat ?? "",
    },
  };
});

export async function requireTenantContext(): Promise<TenantContextDTO> {
  const context = await getCurrentTenantContext();
  if (!context) {
    throw new Error("Store profile not found");
  }
  return context;
}

export async function requireOwnerContext(): Promise<TenantContextDTO> {
  const context = await requireTenantContext();
  if (context.user.role !== "owner") {
    throw new Error("Unauthorized: Only store owners can perform this action.");
  }
  return context;
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
): Promise<ActivityEventsDTO> {
  const context = await requireOwnerContext();
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
    const pattern = `%${filters.search}%`;
    eventsQuery = eventsQuery.or(
      [
        `actor_name.ilike.${pattern}`,
        `action.ilike.${pattern}`,
        `target_type.ilike.${pattern}`,
        `target_label.ilike.${pattern}`,
        `summary.ilike.${pattern}`,
      ].join(","),
    );
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

export async function getStaffManagementDTO(): Promise<StaffManagementDTO> {
  const context = await requireOwnerContext();
  const adminClient = getSupabaseAdminClient();
  const now = new Date().toISOString();

  const [staffResult, invitationResult, delegationResult] = await Promise.all([
    adminClient
      .from("users")
      .select("id, name, store_id, role, status, invited_by_user_id, suspended_at, suspended_by_user_id, created_at")
      .eq("store_id", context.store.id)
      .order("created_at", { ascending: true }),
    adminClient
      .from("staff_invitations")
      .select("id, store_id, email, role, status, invited_by_user_id, accepted_by_user_id, accepted_at, revoked_by_user_id, revoked_at, expires_at, created_at")
      .eq("store_id", context.store.id)
      .order("created_at", { ascending: false })
      .limit(100),
    adminClient
      .from("privilege_delegations")
      .select("id, store_id, granted_to_user_id, granted_by_user_id, scope, reason, starts_at, expires_at, revoked_at, revoked_by_user_id, created_at")
      .eq("store_id", context.store.id)
      .is("revoked_at", null)
      .lte("starts_at", now)
      .gt("expires_at", now)
      .order("expires_at", { ascending: true }),
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

  const staffRows = (staffResult.data ?? []) as StaffProfileRow[];
  const staffNames = new Map(staffRows.map((row) => [row.id, row.name]));

  const staff = staffRows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.id === context.user.id ? context.user.email ?? null : null,
    role: normalizeStaffRole(row.role),
    status: normalizeUserStatus(row.status),
    invitedByUserId: row.invited_by_user_id,
    suspendedAt: row.suspended_at,
    suspendedByUserId: row.suspended_by_user_id,
    createdAt: row.created_at,
    isCurrentUser: row.id === context.user.id,
  }));

  const invitations = ((invitationResult.data ?? []) as StaffInvitationRow[]).map(mapInvitation);
  const activeDelegations = ((delegationResult.data ?? []) as PrivilegeDelegationRow[]).map((delegation) => ({
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
    counts: {
      activeCashiers: staff.filter((member) => member.role === "cashier" && member.status === "active").length,
      suspendedCashiers: staff.filter((member) => member.role === "cashier" && member.status === "suspended").length,
      pendingInvites: invitations.filter((invite) => invite.displayStatus === "pending").length,
      activeDelegations: activeDelegations.length,
    },
  };
}
