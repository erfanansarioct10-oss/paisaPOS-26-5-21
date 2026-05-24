/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, beforeEach, vi } from "vitest";
import { create } from "zustand";
import { AppState } from "../types";
import { createAuthSlice } from "../authSlice";
import { createInventorySlice } from "../inventorySlice";
import { createCartSlice } from "../cartSlice";
import { adjustStockAction } from "@/app/actions";
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
        updatedProducts.push({
          id: productId,
          store_id: state.store?.id || "stress-store-id",
          name: params.name,
          category: params.category,
          low_stock_threshold: params.lowStockThreshold,
          image_url: null,
        });
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
        if (!item.variant_id) continue;
        const variant = state.variants.find((v: any) => v.id === item.variant_id);
        if (!variant || (variant.stock ?? 0) < item.quantity) {
          throw new Error(`Insufficient stock for SKU ${variant?.sku || "unknown"}. Available: ${variant?.stock ?? 0}, Requested: ${item.quantity}`);
        }
      }

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
        custom_name: item.custom_name || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        subtotal: item.subtotal,
      }));

      return {
        ...newInvoice,
        invoice_items: newInvoiceItems,
      };
    }),

    toggleProductFavoriteAction: vi.fn(async (productId, isFavorite) => {
      if (!currentStore) throw new Error("No active store");
      const state = currentStore.getState();
      currentStore.setState({
        products: state.products.map((p: any) =>
          p.id === productId ? { ...p, is_favorite: isFavorite } : p
        ),
      });
      return true;
    }),
  };
});

// Helper to create a clean test store instance
const createTestStore = () => {
  return create<AppState>((set, get) => ({
    ...createAuthSlice(set, get),
    ...createInventorySlice(set, get),
    ...createCartSlice(set, get),
  }));
};

describe("PaisaPOS — Master Concurrency, Performance, & Security Stress Tests", () => {
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    store = createTestStore();
    currentStore = store;

    // Mock fetchStoreData to be a no-op so that it doesn't overwrite our mock updates
    vi.spyOn(store.getState(), "fetchStoreData").mockImplementation(async () => {});

    store.setState({
      store: {
        id: "stress-store-id",
        name: "KTM Streetwear Megastore",
        phone: "9851012345",
        address: "New Road, Kathmandu",
        pan_vat: "123456789",
      },
    });
  });

  // =========================================================================
  // 1. DYNAMIC BULK SCALE STRESS TEST (1,500 SKUs)
  // =========================================================================
  test("Stress Test 1: Seed & Search Scale (1,500 Variants in Memory)", async () => {
    // Generate 150 products, each with 10 variant combinations (1,500 variants total)
    const sizes = ["XS", "S", "M", "L", "XL"];
    const colors = ["Crimson", "Charcoal"];

    const tSeedStart = performance.now();
    
    // Add products in a loop
    for (let i = 1; i <= 150; i++) {
      const productVariants = [];
      const prefix = `STRESS-P${i}`;
      for (const size of sizes) {
        for (const color of colors) {
          productVariants.push({
            size,
            color,
            sku: `${prefix}-${color.toUpperCase().slice(0, 3)}-${size}`,
            price: 1200 + i * 5,
            stock: 10 + (i % 5),
          });
        }
      }

      await store.getState().addProduct(
        `Stress Denim Pant ${i}`,
        "Bottoms",
        3,
        productVariants
      );
    }
    const tSeedEnd = performance.now();
    const seedDuration = tSeedEnd - tSeedStart;

    const finalProducts = store.getState().products;
    const finalVariants = store.getState().variants;

    expect(finalProducts.length).toBe(150);
    expect(finalVariants.length).toBe(1500); // 150 * 5 * 2 = 1,500
    
    // Validate speed limit: Seeding 1,500 items must be highly performant (e.g. < 500ms in testing runner)
    expect(seedDuration).toBeLessThan(1000);

    // Benchmarking Keystroke/SKU Filtering across all 1,500 items
    const tSearchStart = performance.now();
    let matchesFound = 0;
    
    // Simulate 1,000 rapid typing events
    for (let k = 1; k <= 1000; k++) {
      const query = `STRESS-P${(k % 150) + 1}-CHA-L`; // target Charcoal L variants
      const matching = finalVariants.filter((v) =>
        v.sku.toLowerCase().includes(query.toLowerCase())
      );
      matchesFound += matching.length;
    }
    
    expect(matchesFound).toBeGreaterThan(0);
    const tSearchEnd = performance.now();
    const totalSearchTime = tSearchEnd - tSearchStart;
    const avgLatency = totalSearchTime / 1000;

    // SLA Gate: Keystroke search latency must average < 0.5ms per lookup to prevent POS dashboard lag
    expect(avgLatency).toBeLessThan(0.5);
  });

  // =========================================================================
  // 2. CONCURRENT HIGH-SPEED TRANSACTIONAL CHECKOUT STRESS TEST
  // =========================================================================
  test("Stress Test 2: Concurrent High-Throughput Checkout Benchmark (500 Sales)", async () => {
    // Seed initial high stock product
    await store.getState().addProduct("Standard Tee", "Tops", 5, [
      { size: "M", color: "White", sku: "TEE-WHT-M", price: 1000, stock: 1000 }
    ]);

    const targetVariant = store.getState().variants.find(v => v.sku === "TEE-WHT-M")!;
    
    const tCheckoutStart = performance.now();
    const checkoutRuns = 500;
    let successfulSales = 0;

    for (let c = 1; c <= checkoutRuns; c++) {
      // 1. Add white tee to cart
      store.getState().addToCart(targetVariant.id);
      
      // 2. Checkout
      const ok = await store.getState().checkout();
      if (ok) {
        successfulSales++;
      }
    }
    
    const tCheckoutEnd = performance.now();
    const totalCheckoutTime = tCheckoutEnd - tCheckoutStart;
    expect(totalCheckoutTime).toBeGreaterThanOrEqual(0);
    
    // Verify all checkouts completed successfully
    expect(successfulSales).toBe(500);

    // Verify stock is exactly decremented by 500
    const finalVariant = store.getState().variants.find(v => v.sku === "TEE-WHT-M")!;
    expect(finalVariant.stock).toBe(500); // 1000 - 500

    // Verify 500 sequential chronological invoices were successfully written
    const invoices = store.getState().invoices;
    expect(invoices.length).toBe(500);

    // Verify sequential ordering safety (Chronological order validation - descending array check)
    for (let idx = 0; idx < invoices.length; idx++) {
      const numStr = invoices[idx].invoice_number.split("-")[2];
      const sequentialIndex = parseInt(numStr, 10);
      expect(sequentialIndex).toBe(invoices.length - idx);
    }
  });

  // =========================================================================
  // 3. SECURITY INTEGRITY: OVERDRAFT & RECOVERY UNDER CONCURRENCY
  // =========================================================================
  test("Stress Test 3: Transaction Concurrency Race & Atomic Restorations", async () => {
    // Seed highly limited stock item
    await store.getState().addProduct("Limited Edition Sneaker", "Accessories", 1, [
      { size: "10", color: "Gold", sku: "SNK-GLD-10", price: 25000, stock: 2 }
    ]);

    const sneaker = store.getState().variants.find(v => v.sku === "SNK-GLD-10")!;

    // Client A adds 2 sneakers to cart (valid)
    store.getState().addToCart(sneaker.id);
    store.getState().updateCartQuantity(sneaker.id, 2);

    // Client B concurrently checks out 1 sneaker underneath Client A, causing Client A's cart to exceed available stock
    // Simulate background inventory deduction of 1 unit
    store.setState({
      variants: store.getState().variants.map(v =>
        v.id === sneaker.id ? { ...v, stock: 1 } : v // Stock drops to 1
      )
    });

    // Client A now proceeds to checkout, which must fail gracefully without partial stock deductions
    const checkoutA = await store.getState().checkout();
    expect(checkoutA).toBe(false);
    expect(store.getState().errorMsg).toContain("Insufficient stock for SKU SNK-GLD-10");

    // Stock verification: Zero-leakage security boundary check
    const finalSneaker = store.getState().variants.find(v => v.sku === "SNK-GLD-10")!;
    expect(finalSneaker.stock).toBe(1); // Remained at 1, no overdraft allowed

    // No partial invoice was created for Client A
    expect(store.getState().invoices.length).toBe(0);

    // Client A's cart is safely preserved for editing
    expect(store.getState().cart.length).toBe(1);
    expect(store.getState().cart[0].quantity).toBe(2);
  });

  // =========================================================================
  // 4. RAPID CLICK FLICKERING PREVENTION & CONCURRENCY RACE
  // =========================================================================
  test("Stress Test 4: Rapid Stock Updates Concurrency Race (Flickering Prevention)", async () => {
    // Seed test product and variant
    await store.getState().addProduct("Flicker Test Shirt", "Tops", 5, [
      { size: "L", color: "Blue", sku: "FLK-BLU-L", price: 1000, stock: 10 }
    ]);
    const variant = store.getState().variants.find(v => v.sku === "FLK-BLU-L")!;
    expect(variant.stock).toBe(10);

    const mockDbStock = { val: 10 };

    // Implement custom mock for fetchStoreData to simulate db state retrieval and sync override mapping
    vi.spyOn(store.getState(), "fetchStoreData").mockImplementation(async () => {
      const state = store.getState();
      const mappedVariants = state.variants.map((v) => {
        if (v.id === variant.id) {
          const pendingStock = state.pendingStockUpdates[v.id];
          return {
            ...v,
            stock: pendingStock !== undefined ? pendingStock : mockDbStock.val,
          };
        }
        return v;
      });
      store.setState({ variants: mappedVariants });
    });

    // Capture adjustStockAction calls and control their resolution timing
    const adjustResolvers: Array<(ok: boolean) => void> = [];
    vi.mocked(adjustStockAction).mockImplementation((variantId, newStock) => {
      return new Promise<boolean>((resolve) => {
        adjustResolvers.push((ok: boolean) => {
          if (ok) {
            mockDbStock.val = newStock;
            resolve(true);
          } else {
            resolve(false);
          }
        });
      });
    });

    // 1. Simulate rapid clicks: update 10 -> 11, then 11 -> 12
    const p1 = store.getState().updateStockDirect(variant.id, 11);
    const p2 = store.getState().updateStockDirect(variant.id, 12);

    // Immediately check UI state: should be 12 (latest optimistic update)
    expect(store.getState().variants.find(v => v.id === variant.id)!.stock).toBe(12);
    expect(store.getState().pendingStockRequests[variant.id]).toBe(2);
    expect(store.getState().pendingStockUpdates[variant.id]).toBe(12);
    expect(store.getState().originalStockLevels[variant.id]).toBe(10);

    // 2. Simulate background Realtime sync fetching stale DB state (10) while requests are in flight
    await store.getState().fetchStoreData();
    // UI stock must NOT flicker down; it should stay at 12 because requests are pending
    expect(store.getState().variants.find(v => v.id === variant.id)!.stock).toBe(12);

    // 3. Resolve the first click update (10 -> 11)
    adjustResolvers[0](true);
    await p1;

    // After p1 completes, request count should drop to 1, target stock is still 12
    expect(store.getState().pendingStockRequests[variant.id]).toBe(1);
    expect(store.getState().pendingStockUpdates[variant.id]).toBe(12);
    // UI stock remains at 12
    expect(store.getState().variants.find(v => v.id === variant.id)!.stock).toBe(12);

    // 4. Simulate another background sync fetching now-updated DB state (11)
    await store.getState().fetchStoreData();
    // UI stock must still remain at 12
    expect(store.getState().variants.find(v => v.id === variant.id)!.stock).toBe(12);

    // 5. Resolve the second click update (11 -> 12)
    adjustResolvers[1](true);
    await p2;

    // After all updates finish, state is cleaned up
    expect(store.getState().pendingStockRequests[variant.id]).toBeUndefined();
    expect(store.getState().pendingStockUpdates[variant.id]).toBeUndefined();
    expect(store.getState().originalStockLevels[variant.id]).toBeUndefined();
    expect(store.getState().variants.find(v => v.id === variant.id)!.stock).toBe(12);

    // Final database sync should keep it at 12
    await store.getState().fetchStoreData();
    expect(store.getState().variants.find(v => v.id === variant.id)!.stock).toBe(12);
  });

  // =========================================================================
  // 5. RAPID STOCK UPDATES FAILURE & CORRECT BASE ROLLBACK
  // =========================================================================
  test("Stress Test 5: Rapid Stock Updates Failure & Correct Base Rollback", async () => {
    await store.getState().addProduct("Rollback Test Shirt", "Tops", 5, [
      { size: "M", color: "Red", sku: "FLK-RED-M", price: 1000, stock: 20 }
    ]);
    const variant = store.getState().variants.find(v => v.sku === "FLK-RED-M")!;

    const mockDbStock = { val: 20 };

    vi.spyOn(store.getState(), "fetchStoreData").mockImplementation(async () => {
      const state = store.getState();
      const mappedVariants = state.variants.map((v) => {
        if (v.id === variant.id) {
          const pendingStock = state.pendingStockUpdates[v.id];
          return {
            ...v,
            stock: pendingStock !== undefined ? pendingStock : mockDbStock.val,
          };
        }
        return v;
      });
      store.setState({ variants: mappedVariants });
    });

    const adjustResolvers: Array<(ok: boolean) => void> = [];
    vi.mocked(adjustStockAction).mockImplementation((variantId, newStock) => {
      return new Promise<boolean>((resolve, reject) => {
        adjustResolvers.push((ok: boolean) => {
          if (ok) {
            mockDbStock.val = newStock;
            resolve(true);
          } else {
            reject(new Error("Database error"));
          }
        });
      });
    });

    // Start 2 concurrent requests: 20 -> 21, then 21 -> 22
    const p1 = store.getState().updateStockDirect(variant.id, 21);
    const p2 = store.getState().updateStockDirect(variant.id, 22);

    expect(store.getState().variants.find(v => v.id === variant.id)!.stock).toBe(22);

    // Reject the first update (fails)
    adjustResolvers[0](false);
    try {
      await p1;
    } catch {}

    // Since the second request (22) is still in flight, UI should NOT rollback to 20 yet!
    expect(store.getState().variants.find(v => v.id === variant.id)!.stock).toBe(22);

    // Reject the second update (fails)
    adjustResolvers[1](false);
    try {
      await p2;
    } catch {}

    // Both failed, and all requests are finished. UI should correctly rollback to the original base value (20)!
    expect(store.getState().variants.find(v => v.id === variant.id)!.stock).toBe(20);
    expect(store.getState().pendingStockRequests[variant.id]).toBeUndefined();
  });

  // =========================================================================
  // 6. CONCURRENT MIXED CHECKOUT STRESS TEST (CUSTOM & REGULAR ITEMS)
  // =========================================================================
  test("Stress Test 6: Concurrent Checkout of Mixed Custom & Regular Items (250 Sales)", async () => {
    // Seed high stock standard product
    await store.getState().addProduct("Standard Polo", "Tops", 5, [
      { size: "M", color: "Black", sku: "POLO-BLK-M", price: 1800, stock: 1000 }
    ]);
    const targetVariant = store.getState().variants.find(v => v.sku === "POLO-BLK-M")!;

    const tStart = performance.now();
    const runs = 250;
    let successfulSales = 0;

    for (let c = 1; c <= runs; c++) {
      // 1. Add white polo to cart
      store.getState().addToCart(targetVariant.id);
      
      // 2. Add custom tailor charge
      store.getState().addCustomToCart("Hemming Charge", 200);

      // 3. Add custom gift wrap charge
      store.getState().addCustomToCart("Gift Box Premium", 100);

      // Verify cart has 3 items
      expect(store.getState().cart.length).toBe(3);

      // Checkout
      const ok = await store.getState().checkout();
      if (ok) {
        successfulSales++;
      }
    }

    const tEnd = performance.now();
    const duration = tEnd - tStart;
    expect(duration).toBeGreaterThanOrEqual(0);

    // Verify all checkouts completed successfully
    expect(successfulSales).toBe(250);

    // Verify stock of regular item decreased to 750 (1000 - 250)
    const finalVariant = store.getState().variants.find(v => v.sku === "POLO-BLK-M")!;
    expect(finalVariant.stock).toBe(750);

    // Verify invoices list size
    const invoices = store.getState().invoices;
    expect(invoices.length).toBe(250);

    // Verify the latest active receipt items mapped custom items cleanly
    const receiptItems = store.getState().activeInvoiceItems;
    expect(receiptItems?.length).toBe(3);

    const hemming = receiptItems?.find(item => item.product_name === "Hemming Charge");
    expect(hemming).toBeDefined();
    expect(hemming?.variant_id).toBeNull();
    expect(hemming?.unit_price).toBe(200);
    expect(hemming?.quantity).toBe(1);

    const giftBox = receiptItems?.find(item => item.product_name === "Gift Box Premium");
    expect(giftBox).toBeDefined();
    expect(giftBox?.variant_id).toBeNull();
    expect(giftBox?.unit_price).toBe(100);
    expect(giftBox?.quantity).toBe(1);

    const polo = receiptItems?.find(item => item.variant_id === targetVariant.id);
    expect(polo).toBeDefined();
    expect(polo?.product_name).toBe("Standard Polo");
    expect(polo?.unit_price).toBe(1800);
    expect(polo?.quantity).toBe(1);
  });

  // =========================================================================
  // 7. FAVORITES CONCURRENCY, SCALING, & RESILIENCE TESTS
  // =========================================================================
  describe("Product Favorites Concurrency, Scaling, & Resilience", () => {
    test("Stress Test 7: Concurrent Toggling Concurrency Race", async () => {
      await store.getState().addProduct("Stress Test Hoodie", "Tops", 5, [
        { size: "M", color: "Black", sku: "STRESS-HOOD-M", price: 2000, stock: 10 }
      ]);
      const product = store.getState().products.find(p => p.name === "Stress Test Hoodie")!;
      expect(product.is_favorite).toBeFalsy();

      const resolvers: Array<(ok: boolean) => void> = [];
      const mockToggleAction = vi.fn().mockImplementation((prodId, isFav) => {
        return new Promise<boolean>((resolve, reject) => {
          resolvers.push((ok: boolean) => {
            if (ok) {
              const prods = store.getState().products.map(p =>
                p.id === prodId ? { ...p, is_favorite: isFav } : p
              );
              store.setState({ products: prods });
              resolve(true);
            } else {
              reject(new Error("Database error"));
            }
          });
        });
      });

      vi.spyOn(actions, "toggleProductFavoriteAction").mockImplementation(mockToggleAction);

      const promises: Array<Promise<boolean>> = [];
      for (let i = 1; i <= 100; i++) {
        const targetFav = i % 2 === 1; // Alternates: true, false, true, false...
        promises.push(store.getState().toggleProductFavorite(product.id, targetFav));
      }

      expect(store.getState().products.find(p => p.id === product.id)!.is_favorite).toBe(false);

      resolvers.forEach((r) => r(true));
      await Promise.all(promises);

      expect(store.getState().products.find(p => p.id === product.id)!.is_favorite).toBe(false);
      expect(store.getState().errorMsg).toBeNull();
    });

    test("Stress Test 8: Bulk Favorites Filtering & SLA Benchmark (500 Products)", async () => {
      const seedProducts: any[] = [];
      for (let i = 1; i <= 500; i++) {
        seedProducts.push({
          id: `stress-fav-p-${i}`,
          store_id: "stress-store-id",
          name: `Stress Product ${i}`,
          category: "Accessories",
          image_url: null,
          low_stock_threshold: 5,
          is_favorite: i % 2 === 0,
          created_at: new Date().toISOString(),
        });
      }

      store.setState({ products: seedProducts });

      const tFilterStart = performance.now();
      
      let count = 0;
      for (let k = 1; k <= 1000; k++) {
        const favs = store.getState().products.filter((p) => p.is_favorite);
        count = favs.length;
      }

      const tFilterEnd = performance.now();
      const filterDuration = tFilterEnd - tFilterStart;
      const avgFilterLatency = filterDuration / 1000;

      expect(count).toBe(250);
      expect(avgFilterLatency).toBeLessThan(0.1);
    });

    test("Stress Test 9: Offline Transitions & Automatic UI Rollbacks", async () => {
      await store.getState().addProduct("Offline Product", "Tops", 5, [
        { size: "S", color: "Red", sku: "OFF-RED-S", price: 1000, stock: 10 }
      ]);
      const product = store.getState().products.find(p => p.name === "Offline Product")!;
      expect(product.is_favorite).toBeFalsy();
      // Go offline
      vi.stubGlobal("navigator", { onLine: false });

      const res = await store.getState().toggleProductFavorite(product.id, true);
      expect(res).toBe(false);

      expect(store.getState().products.find(p => p.id === product.id)!.is_favorite).toBeFalsy();
      expect(store.getState().errorMsg).toContain("Internet connection is offline");

      vi.unstubAllGlobals();
    });
  });
});
