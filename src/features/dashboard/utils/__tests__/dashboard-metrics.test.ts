import { describe, expect, test } from "vitest";
import type { Invoice, Product, ProductVariant } from "@/lib/store/types";
import { buildDashboardMetrics } from "../dashboard-metrics";

const products: Product[] = [
  {
    id: "product-1",
    store_id: "store-1",
    name: "Oversized Heavyweight Hoodie",
    category: "Tops",
    image_url: null,
    low_stock_threshold: 3,
    is_favorite: false,
  },
  {
    id: "product-2",
    store_id: "store-1",
    name: "Cargo Pants",
    category: "Bottoms",
    image_url: null,
    low_stock_threshold: 2,
    is_favorite: false,
  },
];

const variants: ProductVariant[] = [
  {
    id: "variant-healthy",
    product_id: "product-1",
    size: "M",
    color: "Black",
    sku: "HOOD-BLK-M",
    price: 2500,
    stock: 8,
  },
  {
    id: "variant-low",
    product_id: "product-2",
    size: "L",
    color: "Olive",
    sku: "CARG-OLV-L",
    price: 3200,
    stock: 2,
  },
  {
    id: "variant-empty",
    product_id: "product-2",
    size: "S",
    color: "Olive",
    sku: "CARG-OLV-S",
    price: 3000,
    stock: 0,
  },
];

function makeInvoice(id: string, createdAt: Date, totalAmount: number): Invoice {
  return {
    id,
    store_id: "store-1",
    invoice_number: `INV-${id}`,
    customer_name: null,
    customer_phone: null,
    total_amount: totalAmount,
    discount_amount: 0,
    paid_amount: totalAmount,
    payment_method: "Cash",
    created_at: createdAt.toISOString(),
  };
}

describe("dashboard metrics", () => {
  test("builds today's sales and stock warning metrics from store data", () => {
    const metrics = buildDashboardMetrics({
      invoices: [
        makeInvoice("today-1", new Date("2026-05-29T01:00:00"), 2500),
        makeInvoice("today-2", new Date("2026-05-29T15:00:00"), 3200),
        makeInvoice("yesterday", new Date("2026-05-28T23:59:00"), 9999),
      ],
      products,
      variants,
      now: new Date("2026-05-29T18:00:00"),
    });

    expect(metrics.todayInvoicesCount).toBe(2);
    expect(metrics.todaySalesSum).toBe(5700);
    expect(metrics.productCount).toBe(2);
    expect(metrics.variantCount).toBe(3);
    expect(metrics.lowStockVariants.map((variant) => variant.id)).toEqual(["variant-low", "variant-empty"]);
    expect(metrics.lowStockCount).toBe(2);
    expect(metrics.outOfStockCount).toBe(1);
  });
});
