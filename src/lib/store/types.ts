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
// UNIFIED APP STATE INTERFACE
// =========================================================================

export interface AppState {
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
