import { create } from "zustand";
import { supabase, hasSupabaseConfig } from "@/lib/supabase";

// =========================================================================
// TYPES DEFINITIONS
// =========================================================================

export interface StoreMetadata {
  id: string;
  name: string;
  phone: string;
  address: string;
  pan_vat: string;
}

export interface Profile {
  id: string;
  name: string;
  store_id: string;
  email?: string;
}

export interface Product {
  id: string;
  store_id: string;
  name: string;
  category: string;
  image_url: string | null;
  low_stock_threshold: number;
  created_at?: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  size: string;
  color: string;
  sku: string;
  price: number;
  stock?: number; // Inlined stock for UI convenience
  created_at?: string;
}

export interface InventoryItem {
  id: string;
  variant_id: string;
  quantity: number;
  updated_at?: string;
}

export interface CartItem {
  variant_id: string;
  product_id: string;
  name: string;
  size: string;
  color: string;
  sku: string;
  price: number;
  quantity: number;
  availableStock: number;
}

export interface Invoice {
  id: string;
  store_id: string;
  invoice_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  total_amount: number;
  discount_amount: number;
  paid_amount: number;
  payment_method: string;
  created_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  // Dynamic fields loaded for receipt UI
  product_name?: string;
  size?: string;
  color?: string;
}

// =========================================================================
// HIGH-FIDELITY NEPALESE DEMO DATA SEEDS
// =========================================================================

const DEMO_STORE: StoreMetadata = {
  id: "demo-store-uuid-001",
  name: "KTM Streetwear Hub",
  phone: "9851012345",
  address: "Civil Mall, Kathmandu, Nepal",
  pan_vat: "601245789",
};

const DEMO_PROFILE: Profile = {
  id: "demo-user-uuid-001",
  name: "Sunil Shrestha",
  store_id: DEMO_STORE.id,
  email: "sunil@ktmstreetwear.com",
};

const DEMO_PRODUCTS: Product[] = [
  {
    id: "prod-1",
    store_id: DEMO_STORE.id,
    name: "Oversized Heavyweight Hoodie",
    category: "Outerwear",
    image_url: null,
    low_stock_threshold: 4,
  },
  {
    id: "prod-2",
    store_id: DEMO_STORE.id,
    name: "Baggy Fit Cargo Jeans",
    category: "Bottoms",
    image_url: null,
    low_stock_threshold: 5,
  },
  {
    id: "prod-3",
    store_id: DEMO_STORE.id,
    name: "Minimalist Linen Kurti Set",
    category: "Traditional",
    image_url: null,
    low_stock_threshold: 3,
  },
  {
    id: "prod-4",
    store_id: DEMO_STORE.id,
    name: "Core Essential Tee",
    category: "Tops",
    image_url: null,
    low_stock_threshold: 5,
  },
];

const DEMO_VARIANTS: ProductVariant[] = [
  // Hoodie variants
  { id: "var-1-1", product_id: "prod-1", size: "M", color: "Acid Black", sku: "HOOD-BLK-M", price: 2850, stock: 12 },
  { id: "var-1-2", product_id: "prod-1", size: "L", color: "Acid Black", sku: "HOOD-BLK-L", price: 2850, stock: 3 }, // Low stock!
  { id: "var-1-3", product_id: "prod-1", size: "XL", color: "Acid Black", sku: "HOOD-BLK-XL", price: 2950, stock: 6 },
  { id: "var-1-4", product_id: "prod-1", size: "M", color: "Olive Green", sku: "HOOD-OLV-M", price: 2850, stock: 10 },
  { id: "var-1-5", product_id: "prod-1", size: "L", color: "Olive Green", sku: "HOOD-OLV-L", price: 2850, stock: 0 }, // Out of stock!

  // Cargo Jeans variants
  { id: "var-2-1", product_id: "prod-2", size: "30", color: "Denim Blue", sku: "CARG-BLU-30", price: 2400, stock: 15 },
  { id: "var-2-2", product_id: "prod-2", size: "32", color: "Denim Blue", sku: "CARG-BLU-32", price: 2400, stock: 4 }, // Low stock!
  { id: "var-2-3", product_id: "prod-2", size: "34", color: "Denim Blue", sku: "CARG-BLU-34", price: 2450, stock: 8 },
  { id: "var-2-4", product_id: "prod-2", size: "30", color: "Olive Drab", sku: "CARG-OLV-30", price: 2400, stock: 1 }, // Low stock!

  // Kurti Set
  { id: "var-3-1", product_id: "prod-3", size: "S", color: "Pastel Pink", sku: "KURT-PNK-S", price: 1950, stock: 14 },
  { id: "var-3-2", product_id: "prod-3", size: "M", color: "Pastel Pink", sku: "KURT-PNK-M", price: 1950, stock: 8 },
  { id: "var-3-3", product_id: "prod-3", size: "L", color: "Pastel Pink", sku: "KURT-PNK-L", price: 1950, stock: 2 }, // Low stock!

  // Essential Tee
  { id: "var-4-1", product_id: "prod-4", size: "M", color: "Off-White", sku: "TEE-WHT-M", price: 1200, stock: 25 },
  { id: "var-4-2", product_id: "prod-4", size: "L", color: "Off-White", sku: "TEE-WHT-L", price: 1200, stock: 18 },
  { id: "var-4-3", product_id: "prod-4", size: "M", color: "Charcoal Grey", sku: "TEE-GRY-M", price: 1200, stock: 3 }, // Low stock!
  { id: "var-4-4", product_id: "prod-4", size: "L", color: "Charcoal Grey", sku: "TEE-GRY-L", price: 1200, stock: 12 },
];

const DEMO_INVOICES: Invoice[] = [
  {
    id: "inv-1",
    store_id: DEMO_STORE.id,
    invoice_number: "INV-2026-0001",
    customer_name: "Aashish Adhikari",
    customer_phone: "9841987654",
    total_amount: 5250,
    discount_amount: 0,
    paid_amount: 5250,
    payment_method: "eSewa",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
  },
  {
    id: "inv-2",
    store_id: DEMO_STORE.id,
    invoice_number: "INV-2026-0002",
    customer_name: "Pooja Shrestha",
    customer_phone: "9860123456",
    total_amount: 2400,
    discount_amount: 100,
    paid_amount: 2300,
    payment_method: "Cash",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 25).toISOString(), // 25 hours ago
  },
  {
    id: "inv-3",
    store_id: DEMO_STORE.id,
    invoice_number: "INV-2026-0003",
    customer_name: "Subash Thapa",
    customer_phone: "9812345678",
    total_amount: 1200,
    discount_amount: 0,
    paid_amount: 1200,
    payment_method: "Fonepay",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), // 2 days ago
  },
];

const DEMO_INVOICE_ITEMS: Record<string, InvoiceItem[]> = {
  "inv-1": [
    { id: "inv-item-1-1", invoice_id: "inv-1", variant_id: "var-1-1", quantity: 1, unit_price: 2850, subtotal: 2850 },
    { id: "inv-item-1-2", invoice_id: "inv-1", variant_id: "var-2-3", quantity: 1, unit_price: 2450, subtotal: 2450 },
  ],
  "inv-2": [
    { id: "inv-item-2-1", invoice_id: "inv-2", variant_id: "var-2-1", quantity: 1, unit_price: 2400, subtotal: 2400 },
  ],
  "inv-3": [
    { id: "inv-item-3-1", invoice_id: "inv-3", variant_id: "var-4-1", quantity: 1, unit_price: 1200, subtotal: 1200 },
  ],
};

// =========================================================================
// STATE INTERFACE
// =========================================================================

interface AppState {
  // Navigation & Core UI
  activeTab: "dashboard" | "billing" | "inventory" | "history";
  isDemoMode: boolean;
  user: Profile | null;
  store: StoreMetadata | null;
  isLoading: boolean;
  errorMsg: string | null;

  // DB Collections in memory (Zustand synchronizes these from Supabase)
  products: Product[];
  variants: ProductVariant[];
  invoices: Invoice[];
  invoiceItems: Record<string, InvoiceItem[]>; // Keyed by invoice_id

  // Active Billing POS Cart
  cart: CartItem[];
  cartDiscount: number;
  customerName: string;
  customerPhone: string;
  paymentMethod: string; // 'Cash' | 'eSewa' | 'Khalti' | 'Fonepay'
  activeInvoice: Invoice | null; // Set after successful checkout to trigger receipt
  activeInvoiceItems: InvoiceItem[] | null;

  // Modals & UI States
  isProductModalOpen: boolean;
  isQuickBillingOpen: boolean;

  // ACTIONS
  setTab: (tab: "dashboard" | "billing" | "inventory" | "history") => void;
  setDemoMode: (enabled: boolean) => void;
  initializeSession: () => Promise<void>;
  signOut: () => Promise<void>;

  // Synchronizers
  fetchStoreData: () => Promise<void>;

  // Products & Variants Management
  addProduct: (
    name: string,
    category: string,
    lowStockThreshold: number,
    variantData: Array<{ size: string; color: string; sku: string; price: number; stock: number }>
  ) => Promise<boolean>;
  
  deleteProduct: (productId: string) => Promise<boolean>;
  updateStockDirect: (variantId: string, newStock: number) => Promise<boolean>;

  // Billing POS Cart Actions
  addToCart: (variantId: string) => void;
  removeFromCart: (variantId: string) => void;
  updateCartQuantity: (variantId: string, quantity: number) => void;
  clearCart: () => void;
  setCartDiscount: (discount: number) => void;
  setCustomerDetails: (name: string, phone: string) => void;
  setPaymentMethod: (method: string) => void;
  checkout: () => Promise<boolean>;
  closeReceiptModal: () => void;
  setActiveInvoice: (invoice: Invoice | null, items: InvoiceItem[] | null) => void;
}

// =========================================================================
// ZUSTAND STORE CREATION
// =========================================================================

export const useAppStore = create<AppState>((set, get) => ({
  // Navigation & Core UI
  activeTab: "dashboard",
  isDemoMode: true, // Default to demo mode for high onboarding availability
  user: null,
  store: null,
  isLoading: false,
  errorMsg: null,

  products: [],
  variants: [],
  invoices: [],
  invoiceItems: {},

  // POS Cart State
  cart: [],
  cartDiscount: 0,
  customerName: "",
  customerPhone: "",
  paymentMethod: "Cash",
  activeInvoice: null,
  activeInvoiceItems: null,

  // Modals
  isProductModalOpen: false,
  isQuickBillingOpen: false,

  // Setters
  setTab: (tab) => set({ activeTab: tab }),
  setDemoMode: (enabled) => set({ isDemoMode: enabled }),

  // Initialize Auth & App State
  initializeSession: async () => {
    if (typeof window !== "undefined") {
      const channel = new BroadcastChannel("paisapos-demo-sync");
      channel.onmessage = (event) => {
        const { type, payload } = event.data;
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
        } else if (type === "SYNC_PRODUCT_ADD" || type === "SYNC_PRODUCT_DELETE") {
          set({
            products: payload.products,
            variants: payload.variants,
          });
        }
      };
    }

    set({ isLoading: true, errorMsg: null });
    const isSupabaseReady = hasSupabaseConfig();

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
      // 1. Get current auth user
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      if (!session) {
        // No session: enter Demo Mode automatically (user can log in to view their own store later)
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
        return;
      }

      // 2. Load User Profile from Supabase
      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("*")
        .eq("id", session.user.id)
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
        user: { id: profile.id, name: profile.name, store_id: profile.store_id, email: session.user.email },
        store: store,
      });

      await get().fetchStoreData();
    } catch (e: any) {
      console.warn("Failed to initialize session. Reverting to local Demo Mode:", e.message);
      set({
        isDemoMode: true,
        user: DEMO_PROFILE,
        store: DEMO_STORE,
        products: DEMO_PRODUCTS,
        variants: DEMO_VARIANTS,
        invoices: DEMO_INVOICES,
        invoiceItems: DEMO_INVOICE_ITEMS,
        errorMsg: e.message,
      });
    } finally {
      set({ isLoading: false });
    }
  },

  signOut: async () => {
    set({ isLoading: true });
    if (!get().isDemoMode) {
      await supabase.auth.signOut();
    }
    // Revert to demo mode on sign out
    set({
      isDemoMode: true,
      user: DEMO_PROFILE,
      store: DEMO_STORE,
      products: DEMO_PRODUCTS,
      variants: DEMO_VARIANTS,
      invoices: DEMO_INVOICES,
      invoiceItems: DEMO_INVOICE_ITEMS,
      cart: [],
      activeInvoice: null,
      activeTab: "dashboard",
      isLoading: false,
    });
  },

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
      const mappedVariants: ProductVariant[] = (dbVariants || []).map((v: any) => ({
        id: v.id,
        product_id: v.product_id,
        size: v.size,
        color: v.color,
        sku: v.sku,
        price: Number(v.price),
        stock: v.inventory?.[0]?.quantity ?? 0,
        created_at: v.created_at,
      }));

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
    } catch (e: any) {
      console.error("Error fetching store database:", e.message);
      set({ errorMsg: "Failed to sync inventory: " + e.message });
    } finally {
      set({ isLoading: false });
    }
  },

  // -------------------------------------------------------------------------
  // PRODUCTS & VARIANTS OPERATIONS
  // -------------------------------------------------------------------------

  addProduct: async (name, category, lowStockThreshold, variantData) => {
    const { isDemoMode, store, products, variants } = get();
    if (!store) return false;

    set({ isLoading: true, errorMsg: null });

    if (isDemoMode) {
      // Simulate quick add locally
      const newProductId = `prod-${Date.now()}`;
      const newProduct: Product = {
        id: newProductId,
        store_id: store.id,
        name,
        category,
        image_url: null,
        low_stock_threshold: lowStockThreshold,
      };

      const newVariants: ProductVariant[] = variantData.map((v, index) => ({
        id: `var-${Date.now()}-${index}`,
        product_id: newProductId,
        size: v.size,
        color: v.color,
        sku: v.sku,
        price: v.price,
        stock: v.stock,
      }));

      const newProducts = [newProduct, ...products];
      const newAllVariants = [...variants, ...newVariants];
      set({
        products: newProducts,
        variants: newAllVariants,
        isLoading: false,
      });

      if (typeof window !== "undefined") {
        const channel = new BroadcastChannel("paisapos-demo-sync");
        channel.postMessage({
          type: "SYNC_PRODUCT_ADD",
          payload: { products: newProducts, variants: newAllVariants }
        });
        channel.close();
      }
      return true;
    }

    try {
      // 1. Insert product record
      const { data: product, error: prodError } = await supabase
        .from("products")
        .insert({
          store_id: store.id,
          name,
          category,
          low_stock_threshold: lowStockThreshold,
        })
        .select()
        .single();

      if (prodError) throw prodError;

      // 2. Prepare variants and insert them
      const variantsToInsert = variantData.map(v => ({
        product_id: product.id,
        size: v.size,
        color: v.color,
        sku: v.sku,
        price: v.price,
      }));

      const { data: dbVariants, error: varError } = await supabase
        .from("product_variants")
        .insert(variantsToInsert)
        .select();

      if (varError) throw varError;

      // 3. Prepare inventory records for the created variants
      const inventoryToInsert = dbVariants.map(v => {
        const matchingInput = variantData.find(vd => vd.sku === v.sku);
        return {
          variant_id: v.id,
          quantity: matchingInput?.stock ?? 0,
        };
      });

      const { error: invError } = await supabase
        .from("inventory")
        .insert(inventoryToInsert);

      if (invError) throw invError;

      // Refresh store data to keep in complete sync
      await get().fetchStoreData();
      return true;
    } catch (e: any) {
      console.error("Error creating product:", e.message);
      set({ errorMsg: "Failed to add product: " + e.message, isLoading: false });
      return false;
    }
  },

  deleteProduct: async (productId) => {
    const { isDemoMode, products, variants } = get();
    set({ isLoading: true, errorMsg: null });

    if (isDemoMode) {
      const newProducts = products.filter(p => p.id !== productId);
      const newAllVariants = variants.filter(v => v.product_id !== productId);
      set({
        products: newProducts,
        variants: newAllVariants,
        isLoading: false,
      });

      if (typeof window !== "undefined") {
        const channel = new BroadcastChannel("paisapos-demo-sync");
        channel.postMessage({
          type: "SYNC_PRODUCT_DELETE",
          payload: { products: newProducts, variants: newAllVariants }
        });
        channel.close();
      }
      return true;
    }

    try {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", productId);

      if (error) throw error;

      await get().fetchStoreData();
      return true;
    } catch (e: any) {
      console.error("Error deleting product:", e.message);
      set({ errorMsg: "Failed to delete product: " + e.message, isLoading: false });
      return false;
    }
  },

  updateStockDirect: async (variantId, newStock) => {
    const { isDemoMode, variants } = get();
    set({ isLoading: true, errorMsg: null });

    if (isDemoMode) {
      const updatedVariants = variants.map(v => (v.id === variantId ? { ...v, stock: newStock } : v));
      set({
        variants: updatedVariants,
        isLoading: false,
      });

      if (typeof window !== "undefined") {
        const channel = new BroadcastChannel("paisapos-demo-sync");
        channel.postMessage({
          type: "SYNC_STOCK_DIRECT",
          payload: { variants: updatedVariants }
        });
        channel.close();
      }
      return true;
    }

    try {
      const { error } = await supabase
        .from("inventory")
        .update({ quantity: newStock, updated_at: new Date().toISOString() })
        .eq("variant_id", variantId);

      if (error) throw error;

      await get().fetchStoreData();
      return true;
    } catch (e: any) {
      console.error("Error updating stock directly:", e.message);
      set({ errorMsg: "Failed to save stock adjustment: " + e.message, isLoading: false });
      return false;
    }
  },

  // -------------------------------------------------------------------------
  // POS CART ACTIONS
  // -------------------------------------------------------------------------

  addToCart: (variantId) => {
    const { cart, variants, products } = get();
    const variant = variants.find(v => v.id === variantId);
    if (!variant) return;

    const product = products.find(p => p.id === variant.product_id);
    if (!product) return;

    const existingCartItem = cart.find(item => item.variant_id === variantId);
    const availableStock = variant.stock ?? 0;

    if (existingCartItem) {
      if (existingCartItem.quantity < availableStock) {
        set({
          cart: cart.map(item =>
            item.variant_id === variantId ? { ...item, quantity: item.quantity + 1 } : item
          ),
        });
      }
    } else {
      if (availableStock > 0) {
        const newItem: CartItem = {
          variant_id: variantId,
          product_id: variant.product_id,
          name: product.name,
          size: variant.size,
          color: variant.color,
          sku: variant.sku,
          price: variant.price,
          quantity: 1,
          availableStock: availableStock,
        };
        set({ cart: [...cart, newItem] });
      }
    }
  },

  removeFromCart: (variantId) => {
    const { cart } = get();
    set({ cart: cart.filter(item => item.variant_id !== variantId) });
  },

  updateCartQuantity: (variantId, quantity) => {
    const { cart } = get();
    const item = cart.find(c => c.variant_id === variantId);
    if (!item) return;

    if (quantity <= 0) {
      get().removeFromCart(variantId);
      return;
    }

    if (quantity > item.availableStock) {
      quantity = item.availableStock; // Cap at max available stock
    }

    set({
      cart: cart.map(item =>
        item.variant_id === variantId ? { ...item, quantity } : item
      ),
    });
  },

  clearCart: () => {
    set({
      cart: [],
      cartDiscount: 0,
      customerName: "",
      customerPhone: "",
      paymentMethod: "Cash",
    });
  },

  setCartDiscount: (discount) => {
    if (discount < 0) discount = 0;
    set({ cartDiscount: discount });
  },

  setCustomerDetails: (name, phone) => {
    set({ customerName: name, customerPhone: phone });
  },

  setPaymentMethod: (method) => {
    set({ paymentMethod: method });
  },

  setActiveInvoice: (invoice, items) => {
    set({ activeInvoice: invoice, activeInvoiceItems: items });
  },

  closeReceiptModal: () => {
    set({ activeInvoice: null, activeInvoiceItems: null });
  },

  // Checkout (Executes transactional Supabase RPC or local equivalent)
  checkout: async () => {
    const {
      isDemoMode,
      store,
      cart,
      cartDiscount,
      customerName,
      customerPhone,
      paymentMethod,
      invoices,
      variants,
      products,
      invoiceItems,
    } = get();

    if (!store || cart.length === 0) return false;

    set({ isLoading: true, errorMsg: null });

    const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotalPrice = cart.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const totalAmount = Math.max(0, subtotalPrice - cartDiscount);

    // Dynamic Invoice Number Generation
    const timestamp = Date.now();
    const invoiceNumStr = `INV-${new Date().getFullYear()}-${String(invoices.length + 1).padStart(4, "0")}`;

    if (isDemoMode) {
      // 1. Double check stock in local state
      for (const cartItem of cart) {
        const variant = variants.find(v => v.id === cartItem.variant_id);
        const stockAvailable = variant?.stock ?? 0;
        if (stockAvailable < cartItem.quantity) {
          set({
            errorMsg: `Insufficient stock for SKU ${cartItem.sku}. Available: ${stockAvailable}, Requested: ${cartItem.quantity}`,
            isLoading: false,
          });
          return false;
        }
      }

      // 2. Perform local state changes atomically
      const newInvoiceId = `inv-${timestamp}`;
      const newInvoice: Invoice = {
        id: newInvoiceId,
        store_id: store.id,
        invoice_number: invoiceNumStr,
        customer_name: customerName || "General Customer",
        customer_phone: customerPhone || null,
        total_amount: totalAmount,
        discount_amount: cartDiscount,
        paid_amount: totalAmount,
        payment_method: paymentMethod,
        created_at: new Date().toISOString(),
      };

      // Create invoice items + update variant quantities in state
      const createdItems: InvoiceItem[] = [];
      const updatedVariants = variants.map(v => {
        const cartMatch = cart.find(ci => ci.variant_id === v.id);
        if (cartMatch) {
          const itemSubtotal = cartMatch.quantity * cartMatch.price;
          createdItems.push({
            id: `inv-item-${timestamp}-${cartMatch.variant_id}`,
            invoice_id: newInvoiceId,
            variant_id: cartMatch.variant_id,
            quantity: cartMatch.quantity,
            unit_price: cartMatch.price,
            subtotal: itemSubtotal,
            product_name: cartMatch.name,
            size: cartMatch.size,
            color: cartMatch.color,
          });
          return {
            ...v,
            stock: Math.max(0, (v.stock ?? 0) - cartMatch.quantity),
          };
        }
        return v;
      });

      // Update state
      set({
        invoices: [newInvoice, ...invoices],
        variants: updatedVariants,
        invoiceItems: {
          ...invoiceItems,
          [newInvoiceId]: createdItems,
        },
        activeInvoice: newInvoice,
        activeInvoiceItems: createdItems,
        cart: [],
        cartDiscount: 0,
        customerName: "",
        customerPhone: "",
        paymentMethod: "Cash",
        isLoading: false,
      });

      if (typeof window !== "undefined") {
        const channel = new BroadcastChannel("paisapos-demo-sync");
        channel.postMessage({
          type: "SYNC_CHECKOUT",
          payload: {
            invoices: [newInvoice, ...invoices],
            variants: updatedVariants,
            invoiceItems: {
              ...invoiceItems,
              [newInvoiceId]: createdItems,
            },
          }
        });
        channel.close();
      }

      return true;
    }

    // Real Supabase checkout via custom RPC transactional function
    try {
      const itemsPayload = cart.map(item => ({
        variant_id: item.variant_id,
        quantity: item.quantity,
        unit_price: item.price,
        subtotal: item.quantity * item.price,
      }));

      // Call our robust atomic PostgreSQL transaction function in Supabase
      const { data: returnedInvoiceId, error: rpcError } = await supabase.rpc(
        "create_invoice_and_deduct_stock",
        {
          p_store_id: store.id,
          p_invoice_number: invoiceNumStr,
          p_customer_name: customerName || "General Customer",
          p_customer_phone: customerPhone || null,
          p_total_amount: totalAmount,
          p_discount_amount: cartDiscount,
          p_paid_amount: totalAmount,
          p_payment_method: paymentMethod,
          p_items: itemsPayload,
        }
      );

      if (rpcError) throw rpcError;

      // 4. Fetch the created invoice and items for immediate receipt display
      const { data: dbInvoice, error: invFetchError } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", returnedInvoiceId)
        .single();

      if (invFetchError) throw invFetchError;

      const { data: dbItems, error: itemsFetchError } = await supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", returnedInvoiceId);

      if (itemsFetchError) throw itemsFetchError;

      // Map dynamic receipt fields
      const receiptItems: InvoiceItem[] = dbItems.map(item => {
        const v = variants.find(vr => vr.id === item.variant_id);
        const p = products.find(pr => pr.id === v?.product_id);
        return {
          ...item,
          product_name: p?.name ?? "Unknown Product",
          size: v?.size ?? "-",
          color: v?.color ?? "-",
        };
      });

      // Clear cart locally, refresh store variables, and set receipt active
      set({
        cart: [],
        cartDiscount: 0,
        customerName: "",
        customerPhone: "",
        paymentMethod: "Cash",
        activeInvoice: dbInvoice,
        activeInvoiceItems: receiptItems,
      });

      await get().fetchStoreData();
      return true;
    } catch (e: any) {
      console.error("Checkout Transaction Failed, Rolled back:", e.message);
      set({
        errorMsg: e.message || "Failed to process sale. Please try again.",
        isLoading: false,
      });
      return false;
    }
  },
}));
