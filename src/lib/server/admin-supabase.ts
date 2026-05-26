import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

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
  | "staff.manage";
type DelegatableActivityScope =
  | "catalog.manage"
  | "inventory.adjust"
  | "reports.export"
  | "invoice.correct";

type ActivityEventJson = Record<string, unknown>;

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

type ActivityEventRow = ActivityEventInsert & {
  id: string;
  delegation_id: string | null;
  request_id: string;
  occurred_at: string;
  created_at: string;
};

type StaffInvitationStatus = "pending" | "accepted" | "expired" | "revoked";
type UserStatus = "active" | "suspended";

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

type AdminDatabase = {
  public: {
    Tables: {
      activity_events: {
        Row: ActivityEventRow;
        Insert: ActivityEventInsert;
        Update: Record<string, never>;
        Relationships: [];
      };
      staff_invitations: {
        Row: StaffInvitationRow;
        Insert: StaffInvitationInsert;
        Update: StaffInvitationUpdate;
        Relationships: [];
      };
      users: {
        Row: StaffProfileRow;
        Insert: StaffProfileInsert;
        Update: StaffProfileUpdate;
        Relationships: [];
      };
      privilege_delegations: {
        Row: PrivilegeDelegationRow;
        Insert: PrivilegeDelegationInsert;
        Update: PrivilegeDelegationUpdate;
        Relationships: [];
      };
      product_variants: {
        Row: ProductVariantRow;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      inventory: {
        Row: InventoryRow;
        Insert: Record<string, never>;
        Update: InventoryUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      upsert_product_and_variants_for_delegation: {
        Args: {
          p_store_id: string;
          p_actor_user_id: string;
          p_delegation_id: string;
          p_product_id: string | null;
          p_name: string;
          p_category: string;
          p_low_stock_threshold: number;
          p_deleted_variant_ids: string[];
          p_variants: Json;
        };
        Returns: string;
      };
      bulk_upsert_products_and_variants_for_delegation: {
        Args: {
          p_store_id: string;
          p_actor_user_id: string;
          p_delegation_id: string;
          p_products: Json;
        };
        Returns: number;
      };
      delete_product_for_delegation: {
        Args: {
          p_store_id: string;
          p_actor_user_id: string;
          p_delegation_id: string;
          p_product_id: string;
        };
        Returns: boolean;
      };
      set_product_favorite_for_delegation: {
        Args: {
          p_store_id: string;
          p_actor_user_id: string;
          p_delegation_id: string;
          p_product_id: string;
          p_is_favorite: boolean;
        };
        Returns: boolean;
      };
    };
  };
};

type AdminSupabaseClient = SupabaseClient<AdminDatabase>;

let adminClient: AdminSupabaseClient | null = null;

export function getSupabaseAdminClient(): AdminSupabaseClient {
  if (adminClient) {
    return adminClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin credentials are not configured.");
  }

  adminClient = createClient<AdminDatabase>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return adminClient;
}
