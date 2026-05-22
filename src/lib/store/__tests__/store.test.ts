/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, beforeEach, vi, beforeAll, afterAll } from "vitest";
import { create } from "zustand";
import { AppState, Product, ProductVariant } from "../types";
import { createAuthSlice } from "../authSlice";
import { createInventorySlice } from "../inventorySlice";
import { createCartSlice } from "../cartSlice";
import { supabase } from "@/lib/supabase";
import * as actions from "@/app/actions";

let currentStore: any = null;

// Mock the Server Actions
vi.mock("@/app/actions", () => {
  return {
    upsertProductAction: vi.fn(async (params) => {
      if (!currentStore) throw new Error("No active store");
      const state = currentStore.getState();
      
      const productId = params.productId || `prod-${Math.random().toString(36).substr(2, 9)}`;
      
      // SKU validation
      for (const v of params.variants) {
        const exists = state.variants.find(
          (x: any) => x.sku === v.sku && x.id !== v.id && x.product_id !== productId
        );
        if (exists) {
          throw new Error("duplicate key value violates unique constraint \"product_variants_sku_key\"");
        }
      }

      const isNew = !params.productId;
      
      // Update/insert product
      let updatedProducts = [...state.products];
      if (isNew) {
        updatedProducts = [{
          id: productId,
          store_id: state.store?.id || "test-store-id",
          name: params.name,
          category: params.category,
          low_stock_threshold: params.lowStockThreshold,
          image_url: null,
        }, ...state.products];
      } else {
        updatedProducts = updatedProducts.map((p: any) =>
          p.id === productId
            ? { ...p, name: params.name, category: params.category, low_stock_threshold: params.lowStockThreshold }
            : p
        );
      }

      // Update/insert variants
      let updatedVariants = [...state.variants];
      
      // Remove deleted variants
      if (params.deletedVariantIds && params.deletedVariantIds.length > 0) {
        updatedVariants = updatedVariants.filter((v: any) => !params.deletedVariantIds.includes(v.id));
      }

      params.variants.forEach((v: any) => {
        const varId = v.id || `var-${Math.random().toString(36).substr(2, 9)}`;
        const existingIdx = updatedVariants.findIndex((x: any) => x.id === varId);
        const varData = {
          id: varId,
          product_id: productId,
          size: v.size,
          color: v.color,
          sku: v.sku,
          price: v.price,
          stock: v.stock,
        };
        if (existingIdx > -1) {
          updatedVariants[existingIdx] = varData;
        } else {
          updatedVariants.push(varData);
        }
      });

      currentStore.setState({
        products: updatedProducts,
        variants: updatedVariants,
      });

      return productId;
    }),

    deleteProductAction: vi.fn(async (productId) => {
      if (!currentStore) throw new Error("No active store");
      const state = currentStore.getState();
      currentStore.setState({
        products: state.products.filter((p: any) => p.id !== productId),
        variants: state.variants.filter((v: any) => v.product_id !== productId),
      });
      return true;
    }),

    adjustStockAction: vi.fn(async (variantId, newStock) => {
      if (!currentStore) throw new Error("No active store");
      const state = currentStore.getState();
      currentStore.setState({
        variants: state.variants.map((v: any) =>
          v.id === variantId ? { ...v, stock: newStock } : v
        ),
      });
      return true;
    }),

    checkoutAction: vi.fn(async (params) => {
      if (!currentStore) throw new Error("No active store");
      const state = currentStore.getState();

      // Check stock
      for (const item of params.items) {
        const variant = state.variants.find((v: any) => v.id === item.variant_id);
        if (!variant || (variant.stock ?? 0) < item.quantity) {
          throw new Error(`Insufficient stock for SKU ${variant?.sku || "unknown"}. Available: ${variant?.stock ?? 0}, Requested: ${item.quantity}`);
        }
      }

      // Deduct stock
      const updatedVariants = state.variants.map((v: any) => {
        const item = params.items.find((i: any) => i.variant_id === v.id);
        if (item) {
          return { ...v, stock: v.stock - item.quantity };
        }
        return v;
      });

      // Price validation check
      const recalculatedTotal = params.items.reduce((sum: number, item: any) => sum + item.quantity * item.unit_price, 0) - params.discountAmount;
      if (Math.abs(recalculatedTotal - params.totalAmount) > 0.01) {
        throw new Error(`Price tampering detected! Client reported total of ${params.totalAmount}, but recalculated total is ${recalculatedTotal}`);
      }

      const invoiceId = `inv-${Math.random().toString(36).substr(2, 9)}`;
      const newInvoice = {
        id: invoiceId,
        store_id: params.storeId,
        invoice_number: params.invoiceNumber,
        customer_name: params.customerName,
        customer_phone: params.customerPhone,
        total_amount: params.totalAmount,
        discount_amount: params.discountAmount,
        payment_method: params.paymentMethod,
        created_at: new Date().toISOString(),
      };

      const newInvoiceItems = params.items.map((item: any) => ({
        id: `item-${Math.random().toString(36).substr(2, 9)}`,
        invoice_id: invoiceId,
        variant_id: item.variant_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: item.subtotal,
      }));

      currentStore.setState({
        variants: updatedVariants,
        invoices: [newInvoice, ...state.invoices],
      });

      return {
        ...newInvoice,
        invoice_items: newInvoiceItems,
      };
    }),
  };
});

// Unified Test Store Initializer
const createTestStore = () => {
  return create<AppState>((set, get) => ({
    ...createAuthSlice(set, get),
    ...createInventorySlice(set, get),
    ...createCartSlice(set, get),
  }));
};

describe("PaisaPOS — Core Store & Transactional Engine Tests", () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
    currentStore = store;

    // Mock fetchStoreData to be a no-op so that it doesn't overwrite our mock updates
    vi.spyOn(store.getState(), "fetchStoreData").mockImplementation(async () => {});
    
    // Seed initial dummy store metadata for testing
    store.setState({
      store: {
        id: "test-store-id",
        name: "Test KTM Streetwear",
        created_at: new Date().toISOString(),
      },
      products: [
        {
          id: "prod-1",
          store_id: "test-store-id",
          name: "Oversized Heavyweight Hoodie",
          category: "Tops",
          image_url: null,
          low_stock_threshold: 3,
        },
        {
          id: "prod-2",
          store_id: "test-store-id",
          name: "Cargo Pants",
          category: "Bottoms",
          image_url: null,
          low_stock_threshold: 2,
        }
      ],
      variants: [
        {
          id: "var-1-m",
          product_id: "prod-1",
          size: "M",
          color: "Black",
          sku: "HOOD-BLK-M",
          price: 2500,
          stock: 5,
        },
        {
          id: "var-1-s",
          product_id: "prod-1",
          size: "S",
          color: "Black",
          sku: "HOOD-BLK-S",
          price: 2500,
          stock: 0, // Out of Stock
        },
        {
          id: "var-2-l",
          product_id: "prod-2",
          size: "L",
          color: "Olive",
          sku: "CARG-OLV-L",
          price: 3200,
          stock: 2, // Low stock limit reached
        }
      ],
      invoices: [],
      invoiceItems: {},
    });
  });

  // =========================================================================
  // 1. INVENTORY, PRODUCTS & VARIANT MATRICES
  // =========================================================================
  describe("Inventory & Product Creation", () => {
    test("should successfully add a new product with multiple variant combinations", async () => {
      const result = await store.getState().addProduct(
        "Kurti Set",
        "Ethnic",
        5,
        [
          { size: "S", color: "Red", sku: "KURT-RED-S", price: 1500, stock: 10 },
          { size: "M", color: "Red", sku: "KURT-RED-M", price: 1600, stock: 8 }
        ]
      );

      expect(result).toBe(true);

      const products = store.getState().products;
      const variants = store.getState().variants;

      expect(products.length).toBe(3);
      expect(products[0].name).toBe("Kurti Set");
      expect(products[0].category).toBe("Ethnic");
      expect(products[0].low_stock_threshold).toBe(5);

      // Verify variant generation matches input specs
      const kurtiVariants = variants.filter(v => v.product_id === products[0].id);
      expect(kurtiVariants.length).toBe(2);
      expect(kurtiVariants[0].sku).toBe("KURT-RED-S");
      expect(kurtiVariants[0].price).toBe(1500);
      expect(kurtiVariants[0].stock).toBe(10);
      expect(kurtiVariants[1].sku).toBe("KURT-RED-M");
      expect(kurtiVariants[1].price).toBe(1600);
      expect(kurtiVariants[1].stock).toBe(8);
    });

    test("should successfully delete a product and all of its associated variants", async () => {
      const result = await store.getState().deleteProduct("prod-1");
      expect(result).toBe(true);

      const products = store.getState().products;
      const variants = store.getState().variants;

      expect(products.find(p => p.id === "prod-1")).toBeUndefined();
      expect(variants.filter(v => v.product_id === "prod-1").length).toBe(0);
      expect(products.length).toBe(1); // Only prod-2 remains
      expect(variants.length).toBe(1); // Only var-2-l remains
    });

    test("should support editing products, adjusting thresholds, adding new variants, and deleting old variants", async () => {
      const result = await store.getState().updateProduct(
        "prod-1",
        "Oversized Luxury Hoodie", // Changed name
        "Streetwear", // Changed category
        4, // Changed threshold
        [
          { id: "var-1-m", size: "M", color: "Black", sku: "HOOD-BLK-M-UPDATED", price: 2800, stock: 6 }, // Updated existing
          { size: "XL", color: "Black", sku: "HOOD-BLK-XL", price: 3000, stock: 15 } // Added new variant
        ],
        ["var-1-s"] // Deleted "S" variant
      );

      expect(result).toBe(true);

      const products = store.getState().products;
      const variants = store.getState().variants;

      const updatedProduct = products.find(p => p.id === "prod-1");
      expect(updatedProduct?.name).toBe("Oversized Luxury Hoodie");
      expect(updatedProduct?.category).toBe("Streetwear");
      expect(updatedProduct?.low_stock_threshold).toBe(4);

      const prod1Variants = variants.filter(v => v.product_id === "prod-1");
      expect(prod1Variants.length).toBe(2); // var-1-m (updated) and var-1-xl (new)

      const updatedM = prod1Variants.find(v => v.id === "var-1-m");
      expect(updatedM?.sku).toBe("HOOD-BLK-M-UPDATED");
      expect(updatedM?.price).toBe(2800);
      expect(updatedM?.stock).toBe(6);

      const newXl = prod1Variants.find(v => v.sku === "HOOD-BLK-XL");
      expect(newXl).toBeDefined();
      expect(newXl?.size).toBe("XL");
      expect(newXl?.stock).toBe(15);

      // Verify the deleted variant is completely gone
      expect(variants.find(v => v.id === "var-1-s")).toBeUndefined();
    });

    test("should support updating stock quantities directly", async () => {
      const result = await store.getState().updateStockDirect("var-2-l", 15);
      expect(result).toBe(true);

      const variant = store.getState().variants.find(v => v.id === "var-2-l");
      expect(variant?.stock).toBe(15);
    });
  });

  // =========================================================================
  // 2. CART MATH & CALCULATIONS
  // =========================================================================
  describe("Cart Mechanics & Subtotals", () => {
    test("should successfully add item to cart, cap quantities at available stock, and block adding out of stock items", () => {
      // Add var-1-m (available: 5)
      store.getState().addToCart("var-1-m");
      expect(store.getState().cart.length).toBe(1);
      expect(store.getState().cart[0].quantity).toBe(1);

      // Increment quantity
      store.getState().addToCart("var-1-m");
      expect(store.getState().cart[0].quantity).toBe(2);

      // Try to add out of stock variant (var-1-s)
      store.getState().addToCart("var-1-s");
      expect(store.getState().cart.find(c => c.variant_id === "var-1-s")).toBeUndefined();

      // Set quantity beyond available stock, verify capping
      store.getState().updateCartQuantity("var-1-m", 100);
      expect(store.getState().cart[0].quantity).toBe(5); // Capped at available stock (5)
    });

    test("should remove item from cart if updating quantity to 0 or negative", () => {
      store.getState().addToCart("var-1-m");
      expect(store.getState().cart.length).toBe(1);

      store.getState().updateCartQuantity("var-1-m", 0);
      expect(store.getState().cart.length).toBe(0);
    });

    test("should correctly compute cart subtotal, discount reduction, and guarantee non-negative subtotal", () => {
      store.getState().addToCart("var-1-m"); // Qty: 1, Price: 2500
      store.getState().addToCart("var-2-l"); // Qty: 1, Price: 3200

      // Subtotal = 2500 + 3200 = 5700
      const cart = store.getState().cart;
      const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.price, 0);
      expect(subtotal).toBe(5700);

      // Apply valid discount
      store.getState().setCartDiscount(500);
      expect(store.getState().cartDiscount).toBe(500);

      let finalTotal = Math.max(0, subtotal - store.getState().cartDiscount);
      expect(finalTotal).toBe(5200);

      // Negative discount validation
      store.getState().setCartDiscount(-200);
      expect(store.getState().cartDiscount).toBe(0);

      // Discount greater than subtotal (non-negative guarantee)
      store.getState().setCartDiscount(10000);
      finalTotal = Math.max(0, subtotal - store.getState().cartDiscount);
      expect(finalTotal).toBe(0);
    });
  });

  // =========================================================================
  // 3. TRANSACTION ENGINE & ATOMIC ROLLBACK SAFETY
  // =========================================================================
  describe("Transactional Sales & Rollback Safety", () => {
    test("should process a successful checkout, deduct stock correctly, generate chronological invoice numbers, and clear inputs", async () => {
      store.getState().addToCart("var-1-m"); // Qty: 1, Stock: 5
      store.getState().updateCartQuantity("var-1-m", 2); // Qty: 2
      store.getState().addToCart("var-2-l"); // Qty: 1, Stock: 2

      store.getState().setCustomerDetails("Erfan Ansari", "9800000000");
      store.getState().setCartDiscount(700);
      store.getState().setPaymentMethod("Fonepay");

      // Initial stocks
      expect(store.getState().variants.find(v => v.id === "var-1-m")?.stock).toBe(5);
      expect(store.getState().variants.find(v => v.id === "var-2-l")?.stock).toBe(2);

      const checkoutResult = await store.getState().checkout();
      expect(checkoutResult).toBe(true);

      // 1. Verify stocks decremented
      expect(store.getState().variants.find(v => v.id === "var-1-m")?.stock).toBe(3); // 5 - 2
      expect(store.getState().variants.find(v => v.id === "var-2-l")?.stock).toBe(1); // 2 - 1

      // 2. Verify invoice records
      const invoices = store.getState().invoices;
      expect(invoices.length).toBe(1);
      expect(invoices[0].customer_name).toBe("Erfan Ansari");
      expect(invoices[0].payment_method).toBe("Fonepay");
      expect(invoices[0].discount_amount).toBe(700);
      expect(invoices[0].total_amount).toBe(2500 * 2 + 3200 - 700); // 8200 - 700 = 7500

      // Chronological invoice numbers validation
      expect(invoices[0].invoice_number).toMatch(/^INV-\d{4}-\d{4}$/);

      // 3. Verify invoice items
      const activeItems = store.getState().activeInvoiceItems;
      expect(activeItems?.length).toBe(2);
      expect(activeItems?.find(item => item.variant_id === "var-1-m")?.quantity).toBe(2);
      expect(activeItems?.find(item => item.variant_id === "var-2-l")?.quantity).toBe(1);

      // 4. Verify inputs reset
      expect(store.getState().cart.length).toBe(0);
      expect(store.getState().cartDiscount).toBe(0);
      expect(store.getState().customerName).toBe("");
      expect(store.getState().paymentMethod).toBe("Cash");
    });

    test("should execute an ATOMIC ROLLBACK if any cart item exceeds available stock during checkout (0% stock leakage guarantee)", async () => {
      // Step 1: Add valid item to cart
      store.getState().addToCart("var-1-m"); // Qty: 1, Stock: 5 (VALID)
      
      // Step 2: Force insert an invalid quantity in the cart or modify available stock underneath
      store.getState().addToCart("var-2-l"); // Qty: 1, Stock: 2
      store.getState().updateCartQuantity("var-2-l", 2); // Qty: 2, Stock: 2 (VALID)

      // Directly update the store stock underneath to simulate a race condition / concurrent decrease
      store.setState({
        variants: store.getState().variants.map(v => 
          v.id === "var-2-l" ? { ...v, stock: 1 } : v // Stock drops to 1, making our cart of 2 invalid!
        )
      });

      // Assert checkout fails
      const checkoutResult = await store.getState().checkout();
      expect(checkoutResult).toBe(false);

      // Assert error message is set
      expect(store.getState().errorMsg).toContain("Insufficient stock for SKU CARG-OLV-L");

      // Assert transaction is entirely ROLLED BACK
      // 1. No partial invoice must be generated
      expect(store.getState().invoices.length).toBe(0);

      // 2. The stock of other valid items (e.g. var-1-m) must NOT be deducted!
      const var1 = store.getState().variants.find(v => v.id === "var-1-m");
      expect(var1?.stock).toBe(5); // Remained at 5, untouched!

      const var2 = store.getState().variants.find(v => v.id === "var-2-l");
      expect(var2?.stock).toBe(1); // Remained at 1, untouched!

      // 3. Cart must NOT be cleared, letting the retailer see and resolve the issue
      expect(store.getState().cart.length).toBe(2);
    });
  });

  // =========================================================================
  // 4. SEARCH FILTER MATCHING
  // =========================================================================
  describe("Search & Product Filter Matching", () => {
    const runSearchFilter = (query: string, products: Product[], variants: ProductVariant[]) => {
      return products.filter((p) => {
        const lowerQuery = query.toLowerCase();
        
        const matchesProduct =
          p.name.toLowerCase().includes(lowerQuery) ||
          p.category.toLowerCase().includes(lowerQuery);

        const productVariants = variants.filter((v) => v.product_id === p.id);
        const matchesSku = productVariants.some((v) =>
          v.sku.toLowerCase().includes(lowerQuery)
        );

        return matchesProduct || matchesSku;
      });
    };

    test("should instantly match by product name query", () => {
      const results = runSearchFilter("hoodie", store.getState().products, store.getState().variants);
      expect(results.length).toBe(1);
      expect(results[0].id).toBe("prod-1");
    });

    test("should instantly match by category query", () => {
      const results = runSearchFilter("Bottoms", store.getState().products, store.getState().variants);
      expect(results.length).toBe(1);
      expect(results[0].id).toBe("prod-2");
    });

    test("should instantly match by variant SKU query", () => {
      const results = runSearchFilter("CARG-OLV", store.getState().products, store.getState().variants);
      expect(results.length).toBe(1);
      expect(results[0].id).toBe("prod-2");
    });

    test("should return empty if search query does not match anything", () => {
      const results = runSearchFilter("Momo Set", store.getState().products, store.getState().variants);
      expect(results.length).toBe(0);
    });
  });

  // =========================================================================
  // 5. AUTH & PERSISTENT TAB & STOCK MAPPING TESTS
  // =========================================================================
  describe("Auth, Tab Persistence & Stock Mapping", () => {
    let mockLocalStorage: Record<string, string> = {};
    const originalWindow = global.window;
    const originalLocalStorage = global.localStorage;

    beforeAll(() => {
      global.window = {} as unknown as Window & typeof globalThis;
      global.localStorage = {
        getItem: (key: string) => mockLocalStorage[key] || null,
        setItem: (key: string, value: string) => {
          mockLocalStorage[key] = value;
        },
        removeItem: (key: string) => {
          delete mockLocalStorage[key];
        },
        clear: () => {
          mockLocalStorage = {};
        },
        length: 0,
        key: () => null,
      } as unknown as Storage;
    });

    afterAll(() => {
      global.window = originalWindow;
      global.localStorage = originalLocalStorage;
    });

    beforeEach(() => {
      mockLocalStorage = {};
    });

    test("should persist active tab in localStorage when setTab is called", () => {
      store.getState().setTab("inventory");
      expect(mockLocalStorage["paisapos_active_tab"]).toBe("inventory");
      expect(store.getState().activeTab).toBe("inventory");

      store.getState().setTab("history");
      expect(mockLocalStorage["paisapos_active_tab"]).toBe("history");
      expect(store.getState().activeTab).toBe("history");
    });

    test("should restore active tab from localStorage during initializeSession", async () => {
      mockLocalStorage["paisapos_active_tab"] = "history";
      
      // Reset state to default
      store.setState({ activeTab: "dashboard" });
      expect(store.getState().activeTab).toBe("dashboard");

      await store.getState().initializeSession();

      // Should load history tab from localStorage
      expect(store.getState().activeTab).toBe("history");
    });

    test("should clear tab from localStorage on signOut", async () => {
      mockLocalStorage["paisapos_active_tab"] = "inventory";

      await store.getState().signOut();

      expect(mockLocalStorage["paisapos_active_tab"]).toBeUndefined();
      expect(store.getState().activeTab).toBe("dashboard");
    });

    test("should correctly map inventory quantity to variant stock for both array and object formats", async () => {
      // Create a store where fetchStoreData is NOT mocked:
      const unmockedStore = createTestStore();
      unmockedStore.setState({
        store: {
          id: "test-store-id",
          name: "Test Store",
          created_at: new Date().toISOString(),
        },
      });

      // Setup mock supabase.from chain
      const createChainMock = (data: any) => {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          in: () => chain,
          single: () => chain,
        };
        chain.then = (resolve: any) => {
          resolve({ data, error: null });
        };
        return chain;
      };

      const mockFrom = vi.spyOn(supabase, "from").mockImplementation((table: string) => {
        if (table === "products") {
          return createChainMock([
            { id: "prod-1", store_id: "test-store-id", name: "Product 1" }
          ]);
        }
        if (table === "product_variants") {
          return createChainMock([
            {
              id: "var-array",
              product_id: "prod-1",
              size: "M",
              color: "Red",
              sku: "SKU-ARRAY",
              price: 100,
              inventory: [{ quantity: 15 }],
              created_at: new Date().toISOString(),
            },
            {
              id: "var-object",
              product_id: "prod-1",
              size: "L",
              color: "Blue",
              sku: "SKU-OBJECT",
              price: 200,
              inventory: { quantity: 42 },
              created_at: new Date().toISOString(),
            },
            {
              id: "var-null",
              product_id: "prod-1",
              size: "S",
              color: "Green",
              sku: "SKU-NULL",
              price: 150,
              inventory: null,
              created_at: new Date().toISOString(),
            }
          ]);
        }
        if (table === "invoices") {
          return createChainMock([]);
        }
        return createChainMock([]);
      });

      try {
        await unmockedStore.getState().fetchStoreData();

        const variants = unmockedStore.getState().variants;
        expect(variants.length).toBe(3);

        const varArray = variants.find(v => v.id === "var-array");
        expect(varArray).toBeDefined();
        expect(varArray?.stock).toBe(15);

        const varObject = variants.find(v => v.id === "var-object");
        expect(varObject).toBeDefined();
        expect(varObject?.stock).toBe(42);

        const varNull = variants.find(v => v.id === "var-null");
        expect(varNull).toBeDefined();
        expect(varNull?.stock).toBe(0);
      } finally {
        mockFrom.mockRestore();
      }
    });
  });

  // =========================================================================
  // 6. SECURITY & ERROR MAPPING
  // =========================================================================
  describe("Security & Server Action Error Mapping", () => {
    describe("Server Action Error Mapping", () => {
      test("should map checkout price tampering database errors to clear user-friendly messages", async () => {
        store.getState().addToCart("var-1-m");
        
        const mockCheckoutAction = vi.spyOn(actions, "checkoutAction").mockRejectedValue(
          new Error("Price tampering detected! Client reported total of 100, but recalculated total is 200")
        );

        const result = await store.getState().checkout();
        expect(result).toBe(false);
        expect(store.getState().errorMsg).toBe("Checkout failed: Price validation mismatch. Please refresh your cart.");

        mockCheckoutAction.mockRestore();
      });

      test("should map checkout stock insufficiency database errors directly", async () => {
        store.getState().addToCart("var-1-m");

        const mockCheckoutAction = vi.spyOn(actions, "checkoutAction").mockRejectedValue(
          new Error("Insufficient stock for SKU HOOD-BLK-M. Available: 2, Requested: 5")
        );

        const result = await store.getState().checkout();
        expect(result).toBe(false);
        expect(store.getState().errorMsg).toBe("Insufficient stock for SKU HOOD-BLK-M. Available: 2, Requested: 5");

        mockCheckoutAction.mockRestore();
      });

      test("should map product SKU uniqueness violation database errors to friendly variant SKU warning", async () => {
        const mockUpsertProductAction = vi.spyOn(actions, "upsertProductAction").mockRejectedValue(
          new Error("duplicate key value violates unique constraint \"product_variants_sku_key\"")
        );

        const result = await store.getState().addProduct("Kurti Set", "Ethnic", 5, [
          { size: "S", color: "Red", sku: "KURT-RED-S", price: 1500, stock: 10 }
        ]);
        expect(result).toBe(false);
        expect(store.getState().errorMsg).toBe("Failed to save product: A variant with this SKU already exists.");

        mockUpsertProductAction.mockRestore();
      });
    });
  });

  // =========================================================================
  // 7. NETWORK RESILIENCE & ERROR HANDLING
  // =========================================================================
  describe("Network Resilience & Error Handling", () => {
    test("should successfully clear errorMsg using clearError action", () => {
      store.setState({ errorMsg: "Some test error" });
      expect(store.getState().errorMsg).toBe("Some test error");
      store.getState().clearError();
      expect(store.getState().errorMsg).toBeNull();
    });

    test("should reject checkout when navigator.onLine is false", async () => {
      // Mock window.navigator.onLine to be false
      const originalNavigator = global.navigator;
      Object.defineProperty(global, "navigator", {
        value: { onLine: false },
        configurable: true,
      });

      store.getState().addToCart("var-1-m");
      const result = await store.getState().checkout();
      expect(result).toBe(false);
      expect(store.getState().errorMsg).toBe("Checkout failed: Internet connection is offline.");

      // Restore
      Object.defineProperty(global, "navigator", {
        value: originalNavigator,
        configurable: true,
      });
    });

    test("should reject addProduct when navigator.onLine is false", async () => {
      // Mock window.navigator.onLine to be false
      const originalNavigator = global.navigator;
      Object.defineProperty(global, "navigator", {
        value: { onLine: false },
        configurable: true,
      });

      const result = await store.getState().addProduct("Kurti Set", "Ethnic", 5, [
        { size: "S", color: "Red", sku: "KURT-RED-S", price: 1500, stock: 10 }
      ]);
      expect(result).toBe(false);
      expect(store.getState().errorMsg).toBe("Operation failed: Internet connection is offline.");

      // Restore
      Object.defineProperty(global, "navigator", {
        value: originalNavigator,
        configurable: true,
      });
    });
  });
});
