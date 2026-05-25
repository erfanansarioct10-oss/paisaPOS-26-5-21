import { describe, test, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import { retryOnTransientJwtClockSkew } from "./supabase-test-utils";

// Load environment variables using Next.js's loader
loadEnvConfig(process.cwd());

// Skip integration tests if environment variables are not present
const runLiveTests = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !process.env.SKIP_LIVE_TESTS
);

describe.runIf(runLiveTests)("PaisaPOS — Live Production Database CRUD Integration Verification", () => {
  let supabase: ReturnType<typeof createClient>;

  beforeAll(() => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    supabase = createClient(supabaseUrl, supabaseAnonKey);
  });

  test("Executes complete Tenant Store, Product, Variant, Inventory, and checkout Invoice CRUD lifecycle", async () => {
    // 1. Generate unique randomized credentials for the QA test user
    const randomId = Math.random().toString(36).slice(2, 7) + Date.now();
    const email = `test-crud-${randomId}@paisapos-qa.com`;
    const password = "SecurityDefinerPass123!";
    const fullName = `QA Tester - ${randomId}`;
    const storeName = `QA Boutique - ${randomId}`;

    console.log(`[QA] Signing up test tenant: ${email}`);
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    expect(signUpError).toBeNull();
    expect(signUpData.user).toBeDefined();
    const userId = signUpData.user!.id;

    // 2. Call the Security Definer registration RPC
    console.log("[QA] Triggering register_store_and_user onboarding RPC...");
    const { data: storeId, error: onboardingError } = await retryOnTransientJwtClockSkew(() =>
      supabase.rpc("register_store_and_user", {
        p_full_name: fullName,
        p_store_name: storeName,
      })
    );

    expect(onboardingError).toBeNull();
    expect(storeId).toBeDefined();

    // 3. Verify user profile exists in public.users
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    expect(profileError).toBeNull();
    expect(profile).toBeDefined();
    expect(profile.name).toBe(fullName);
    expect(profile.store_id).toBe(storeId);

    // 4. Verify store metadata exists in public.stores
    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select("*")
      .eq("id", storeId)
      .single();

    expect(storeError).toBeNull();
    expect(store).toBeDefined();
    expect(store.name).toBe(storeName);

    // 5. Product Creation (CREATE Product)
    console.log("[QA] Creating test product...");
    const { data: product, error: productError } = await supabase
      .from("products")
      .insert({
        store_id: storeId,
        name: "QA Denim Jeans",
        category: "Pants",
        low_stock_threshold: 3,
      })
      .select()
      .single();

    expect(productError).toBeNull();
    expect(product).toBeDefined();
    expect(product.name).toBe("QA Denim Jeans");

    // 6. Variant Mapping (CREATE Variant)
    console.log("[QA] Creating product variant...");
    const sku = `QA-JEAN-BLU-${randomId.toUpperCase()}`;
    const { data: variant, error: variantError } = await supabase
      .from("product_variants")
      .insert({
        product_id: product.id,
        size: "32",
        color: "Indigo Blue",
        sku: sku,
        price: 2450.00,
      })
      .select()
      .single();

    expect(variantError).toBeNull();
    expect(variant).toBeDefined();
    expect(variant.sku).toBe(sku);

    // 7. Inventory Seeding (CREATE Stock)
    console.log("[QA] Seeding initial variant stock level...");
    const { data: inventory, error: inventoryError } = await supabase
      .from("inventory")
      .insert({
        variant_id: variant.id,
        quantity: 15,
      })
      .select()
      .single();

    expect(inventoryError).toBeNull();
    expect(inventory).toBeDefined();
    expect(inventory.quantity).toBe(15);

    // 8. Fetch product lists with variant data (READ Product + Variant + Inventory)
    console.log("[QA] Reading back product records...");
    const { data: productsList, error: readProductsError } = await supabase
      .from("products")
      .select("*, product_variants(*, inventory(*))")
      .eq("id", product.id);

    expect(readProductsError).toBeNull();
    expect(productsList).toBeDefined();
    expect(productsList!.length).toBe(1);
    expect(productsList![0].product_variants.length).toBe(1);
    expect(productsList![0].product_variants[0].inventory.quantity).toBe(15);

    // 9. Update variant stock directly (UPDATE Stock)
    console.log("[QA] Updating variant stock level directly...");
    const { data: updatedInventory, error: stockUpdateError } = await supabase
      .from("inventory")
      .update({ quantity: 20 })
      .eq("variant_id", variant.id)
      .select()
      .single();

    expect(stockUpdateError).toBeNull();
    expect(updatedInventory).toBeDefined();
    expect(updatedInventory.quantity).toBe(20);

    // 10. Update product details (UPDATE Product)
    console.log("[QA] Updating product details...");
    const { data: updatedProduct, error: productUpdateError } = await supabase
      .from("products")
      .update({ name: "QA Distressed Denim Jeans" })
      .eq("id", product.id)
      .select()
      .single();

    expect(productUpdateError).toBeNull();
    expect(updatedProduct.name).toBe("QA Distressed Denim Jeans");

    // 11. Transaction Checkout & Atomic Inventory Deduction (CREATE Invoice)
    console.log("[QA] Initiating checkout transaction...");
    const items = [
      {
        variant_id: variant.id,
        quantity: 4,
        unit_price: 2450.00,
        subtotal: 9800.00,
      },
      {
        variant_id: null,
        custom_name: "Premium Gift Wrap",
        quantity: 2,
        unit_price: 150.00,
        subtotal: 300.00,
      },
    ];

    const { data: invoiceId, error: checkoutError } = await supabase.rpc("create_invoice_and_deduct_stock", {
      p_store_id: storeId,
      p_invoice_number: "INV-PRE-GENERATED", // Overwritten dynamically by the RPC sequencer
      p_customer_name: "John Doe Nepal",
      p_customer_phone: "9851000000",
      p_total_amount: 10100.00,
      p_discount_amount: 0.00,
      p_paid_amount: 10100.00,
      p_payment_method: "Fonepay",
      p_items: items,
    });

    expect(checkoutError).toBeNull();
    expect(invoiceId).toBeDefined();

    // 12. Verify inventory reduction (Stock check: 20 - 4 = 16)
    const { data: afterCheckoutInv, error: afterCheckoutInvError } = await supabase
      .from("inventory")
      .select("quantity")
      .eq("variant_id", variant.id)
      .single();

    expect(afterCheckoutInvError).toBeNull();
    expect(afterCheckoutInv.quantity).toBe(16);

    // 13. Verify invoice details & sequential numbering (READ Invoice & InvoiceItems)
    console.log("[QA] Reading back invoice and sequential bill number...");
    const { data: checkInvoice, error: readInvoiceError } = await supabase
      .from("invoices")
      .select("*, invoice_items(*)")
      .eq("id", invoiceId)
      .single();

    expect(readInvoiceError).toBeNull();
    expect(checkInvoice.customer_name).toBe("John Doe Nepal");
    expect(checkInvoice.total_amount).toBe(10100.00);
    // Invoice number should follow sequential format: e.g. INV-YYYY-0001
    const currentYear = new Date().getFullYear().toString();
    expect(checkInvoice.invoice_number).toBe(`INV-${currentYear}-0001`);
    expect(checkInvoice.invoice_items.length).toBe(2);

    const regularItem = checkInvoice.invoice_items.find((i: { variant_id: string | null; quantity: number; custom_name: string | null }) => i.variant_id === variant.id);
    expect(regularItem).toBeDefined();
    expect(regularItem.quantity).toBe(4);
    expect(regularItem.custom_name).toBeNull();

    const customItem = checkInvoice.invoice_items.find((i: { variant_id: string | null; quantity: number; custom_name: string | null }) => i.variant_id === null);
    expect(customItem).toBeDefined();
    expect(customItem.quantity).toBe(2);
    expect(customItem.custom_name).toBe("Premium Gift Wrap");

    // 13.5. Verify check constraint on payment method: only Cash, eSewa, Khalti, Fonepay are allowed
    console.log("[QA] Testing payment method check constraint with invalid method 'Visa'...");
    const { error: invalidCheckoutError } = await supabase.rpc("create_invoice_and_deduct_stock", {
      p_store_id: storeId,
      p_invoice_number: "INV-PRE-GENERATED",
      p_customer_name: "John Doe Nepal",
      p_customer_phone: "9851000000",
      p_total_amount: 2450.00,
      p_discount_amount: 0.00,
      p_paid_amount: 2450.00,
      p_payment_method: "Visa", // Invalid payment method
      p_items: [
        {
          variant_id: variant.id,
          quantity: 1,
          unit_price: 2450.00,
          subtotal: 2450.00,
        }
      ],
    });

    expect(invalidCheckoutError).not.toBeNull();
    expect(invalidCheckoutError!.message).toContain("check_payment_method");

    // 13.6. Verify validation for zero or negative quantity in checkout
    console.log("[QA] Testing checkout validation with non-positive quantity...");
    const { error: nonPositiveQtyError } = await supabase.rpc("create_invoice_and_deduct_stock", {
      p_store_id: storeId,
      p_invoice_number: "INV-PRE-GENERATED",
      p_customer_name: "John Doe Nepal",
      p_customer_phone: "9851000000",
      p_total_amount: 0.00,
      p_discount_amount: 0.00,
      p_paid_amount: 0.00,
      p_payment_method: "Fonepay",
      p_items: [
        {
          variant_id: variant.id,
          quantity: 0, // Non-positive quantity
          unit_price: 2450.00,
          subtotal: 0.00,
        }
      ],
    });

    expect(nonPositiveQtyError).not.toBeNull();
    expect(nonPositiveQtyError!.message).toContain("Invalid quantity");

    // 14. Clean up - DELETE the store. Cascade constraints must automatically wipe out products, variants, inventory, and invoices.
    console.log("[QA] Cleaning up database by deleting test store (cascade)...");
    const { error: storeDeleteError } = await supabase
      .from("stores")
      .delete()
      .eq("id", storeId);

    expect(storeDeleteError).toBeNull();

    // 15. Verify cascade deletion was successful across all tables
    const { data: finalProducts } = await supabase.from("products").select("*").eq("store_id", storeId);
    expect(finalProducts!.length).toBe(0);

    const { data: finalInvoices } = await supabase.from("invoices").select("*").eq("store_id", storeId);
    expect(finalInvoices!.length).toBe(0);

    // 16. Delete user profile record
    console.log("[QA] Deleting temporary user profile...");
    const { error: profileDeleteError } = await supabase
      .from("users")
      .delete()
      .eq("id", userId);

    expect(profileDeleteError).toBeNull();

    // 17. Clean up Supabase Session
    console.log("[QA] Logging out test session...");
    await supabase.auth.signOut();
  }, 15000);
});
