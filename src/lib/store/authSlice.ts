// =========================================================================
// PaisaPOS — Auth, Navigation & Data Synchronization Slice
// =========================================================================

import { supabase, hasSupabaseConfig } from "@/lib/supabase";
import type { AppState, ProductVariant } from "./types";
import {
  DEMO_STORE,
  DEMO_PROFILE,
  DEMO_PRODUCTS,
  DEMO_VARIANTS,
  DEMO_INVOICES,
  DEMO_INVOICE_ITEMS,
} from "./demoData";
import { verifyAndDecryptBroadcast } from "@/lib/broadcast";
import type { RealtimeChannel } from "@supabase/supabase-js";

let activeRealtimeChannel: RealtimeChannel | null = null;
let realtimeFetchTimeout: ReturnType<typeof setTimeout> | null = null;

const subscribeToRealtimeChanges = (storeId: string, fetchStoreData: () => Promise<void>) => {
  if (activeRealtimeChannel) {
    supabase.removeChannel(activeRealtimeChannel);
    activeRealtimeChannel = null;
  }
  if (realtimeFetchTimeout) {
    clearTimeout(realtimeFetchTimeout);
    realtimeFetchTimeout = null;
  }

  const debouncedFetch = () => {
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
      { event: "*", schema: "public", table: "products" },
      debouncedFetch
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "product_variants" },
      debouncedFetch
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "inventory" },
      debouncedFetch
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "invoices" },
      debouncedFetch
    )
    .subscribe();
};

type SetState = (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void;
type GetState = () => AppState;

export const createAuthSlice = (set: SetState, get: GetState) => ({
  // -----------------------------------------------------------------------
  // INITIAL STATE
  // -----------------------------------------------------------------------
  activeTab: "dashboard" as const,
  isDemoMode: false, // Default to false so that if Supabase is configured we start at the login screen
  user: null,
  store: null,
  isLoading: true,
  errorMsg: null,

  products: [] as AppState["products"],
  variants: [] as AppState["variants"],
  invoices: [] as AppState["invoices"],
  invoiceItems: {} as AppState["invoiceItems"],

  // Modals
  isProductModalOpen: false,
  isQuickBillingOpen: false,

  // -----------------------------------------------------------------------
  // SIMPLE SETTERS
  // -----------------------------------------------------------------------
  setTab: (tab: AppState["activeTab"]) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("paisapos_active_tab", tab);
    }
    set({ activeTab: tab });
  },
  setDemoMode: (enabled: boolean) => {
    if (typeof window !== "undefined") {
      if (enabled) {
        localStorage.setItem("paisapos_demo_mode", "true");
      } else {
        localStorage.removeItem("paisapos_demo_mode");
      }
    }
    set({ isDemoMode: enabled });
  },

  // -----------------------------------------------------------------------
  // SESSION INITIALIZATION
  // -----------------------------------------------------------------------
  initializeSession: async () => {
    if (typeof window !== "undefined") {
      const savedTab = localStorage.getItem("paisapos_active_tab") as AppState["activeTab"];
      if (savedTab && ["dashboard", "billing", "inventory", "history"].includes(savedTab)) {
        set({ activeTab: savedTab });
      }

      const channel = new BroadcastChannel("paisapos-demo-sync");
      channel.onmessage = (event: MessageEvent) => {
        const verified = verifyAndDecryptBroadcast(event);
        if (!verified) return;
        const { type, payload } = verified;
        if (type === "SYNC_CHECKOUT") {
          set({
            invoices: payload.invoices,
            variants: payload.variants,
            invoiceItems: payload.invoiceItems,
          });
        } else if (type === "SYNC_STOCK_DIRECT") {
          set({
            variants: payload.variants,
          });
        } else if (
          type === "SYNC_PRODUCT_ADD" ||
          type === "SYNC_PRODUCT_DELETE" ||
          type === "SYNC_PRODUCT_UPDATE"
        ) {
          set({
            products: payload.products,
            variants: payload.variants,
          });
        }
      };
    }

    set({ isLoading: true, errorMsg: null });
    const isSupabaseReady = hasSupabaseConfig();

    let isDemo = get().isDemoMode;
    if (typeof window !== "undefined") {
      isDemo = isDemo || localStorage.getItem("paisapos_demo_mode") === "true";
    }

    if (!isSupabaseReady) {
      // Gracefully fall back to pre-seeded local Demo Mode
      console.log("Supabase config not found. Auto-booting in Demo Mode.");
      set({
        isDemoMode: true,
        user: DEMO_PROFILE,
        store: DEMO_STORE,
        products: DEMO_PRODUCTS,
        variants: DEMO_VARIANTS,
        invoices: DEMO_INVOICES,
        invoiceItems: DEMO_INVOICE_ITEMS,
        isLoading: false,
      });
      return;
    }

    try {
      // 1. Get current auth user (getUser() validates JWT against the auth server,
      //    unlike getSession() which only reads from localStorage and can accept stale/stolen tokens)
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      if (authError && authError.message !== "Auth session missing!") throw authError;

      if (!authUser) {
        // No session: enter Demo Mode ONLY if explicitly chosen or persisted
        if (isDemo) {
          console.log("No active Supabase session. Initializing Pre-seeded Demo Workspace.");
          set({
            isDemoMode: true,
            user: DEMO_PROFILE,
            store: DEMO_STORE,
            products: DEMO_PRODUCTS,
            variants: DEMO_VARIANTS,
            invoices: DEMO_INVOICES,
            invoiceItems: DEMO_INVOICE_ITEMS,
            isLoading: false,
          });
        } else {
          console.log("No active Supabase session. Remaining on Login Screen.");
          set({
            isDemoMode: false,
            user: null,
            store: null,
            products: [],
            variants: [],
            invoices: [],
            invoiceItems: {},
            isLoading: false,
          });
        }
        return;
      }

      // 2. Load User Profile from Supabase
      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (profileError || !profile) {
        // Profile doesn't exist, sign out
        await supabase.auth.signOut();
        throw new Error("Store user profile not found. Reverting to Demo.");
      }

      // 3. Load Store Meta
      const { data: store, error: storeError } = await supabase
        .from("stores")
        .select("*")
        .eq("id", profile.store_id)
        .single();

      if (storeError || !store) {
        throw new Error("Store metadata associated with user not found.");
      }

      // Success: Save Session details, trigger data fetches
      set({
        isDemoMode: false,
        user: { id: profile.id, name: profile.name, store_id: profile.store_id, email: authUser.email },
        store: store,
      });

      subscribeToRealtimeChanges(profile.store_id, get().fetchStoreData);

      await get().fetchStoreData();
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.warn("Failed to initialize session:", errMsg);
      if (isSupabaseReady && !isDemo) {
        try {
          await supabase.auth.signOut();
        } catch {}
        set({
          isDemoMode: false,
          user: null,
          store: null,
          products: [],
          variants: [],
          invoices: [],
          invoiceItems: {},
          errorMsg: errMsg,
        });
      } else {
        set({
          isDemoMode: true,
          user: DEMO_PROFILE,
          store: DEMO_STORE,
          products: DEMO_PRODUCTS,
          variants: DEMO_VARIANTS,
          invoices: DEMO_INVOICES,
          invoiceItems: DEMO_INVOICE_ITEMS,
          errorMsg: errMsg,
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
      localStorage.removeItem("paisapos_demo_mode");
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
    if (!get().isDemoMode) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn("Supabase auth signOut failed, clearing local state anyway:", err);
      }
    }
    // Fully reset store and clear state so user redirects back to the login screen
    set({
      isDemoMode: false,
      user: null,
      store: null,
      products: [],
      variants: [],
      invoices: [],
      invoiceItems: {},
      cart: [],
      activeInvoice: null,
      activeTab: "dashboard" as const,
      isLoading: false,
    });
  },

  // -----------------------------------------------------------------------
  // FETCH STORE DATA FROM SUPABASE
  // -----------------------------------------------------------------------
  fetchStoreData: async () => {
    const { isDemoMode, store } = get();
    if (isDemoMode || !store) return;

    set({ isLoading: true });
    try {
      // 1. Fetch products
      const { data: dbProducts, error: prodError } = await supabase
        .from("products")
        .select("*")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false });

      if (prodError) throw prodError;

      // 2. Fetch variants + inlined stock
      const { data: dbVariants, error: varError } = await supabase
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
        .in("product_id", (dbProducts || []).map(p => p.id));

      if (varError) throw varError;

      // Map back to our structure (inlining inventory quantity)
      const mappedVariants: ProductVariant[] = (dbVariants || []).map((v: unknown) => {
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
        return {
          id: item.id,
          product_id: item.product_id,
          size: item.size,
          color: item.color,
          sku: item.sku,
          price: Number(item.price),
          stock: Array.isArray(item.inventory)
            ? (item.inventory[0]?.quantity ?? 0)
            : (item.inventory?.quantity ?? 0),
          created_at: item.created_at,
        };
      });

      // 3. Fetch Invoices
      const { data: dbInvoices, error: invError } = await supabase
        .from("invoices")
        .select("*")
        .eq("store_id", store.id)
        .order("created_at", { ascending: false });

      if (invError) throw invError;

      set({
        products: dbProducts || [],
        variants: mappedVariants,
        invoices: dbInvoices || [],
      });
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error("Error fetching store database:", errMsg);
      set({ errorMsg: "Failed to sync inventory: " + errMsg });
    } finally {
      set({ isLoading: false });
    }
  },
});
