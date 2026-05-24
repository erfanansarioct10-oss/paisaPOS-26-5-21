// =========================================================================
// PaisaPOS — Shared Store Type Definitions
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
  role?: "owner" | "cashier";
}

export interface Product {
  id: string;
  store_id: string;
  name: string;
  category: string;
  image_url: string | null;
  low_stock_threshold: number;
  is_favorite: boolean;
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
  is_custom?: boolean;
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
  variant_id: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  // Dynamic fields loaded for receipt UI
  product_name?: string;
  size?: string;
  color?: string;
  custom_name?: string | null;
}

// =========================================================================
// UNIFIED APP STATE INTERFACE
// =========================================================================

export interface AppState {
  // Navigation & Core UI
  activeTab: "dashboard" | "billing" | "inventory" | "history" | "settings";
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
  isImporting: boolean;

  // In-flight concurrency tracking for stock updates
  pendingStockUpdates: Record<string, number>;
  pendingStockRequests: Record<string, number>;
  originalStockLevels: Record<string, number>;

  // In-flight concurrency tracking for favorite updates
  pendingFavoriteUpdates: Record<string, boolean>;
  pendingFavoriteRequests: Record<string, number>;
  originalFavoriteLevels: Record<string, boolean>;


  // ACTIONS
  setTab: (tab: "dashboard" | "billing" | "inventory" | "history" | "settings") => void;
  initializeSession: () => Promise<void>;
  signOut: () => Promise<void>;

  // Synchronizers
  fetchStoreData: (options?: { forceLoading?: boolean }) => Promise<void>;
  loadMoreInvoices: (limit?: number) => Promise<void>;
  fetchInvoiceItems: (invoiceId: string) => Promise<InvoiceItem[]>;
  clearError: () => void;

  // Products & Variants Management
  addProduct: (
    name: string,
    category: string,
    lowStockThreshold: number,
    variantData: Array<{ size: string; color: string; sku: string; price: number; stock: number }>
  ) => Promise<boolean>;
  
  deleteProduct: (productId: string) => Promise<boolean>;
  updateProduct: (
    productId: string,
    name: string,
    category: string,
    lowStockThreshold: number,
    variantsData: Array<{
      id?: string;
      size: string;
      color: string;
      sku: string;
      price: number;
      stock: number;
    }>,
    deletedVariantIds: string[]
  ) => Promise<boolean>;
  updateStockDirect: (variantId: string, newStock: number) => Promise<boolean>;
  toggleProductFavorite: (productId: string, isFavorite: boolean) => Promise<boolean>;
  
  bulkImportProducts: (
    parsedProducts: Array<{
      name: string;
      category: string;
      lowStockThreshold: number;
      variants: Array<{
        size: string;
        color: string;
        sku: string;
        price: number;
        stock: number;
      }>;
    }>,
    onProgress?: (current: number, total: number) => void
  ) => Promise<{
    succeededCount: number;
    failedProducts: Array<{ name: string; error: string }>;
    failedChunkError?: string;
    skippedRemainder?: string[];
  }>;

  // Billing POS Cart Actions
  addToCart: (variantId: string) => void;
  addCustomToCart: (name: string, price: number) => void;
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
