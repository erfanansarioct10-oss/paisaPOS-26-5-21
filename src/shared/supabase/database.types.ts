export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      activity_events: {
        Row: {
          action: string
          action_scope: Database["public"]["Enums"]["privilege_scope"] | null
          actor_email: string | null
          actor_name: string
          actor_role: Database["public"]["Enums"]["user_role"]
          actor_user_id: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          delegation_id: string | null
          error_code: string | null
          id: string
          metadata: Json
          occurred_at: string
          privilege_source: Database["public"]["Enums"]["privilege_source"]
          request_id: string
          result: Database["public"]["Enums"]["activity_result"]
          search_vector: unknown
          store_id: string
          summary: string
          target_id: string | null
          target_label: string | null
          target_type: string
        }
        Insert: {
          action: string
          action_scope?: Database["public"]["Enums"]["privilege_scope"] | null
          actor_email?: string | null
          actor_name: string
          actor_role: Database["public"]["Enums"]["user_role"]
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          delegation_id?: string | null
          error_code?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          privilege_source: Database["public"]["Enums"]["privilege_source"]
          request_id?: string
          result: Database["public"]["Enums"]["activity_result"]
          search_vector?: unknown
          store_id: string
          summary: string
          target_id?: string | null
          target_label?: string | null
          target_type: string
        }
        Update: {
          action?: string
          action_scope?: Database["public"]["Enums"]["privilege_scope"] | null
          actor_email?: string | null
          actor_name?: string
          actor_role?: Database["public"]["Enums"]["user_role"]
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          delegation_id?: string | null
          error_code?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          privilege_source?: Database["public"]["Enums"]["privilege_source"]
          request_id?: string
          result?: Database["public"]["Enums"]["activity_result"]
          search_vector?: unknown
          store_id?: string
          summary?: string
          target_id?: string | null
          target_label?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_delegation_id_fkey"
            columns: ["delegation_id"]
            isOneToOne: false
            referencedRelation: "privilege_delegations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          affected_entity: string
          created_at: string
          error_message: string | null
          id: string
          operation: string
          result: string
          store_id: string | null
          user_id: string | null
        }
        Insert: {
          affected_entity: string
          created_at?: string
          error_message?: string | null
          id?: string
          operation: string
          result: string
          store_id?: string | null
          user_id?: string | null
        }
        Update: {
          affected_entity?: string
          created_at?: string
          error_message?: string | null
          id?: string
          operation?: string
          result?: string
          store_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs_archive: {
        Row: {
          affected_entity: string | null
          created_at: string | null
          error_message: string | null
          id: string | null
          operation: string | null
          result: string | null
          store_id: string | null
          user_id: string | null
        }
        Insert: {
          affected_entity?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string | null
          operation?: string | null
          result?: string | null
          store_id?: string | null
          user_id?: string | null
        }
        Update: {
          affected_entity?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string | null
          operation?: string | null
          result?: string | null
          store_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      checkout_requests: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          idempotency_key: string
          invoice_id: string | null
          last_replayed_at: string | null
          replay_count: number
          request_hash: string
          status: string
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          idempotency_key: string
          invoice_id?: string | null
          last_replayed_at?: string | null
          replay_count?: number
          request_hash: string
          status?: string
          store_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          idempotency_key?: string
          invoice_id?: string | null
          last_replayed_at?: string | null
          replay_count?: number
          request_hash?: string
          status?: string
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_requests_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_requests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          id: string
          quantity: number
          store_id: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          id?: string
          quantity?: number
          store_id: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          id?: string
          quantity?: number
          store_id?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: true
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          custom_name: string | null
          id: string
          invoice_id: string
          quantity: number
          subtotal: number
          unit_price: number
          variant_id: string | null
        }
        Insert: {
          custom_name?: string | null
          id?: string
          invoice_id: string
          quantity: number
          subtotal: number
          unit_price: number
          variant_id?: string | null
        }
        Update: {
          custom_name?: string | null
          id?: string
          invoice_id?: string
          quantity?: number
          subtotal?: number
          unit_price?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          discount_amount: number | null
          fiscal_year: number | null
          id: string
          invoice_number: string
          invoice_seq: number | null
          paid_amount: number
          payment_method: string
          sold_by_name: string | null
          sold_by_role: Database["public"]["Enums"]["user_role"] | null
          sold_by_user_id: string | null
          sold_with_delegation_id: string | null
          store_id: string
          total_amount: number
        }
        Insert: {
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          discount_amount?: number | null
          fiscal_year?: number | null
          id?: string
          invoice_number: string
          invoice_seq?: number | null
          paid_amount: number
          payment_method: string
          sold_by_name?: string | null
          sold_by_role?: Database["public"]["Enums"]["user_role"] | null
          sold_by_user_id?: string | null
          sold_with_delegation_id?: string | null
          store_id: string
          total_amount: number
        }
        Update: {
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          discount_amount?: number | null
          fiscal_year?: number | null
          id?: string
          invoice_number?: string
          invoice_seq?: number | null
          paid_amount?: number
          payment_method?: string
          sold_by_name?: string | null
          sold_by_role?: Database["public"]["Enums"]["user_role"] | null
          sold_by_user_id?: string | null
          sold_with_delegation_id?: string | null
          store_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_sold_by_user_id_fkey"
            columns: ["sold_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_sold_with_delegation_id_fkey"
            columns: ["sold_with_delegation_id"]
            isOneToOne: false
            referencedRelation: "privilege_delegations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      privilege_delegations: {
        Row: {
          created_at: string
          expires_at: string
          granted_by_user_id: string
          granted_to_user_id: string
          id: string
          reason: string
          revoked_at: string | null
          revoked_by_user_id: string | null
          scope: Database["public"]["Enums"]["privilege_scope"]
          starts_at: string
          store_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          granted_by_user_id: string
          granted_to_user_id: string
          id?: string
          reason: string
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          scope: Database["public"]["Enums"]["privilege_scope"]
          starts_at?: string
          store_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          granted_by_user_id?: string
          granted_to_user_id?: string
          id?: string
          reason?: string
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          scope?: Database["public"]["Enums"]["privilege_scope"]
          starts_at?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "privilege_delegations_granted_by_user_id_fkey"
            columns: ["granted_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "privilege_delegations_granted_to_user_id_fkey"
            columns: ["granted_to_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "privilege_delegations_revoked_by_user_id_fkey"
            columns: ["revoked_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "privilege_delegations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          color: string
          created_at: string
          id: string
          price: number
          product_id: string
          size: string
          sku: string
          store_id: string
        }
        Insert: {
          color: string
          created_at?: string
          id?: string
          price: number
          product_id: string
          size: string
          sku: string
          store_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          price?: number
          product_id?: string
          size?: string
          sku?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string
          created_at: string
          id: string
          image_url: string | null
          is_favorite: boolean
          low_stock_threshold: number
          name: string
          store_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_favorite?: boolean
          low_stock_threshold?: number
          name: string
          store_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_favorite?: boolean
          low_stock_threshold?: number
          name?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      security_alerts: {
        Row: {
          acknowledged: boolean | null
          alert_type: string
          created_at: string
          description: string
          id: string
          metadata: Json | null
          severity: string
        }
        Insert: {
          acknowledged?: boolean | null
          alert_type: string
          created_at?: string
          description: string
          id?: string
          metadata?: Json | null
          severity?: string
        }
        Update: {
          acknowledged?: boolean | null
          alert_type?: string
          created_at?: string
          description?: string
          id?: string
          metadata?: Json | null
          severity?: string
        }
        Relationships: []
      }
      staff_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by_user_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by_user_id: string
          revoked_at: string | null
          revoked_by_user_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["staff_invitation_status"]
          store_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by_user_id: string
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["staff_invitation_status"]
          store_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by_user_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by_user_id?: string
          revoked_at?: string | null
          revoked_by_user_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["staff_invitation_status"]
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_invitations_accepted_by_user_id_fkey"
            columns: ["accepted_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invitations_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invitations_revoked_by_user_id_fkey"
            columns: ["revoked_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_invitations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_step_up_proofs: {
        Row: {
          assurance_level: string
          authenticated_at: string
          authentication_method: string | null
          created_at: string
          expires_at: string
          id: string
          purpose: string
          store_id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          assurance_level: string
          authenticated_at: string
          authentication_method?: string | null
          created_at?: string
          expires_at: string
          id?: string
          purpose: string
          store_id: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          assurance_level?: string
          authenticated_at?: string
          authentication_method?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          purpose?: string
          store_id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_step_up_proofs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_step_up_proofs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      store_invoice_counters: {
        Row: {
          created_at: string
          fiscal_year: number
          next_invoice_seq: number
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fiscal_year: number
          next_invoice_seq?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fiscal_year?: number
          next_invoice_seq?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_invoice_counters_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          pan_vat: string | null
          phone: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          pan_vat?: string | null
          phone?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          pan_vat?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          id: string
          invited_by_user_id: string | null
          name: string
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["user_status"]
          store_id: string | null
          suspended_at: string | null
          suspended_by_user_id: string | null
        }
        Insert: {
          created_at?: string
          id: string
          invited_by_user_id?: string | null
          name: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          store_id?: string | null
          suspended_at?: string | null
          suspended_by_user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          invited_by_user_id?: string | null
          name?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          store_id?: string | null
          suspended_at?: string | null
          suspended_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_invited_by_user_id_fkey"
            columns: ["invited_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_suspended_by_user_id_fkey"
            columns: ["suspended_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_staff_invitation: {
        Args: {
          p_actor_name?: string
          p_auth_email: string
          p_auth_user_id: string
          p_invitation_id: string
        }
        Returns: Json
      }
      adjust_inventory_for_delegation: {
        Args: {
          p_actor_user_id: string
          p_delegation_id: string
          p_new_stock: number
          p_store_id: string
          p_variant_id: string
        }
        Returns: string
      }
      bulk_upsert_products_and_variants: {
        Args: { p_products: Json }
        Returns: number
      }
      bulk_upsert_products_and_variants_for_delegation: {
        Args: {
          p_actor_user_id: string
          p_delegation_id: string
          p_products: Json
          p_store_id: string
        }
        Returns: number
      }
      create_invoice_and_deduct_stock:
        | {
            Args: {
              p_customer_name: string
              p_customer_phone: string
              p_discount_amount: number
              p_invoice_number: string
              p_items: Json
              p_paid_amount: number
              p_payment_method: string
              p_store_id: string
              p_total_amount: number
            }
            Returns: string
          }
        | {
            Args: {
              p_customer_name: string
              p_customer_phone: string
              p_discount_amount: number
              p_idempotency_key: string
              p_invoice_number: string
              p_items: Json
              p_paid_amount: number
              p_payment_method: string
              p_store_id: string
              p_total_amount: number
            }
            Returns: Json
          }
      delete_product_for_delegation: {
        Args: {
          p_actor_user_id: string
          p_delegation_id: string
          p_product_id: string
          p_store_id: string
        }
        Returns: boolean
      }
      detect_threat_anomalies: { Args: never; Returns: undefined }
      get_user_store_id: { Args: never; Returns: string }
      grant_privilege_delegation: {
        Args: {
          p_actor_user_id: string
          p_duration_hours: number
          p_reason: string
          p_scope: Database["public"]["Enums"]["privilege_scope"]
          p_step_up_proof_id: string
          p_store_id: string
          p_target_user_id: string
        }
        Returns: Json
      }
      log_unauthenticated_security_event: {
        Args: {
          p_affected_entity: string
          p_error_message: string
          p_operation: string
        }
        Returns: undefined
      }
      reactivate_staff_user: {
        Args: { p_actor_user_id: string; p_target_user_id: string }
        Returns: Json
      }
      record_delegated_mutation_activity: {
        Args: {
          p_action: string
          p_action_scope: Database["public"]["Enums"]["privilege_scope"]
          p_actor_user_id: string
          p_after_state: Json
          p_before_state: Json
          p_delegation_id: string
          p_metadata: Json
          p_store_id: string
          p_summary: string
          p_target_id: string
          p_target_label: string
          p_target_type: string
        }
        Returns: string
      }
      register_store_and_user: {
        Args: { p_full_name: string; p_store_name: string }
        Returns: string
      }
      revoke_privilege_delegation: {
        Args: { p_actor_user_id: string; p_delegation_id: string }
        Returns: Json
      }
      revoke_staff_invitation: {
        Args: { p_actor_user_id: string; p_invitation_id: string }
        Returns: Json
      }
      rollback_staff_invitation_acceptance: {
        Args: {
          p_accepted_at: string
          p_auth_user_id: string
          p_invitation_id: string
          p_previous_profile?: Json
          p_profile_disposition: string
        }
        Returns: Json
      }
      set_product_favorite_for_delegation: {
        Args: {
          p_actor_user_id: string
          p_delegation_id: string
          p_is_favorite: boolean
          p_product_id: string
          p_store_id: string
        }
        Returns: boolean
      }
      suspend_staff_user: {
        Args: { p_actor_user_id: string; p_target_user_id: string }
        Returns: Json
      }
      upsert_product_and_variants: {
        Args: {
          p_category: string
          p_deleted_variant_ids: string[]
          p_low_stock_threshold: number
          p_name: string
          p_product_id: string
          p_variants: Json
        }
        Returns: string
      }
      upsert_product_and_variants_for_delegation: {
        Args: {
          p_actor_user_id: string
          p_category: string
          p_delegation_id: string
          p_deleted_variant_ids: string[]
          p_low_stock_threshold: number
          p_name: string
          p_product_id: string
          p_store_id: string
          p_variants: Json
        }
        Returns: string
      }
      validate_delegated_catalog_action: {
        Args: {
          p_actor_user_id: string
          p_delegation_id: string
          p_store_id: string
        }
        Returns: string
      }
    }
    Enums: {
      activity_result: "success" | "failure"
      privilege_scope:
        | "checkout.create"
        | "catalog.manage"
        | "inventory.adjust"
        | "store.settings"
        | "reports.export"
        | "invoice.correct"
        | "staff.manage"
        | "activity.read"
        | "profile.update"
      privilege_source: "owner_role" | "cashier_role" | "delegation" | "system"
      staff_invitation_status: "pending" | "accepted" | "expired" | "revoked"
      user_role: "owner" | "cashier"
      user_status: "active" | "suspended"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_result: ["success", "failure"],
      privilege_scope: [
        "checkout.create",
        "catalog.manage",
        "inventory.adjust",
        "store.settings",
        "reports.export",
        "invoice.correct",
        "staff.manage",
        "activity.read",
        "profile.update",
      ],
      privilege_source: ["owner_role", "cashier_role", "delegation", "system"],
      staff_invitation_status: ["pending", "accepted", "expired", "revoked"],
      user_role: ["owner", "cashier"],
      user_status: ["active", "suspended"],
    },
  },
} as const

