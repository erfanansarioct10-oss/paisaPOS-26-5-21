// =========================================================================
// PaisaPOS — Auth, Navigation & Data Synchronization Slice
// =========================================================================

import { supabase } from "@/lib/supabase";
import {
  ACTIVE_STAFF_DELEGATION_PRIVILEGES,
  filterActiveStaffDelegations,
} from "@/lib/staff-capabilities";
import type { AppState, ProductVariant } from "@/lib/store/types";
import type { RealtimeChannel } from "@supabase/supabase-js";

let activeRealtimeChannel: RealtimeChannel | null = null;
let realtimeFetchTimeout: ReturnType<typeof setTimeout> | null = null;

const subscribeToRealtimeChanges = (
  storeId: string,
  fetchStoreData: () => Promise<void>,
  checkImporting: () => boolean
) => {
  if (activeRealtimeChannel) {
    supabase.removeChannel(activeRealtimeChannel);
    activeRealtimeChannel = null;
  }
  if (realtimeFetchTimeout) {
    clearTimeout(realtimeFetchTimeout);
    realtimeFetchTimeout = null;
  }

  const debouncedFetch = () => {
    if (checkImporting()) return;
    if (realtimeFetchTimeout) {
      clearTimeout(realtimeFetchTimeout);
    }
    realtimeFetchTimeout = setTimeout(() => {
      fetchStoreData().catch((err) => console.error("Error fetching store data via realtime sync:", err));
    }, 100);
  };

  activeRealtimeChannel = supabase
    .channel(`store-realtime-${storeId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "products", filter: `store_id=eq.${storeId}` },
      debouncedFetch
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "product_variants", filter: `store_id=eq.${storeId}` },
      debouncedFetch
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "inventory", filter: `store_id=eq.${storeId}` },
      debouncedFetch
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "invoices", filter: `store_id=eq.${storeId}` },
      debouncedFetch
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "privilege_delegations", filter: `store_id=eq.${storeId}` },
      debouncedFetch
    )
    .subscribe();
};

type DelegationProfile = {
  id: string;
  role?: "owner" | "cashier" | null;
  store_id: string;
};

async function loadActiveDelegations(profile: DelegationProfile) {
  if (!profile?.id || profile.role !== "cashier") {
    return [];
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("privilege_delegations")
    .select("id, scope, reason, granted_by_user_id, starts_at, expires_at")
    .eq("store_id", profile.store_id)
    .eq("granted_to_user_id", profile.id)
    .in("scope", [...ACTIVE_STAFF_DELEGATION_PRIVILEGES])
    .is("revoked_at", null)
    .lte("starts_at", now)
    .gt("expires_at", now)
    .order("expires_at", { ascending: true });

  if (error) {
    console.warn("Failed to load active delegations:", error.message);
    return [];
  }

  return filterActiveStaffDelegations(data ?? []);
}

class SessionInitializationError extends Error {
  readonly kind: "missing_profile" | "suspended" | "store_missing" | "transient";

  constructor(kind: SessionInitializationError["kind"], message: string) {
    super(message);
    this.name = "SessionInitializationError";
    this.kind = kind;
  }
}

function isMissingAuthSessionMessage(message: string | undefined) {
  return /auth session missing/i.test(message ?? "");
}

function isTransientSessionError(error: unknown) {
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");

  return /fetch|network|connection|timeout|temporarily|server|database|postgrest|supabase|failed to fetch|load failed|503|502|500/i.test(message);
}

function safeSessionErrorMessage(error: unknown) {
  if (error instanceof SessionInitializationError && error.kind === "suspended") {
    return "This staff account is suspended. Please contact the store owner.";
  }
  if (error instanceof SessionInitializationError && error.kind === "missing_profile") {
    return "Store user profile not found.";
  }
  if (error instanceof SessionInitializationError && error.kind === "store_missing") {
    return "Store metadata associated with user not found.";
  }
  if (isTransientSessionError(error)) {
    return "We could not sync your session. Check your connection and try again.";
  }
  return "We could not sync your session. Please try again.";
}

type SetState = (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void;
type GetState = () => AppState;

export const createAuthSlice = (set: SetState, get: GetState) => ({
  // -----------------------------------------------------------------------
  // INITIAL STATE
  // -----------------------------------------------------------------------
  activeTab: "dashboard" as const,
  user: null,
  store: null,
  isLoading: true,
  sessionStatus: "unknown" as const,
  errorMsg: null,

  products: [] as AppState["products"],
  variants: [] as AppState["variants"],
  invoices: [] as AppState["invoices"],
  invoiceItems: {} as AppState["invoiceItems"],
  activeDelegations: [] as AppState["activeDelegations"],

  // Modals
  isProductModalOpen: false,
  isQuickBillingOpen: false,
  isImporting: false,

  // Concurrency tracking for stock updates
  pendingStockUpdates: {} as Record<string, number>,
  pendingStockRequests: {} as Record<string, number>,
  originalStockLevels: {} as Record<string, number>,

  // Concurrency tracking for favorite updates
  pendingFavoriteUpdates: {} as Record<string, boolean>,
  pendingFavoriteRequests: {} as Record<string, number>,
  originalFavoriteLevels: {} as Record<string, boolean>,

  // -----------------------------------------------------------------------
  // SIMPLE SETTERS
  // -----------------------------------------------------------------------
  setTab: (tab: AppState["activeTab"]) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("paisapos_active_tab", tab);
    }
    set({ activeTab: tab });
  },

  // -----------------------------------------------------------------------
  // SESSION INITIALIZATION
  // -----------------------------------------------------------------------
  initializeSession: async () => {
    if (typeof window !== "undefined") {
      const savedTab = localStorage.getItem("paisapos_active_tab") as AppState["activeTab"];
      if (savedTab && ["dashboard", "billing", "inventory", "history", "activity", "staff", "settings"].includes(savedTab)) {
        set({ activeTab: savedTab });
      }
    }

    const previousState = get();
    set({ isLoading: true, errorMsg: null });

    try {
      // 1. Get current auth user (getUser() validates JWT against the auth server,
      //    unlike getSession() which only reads from localStorage and can accept stale/stolen tokens)
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      if (authError && !isMissingAuthSessionMessage(authError.message)) {
        throw new SessionInitializationError("transient", authError.message);
      }

      if (!authUser) {
        console.log("No active Supabase session. Remaining on Login Screen.");
        set({
          user: null,
          store: null,
          products: [],
          variants: [],
          invoices: [],
          invoiceItems: {},
          activeDelegations: [],
          isLoading: false,
          sessionStatus: "unauthenticated",
        });
        return;
      }

      // 2. Load User Profile from Supabase
      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("id, name, store_id, role, status")
        .eq("id", authUser.id)
        .maybeSingle();

      if (profileError || !profile) {
        if (profileError) {
          throw new SessionInitializationError("transient", profileError.message);
        }
        throw new SessionInitializationError("missing_profile", "Store user profile not found.");
      }

      if (profile.status === "suspended") {
        throw new SessionInitializationError("suspended", "This staff account is suspended. Please contact the store owner.");
      }
      if (!profile.store_id) {
        throw new SessionInitializationError("missing_profile", "Store user profile not found.");
      }
      const profileStoreId = profile.store_id;

      // 3. Load Store Meta
      const { data: store, error: storeError } = await supabase
        .from("stores")
        .select("id, name, phone, address, pan_vat")
        .eq("id", profileStoreId)
        .maybeSingle();

      if (storeError || !store) {
        if (storeError) {
          throw new SessionInitializationError("transient", storeError.message);
        }
        throw new SessionInitializationError("store_missing", "Store metadata associated with user not found.");
      }

      const activeDelegations = await loadActiveDelegations({ ...profile, store_id: profileStoreId });

      // Success: Save Session details, trigger data fetches
      set({
        user: {
          id: profile.id,
          name: profile.name,
          store_id: profileStoreId,
          email: authUser.email,
          role: profile.role,
          status: profile.status ?? "active",
        },
        store: {
          id: store.id,
          name: store.name,
          phone: store.phone ?? "",
          address: store.address ?? "",
          pan_vat: store.pan_vat ?? "",
        },
        activeDelegations,
        sessionStatus: "authenticated",
      });

      subscribeToRealtimeChanges(profileStoreId, get().fetchStoreData, () => get().isImporting);

      await get().fetchStoreData();
    } catch (e: unknown) {
      const errMsg = safeSessionErrorMessage(e);
      console.warn("Failed to initialize session:", e instanceof Error ? e.message : String(e));

      if (e instanceof SessionInitializationError && (e.kind === "missing_profile" || e.kind === "suspended")) {
        try {
          await supabase.auth.signOut();
        } catch {}
        set({
          user: null,
          store: null,
          products: [],
          variants: [],
          invoices: [],
          invoiceItems: {},
          activeDelegations: [],
          errorMsg: errMsg,
          sessionStatus: "unauthenticated",
        });
        return;
      }

      if (previousState.user && previousState.store) {
        set({
          user: previousState.user,
          store: previousState.store,
          products: previousState.products,
          variants: previousState.variants,
          invoices: previousState.invoices,
          invoiceItems: previousState.invoiceItems,
          activeDelegations: previousState.activeDelegations,
          errorMsg: errMsg,
          sessionStatus: "degraded",
        });
      } else {
        set({
          user: null,
          store: null,
          products: [],
          variants: [],
          invoices: [],
          invoiceItems: {},
          activeDelegations: [],
          errorMsg: errMsg,
          sessionStatus: "degraded",
        });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  // -----------------------------------------------------------------------
  // SIGN OUT
  // -----------------------------------------------------------------------
  signOut: async () => {
    set({ isLoading: true });
    if (typeof window !== "undefined") {
      localStorage.removeItem("paisapos_active_tab");
    }
    if (activeRealtimeChannel) {
      try {
        await supabase.removeChannel(activeRealtimeChannel);
      } catch (err) {
        console.warn("Failed to remove realtime channel on signout:", err);
      }
      activeRealtimeChannel = null;
    }
    if (realtimeFetchTimeout) {
      clearTimeout(realtimeFetchTimeout);
      realtimeFetchTimeout = null;
    }
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("Supabase auth signOut failed, clearing local state anyway:", err);
    }
    // Fully reset store and clear state so user redirects back to the login screen
    set({
      user: null,
      store: null,
      products: [],
      variants: [],
      invoices: [],
      invoiceItems: {},
      activeDelegations: [],
      cart: [],
      activeInvoice: null,
      activeTab: "dashboard" as const,
      isLoading: false,
      sessionStatus: "unauthenticated",
    });

    if (typeof window !== "undefined" && window.location) {
      window.location.href = "/";
    }
  },

  // -----------------------------------------------------------------------
  // FETCH STORE DATA FROM SUPABASE
  // -----------------------------------------------------------------------
  fetchStoreData: async (options?: { forceLoading?: boolean }) => {
    const { store, products, user } = get();
    if (!store) return;

    const showLoading = options?.forceLoading || products.length === 0;

    if (showLoading) {
      set({ isLoading: true });
    }
    try {
      const [productsResult, variantsResult, invoicesResult, activeDelegations] = await Promise.all([
        supabase
          .from("products")
          .select("id, store_id, name, category, image_url, low_stock_threshold, is_favorite, created_at")
          .eq("store_id", store.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("product_variants")
          .select(`
            id,
            product_id,
            size,
            color,
            sku,
            price,
            created_at,
            inventory (quantity)
          `)
          .eq("store_id", store.id),
        supabase
          .from("invoices")
          .select("id, store_id, invoice_number, customer_name, customer_phone, total_amount, discount_amount, paid_amount, payment_method, sold_by_user_id, sold_by_name, sold_by_role, sold_with_delegation_id, created_at")
          .eq("store_id", store.id)
          .order("created_at", { ascending: false })
          .limit(50),
        user?.role === "cashier" ? loadActiveDelegations(user) : Promise.resolve([]),
      ]);

      if (productsResult.error) throw productsResult.error;
      if (variantsResult.error) throw variantsResult.error;
      if (invoicesResult.error) throw invoicesResult.error;

      const dbProducts = productsResult.data || [];
      const dbVariants = variantsResult.data || [];
      const dbInvoices = (invoicesResult.data || []).map((invoice) => ({
        ...invoice,
        discount_amount: invoice.discount_amount ?? 0,
      }));
      // Map back to our structure (inlining inventory quantity)
      const mappedVariants: ProductVariant[] = dbVariants.map((v: unknown) => {
        const item = v as {
          id: string;
          product_id: string;
          size: string;
          color: string;
          sku: string;
          price: string | number;
          inventory?: { quantity: number }[] | { quantity: number } | null;
          created_at: string;
        };
        const pendingStock = get().pendingStockUpdates[item.id];
        const dbStock = Array.isArray(item.inventory)
          ? (item.inventory[0]?.quantity ?? 0)
          : (item.inventory?.quantity ?? 0);
        return {
          id: item.id,
          product_id: item.product_id,
          size: item.size,
          color: item.color,
          sku: item.sku,
          price: Number(item.price),
          stock: pendingStock !== undefined ? pendingStock : dbStock,
          created_at: item.created_at,
        };
      });

      const invoiceItemsMap = { ...get().invoiceItems };

      const mappedProducts = dbProducts.map((p) => {
        const pendingFav = get().pendingFavoriteUpdates[p.id];
        return {
          ...p,
          is_favorite: pendingFav !== undefined ? pendingFav : p.is_favorite,
        };
      });

      set({
        products: mappedProducts,
        variants: mappedVariants,
        invoices: dbInvoices,
        invoiceItems: invoiceItemsMap,
        activeDelegations,
      });
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error("Error fetching store database:", errMsg);
      set({ errorMsg: "Failed to sync inventory: " + errMsg });
    } finally {
      if (showLoading) {
        set({ isLoading: false });
      }
    }
  },

  loadMoreInvoices: async (limit = 50) => {
    const { store, invoices } = get();
    if (!store) return;

    const lastInvoice = invoices[invoices.length - 1];
    try {
      let query = supabase
        .from("invoices")
        .select("id, store_id, invoice_number, customer_name, customer_phone, total_amount, discount_amount, paid_amount, payment_method, sold_by_user_id, sold_by_name, sold_by_role, sold_with_delegation_id, created_at")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (lastInvoice?.created_at) {
        query = query.lt("created_at", lastInvoice.created_at);
      }

      const { data: moreInvoices, error } = await query;

      if (error) throw error;

      if (moreInvoices && moreInvoices.length > 0) {
        set({
          invoices: [
            ...invoices,
            ...moreInvoices.map((invoice) => ({
              ...invoice,
              discount_amount: invoice.discount_amount ?? 0,
            })),
          ],
        });
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error("Error loading more invoices:", errMsg);
      set({ errorMsg: "Failed to load more invoices: " + errMsg });
    }
  },

  fetchInvoiceItems: async (invoiceId: string) => {
    try {
      const { data: items, error } = await supabase
        .from("invoice_items")
        .select("id, invoice_id, variant_id, custom_name, quantity, unit_price, subtotal")
        .eq("invoice_id", invoiceId);

      if (error) throw error;

      const parsedItems = items || [];

      set((state) => ({
        invoiceItems: {
          ...state.invoiceItems,
          [invoiceId]: parsedItems,
        },
      }));

      return parsedItems;
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error(`Error fetching line items for invoice ${invoiceId}:`, errMsg);
      set({ errorMsg: "Failed to load receipt details: " + errMsg });
      return [];
    }
  },

  clearError: () => {
    set({ errorMsg: null });
  },
});
