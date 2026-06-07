import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const JWT_CLOCK_SKEW_RETRY_DELAYS_MS = [500, 1000, 2000];

type SupabaseErrorLike = {
  code?: string;
  message?: string;
} | null;

type SupabaseResult<T> = {
  data: T | null;
  error: SupabaseErrorLike;
};

function isJwtIssuedAtFutureError(error: SupabaseErrorLike): boolean {
  return Boolean(
    error &&
    (error.code === "PGRST303" ||
      error.message?.toLowerCase().includes("jwt issued at future"))
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryOnTransientJwtClockSkew<T>(
  operation: () => PromiseLike<SupabaseResult<T>>
): Promise<SupabaseResult<T>> {
  let result = await operation();

  for (const delayMs of JWT_CLOCK_SKEW_RETRY_DELAYS_MS) {
    if (!isJwtIssuedAtFutureError(result.error)) {
      return result;
    }

    await sleep(delayMs);
    result = await operation();
  }

  return result;
}

type TestVariantInput = {
  id?: string;
  size: string;
  color: string;
  sku: string;
  price: number;
  stock: number;
};

type TestInventory = {
  quantity: number;
};

type TestVariant = {
  id: string;
  sku: string;
  price: number;
  inventory: TestInventory | TestInventory[];
};

type TestProduct = {
  id: string;
  name: string;
  category: string;
  low_stock_threshold: number;
  product_variants: TestVariant[];
};

type CheckoutRpcResult = string | {
  invoice_id?: string;
  was_replayed?: boolean;
};

export function getCheckoutInvoiceId(data: CheckoutRpcResult | null): string {
  if (typeof data === "string") return data;
  if (data?.invoice_id) return data.invoice_id;
  throw new Error("Checkout RPC did not return an invoice id.");
}

export function newIdempotencyKey(): string {
  return randomUUID();
}

export function getVariantInventory(variant: TestVariant): TestInventory {
  const inventory = Array.isArray(variant.inventory) ? variant.inventory[0] : variant.inventory;
  if (!inventory) {
    throw new Error(`Variant ${variant.id} did not include inventory.`);
  }
  return inventory;
}

export async function upsertCatalogProduct(
  client: SupabaseClient,
  params: {
    productId?: string | null;
    name: string;
    category: string;
    lowStockThreshold?: number;
    deletedVariantIds?: string[];
    variants: TestVariantInput[];
  },
): Promise<{
  product: TestProduct;
  variant: TestVariant;
  inventory: TestInventory;
}> {
  const { data: productId, error: upsertError } = await retryOnTransientJwtClockSkew(() =>
    client.rpc("upsert_product_and_variants", {
      p_product_id: params.productId ?? null,
      p_name: params.name,
      p_category: params.category,
      p_low_stock_threshold: params.lowStockThreshold ?? 5,
      p_deleted_variant_ids: params.deletedVariantIds ?? [],
      p_variants: params.variants,
    })
  );

  if (upsertError) {
    throw new Error(upsertError.message ?? "Product upsert RPC failed.");
  }
  if (!productId) {
    throw new Error("Product upsert RPC did not return a product id.");
  }

  const { data: product, error: readError } = await client
    .from("products")
    .select("*, product_variants(*, inventory(*))")
    .eq("id", productId)
    .single();

  if (readError) {
    throw new Error(readError.message ?? "Product readback failed.");
  }

  const typedProduct = product as TestProduct;
  const firstInputSku = params.variants[0]?.sku;
  const variant = typedProduct.product_variants.find((candidate) => candidate.sku === firstInputSku)
    ?? typedProduct.product_variants[0];

  if (!variant) {
    throw new Error("Product readback did not include a variant.");
  }

  return {
    product: typedProduct,
    variant,
    inventory: getVariantInventory(variant),
  };
}
