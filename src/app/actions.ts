"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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

export async function checkoutAction(params: {
  storeId: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string | null;
  totalAmount: number;
  discountAmount: number;
  paidAmount: number;
  paymentMethod: string;
  items: Array<{
    variant_id: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
}) {
  const supabase = await getSupabaseServerClient();
  
  // Sort items alphabetically by variant_id UUID to eliminate deadlock vulnerability under concurrent checkout
  const sortedItems = [...params.items].sort((a, b) => a.variant_id.localeCompare(b.variant_id));

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

export async function upsertProductAction(params: {
  productId: string | null;
  name: string;
  category: string;
  lowStockThreshold: number;
  deletedVariantIds: string[];
  variants: Array<{
    id?: string;
    size: string;
    color: string;
    sku: string;
    price: number;
    stock: number;
  }>;
}) {
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
