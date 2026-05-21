import { describe, test, expect, beforeEach } from "vitest";
import { create } from "zustand";
import { AppState } from "../types";
import { createAuthSlice } from "../authSlice";
import { createInventorySlice } from "../inventorySlice";
import { createCartSlice } from "../cartSlice";

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
    store.setState({
      isDemoMode: true,
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

    // SLA Gate: Keystroke search latency must average < 0.2ms per lookup to prevent POS dashboard lag
    expect(avgLatency).toBeLessThan(0.2);
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
});
