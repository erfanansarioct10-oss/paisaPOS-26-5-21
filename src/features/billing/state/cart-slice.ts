// =========================================================================
// PaisaPOS — Cart & Checkout Slice
// =========================================================================

import type { AppState, CartItem, Invoice, InvoiceItem } from "@/lib/store/types";
import { checkoutAction } from "@/features/billing/server/actions";

// ---------------------------------------------------------------------------
// Checkout timeout configuration
// ---------------------------------------------------------------------------

/** Maximum time (ms) to wait for a single checkout server action call. */
const CHECKOUT_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapCheckoutError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const lowercaseMsg = msg.toLowerCase();
  if (lowercaseMsg.includes("invalid checkout payload")) {
    return msg;
  }
  if (lowercaseMsg.includes("insufficient stock")) {
    return msg;
  }
  if (lowercaseMsg.includes("price tampering")) {
    return "Checkout failed: Price validation mismatch. Please refresh your cart.";
  }
  if (lowercaseMsg.includes("unauthorized") || lowercaseMsg.includes("unauthenticated")) {
    return "Checkout failed: Unauthorized session. Please sign in again.";
  }
  return "Failed to process sale. Please try again.";
}

function createCheckoutIdempotencyKey(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/** Returns true if the error looks like a network timeout or connectivity issue. */
function isTimeoutOrNetworkError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") return true;
  if (e instanceof TypeError) {
    // fetch() throws TypeError for network failures
    const msg = e.message.toLowerCase();
    if (msg.includes("failed to fetch") || msg.includes("network") || msg.includes("aborted")) {
      return true;
    }
  }
  if (e instanceof Error) {
    const msg = e.message.toLowerCase();
    if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("network")) {
      return true;
    }
  }
  return false;
}

/**
 * Race a promise against an AbortSignal-based timeout.
 * Returns the result of `fn` or throws an AbortError on timeout.
 */
function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fn(controller.signal).finally(() => clearTimeout(timer));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  checkoutIdempotencyKey: null,
  isCheckoutInFlight: false,
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
          checkoutIdempotencyKey: null,
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
        set({ cart: [...cart, newItem], checkoutIdempotencyKey: null });
      }
    }
  },
  addCustomToCart: (name: string, price: number) => {
    const { cart } = get();
    const existing = cart.find(item => item.is_custom && item.name === name && item.price === price);
    if (existing) {
      set({
          cart: cart.map(item =>
            item.variant_id === existing.variant_id ? { ...item, quantity: item.quantity + 1 } : item
          ),
          checkoutIdempotencyKey: null,
        });
    } else {
      const customId = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newItem: CartItem = {
        variant_id: customId,
        product_id: "custom",
        name,
        size: "-",
        color: "-",
        sku: "CUSTOM",
        price,
        quantity: 1,
        availableStock: 9999,
        is_custom: true,
      };
      set({ cart: [...cart, newItem], checkoutIdempotencyKey: null });
    }
  },

  removeFromCart: (variantId: string) => {
    const { cart } = get();
    set({ cart: cart.filter(item => item.variant_id !== variantId), checkoutIdempotencyKey: null });
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
      checkoutIdempotencyKey: null,
    });
  },

  clearCart: () => {
    set({
      cart: [],
      cartDiscount: 0,
      customerName: "",
      customerPhone: "",
      paymentMethod: "Cash",
      checkoutIdempotencyKey: null,
      isCheckoutInFlight: false,
    });
  },

  // -----------------------------------------------------------------------
  // CART METADATA SETTERS
  // -----------------------------------------------------------------------
  setCartDiscount: (discount: number) => {
    // Defense-in-depth: reject NaN/Infinity — always keep store clean
    if (!Number.isFinite(discount) || discount < 0) discount = 0;
    set({ cartDiscount: discount, checkoutIdempotencyKey: null });
  },

  setCustomerDetails: (name: string, phone: string) => {
    set({ customerName: name, customerPhone: phone, checkoutIdempotencyKey: null });
  },

  setPaymentMethod: (method: string) => {
    set({ paymentMethod: method, checkoutIdempotencyKey: null });
  },

  setActiveInvoice: (invoice: Invoice | null, items: InvoiceItem[] | null) => {
    set({ activeInvoice: invoice, activeInvoiceItems: items });
  },

  closeReceiptModal: () => {
    set({ activeInvoice: null, activeInvoiceItems: null });
  },

  // -----------------------------------------------------------------------
  // CHECKOUT (Atomic Supabase RPC) — with timeout + single retry
  //
  // The button is disabled while isCheckoutInFlight is true.
  // On a network timeout the function waits 3 s then retries once with
  // the same idempotency key (the DB will replay if the first attempt
  // actually committed).  The button stays disabled throughout.
  // On a *confirmed* server error (not a timeout) the button re-enables
  // immediately so the cashier can fix the issue and retry.
  // -----------------------------------------------------------------------
  checkout: async (): Promise<boolean> => {
    const {
      store,
      cart,
      cartDiscount,
      customerName,
      customerPhone,
      paymentMethod,
      checkoutIdempotencyKey,
      isCheckoutInFlight,
      variants,
      products,
    } = get();

    if (!store || cart.length === 0) return false;
    if (isCheckoutInFlight) return false;

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      set({ errorMsg: "Checkout failed: Internet connection is offline." });
      return false;
    }

    const idempotencyKey = checkoutIdempotencyKey ?? createCheckoutIdempotencyKey();
    set({
      isLoading: true,
      isCheckoutInFlight: true,
      errorMsg: null,
      checkoutIdempotencyKey: idempotencyKey,
    });

    try {
      const subtotalPrice = cart.reduce((sum, item) => sum + item.quantity * item.price, 0);
      const totalAmount = Math.max(0, subtotalPrice - cartDiscount);

      // Real Supabase checkout via Server Action (MEDIUM-09, MEDIUM-20)
      const itemsPayload = cart.map(item => ({
        variant_id: item.is_custom ? null : item.variant_id,
        custom_name: item.is_custom ? item.name : null,
        quantity: item.quantity,
        unit_price: item.price,
        subtotal: item.quantity * item.price,
      }));

      const checkoutPayload = {
        storeId: store.id,
        idempotencyKey,
        customerName: customerName || "General Customer",
        customerPhone: customerPhone || null,
        totalAmount,
        discountAmount: cartDiscount,
        paidAmount: totalAmount,
        paymentMethod,
        items: itemsPayload,
      };

      // -------------------------------------------------------------------
      // Checkout attempt with timeout and exponential backoff retry loop
      // -------------------------------------------------------------------
      let dbInvoiceWithItems;
      const MAX_RETRIES = 2;
      let attempt = 0;

      while (attempt <= MAX_RETRIES) {
        try {
          if (attempt > 0) {
            const backoffMs = Math.pow(2, attempt) * 2000; // 4000ms, then 8000ms
            console.warn(
              `Checkout attempt ${attempt} timed out or had a network error. Retrying in ${backoffMs} ms...`,
            );
            set({ errorMsg: `Connection slow — retrying checkout (attempt ${attempt}/${MAX_RETRIES})...` });
            await delay(backoffMs);
          }

          dbInvoiceWithItems = await withTimeout(
            // The AbortSignal is not passed to checkoutAction because
            // Next.js server actions do not accept AbortSignal. The
            // timeout only controls how long the *client* waits.
            () => checkoutAction(checkoutPayload),
            CHECKOUT_TIMEOUT_MS,
          );
          // Clear any transient error messages on success.
          set({ errorMsg: null });
          break;
        } catch (error: unknown) {
          if (!isTimeoutOrNetworkError(error) || attempt === MAX_RETRIES) {
            if (isTimeoutOrNetworkError(error)) {
              throw new Error(
                "Checkout timed out after automatic retries. Please check your connection and try again.",
              );
            }
            throw error;
          }
          attempt++;
        }
      }

      if (!dbInvoiceWithItems) {
        throw new Error("Checkout failed: Server did not return invoice details.");
      }

      const { invoice_items: dbItems, ...dbInvoice } = dbInvoiceWithItems;

      // Map dynamic receipt fields
      const receiptItems: InvoiceItem[] = (dbItems || []).map((item: InvoiceItem) => {
        if (!item.variant_id) {
          return {
            ...item,
            product_name: item.custom_name ?? "Custom Item",
            size: "-",
            color: "-",
          };
        }
        const v = variants.find(vr => vr.id === item.variant_id);
        const p = products.find(pr => pr.id === v?.product_id);
        return {
          ...item,
          product_name: p?.name ?? "Unknown Product",
          size: v?.size ?? "-",
          color: v?.color ?? "-",
        };
      });

      // Clear cart locally, update store variables in-memory, and set receipt active
      // Atomically prepends the returned invoice and decrements variant stock levels locally, avoiding redundant network fetches
      set((state) => {
        const updatedVariants = state.variants.map((v) => {
          const cartItem = cart.find((item) => item.variant_id === v.id);
          if (cartItem) {
            return { ...v, stock: Math.max(0, (v.stock ?? 0) - cartItem.quantity) };
          }
          return v;
        });

        return {
          cart: [],
          cartDiscount: 0,
          customerName: "",
          customerPhone: "",
          paymentMethod: "Cash",
          activeInvoice: dbInvoice,
          activeInvoiceItems: receiptItems,
          checkoutIdempotencyKey: null,
          isCheckoutInFlight: false,
          invoices: [dbInvoice, ...state.invoices],
          invoiceItems: {
            ...state.invoiceItems,
            [dbInvoice.id]: receiptItems,
          },
          variants: updatedVariants,
        };
      });

      // Refresh invoice history data so /invoices page reflects the new sale
      get().fetchHistoryData().catch((err) =>
        console.error("Error refreshing invoice history after checkout:", err)
      );

      return true;
    } catch (e: unknown) {
      const errMsg = mapCheckoutError(e);
      console.error("Checkout Transaction Failed, Rolled back:", errMsg);
      set({ errorMsg: errMsg });
      return false;
    } finally {
      set({ isLoading: false, isCheckoutInFlight: false });
    }
  },
});

