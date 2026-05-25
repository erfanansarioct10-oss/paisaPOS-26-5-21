import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Invoice, InvoiceItem, Product, ProductVariant, Profile, StoreMetadata } from "@/lib/store/types";

export type CurrentUserDTO = {
  id: string;
  email?: string;
};

export type TenantContextDTO = {
  user: Profile;
  store: StoreMetadata;
};

export type StoreSnapshotDTO = {
  products: Product[];
  variants: ProductVariant[];
  invoices: Invoice[];
};

export type CheckoutInvoiceDTO = Invoice & {
  invoice_items: InvoiceItem[];
};

export const getSupabaseServerClient = cache(async () => {
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
          // The same client is used in read-only server component contexts.
        }
      },
      remove(name: string, options: Record<string, unknown>) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cookieStore.set({ name, value: "", ...options } as any);
        } catch {
          // Ignore read-only contexts.
        }
      },
    },
  });
});

export const getCurrentUser = cache(async (): Promise<CurrentUserDTO | null> => {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
  };
});

export async function requireCurrentUser(): Promise<CurrentUserDTO> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthenticated");
  }
  return user;
}

export const getCurrentTenantContext = cache(async (): Promise<TenantContextDTO | null> => {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const supabase = await getSupabaseServerClient();
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, name, store_id, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.store_id) {
    return null;
  }

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, name, phone, address, pan_vat")
    .eq("id", profile.store_id)
    .single();

  if (storeError || !store) {
    return null;
  }

  return {
    user: {
      id: profile.id,
      name: profile.name,
      store_id: profile.store_id,
      email: user.email,
      role: profile.role,
    },
    store: {
      id: store.id,
      name: store.name,
      phone: store.phone ?? "",
      address: store.address ?? "",
      pan_vat: store.pan_vat ?? "",
    },
  };
});

export async function requireTenantContext(): Promise<TenantContextDTO> {
  const context = await getCurrentTenantContext();
  if (!context) {
    throw new Error("Store profile not found");
  }
  return context;
}

export async function requireOwnerContext(): Promise<TenantContextDTO> {
  const context = await requireTenantContext();
  if (context.user.role !== "owner") {
    throw new Error("Unauthorized: Only store owners can perform this action.");
  }
  return context;
}

export async function assertStoreAccess(storeId: string): Promise<TenantContextDTO> {
  const context = await requireTenantContext();
  if (context.store.id !== storeId) {
    throw new Error("Unauthorized: Store ownership mismatch");
  }
  return context;
}

export async function getStoreSnapshotDTO(): Promise<StoreSnapshotDTO> {
  const context = await requireTenantContext();
  const supabase = await getSupabaseServerClient();

  const [productsResult, variantsResult, invoicesResult] = await Promise.all([
    supabase
      .from("products")
      .select("id, store_id, name, category, image_url, low_stock_threshold, is_favorite, created_at")
      .eq("store_id", context.store.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("product_variants")
      .select("id, product_id, size, color, sku, price, created_at, inventory(quantity)")
      .eq("store_id", context.store.id),
    supabase
      .from("invoices")
      .select("id, store_id, invoice_number, customer_name, customer_phone, total_amount, discount_amount, paid_amount, payment_method, created_at")
      .eq("store_id", context.store.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (productsResult.error) throw new Error(productsResult.error.message);
  if (variantsResult.error) throw new Error(variantsResult.error.message);
  if (invoicesResult.error) throw new Error(invoicesResult.error.message);

  const variants = (variantsResult.data ?? []).map((variant: unknown) => {
    const item = variant as ProductVariant & {
      price: string | number;
      inventory?: { quantity: number }[] | { quantity: number } | null;
    };
    const inventory = Array.isArray(item.inventory) ? item.inventory[0] : item.inventory;

    return {
      id: item.id,
      product_id: item.product_id,
      size: item.size,
      color: item.color,
      sku: item.sku,
      price: Number(item.price),
      stock: inventory?.quantity ?? 0,
      created_at: item.created_at,
    };
  });

  return {
    products: (productsResult.data ?? []) as Product[],
    variants,
    invoices: (invoicesResult.data ?? []) as Invoice[],
  };
}

export async function getInvoiceReceiptDTO(invoiceId: string): Promise<CheckoutInvoiceDTO> {
  const context = await requireTenantContext();
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase
    .from("invoices")
    .select(`
      id,
      store_id,
      invoice_number,
      customer_name,
      customer_phone,
      total_amount,
      discount_amount,
      paid_amount,
      payment_method,
      created_at,
      invoice_items (
        id,
        invoice_id,
        variant_id,
        custom_name,
        quantity,
        unit_price,
        subtotal
      )
    `)
    .eq("id", invoiceId)
    .eq("store_id", context.store.id)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Invoice not found");
  }

  const { invoice_items: invoiceItems, ...invoice } = data as CheckoutInvoiceDTO;
  return {
    ...invoice,
    invoice_items: invoiceItems ?? [],
  };
}
