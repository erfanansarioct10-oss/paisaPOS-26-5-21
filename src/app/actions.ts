"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { z } from "zod";

const checkoutSchema = z.object({
  storeId: z.string().uuid(),
  invoiceNumber: z.string().max(50),
  customerName: z.string().min(1).max(100),
  customerPhone: z.string().max(20).nullable(),
  totalAmount: z.number().nonnegative(),
  discountAmount: z.number().nonnegative(),
  paidAmount: z.number().nonnegative(),
  paymentMethod: z.enum(["Cash", "eSewa", "Khalti", "Fonepay"]),
  items: z.array(
    z.object({
      variant_id: z.string().uuid().nullable(),
      custom_name: z.string().min(1).max(200).nullable().optional(),
      quantity: z.number().int().positive(),
      unit_price: z.number().nonnegative(),
      subtotal: z.number().nonnegative(),
    })
  ).min(1),
});

const upsertProductSchema = z.object({
  productId: z.string().uuid().nullable(),
  name: z.string().min(1).max(150),
  category: z.string().min(1).max(100),
  lowStockThreshold: z.number().int().nonnegative(),
  deletedVariantIds: z.array(z.string().uuid()),
  variants: z.array(
    z.object({
      id: z.string().uuid().optional(),
      size: z.string().min(1).max(50),
      color: z.string().min(1).max(50),
      sku: z.string().min(1).max(100),
      price: z.number().nonnegative(),
      stock: z.number().int().nonnegative(),
    })
  ).min(1),
});

async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: Record<string, unknown>) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cookieStore.set({ name, value, ...options } as any);
        } catch {
          // Ignore if called in a context where cookies cannot be written
        }
      },
      remove(name: string, options: Record<string, unknown>) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cookieStore.set({ name, value: "", ...options } as any);
        } catch {
          // Ignore
        }
      },
    },
  });
}

export async function checkoutAction(rawParams: unknown) {
  const validation = checkoutSchema.safeParse(rawParams);
  if (!validation.success) {
    throw new Error("Invalid checkout payload: " + validation.error.message);
  }
  const params = validation.data;

  const supabase = await getSupabaseServerClient();
  
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
    const { data: { user } } = await supabase.auth.getUser();
    
    await supabase.from("audit_logs").insert({
      store_id: params.storeId,
      user_id: user?.id || null,
      operation: "CHECKOUT",
      affected_entity: "Invoice: " + params.invoiceNumber,
      result: "FAILED",
      error_message: rpcError.message,
    });

    throw new Error(rpcError.message);
  }

  // Fetch the newly created invoice and its line items
  const { data: dbInvoice, error: invFetchError } = await supabase
    .from("invoices")
    .select("*, invoice_items(*)")
    .eq("id", returnedInvoiceId)
    .single();

  if (invFetchError) {
    throw new Error(invFetchError.message);
  }

  return dbInvoice;
}

export async function upsertProductAction(rawParams: unknown) {
  const validation = upsertProductSchema.safeParse(rawParams);
  if (!validation.success) {
    throw new Error("Invalid product details payload: " + validation.error.message);
  }
  const params = validation.data;

  const supabase = await getSupabaseServerClient();
  
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
    throw new Error(error.message);
  }

  return productId;
}

export async function deleteProductAction(productId: string) {
  const supabase = await getSupabaseServerClient();

  // Enforce server-side store ownership check (defense-in-depth)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Unauthenticated");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("store_id")
    .eq("id", user.id)
    .single();

  if (!profile?.store_id) {
    throw new Error("Store profile not found");
  }

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId)
    .eq("store_id", profile.store_id);

  if (error) {
    throw new Error(error.message);
  }

  // Record successful deletion to audit log
  await supabase.from("audit_logs").insert({
    store_id: profile.store_id,
    user_id: user.id,
    operation: "PRODUCT_DELETE",
    affected_entity: "Product ID: " + productId,
    result: "SUCCESS",
  });

  return true;
}

export async function adjustStockAction(variantId: string, newStock: number) {
  const supabase = await getSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Unauthenticated");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("store_id")
    .eq("id", user.id)
    .single();

  if (!profile?.store_id) {
    throw new Error("Store profile not found");
  }

  // Verify variant ownership before updating
  const { data: variant, error: varError } = await supabase
    .from("product_variants")
    .select("id, products(store_id)")
    .eq("id", variantId)
    .single();

  if (varError || !variant) {
    throw new Error("Variant not found");
  }

  // @ts-expect-error products relationship type not fully resolved in raw DB schema
  if (variant.products?.store_id !== profile.store_id) {
    throw new Error("Unauthorized");
  }

  const { error } = await supabase
    .from("inventory")
    .update({ quantity: newStock, updated_at: new Date().toISOString() })
    .eq("variant_id", variantId);

  if (error) {
    throw new Error(error.message);
  }

  return true;
}

const updateStoreSchema = z.object({
  name: z.string().min(1, "Store name is required").max(100, "Store name must be under 100 characters"),
  phone: z.string().max(20, "Phone number must be under 20 characters").nullable().optional().or(z.literal("")),
  address: z.string().max(200, "Address must be under 200 characters").nullable().optional().or(z.literal("")),
  panVat: z.string().max(20, "PAN / VAT number must be under 20 characters").nullable().optional().or(z.literal("")),
});

const updateProfileSchema = z.object({
  name: z.string().min(1, "Display name is required").max(100, "Display name must be under 100 characters"),
});

export async function updateStoreAction(rawParams: unknown) {
  const validation = updateStoreSchema.safeParse(rawParams);
  if (!validation.success) {
    const errorMsg = validation.error.issues.map(e => e.message).join(", ");
    throw new Error("Invalid store info: " + errorMsg);
  }
  const data = validation.data;

  const supabase = await getSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  const { data: profile } = await supabase
    .from("users")
    .select("store_id")
    .eq("id", user.id)
    .single();

  if (!profile?.store_id) throw new Error("Store profile not found");

  const { error } = await supabase
    .from("stores")
    .update({
      name: data.name,
      phone: data.phone || null,
      address: data.address || null,
      pan_vat: data.panVat || null,
    })
    .eq("id", profile.store_id);

  if (error) throw new Error(error.message);
  return true;
}

export async function updateProfileAction(rawParams: unknown) {
  const validation = updateProfileSchema.safeParse(rawParams);
  if (!validation.success) {
    const errorMsg = validation.error.issues.map(e => e.message).join(", ");
    throw new Error("Invalid profile details: " + errorMsg);
  }
  const data = validation.data;

  const supabase = await getSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthenticated");

  const { error } = await supabase
    .from("users")
    .update({ name: data.name })
    .eq("id", user.id);

  if (error) throw new Error(error.message);
  return true;
}
