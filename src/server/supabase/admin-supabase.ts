import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/shared/supabase/database.types";

type ActivityRole = "owner" | "cashier";
type ActivityResult = "success" | "failure";
type PrivilegeSource = "owner_role" | "cashier_role" | "delegation" | "system";
type ActivityScope =
  | "checkout.create"
  | "catalog.manage"
  | "inventory.adjust"
  | "store.settings"
  | "reports.export"
  | "invoice.correct"
  | "staff.manage"
  | "activity.read"
  | "profile.update";
type DelegatableActivityScope =
  | "catalog.manage"
  | "inventory.adjust";

type ActivityEventJson = Json;

export type ActivityEventInsert = {
  store_id: string;
  actor_user_id: string;
  actor_name: string;
  actor_email: string | null;
  actor_role: ActivityRole;
  privilege_source: PrivilegeSource;
  delegation_id?: string | null;
  action: string;
  action_scope: ActivityScope | null;
  target_type: string;
  target_id: string | null;
  target_label: string | null;
  summary: string;
  before_state: ActivityEventJson | null;
  after_state: ActivityEventJson | null;
  metadata: ActivityEventJson;
  result: ActivityResult;
  error_code: string | null;
  request_id?: string;
  occurred_at?: string;
  created_at?: string;
};

type StaffInvitationStatus = "pending" | "accepted" | "expired" | "revoked";
type UserStatus = "active" | "suspended";

export type StoreRow = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  pan_vat: string | null;
  created_at: string;
};

export type StaffInvitationInsert = {
  store_id: string;
  email: string;
  role?: ActivityRole;
  status?: StaffInvitationStatus;
  invited_by_user_id: string;
  accepted_by_user_id?: string | null;
  accepted_at?: string | null;
  revoked_by_user_id?: string | null;
  revoked_at?: string | null;
  expires_at: string;
  created_at?: string;
};

export type StaffInvitationUpdate = Partial<Omit<StaffInvitationInsert, "store_id" | "email" | "invited_by_user_id">>;

export type StaffInvitationRow = Required<
  Pick<StaffInvitationInsert, "store_id" | "email" | "invited_by_user_id" | "expires_at">
> & {
  id: string;
  role: ActivityRole;
  status: StaffInvitationStatus;
  accepted_by_user_id: string | null;
  accepted_at: string | null;
  revoked_by_user_id: string | null;
  revoked_at: string | null;
  created_at: string;
};

export type StaffInviteAcceptanceResult = {
  invitationId: string;
  storeId: string;
  acceptedAt: string;
  actorName: string;
  actorEmail: string;
  profileDisposition: "created" | "attached" | "existing";
  previousProfile: Json | null;
};

export type StaffLifecycleRpcResult = {
  ok: boolean;
  code: string;
  message?: string;
  storeId?: string;
  invitationId?: string;
  delegationId?: string;
  targetId?: string;
  targetLabel?: string | null;
  email?: string;
  scope?: DelegatableActivityScope;
  actorName?: string;
  expiresAt?: string;
  revokedDelegationCount?: number;
  revokedDelegationIds?: string[];
  revokedDelegationScopes?: DelegatableActivityScope[];
  updatedAt?: string;
};

export type StaffProfileUpdate = {
  name?: string;
  store_id?: string | null;
  role?: ActivityRole;
  status?: UserStatus;
  invited_by_user_id?: string | null;
  suspended_at?: string | null;
  suspended_by_user_id?: string | null;
};

export type StaffProfileInsert = {
  id: string;
  name: string;
  store_id: string;
  role: ActivityRole;
  status?: UserStatus;
  invited_by_user_id?: string | null;
};

export type StaffProfileRow = {
  id: string;
  name: string;
  store_id: string | null;
  role: ActivityRole;
  status: UserStatus;
  invited_by_user_id: string | null;
  suspended_at: string | null;
  suspended_by_user_id: string | null;
  created_at: string;
};

export type PrivilegeDelegationInsert = {
  store_id: string;
  granted_to_user_id: string;
  granted_by_user_id: string;
  scope: DelegatableActivityScope;
  reason: string;
  starts_at?: string;
  expires_at: string;
  revoked_at?: string | null;
  revoked_by_user_id?: string | null;
  created_at?: string;
};

export type PrivilegeDelegationUpdate = {
  revoked_at?: string | null;
  revoked_by_user_id?: string | null;
};

export type PrivilegeDelegationRow = Required<
  Pick<
    PrivilegeDelegationInsert,
    "store_id" | "granted_to_user_id" | "granted_by_user_id" | "scope" | "reason" | "expires_at"
  >
> & {
  id: string;
  starts_at: string;
  revoked_at: string | null;
  revoked_by_user_id: string | null;
  created_at: string;
};

export type StaffStepUpProofInsert = {
  store_id: string;
  user_id: string;
  purpose: "delegation.grant";
  assurance_level: "aal2";
  authentication_method?: string | null;
  authenticated_at: string;
  expires_at: string;
  used_at?: string | null;
};

export type StaffStepUpProofUpdate = {
  used_at?: string | null;
};

export type StaffStepUpProofRow = StaffStepUpProofInsert & {
  id: string;
  authentication_method: string | null;
  used_at: string | null;
  created_at: string;
};

export type ProductVariantRow = {
  id: string;
  product_id: string;
  store_id: string;
  size: string;
  color: string;
  sku: string;
  price: number;
  created_at?: string;
};

export type InventoryRow = {
  id: string;
  variant_id: string;
  store_id: string;
  quantity: number;
  updated_at: string | null;
};

export type InventoryUpdate = {
  quantity?: number;
  updated_at?: string;
};

type AdminSupabaseClient = SupabaseClient<Database>;

let adminClient: AdminSupabaseClient | null = null;
let emailAuthClient: SupabaseClient<Database> | null = null;

export function getSupabaseAdminClient(): AdminSupabaseClient {
  if (adminClient) {
    return adminClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const authAdminJwt = process.env.SUPABASE_AUTH_ADMIN_JWT;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin credentials are not configured.");
  }

  adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    ...(authAdminJwt
      ? {
          global: {
            headers: {
              Authorization: `Bearer ${authAdminJwt}`,
            },
          },
        }
      : {}),
  });

  return adminClient;
}

export function getSupabaseEmailAuthClient(): SupabaseClient<Database> {
  if (emailAuthClient) {
    return emailAuthClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase email auth credentials are not configured.");
  }

  emailAuthClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return emailAuthClient;
}
