"use server";

import { z } from "zod";
import { writeLog } from "@/lib/logger";
import { sanitizeString, formatZodError, getFriendlyErrorMessage } from "@/lib/security";
import {
  assertStoreAccess,
  getInvoiceReceiptDTO,
  getSupabaseServerClient,
  requireOwnerContext,
  requireTenantContext,
} from "@/lib/server/dal";
import {
  checkoutLimiter,
  productMutationLimiter,
  bulkImportLimiter,
  uiMutationLimiter,
  enforceRateLimit,
} from "@/lib/rate-limiter";

const checkoutSchema = z.object({
  storeId: z.string().uuid(),
  invoiceNumber: z.string().max(50).transform(sanitizeString),
  customerName: z.string().min(1).max(100).transform(sanitizeString),
  customerPhone: z.string().max(20).nullable().transform(val => val ? sanitizeString(val) : null),
  totalAmount: z.number().nonnegative(),
  discountAmount: z.number().nonnegative(),
  paidAmount: z.number().nonnegative(),
  paymentMethod: z.enum(["Cash", "eSewa", "Khalti", "Fonepay"]),
  items: z.array(
    z.object({
      variant_id: z.string().uuid().nullable(),
      custom_name: z.string().min(1).max(200).nullable().optional().transform(val => val ? sanitizeString(val) : null),
      quantity: z.number().int().positive(),
      unit_price: z.number().nonnegative(),
      subtotal: z.number().nonnegative(),
    })
  ).min(1),
});

const upsertProductSchema = z.object({
  productId: z.string().uuid().nullable(),
  name: z.string().min(1).max(150).transform(sanitizeString),
  category: z.string().min(1).max(100).transform(sanitizeString),
  lowStockThreshold: z.number().int().nonnegative(),
  deletedVariantIds: z.array(z.string().uuid()),
  variants: z.array(
    z.object({
      id: z.string().uuid().optional(),
      size: z.string().min(1).max(50).transform(sanitizeString),
      color: z.string().min(1).max(50).transform(sanitizeString),
      sku: z.string().min(1).max(100).transform(val => val.toUpperCase().replace(/[^A-Z0-9-_]/g, "")),
      price: z.number().nonnegative(),
      stock: z.number().int().nonnegative(),
    })
  ).min(1),
});

async function logAuthorizationDenied(
  operation: string,
  message: string,
  metadata?: Record<string, unknown>,
) {
  await writeLog("SECURITY", operation, message, metadata);
}

export async function checkoutAction(rawParams: unknown) {
  const validation = checkoutSchema.safeParse(rawParams);
  if (!validation.success) {
    throw new Error("Invalid checkout payload: " + formatZodError(validation.error));
  }
  const params = validation.data;

  const supabase = await getSupabaseServerClient();
  const { user, store } = await assertStoreAccess(params.storeId);

  if (store.id !== params.storeId) {
    await logAuthorizationDenied("CHECKOUT_AUTHZ_DENIED", "Checkout rejected due to store ownership mismatch", {
      userId: user.id,
      requestedStoreId: params.storeId,
      actualStoreId: store.id,
    });
    throw new Error("Unauthorized: Store ownership mismatch");
  }

  // User-scoped rate limiting: 10 checkouts per minute
  await enforceRateLimit(checkoutLimiter, `checkout:${user.id}`, "CHECKOUT");
  
  // Sort items alphabetically by variant_id UUID to eliminate deadlock vulnerability under concurrent checkout
  const sortedItems = [...params.items].sort((a, b) => {
    if (!a.variant_id && !b.variant_id) return 0;
    if (!a.variant_id) return 1;
    if (!b.variant_id) return -1;
    return a.variant_id.localeCompare(b.variant_id);
  });

  // Call the atomic checkout RPC in the database
  const { data: returnedInvoiceId, error: rpcError } = await supabase.rpc(
    "create_invoice_and_deduct_stock",
    {
      p_store_id: params.storeId,
      p_invoice_number: params.invoiceNumber,
      p_customer_name: params.customerName,
      p_customer_phone: params.customerPhone,
      p_total_amount: params.totalAmount,
      p_discount_amount: params.discountAmount,
      p_paid_amount: params.paidAmount,
      p_payment_method: params.paymentMethod,
      p_items: sortedItems,
    }
  );

  if (rpcError) {
    // Audit failure in the database outside the rolled-back RPC transaction (MEDIUM-20)
    await writeLog("ERROR", "CHECKOUT_FAILURE", `Checkout failed for invoice ${params.invoiceNumber}`, {
      storeId: store.id,
      userId: user.id,
      invoiceNumber: params.invoiceNumber,
      errorMessage: rpcError.message,
    });

    throw new Error(rpcError.message);
  }

  return getInvoiceReceiptDTO(returnedInvoiceId);
}

export async function upsertProductAction(rawParams: unknown) {
  const validation = upsertProductSchema.safeParse(rawParams);
  if (!validation.success) {
    throw new Error("Invalid product details payload: " + formatZodError(validation.error));
  }
  const params = validation.data;

  const supabase = await getSupabaseServerClient();
  const { user } = await requireOwnerContext();

  // User-scoped rate limiting: 20 product mutations per minute
  await enforceRateLimit(productMutationLimiter, `product:${user.id}`, "PRODUCT_UPSERT");
  
  const { data: productId, error } = await supabase.rpc(
    "upsert_product_and_variants",
    {
      p_product_id: params.productId,
      p_name: params.name,
      p_category: params.category,
      p_low_stock_threshold: params.lowStockThreshold,
      p_deleted_variant_ids: params.deletedVariantIds,
      p_variants: params.variants,
    }
  );

  if (error) {
    if (error.message.toLowerCase().includes("unauthorized")) {
      await logAuthorizationDenied("PRODUCT_UPSERT_AUTHZ_DENIED", "Product upsert authorization rejected by RPC", {
        userId: user.id,
        errorMessage: error.message,
      });
    }
    const msg = error.message.toLowerCase();
    if (
      msg.includes("product_variants_store_sku_key") ||
      msg.includes("product_variants_sku_key") ||
      msg.includes("duplicate key") ||
      msg.includes("unique constraint")
    ) {
      throw new Error("Failed to save product: A variant with this SKU already exists.");
    }
    throw new Error(error.message);
  }

  return productId;
}

export async function bulkUpsertProductsAction(rawParams: unknown) {
  const validation = z.array(upsertProductSchema).safeParse(rawParams);
  if (!validation.success) {
    throw new Error("Invalid bulk products details payload: " + formatZodError(validation.error));
  }
  const products = validation.data;
  const total = products.length;

  const supabase = await getSupabaseServerClient();
  const { user: bulkUser } = await requireOwnerContext();

  // User-scoped rate limiting: 2 bulk imports per 5 minutes
  await enforceRateLimit(bulkImportLimiter, `bulk:${bulkUser.id}`, "BULK_IMPORT");

  let succeededCount = 0;
  const failedProducts: Array<{ name: string; error: string }> = [];
  let failedChunkError: string | undefined = undefined;
  let skippedRemainder: string[] | undefined = undefined;

  const CHUNK_SIZE = 100;

  for (let i = 0; i < total; i += CHUNK_SIZE) {
    const chunk = products.slice(i, i + CHUNK_SIZE);
    const rpcPayload = chunk.map(p => ({
      name: p.name,
      category: p.category,
      lowStockThreshold: p.lowStockThreshold,
      variants: p.variants.map(v => ({
        size: v.size,
        color: v.color,
        sku: v.sku,
        price: v.price,
        stock: v.stock,
      })),
    }));

    try {
      const { data: count, error } = await supabase.rpc(
        "bulk_upsert_products_and_variants",
        {
          p_products: rpcPayload,
        }
      );

      if (error) {
        if (error.message.toLowerCase().includes("unauthorized")) {
          await logAuthorizationDenied("BULK_IMPORT_AUTHZ_DENIED", "Bulk import authorization rejected by RPC", {
            userId: bulkUser.id,
            errorMessage: error.message,
          });
        }
        throw new Error(error.message);
      }

      succeededCount += count || chunk.length;
    } catch (e: unknown) {
      console.error(`Error in bulkUpsertProductsAction at chunk index ${i}:`, e);
      let errorMsg = "Database operation failed.";
      if (e instanceof Error) {
        errorMsg = e.message;
      }

      const msg = errorMsg.toLowerCase();
      if (
        msg.includes("product_variants_store_sku_key") ||
        msg.includes("product_variants_sku_key") ||
        msg.includes("duplicate key") ||
        msg.includes("unique constraint")
      ) {
        errorMsg = "Failed to save product: A variant with this SKU already exists.";
      }

      failedChunkError = errorMsg;

      // This chunk rolls back atomically. Mark all products in this chunk as failed.
      chunk.forEach(p => {
        failedProducts.push({ name: p.name, error: errorMsg });
      });

      // Remaining products in other chunks are skipped.
      const remainder = products.slice(i + CHUNK_SIZE);
      skippedRemainder = remainder.map(p => p.name);

      await writeLog("ERROR", "BULK_IMPORT_CHUNK_FAILURE", `Bulk import failed at chunk index ${i}`, {
        chunkStartIndex: i,
        errorMessage: errorMsg,
        failedCount: chunk.length,
        skippedCount: remainder.length,
      });

      break; // Halt subsequent chunks immediately
    }
  }

  return {
    succeededCount,
    failedProducts,
    failedChunkError,
    skippedRemainder,
  };
}

export async function deleteProductAction(productId: string) {
  const cleanProductId = z.string().uuid().parse(productId);
  const supabase = await getSupabaseServerClient();
  const { user, store } = await requireOwnerContext();

  // User-scoped rate limiting: 20 product mutations per minute
  await enforceRateLimit(productMutationLimiter, `product:${user.id}`, "PRODUCT_DELETE");

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", cleanProductId)
    .eq("store_id", store.id);

  if (error) {
    await writeLog("ERROR", "PRODUCT_DELETE_FAILURE", `Failed to delete product: ${cleanProductId}`, {
      productId: cleanProductId,
      storeId: store.id,
      errorMessage: error.message,
    });
    throw new Error(error.message);
  }

  await writeLog("INFO", "PRODUCT_DELETE_SUCCESS", `Product deleted: ${cleanProductId}`, {
    productId: cleanProductId,
    storeId: store.id,
    userId: user.id,
  });

  return true;
}

export async function adjustStockAction(variantId: string, newStock: number) {
  const cleanVariantId = z.string().uuid().parse(variantId);
  const cleanStock = z.number().int().nonnegative().parse(newStock);
  const supabase = await getSupabaseServerClient();
  const { user, store } = await requireOwnerContext();

  // User-scoped rate limiting: 30 stock/UI mutations per minute
  await enforceRateLimit(uiMutationLimiter, `ui:${user.id}`, "STOCK_ADJUST");

  // Verify variant ownership before updating
  const { data: variant, error: varError } = await supabase
    .from("product_variants")
    .select("id, store_id")
    .eq("id", cleanVariantId)
    .single();

  if (varError || !variant) {
    throw new Error("Variant not found");
  }

  if (variant.store_id !== store.id) {
    await logAuthorizationDenied("STOCK_ADJUST_AUTHZ_DENIED", "Stock adjustment rejected for cross-store variant", {
      userId: user.id,
      storeId: store.id,
      variantId: cleanVariantId,
    });
    throw new Error("Unauthorized");
  }

  const { error } = await supabase
    .from("inventory")
    .update({ quantity: cleanStock, updated_at: new Date().toISOString() })
    .eq("variant_id", cleanVariantId)
    .eq("store_id", store.id);

  if (error) {
    await writeLog("ERROR", "STOCK_ADJUST_FAILURE", `Failed to adjust stock for variant: ${cleanVariantId}`, {
      variantId: cleanVariantId,
      newStock: cleanStock,
      storeId: store.id,
      errorMessage: error.message,
    });
    throw new Error(error.message);
  }

  return true;
}

export async function toggleProductFavoriteAction(productId: string, isFavorite: boolean) {
  const cleanProductId = z.string().uuid().parse(productId);
  const cleanIsFavorite = z.boolean().parse(isFavorite);
  const supabase = await getSupabaseServerClient();
  const { user, store } = await requireOwnerContext();

  // Verify product ownership before updating to prevent cross-tenant parameter spoofing (BOLA)
  const { data: product, error: prodError } = await supabase
    .from("products")
    .select("id, store_id")
    .eq("id", cleanProductId)
    .single();

  if (prodError || !product) {
    throw new Error("Product not found");
  }

  if (product.store_id !== store.id) {
    await logAuthorizationDenied("FAVORITE_TOGGLE_AUTHZ_DENIED", "Favorite toggle rejected for cross-store product", {
      userId: user.id,
      storeId: store.id,
      productId: cleanProductId,
      productStoreId: product.store_id,
    });
    throw new Error("Unauthorized");
  }

  // User-scoped rate limiting: 30 stock/UI mutations per minute
  await enforceRateLimit(uiMutationLimiter, `ui:${user.id}`, "FAVORITE_TOGGLE");

  const { error } = await supabase
    .from("products")
    .update({ is_favorite: cleanIsFavorite })
    .eq("id", cleanProductId)
    .eq("store_id", store.id);

  if (error) {
    await writeLog("ERROR", "FAVORITE_TOGGLE_FAILURE", `Failed to toggle favorite for product: ${cleanProductId}`, {
      productId: cleanProductId,
      isFavorite: cleanIsFavorite,
      storeId: store.id,
      errorMessage: error.message,
    });
    throw new Error(error.message);
  }

  return true;
}

const updateStoreSchema = z.object({
  name: z.string().min(1, "Store name is required").max(100, "Store name must be under 100 characters").transform(sanitizeString),
  phone: z.string().max(20, "Phone number must be under 20 characters").nullable().optional().or(z.literal("")).transform(val => val ? sanitizeString(val) : val),
  address: z.string().max(200, "Address must be under 200 characters").nullable().optional().or(z.literal("")).transform(val => val ? sanitizeString(val) : val),
  panVat: z.string().max(20, "PAN / VAT number must be under 20 characters").nullable().optional().or(z.literal("")).transform(val => val ? sanitizeString(val) : val),
});

const updateProfileSchema = z.object({
  name: z.string().min(1, "Display name is required").max(100, "Display name must be under 100 characters").transform(sanitizeString),
});

export type SettingsFormState = {
  success: boolean;
  message?: string;
  error?: string;
  savedAt?: number;
};

const settingsInitialError = "We could not save those changes. Please try again.";

export async function updateStoreAction(rawParams: unknown) {
  const validation = updateStoreSchema.safeParse(rawParams);
  if (!validation.success) {
    throw new Error("Invalid store info: " + formatZodError(validation.error));
  }
  const data = validation.data;

  const supabase = await getSupabaseServerClient();
  const { user, store } = await requireOwnerContext();

  // Rate limit: UI mutations (30/min/user)
  await enforceRateLimit(uiMutationLimiter, `ui:${user.id}`, "STORE_UPDATE");

  const { error } = await supabase
    .from("stores")
    .update({
      name: data.name,
      phone: data.phone || null,
      address: data.address || null,
      pan_vat: data.panVat || null,
    })
    .eq("id", store.id);

  if (error) throw new Error(error.message);
  return true;
}

export async function updateProfileAction(rawParams: unknown) {
  const validation = updateProfileSchema.safeParse(rawParams);
  if (!validation.success) {
    throw new Error("Invalid profile details: " + formatZodError(validation.error));
  }
  const data = validation.data;

  const supabase = await getSupabaseServerClient();
  const { user } = await requireTenantContext();

  // Rate limit: UI mutations (30/min/user)
  await enforceRateLimit(uiMutationLimiter, `ui:${user.id}`, "PROFILE_UPDATE");

  const { error } = await supabase
    .from("users")
    .update({ name: data.name })
    .eq("id", user.id);

  if (error) throw new Error(error.message);
  return true;
}

export async function updateStoreFormAction(
  _prevState: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  try {
    await updateStoreAction({
      name: String(formData.get("name") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      address: String(formData.get("address") ?? ""),
      panVat: String(formData.get("panVat") ?? ""),
    });

    return {
      success: true,
      message: "Store information updated successfully.",
      savedAt: Date.now(),
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: getFriendlyErrorMessage(err) || settingsInitialError,
    };
  }
}

export async function updateProfileFormAction(
  _prevState: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  try {
    await updateProfileAction({
      name: String(formData.get("name") ?? ""),
    });

    return {
      success: true,
      message: "Profile updated successfully.",
      savedAt: Date.now(),
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: getFriendlyErrorMessage(err) || settingsInitialError,
    };
  }
}
