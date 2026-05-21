// =========================================================================
// PaisaPOS — High-Fidelity Nepalese Demo Data Seeds
// =========================================================================

import type {
  StoreMetadata,
  Profile,
  Product,
  ProductVariant,
  Invoice,
  InvoiceItem,
} from "./types";

export const DEMO_STORE: StoreMetadata = {
  id: "demo-store-uuid-001",
  name: "KTM Streetwear Hub",
  phone: "9851012345",
  address: "Civil Mall, Kathmandu, Nepal",
  pan_vat: "601245789",
};

export const DEMO_PROFILE: Profile = {
  id: "demo-user-uuid-001",
  name: "Sunil Shrestha",
  store_id: DEMO_STORE.id,
  email: "sunil@ktmstreetwear.com",
};

export const DEMO_PRODUCTS: Product[] = [
  {
    id: "prod-1",
    store_id: DEMO_STORE.id,
    name: "Oversized Heavyweight Hoodie",
    category: "Outerwear",
    image_url: null,
    low_stock_threshold: 4,
  },
  {
    id: "prod-2",
    store_id: DEMO_STORE.id,
    name: "Baggy Fit Cargo Jeans",
    category: "Bottoms",
    image_url: null,
    low_stock_threshold: 5,
  },
  {
    id: "prod-3",
    store_id: DEMO_STORE.id,
    name: "Minimalist Linen Kurti Set",
    category: "Traditional",
    image_url: null,
    low_stock_threshold: 3,
  },
  {
    id: "prod-4",
    store_id: DEMO_STORE.id,
    name: "Core Essential Tee",
    category: "Tops",
    image_url: null,
    low_stock_threshold: 5,
  },
];

export const DEMO_VARIANTS: ProductVariant[] = [
  // Hoodie variants
  { id: "var-1-1", product_id: "prod-1", size: "M", color: "Acid Black", sku: "HOOD-BLK-M", price: 2850, stock: 12 },
  { id: "var-1-2", product_id: "prod-1", size: "L", color: "Acid Black", sku: "HOOD-BLK-L", price: 2850, stock: 3 }, // Low stock!
  { id: "var-1-3", product_id: "prod-1", size: "XL", color: "Acid Black", sku: "HOOD-BLK-XL", price: 2950, stock: 6 },
  { id: "var-1-4", product_id: "prod-1", size: "M", color: "Olive Green", sku: "HOOD-OLV-M", price: 2850, stock: 10 },
  { id: "var-1-5", product_id: "prod-1", size: "L", color: "Olive Green", sku: "HOOD-OLV-L", price: 2850, stock: 0 }, // Out of stock!

  // Cargo Jeans variants
  { id: "var-2-1", product_id: "prod-2", size: "30", color: "Denim Blue", sku: "CARG-BLU-30", price: 2400, stock: 15 },
  { id: "var-2-2", product_id: "prod-2", size: "32", color: "Denim Blue", sku: "CARG-BLU-32", price: 2400, stock: 4 }, // Low stock!
  { id: "var-2-3", product_id: "prod-2", size: "34", color: "Denim Blue", sku: "CARG-BLU-34", price: 2450, stock: 8 },
  { id: "var-2-4", product_id: "prod-2", size: "30", color: "Olive Drab", sku: "CARG-OLV-30", price: 2400, stock: 1 }, // Low stock!

  // Kurti Set
  { id: "var-3-1", product_id: "prod-3", size: "S", color: "Pastel Pink", sku: "KURT-PNK-S", price: 1950, stock: 14 },
  { id: "var-3-2", product_id: "prod-3", size: "M", color: "Pastel Pink", sku: "KURT-PNK-M", price: 1950, stock: 8 },
  { id: "var-3-3", product_id: "prod-3", size: "L", color: "Pastel Pink", sku: "KURT-PNK-L", price: 1950, stock: 2 }, // Low stock!

  // Essential Tee
  { id: "var-4-1", product_id: "prod-4", size: "M", color: "Off-White", sku: "TEE-WHT-M", price: 1200, stock: 25 },
  { id: "var-4-2", product_id: "prod-4", size: "L", color: "Off-White", sku: "TEE-WHT-L", price: 1200, stock: 18 },
  { id: "var-4-3", product_id: "prod-4", size: "M", color: "Charcoal Grey", sku: "TEE-GRY-M", price: 1200, stock: 3 }, // Low stock!
  { id: "var-4-4", product_id: "prod-4", size: "L", color: "Charcoal Grey", sku: "TEE-GRY-L", price: 1200, stock: 12 },
];

export const DEMO_INVOICES: Invoice[] = [
  {
    id: "inv-1",
    store_id: DEMO_STORE.id,
    invoice_number: "INV-2026-0001",
    customer_name: "Aashish Adhikari",
    customer_phone: "9841987654",
    total_amount: 5250,
    discount_amount: 0,
    paid_amount: 5250,
    payment_method: "eSewa",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
  },
  {
    id: "inv-2",
    store_id: DEMO_STORE.id,
    invoice_number: "INV-2026-0002",
    customer_name: "Pooja Shrestha",
    customer_phone: "9860123456",
    total_amount: 2400,
    discount_amount: 100,
    paid_amount: 2300,
    payment_method: "Cash",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 25).toISOString(), // 25 hours ago
  },
  {
    id: "inv-3",
    store_id: DEMO_STORE.id,
    invoice_number: "INV-2026-0003",
    customer_name: "Subash Thapa",
    customer_phone: "9812345678",
    total_amount: 1200,
    discount_amount: 0,
    paid_amount: 1200,
    payment_method: "Fonepay",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), // 2 days ago
  },
];

export const DEMO_INVOICE_ITEMS: Record<string, InvoiceItem[]> = {
  "inv-1": [
    { id: "inv-item-1-1", invoice_id: "inv-1", variant_id: "var-1-1", quantity: 1, unit_price: 2850, subtotal: 2850 },
    { id: "inv-item-1-2", invoice_id: "inv-1", variant_id: "var-2-3", quantity: 1, unit_price: 2450, subtotal: 2450 },
  ],
  "inv-2": [
    { id: "inv-item-2-1", invoice_id: "inv-2", variant_id: "var-2-1", quantity: 1, unit_price: 2400, subtotal: 2400 },
  ],
  "inv-3": [
    { id: "inv-item-3-1", invoice_id: "inv-3", variant_id: "var-4-1", quantity: 1, unit_price: 1200, subtotal: 1200 },
  ],
};
