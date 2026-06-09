/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, test, expect, beforeEach, vi, afterEach } from "vitest";
import { create } from "zustand";
import { AppState } from "../types";
import { createAuthSlice } from "@/features/auth/state/auth-slice";
import { createInventorySlice } from "@/features/inventory/state/inventory-slice";
import { createCartSlice } from "@/features/billing/state/cart-slice";
import * as actions from "@/app/actions";



// Mock the Server Actions — now returns JSONB-shaped result with per-product isolation
vi.mock("@/app/actions", () => {
  return {
    upsertProductAction: vi.fn(),
    bulkUpsertProductsAction: vi.fn(async (products: any[]) => {
      let succeededCount = 0;
      const failedProducts: Array<{ name: string; error: string }> = [];
      for (const params of products) {
        if (params.name === "Fail Product") {
          failedProducts.push({ name: params.name, error: "Database validation error for this product" });
        } else if (params.name === "Duplicate SKU Product") {
          failedProducts.push({ name: params.name, error: "A variant with this SKU already exists." });
        } else {
          succeededCount++;
        }
      }
      return { succeededCount, failedProducts };
    }),
    deleteProductAction: vi.fn(),
    adjustStockAction: vi.fn(),
    checkoutAction: vi.fn(),
    toggleProductFavoriteAction: vi.fn(),
  };
});

const createTestStore = () => {
  return create<AppState>((set, get) => ({
    ...createAuthSlice(set, get),
    ...createInventorySlice(set, get),
    ...createCartSlice(set, get),
  }));
};

describe("PaisaPOS — Bulk Import Store Actions & Integration Tests", () => {
  let store: ReturnType<typeof createTestStore>;
  let fetchStoreDataSpy: any;

  beforeEach(() => {
    store = createTestStore();


    // Reset mock histories to guarantee test isolation
    vi.clearAllMocks();

    // Seed initial dummy store metadata for testing
    store.setState({
      store: {
        id: "test-store-id",
        name: "Test KTM Streetwear",
        phone: "9800000000",
        address: "KTM",
        pan_vat: "123456789",
      },
      products: [],
      variants: [],
      invoices: [],
      invoiceItems: {},
    });

    fetchStoreDataSpy = vi.spyOn(store.getState(), "fetchStoreData").mockImplementation(async () => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("should successfully import multiple products, track progress, and trigger exactly one fetchStoreData sync", async () => {
    const productsToImport = [
      {
        name: "Imported Hoodie",
        category: "Tops",
        lowStockThreshold: 4,
        variants: [
          { size: "S", color: "Black", sku: "IMP-BLK-S", price: 2000, stock: 10 },
          { size: "M", color: "Black", sku: "IMP-BLK-M", price: 2000, stock: 15 },
        ],
      },
      {
        name: "Imported Cargo",
        category: "Bottoms",
        lowStockThreshold: 2,
        variants: [
          { size: "30", color: "Olive", sku: "IMP-CARG-30", price: 2500, stock: 8 },
        ],
      },
    ];

    const progressTracker: Array<{ current: number; total: number }> = [];
    const onProgress = (current: number, total: number) => {
      progressTracker.push({ current, total });
    };

    // Spy on bulkUpsertProductsAction
    const bulkUpsertSpy = vi.spyOn(actions, "bulkUpsertProductsAction");

    const resultPromise = store.getState().bulkImportProducts(productsToImport, onProgress);

    // Verify isImporting and isLoading state during import execution
    expect(store.getState().isImporting).toBe(true);
    expect(store.getState().isLoading).toBe(true);

    const result = await resultPromise;

    // Verify final stats returned
    expect(result.succeededCount).toBe(2);
    expect(result.failedProducts).toHaveLength(0);

    // Verify bulkUpsertProductsAction called once with all payloads
    expect(bulkUpsertSpy).toHaveBeenCalledTimes(1);
    expect(bulkUpsertSpy).toHaveBeenNthCalledWith(1, [
      {
        productId: null,
        name: "Imported Hoodie",
        category: "Tops",
        lowStockThreshold: 4,
        deletedVariantIds: [],
        variants: [
          { size: "S", color: "Black", sku: "IMP-BLK-S", price: 2000, stock: 10 },
          { size: "M", color: "Black", sku: "IMP-BLK-M", price: 2000, stock: 15 },
        ],
      },
      {
        productId: null,
        name: "Imported Cargo",
        category: "Bottoms",
        lowStockThreshold: 2,
        deletedVariantIds: [],
        variants: [
          { size: "30", color: "Olive", sku: "IMP-CARG-30", price: 2500, stock: 8 },
        ],
      },
    ]);

    // Verify progress tracking callbacks executed chronologically
    expect(progressTracker).toEqual([
      { current: 0, total: 2 },
      { current: 2, total: 2 },
    ]);

    // Verify isImporting returns to false, letting real-time sync resume
    expect(store.getState().isImporting).toBe(false);
    expect(store.getState().isLoading).toBe(false);

    // Verify single consolidated fetchStoreData sync triggered at the end
    expect(fetchStoreDataSpy).toHaveBeenCalledTimes(1);

    // Verify no failedChunkError or skippedRemainder in the result (removed in row isolation fix)
    expect(result).not.toHaveProperty("failedChunkError");
    expect(result).not.toHaveProperty("skippedRemainder");
  });

  test("should handle partial batch failures with per-product error isolation", async () => {
    const productsToImport = [
      {
        name: "Success Item 1",
        category: "Tops",
        lowStockThreshold: 5,
        variants: [{ size: "M", color: "White", sku: "SUC-1-M", price: 1000, stock: 5 }],
      },
      {
        name: "Fail Product", // Trigger mock error
        category: "Bottoms",
        lowStockThreshold: 5,
        variants: [{ size: "L", color: "Black", sku: "FAIL-L", price: 1000, stock: 5 }],
      },
      {
        name: "Success Item 2",
        category: "Tops",
        lowStockThreshold: 5,
        variants: [{ size: "S", color: "White", sku: "SUC-2-S", price: 1000, stock: 5 }],
      },
    ];

    const result = await store.getState().bulkImportProducts(productsToImport);

    // With per-product isolation, 2 succeed and only the bad one fails
    expect(result.succeededCount).toBe(2);
    expect(result.failedProducts).toHaveLength(1);
    expect(result.failedProducts[0]).toEqual({
      name: "Fail Product",
      error: "Database validation error for this product",
    });

    // Ensure it still turned off isImporting state on completion
    expect(store.getState().isImporting).toBe(false);
    expect(fetchStoreDataSpy).toHaveBeenCalledTimes(1);
  });

  test("should isolate duplicate SKU errors to individual products without failing others", async () => {
    const productsToImport = [
      {
        name: "Good Product A",
        category: "Tops",
        lowStockThreshold: 3,
        variants: [{ size: "S", color: "Red", sku: "GOOD-A-S", price: 1500, stock: 10 }],
      },
      {
        name: "Good Product B",
        category: "Tops",
        lowStockThreshold: 3,
        variants: [{ size: "M", color: "Blue", sku: "GOOD-B-M", price: 1800, stock: 12 }],
      },
      {
        name: "Duplicate SKU Product", // Triggers duplicate SKU error in mock
        category: "Tops",
        lowStockThreshold: 3,
        variants: [{ size: "L", color: "Green", sku: "DUP-SKU-L", price: 2000, stock: 8 }],
      },
      {
        name: "Good Product C",
        category: "Bottoms",
        lowStockThreshold: 3,
        variants: [{ size: "30", color: "Black", sku: "GOOD-C-30", price: 2200, stock: 6 }],
      },
      {
        name: "Fail Product",
        category: "Bottoms",
        lowStockThreshold: 3,
        variants: [{ size: "32", color: "Navy", sku: "FAIL-32", price: 2200, stock: 4 }],
      },
    ];

    const result = await store.getState().bulkImportProducts(productsToImport);

    // 3 good products succeed, 2 fail individually
    expect(result.succeededCount).toBe(3);
    expect(result.failedProducts).toHaveLength(2);

    // Verify the correct products failed with correct error messages
    expect(result.failedProducts).toContainEqual({
      name: "Duplicate SKU Product",
      error: "A variant with this SKU already exists.",
    });
    expect(result.failedProducts).toContainEqual({
      name: "Fail Product",
      error: "Database validation error for this product",
    });

    // All good products (A, B, C) should have succeeded
    // The fact that succeededCount === 3 confirms this

    expect(store.getState().isImporting).toBe(false);
    expect(store.getState().isLoading).toBe(false);
  });

  test("should fail immediately with correct store error state when client is offline", async () => {
    // Simulate offline environment by defining navigator.onLine property
    const originalOnLine = (navigator as any).onLine;
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });

    const productsToImport = [
      {
        name: "Offline Item",
        category: "Tops",
        lowStockThreshold: 5,
        variants: [{ size: "M", color: "White", sku: "OFF-M", price: 1000, stock: 5 }],
      },
    ];

    const upsertSpy = vi.spyOn(actions, "upsertProductAction");

    const result = await store.getState().bulkImportProducts(productsToImport);

    expect(result.succeededCount).toBe(0);
    expect(result.failedProducts).toHaveLength(1);
    expect(result.failedProducts[0].error).toContain("offline");

    // Verify Rpc not called at all
    expect(upsertSpy).not.toHaveBeenCalled();

    // Verify error boundary registered in store state
    expect(store.getState().errorMsg).toContain("offline");

    // Restore original navigator.onLine value
    Object.defineProperty(navigator, "onLine", {
      value: originalOnLine !== undefined ? originalOnLine : true,
      configurable: true,
    });
  });
});
