import { describe, expect, test, vi } from "vitest";
import type { InvoiceItem, Product, ProductVariant } from "@/lib/store/types";
import { hydrateReceiptInvoiceItems, resolveReceiptInvoiceItems } from "../receipt-invoice-items";

const products: Product[] = [
  {
    id: "product-1",
    store_id: "store-1",
    name: "Oversized Heavyweight Hoodie",
    category: "Tops",
    image_url: null,
    low_stock_threshold: 5,
    is_favorite: false,
  },
];

const variants: ProductVariant[] = [
  {
    id: "variant-1",
    product_id: "product-1",
    size: "M",
    color: "Black",
    sku: "HOOD-BLK-M",
    price: 2500,
    stock: 4,
  },
];

const invoiceItems: InvoiceItem[] = [
  {
    id: "item-1",
    invoice_id: "invoice-1",
    variant_id: "variant-1",
    quantity: 2,
    unit_price: 2500,
    subtotal: 5000,
  },
  {
    id: "item-2",
    invoice_id: "invoice-1",
    variant_id: null,
    custom_name: "Alteration",
    quantity: 1,
    unit_price: 300,
    subtotal: 300,
  },
];

describe("receipt invoice item helpers", () => {
  test("hydrates product, size, and color details for receipt rendering", () => {
    expect(hydrateReceiptInvoiceItems(invoiceItems, products, variants)).toEqual([
      {
        ...invoiceItems[0],
        product_name: "Oversized Heavyweight Hoodie",
        size: "M",
        color: "Black",
      },
      {
        ...invoiceItems[1],
        product_name: "Alteration",
        size: "-",
        color: "-",
      },
    ]);
  });

  test("uses cached invoice items when they are already loaded", async () => {
    const fetchInvoiceItems = vi.fn<Parameters<typeof resolveReceiptInvoiceItems>[0]["fetchInvoiceItems"]>();

    await expect(
      resolveReceiptInvoiceItems({
        fetchInvoiceItems,
        invoiceId: "invoice-1",
        invoiceItemsByInvoiceId: { "invoice-1": invoiceItems },
        products,
        variants,
      }),
    ).resolves.toHaveLength(2);
    expect(fetchInvoiceItems).not.toHaveBeenCalled();
  });

  test("fetches invoice items when the receipt cache is empty", async () => {
    const fetchInvoiceItems = vi.fn(async () => invoiceItems);

    await expect(
      resolveReceiptInvoiceItems({
        fetchInvoiceItems,
        invoiceId: "invoice-1",
        invoiceItemsByInvoiceId: {},
        products,
        variants,
      }),
    ).resolves.toHaveLength(2);
    expect(fetchInvoiceItems).toHaveBeenCalledWith("invoice-1");
  });
});
