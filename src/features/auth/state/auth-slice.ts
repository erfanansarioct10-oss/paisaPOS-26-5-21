// =========================================================================
// PaisaPOS — Auth, Navigation & Data Synchronization Slice
// =========================================================================

import { supabase } from "@/lib/supabase";
import {
  ACTIVE_STAFF_DELEGATION_PRIVILEGES,
  filterActiveStaffDelegations,
} from "@/lib/staff-capabilities";
import type { AppState, ProductVariant, StoreMetadata, Profile } from "@/lib/store/types";
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

function isAuthTokenInvalidError(error: unknown) {
  if (!error) return false;
  const err = error as { status?: number; message?: string };
  const status = err.status;
  const message = err.message?.toLowerCase() || "";
  return (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    /invalid jwt|token is expired|invalid signature|jwt expired|forbidden|user not found/i.test(message)
  );
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

function getUtcDateBoundaries(dateFilter: string) {
  if (dateFilter === "All Time") {
    return { start: null, end: null };
  }

  const NEPAL_OFFSET_MS = 5.75 * 3600_000;
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const nepalNow = new Date(utcMs + NEPAL_OFFSET_MS);

  // Start of today in UTC (Nepal midnight converted to UTC)
  const nepalTodayStart = new Date(nepalNow);
  nepalTodayStart.setUTCHours(0, 0, 0, 0);
  const startOfToday = new Date(nepalTodayStart.getTime() - NEPAL_OFFSET_MS);

  // End of today in UTC (Nepal 23:59:59.999 converted to UTC)
  const nepalTodayEnd = new Date(nepalNow);
  nepalTodayEnd.setUTCHours(23, 59, 59, 999);
  const endOfToday = new Date(nepalTodayEnd.getTime() - NEPAL_OFFSET_MS);

  if (dateFilter === "Today") {
    return { start: startOfToday.toISOString(), end: endOfToday.toISOString() };
  } else if (dateFilter === "Yesterday") {
    const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);
    const endOfYesterday = new Date(endOfToday.getTime() - 86_400_000);
    return { start: startOfYesterday.toISOString(), end: endOfYesterday.toISOString() };
  } else if (dateFilter === "This Week") {
    const nepalDay = nepalNow.getUTCDay();
    const startOfWeek = new Date(startOfToday.getTime() - nepalDay * 86_400_000);
    return { start: startOfWeek.toISOString(), end: endOfToday.toISOString() };
  }

  return { start: null, end: null };
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
  hasMoreInvoices: true,
  invoiceItems: {} as AppState["invoiceItems"],
  activeDelegations: [] as AppState["activeDelegations"],

  // Invoices History & Search State
  historyFilters: {
    searchQuery: "",
    paymentMethodFilter: "All",
    dateFilter: "All Time",
    page: 1,
  },
  historyInvoices: [] as AppState["historyInvoices"],
  historyTotalCount: 0,
  historyTotalSales: 0,
  historyMethodBreakdown: {} as Record<string, number>,
  historyHasMore: true,
  historyLoading: false,

  // Modals
  isProductModalOpen: false,
  isQuickBillingOpen: false,
  isImporting: false,

  // Concurrency tracking for stock updates
  pendingStockUpdates: {} as Record<string, number>,
  pendingStockRequests: {} as Record<string, number>,
  originalStockLevels: {} as Record<string, number>,
  latestStockRequestIds: {} as Record<string, number>,

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

  updateLocalStore: (updatedStore: Partial<StoreMetadata>) => {
    set((state) => ({
      store: state.store ? { ...state.store, ...updatedStore } : null,
    }));
  },

  updateLocalUser: (updatedUser: Partial<Profile>) => {
    set((state) => ({
      user: state.user ? { ...state.user, ...updatedUser } : null,
    }));
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
      if (authError) {
        if (isMissingAuthSessionMessage(authError.message) || isAuthTokenInvalidError(authError)) {
          console.log("Session token is invalid, expired, or missing. Resetting auth state.");
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
            isLoading: false,
            sessionStatus: "unauthenticated",
          });
          return;
        }
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
        .select("id, name, store_id, role, status, security_pin")
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

      // =====================================================================
      // CRITICAL FIX: Fetch store data BEFORE marking authenticated.
      // Previously, we set sessionStatus: "authenticated" here, which caused
      // the loader to disappear and the UI to render with empty arrays.
      // Now we fetch all data first and set everything in one atomic call.
      // =====================================================================
      const [productsResult, variantsResult, invoicesResult] = await Promise.all([
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
      ]);

      if (productsResult.error) throw new SessionInitializationError("transient", productsResult.error.message);
      if (variantsResult.error) throw new SessionInitializationError("transient", variantsResult.error.message);
      if (invoicesResult.error) throw new SessionInitializationError("transient", invoicesResult.error.message);

      const dbProducts = productsResult.data || [];
      const dbVariants = variantsResult.data || [];
      const dbInvoices = (invoicesResult.data || []).map((invoice) => ({
        ...invoice,
        discount_amount: invoice.discount_amount ?? 0,
      }));

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
          stock: dbStock,
          created_at: item.created_at,
        };
      });

      // ATOMIC: Set user, store, AND data in one single call.
      // The loader stays visible until everything is ready — no empty-state flicker.
      set({
        user: {
          id: profile.id,
          name: profile.name,
          store_id: profileStoreId,
          email: authUser.email,
          role: profile.role,
          status: profile.status ?? "active",
          has_security_pin: !!profile.security_pin,
        },
        store: {
          id: store.id,
          name: store.name,
          phone: store.phone ?? "",
          address: store.address ?? "",
          pan_vat: store.pan_vat ?? "",
        },
        products: dbProducts.map((p) => ({ ...p })),
        variants: mappedVariants,
        invoices: dbInvoices,
        hasMoreInvoices: dbInvoices.length >= 50,
        invoiceItems: {},
        activeDelegations,
        sessionStatus: "authenticated",
      });

      subscribeToRealtimeChanges(store.id, get().fetchStoreData, () => get().isImporting);
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

      const existingInvoices = get().invoices;
      const mergedInvoices = [
        ...dbInvoices,
        ...existingInvoices.filter((ext) => !dbInvoices.some((db) => db.id === ext.id)),
      ].sort((a, b) => b.created_at.localeCompare(a.created_at));

      set({
        products: mappedProducts,
        variants: mappedVariants,
        invoices: mergedInvoices,
        hasMoreInvoices: dbInvoices.length >= 50 ? (get().invoices.length > 0 ? get().hasMoreInvoices : true) : false,
        invoiceItems: invoiceItemsMap,
        activeDelegations,
      });

      if (get().activeTab === "history") {
        get().fetchHistoryData().catch((err) => console.error("Error fetching history data during store sync:", err));
      }
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
          hasMoreInvoices: moreInvoices.length >= limit,
        });
      } else {
        set({ hasMoreInvoices: false });
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

  setHistoryFilters: async (newFilters: Partial<AppState["historyFilters"]>) => {
    const currentFilters = get().historyFilters;
    const updatedFilters = { ...currentFilters, ...newFilters };
    
    // Reset page to 1 if any filter other than page changes
    if (
      newFilters.searchQuery !== undefined ||
      newFilters.paymentMethodFilter !== undefined ||
      newFilters.dateFilter !== undefined
    ) {
      updatedFilters.page = 1;
    }

    set({ historyFilters: updatedFilters });
    await get().fetchHistoryData();
  },

  fetchHistoryData: async () => {
    const { store, historyFilters } = get();
    if (!store) return;

    set({ historyLoading: true, errorMsg: null });

    try {
      const { searchQuery, paymentMethodFilter, dateFilter, page } = historyFilters;
      const PAGE_SIZE = 20;

      // 1. Fetch Invoices matching filters & page
      let query = supabase
        .from("invoices")
        .select("id, store_id, invoice_number, customer_name, customer_phone, total_amount, discount_amount, paid_amount, payment_method, sold_by_user_id, sold_by_name, sold_by_role, sold_with_delegation_id, created_at")
        .eq("store_id", store.id);

      if (searchQuery.trim()) {
        const queryTerm = `%${searchQuery.trim()}%`;
        query = query.or(
          `invoice_number.ilike.${queryTerm},customer_name.ilike.${queryTerm},customer_phone.ilike.${queryTerm},payment_method.ilike.${queryTerm},sold_by_name.ilike.${queryTerm},sold_by_role.ilike.${queryTerm}`
        );
      }

      if (paymentMethodFilter !== "All") {
        query = query.ilike("payment_method", paymentMethodFilter);
      }

      const { start, end } = getUtcDateBoundaries(dateFilter);
      if (start) {
        query = query.gte("created_at", start);
      }
      if (end) {
        query = query.lte("created_at", end);
      }

      const fromRow = (page - 1) * PAGE_SIZE;
      const toRow = page * PAGE_SIZE - 1;
      query = query.order("created_at", { ascending: false }).range(fromRow, toRow);

      // 2. Fetch Aggregated Summary statistics
      const [invoicesResult, summaryResult] = await Promise.all([
        query,
        supabase.rpc("get_store_invoice_summary", {
          p_store_id: store.id,
          p_start_date: (start ?? null) as unknown as string,
          p_end_date: (end ?? null) as unknown as string,
          p_payment_method: paymentMethodFilter,
          p_search_query: (searchQuery.trim() || null) as unknown as string,
        }),
      ]);

      if (invoicesResult.error) throw invoicesResult.error;
      if (summaryResult.error) throw summaryResult.error;

      const dbInvoices = (invoicesResult.data || []).map((invoice) => ({
        ...invoice,
        discount_amount: invoice.discount_amount ?? 0,
      }));

      const summary = (summaryResult.data && summaryResult.data[0]) || {
        total_sales: 0,
        total_count: 0,
        cash_sales: 0,
        esewa_sales: 0,
        khalti_sales: 0,
        fonepay_sales: 0,
      };

      set({
        historyInvoices: dbInvoices,
        historyTotalCount: Number(summary.total_count),
        historyTotalSales: Number(summary.total_sales),
        historyMethodBreakdown: {
          "Cash": Number(summary.cash_sales),
          "eSewa": Number(summary.esewa_sales),
          "Khalti": Number(summary.khalti_sales),
          "Fonepay": Number(summary.fonepay_sales),
        },
        historyHasMore: dbInvoices.length >= PAGE_SIZE,
      });
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error("Error fetching invoice history:", errMsg);
      set({ errorMsg: "Failed to fetch invoice history: " + errMsg });
    } finally {
      set({ historyLoading: false });
    }
  },
});
