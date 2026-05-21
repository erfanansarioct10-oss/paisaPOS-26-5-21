// =========================================================================
// PaisaPOS — Cart & Checkout Slice
// =========================================================================

import type { AppState, CartItem, Invoice, InvoiceItem } from "./types";
import { checkoutAction } from "@/app/actions";
import { getSyncToken } from "@/lib/broadcast";

function mapCheckoutError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.toLowerCase().includes("insufficient stock")) {
    return msg;
  }
  if (msg.toLowerCase().includes("price tampering")) {
    return "Checkout failed: Price validation mismatch. Please refresh your cart.";
  }
  if (msg.toLowerCase().includes("unauthorized") || msg.toLowerCase().includes("unauthenticated")) {
    return "Checkout failed: Unauthorized session. Please sign in again.";
  }
  return "Failed to process sale. Please try again.";
}

type SetState = (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void;
type GetState = () => AppState;

export const createCartSlice = (set: SetState, get: GetState) => ({
  // -----------------------------------------------------------------------
  // INITIAL CART STATE
  // -----------------------------------------------------------------------
  cart: [] as CartItem[],
  cartDiscount: 0,
  customerName: "",
  customerPhone: "",
  paymentMethod: "Cash",
  activeInvoice: null as Invoice | null,
  activeInvoiceItems: null as InvoiceItem[] | null,

  // -----------------------------------------------------------------------
  // CART ITEM ACTIONS
  // -----------------------------------------------------------------------
  addToCart: (variantId: string) => {
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

  removeFromCart: (variantId: string) => {
    const { cart } = get();
    set({ cart: cart.filter(item => item.variant_id !== variantId) });
  },

  updateCartQuantity: (variantId: string, quantity: number) => {
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

  // -----------------------------------------------------------------------
  // CART METADATA SETTERS
  // -----------------------------------------------------------------------
  setCartDiscount: (discount: number) => {
    if (discount < 0) discount = 0;
    set({ cartDiscount: discount });
  },

  setCustomerDetails: (name: string, phone: string) => {
    set({ customerName: name, customerPhone: phone });
  },

  setPaymentMethod: (method: string) => {
    set({ paymentMethod: method });
  },

  setActiveInvoice: (invoice: Invoice | null, items: InvoiceItem[] | null) => {
    set({ activeInvoice: invoice, activeInvoiceItems: items });
  },

  closeReceiptModal: () => {
    set({ activeInvoice: null, activeInvoiceItems: null });
  },

  // -----------------------------------------------------------------------
  // CHECKOUT (Atomic Supabase RPC or local demo equivalent)
  // -----------------------------------------------------------------------
  checkout: async (): Promise<boolean> => {
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
          },
          token: getSyncToken()
        });
        channel.close();
      }

      return true;
    }

    // Real Supabase checkout via Server Action (MEDIUM-09, MEDIUM-20)
    try {
      const itemsPayload = cart.map(item => ({
        variant_id: item.variant_id,
        quantity: item.quantity,
        unit_price: item.price,
        subtotal: item.quantity * item.price,
      }));

      const dbInvoiceWithItems = await checkoutAction({
        storeId: store.id,
        invoiceNumber: invoiceNumStr,
        customerName: customerName || "General Customer",
        customerPhone: customerPhone || null,
        totalAmount,
        discountAmount: cartDiscount,
        paidAmount: totalAmount,
        paymentMethod,
        items: itemsPayload,
      });

      const { invoice_items: dbItems, ...dbInvoice } = dbInvoiceWithItems;

      // Map dynamic receipt fields
      const receiptItems: InvoiceItem[] = (dbItems || []).map((item: InvoiceItem) => {
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

      // Broadcast changes using signed BroadcastChannel payloads
      if (typeof window !== "undefined") {
        const channel = new BroadcastChannel("paisapos-demo-sync");
        channel.postMessage({
          type: "SYNC_CHECKOUT",
          payload: {
            invoices: get().invoices,
            variants: get().variants,
            invoiceItems: {
              ...get().invoiceItems,
              [dbInvoice.id]: receiptItems,
            },
          },
          token: getSyncToken()
        });
        channel.close();
      }

      return true;
    } catch (e: unknown) {
      const errMsg = mapCheckoutError(e);
      console.error("Checkout Transaction Failed, Rolled back:", errMsg);
      set({
        errorMsg: errMsg,
        isLoading: false,
      });
      return false;
    }
  },
});
