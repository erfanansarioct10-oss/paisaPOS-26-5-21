// =========================================================================
// PaisaPOS — Inventory (Products & Variants) Slice
// =========================================================================

import { supabase } from "@/lib/supabase";
import type { AppState, Product, ProductVariant } from "./types";

type SetState = (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void;
type GetState = () => AppState;

export const createInventorySlice = (set: SetState, get: GetState) => ({
  // -----------------------------------------------------------------------
  // ADD PRODUCT WITH VARIANTS
  // -----------------------------------------------------------------------
  addProduct: async (
    name: string,
    category: string,
    lowStockThreshold: number,
    variantData: Array<{ size: string; color: string; sku: string; price: number; stock: number }>
  ): Promise<boolean> => {
    const { isDemoMode, store, products, variants } = get();
    if (!store) return false;

    set({ isLoading: true, errorMsg: null });

    if (isDemoMode) {
      // Simulate quick add locally
      const newProductId = `prod-${Date.now()}`;
      const newProduct: Product = {
        id: newProductId,
        store_id: store.id,
        name,
        category,
        image_url: null,
        low_stock_threshold: lowStockThreshold,
      };

      const newVariants: ProductVariant[] = variantData.map((v, index) => ({
        id: `var-${Date.now()}-${index}`,
        product_id: newProductId,
        size: v.size,
        color: v.color,
        sku: v.sku,
        price: v.price,
        stock: v.stock,
      }));

      const newProducts = [newProduct, ...products];
      const newAllVariants = [...variants, ...newVariants];
      set({
        products: newProducts,
        variants: newAllVariants,
        isLoading: false,
      });

      if (typeof window !== "undefined") {
        const channel = new BroadcastChannel("paisapos-demo-sync");
        channel.postMessage({
          type: "SYNC_PRODUCT_ADD",
          payload: { products: newProducts, variants: newAllVariants }
        });
        channel.close();
      }
      return true;
    }

    try {
      // 1. Insert product record
      const { data: product, error: prodError } = await supabase
        .from("products")
        .insert({
          store_id: store.id,
          name,
          category,
          low_stock_threshold: lowStockThreshold,
        })
        .select()
        .single();

      if (prodError) throw prodError;

      // 2. Prepare variants and insert them
      const variantsToInsert = variantData.map(v => ({
        product_id: product.id,
        size: v.size,
        color: v.color,
        sku: v.sku,
        price: v.price,
      }));

      const { data: dbVariants, error: varError } = await supabase
        .from("product_variants")
        .insert(variantsToInsert)
        .select();

      if (varError) throw varError;

      // 3. Prepare inventory records for the created variants
      const inventoryToInsert = dbVariants.map(v => {
        const matchingInput = variantData.find(vd => vd.sku === v.sku);
        return {
          variant_id: v.id,
          quantity: matchingInput?.stock ?? 0,
        };
      });

      const { error: invError } = await supabase
        .from("inventory")
        .insert(inventoryToInsert);

      if (invError) throw invError;

      // Refresh store data to keep in complete sync
      await get().fetchStoreData();
      return true;
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error("Error creating product:", errMsg);
      set({ errorMsg: "Failed to add product: " + errMsg, isLoading: false });
      return false;
    }
  },

  // -----------------------------------------------------------------------
  // DELETE PRODUCT
  // -----------------------------------------------------------------------
  deleteProduct: async (productId: string): Promise<boolean> => {
    const { isDemoMode, products, variants } = get();
    set({ isLoading: true, errorMsg: null });

    if (isDemoMode) {
      const newProducts = products.filter(p => p.id !== productId);
      const newAllVariants = variants.filter(v => v.product_id !== productId);
      set({
        products: newProducts,
        variants: newAllVariants,
        isLoading: false,
      });

      if (typeof window !== "undefined") {
        const channel = new BroadcastChannel("paisapos-demo-sync");
        channel.postMessage({
          type: "SYNC_PRODUCT_DELETE",
          payload: { products: newProducts, variants: newAllVariants }
        });
        channel.close();
      }
      return true;
    }

    try {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", productId);

      if (error) throw error;

      await get().fetchStoreData();
      return true;
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error("Error deleting product:", errMsg);
      set({ errorMsg: "Failed to delete product: " + errMsg, isLoading: false });
      return false;
    }
  },

  // -----------------------------------------------------------------------
  // UPDATE PRODUCT WITH VARIANTS
  // -----------------------------------------------------------------------
  updateProduct: async (
    productId: string,
    name: string,
    category: string,
    lowStockThreshold: number,
    variantsData: Array<{
      id?: string;
      size: string;
      color: string;
      sku: string;
      price: number;
      stock: number;
    }>,
    deletedVariantIds: string[]
  ): Promise<boolean> => {
    const { isDemoMode, products, variants } = get();
    set({ isLoading: true, errorMsg: null });

    if (isDemoMode) {
      // 1. Update product metadata
      const updatedProducts = products.map(p =>
        p.id === productId
          ? { ...p, name, category, low_stock_threshold: lowStockThreshold }
          : p
      );

      // 2. Filter out deleted variants
      const remainingVariants = variants.filter(v => !deletedVariantIds.includes(v.id));

      // 3. Separate other variants from this product's variants
      const otherVariants = remainingVariants.filter(v => v.product_id !== productId);

      // 4. Process new and updated variants
      const productVariants: ProductVariant[] = variantsData.map((v, index) => {
        if (v.id) {
          return {
            id: v.id,
            product_id: productId,
            size: v.size,
            color: v.color,
            sku: v.sku,
            price: v.price,
            stock: v.stock,
          };
        } else {
          return {
            id: `var-${Date.now()}-${index}`,
            product_id: productId,
            size: v.size,
            color: v.color,
            sku: v.sku,
            price: v.price,
            stock: v.stock,
          };
        }
      });

      const updatedAllVariants = [...otherVariants, ...productVariants];

      set({
        products: updatedProducts,
        variants: updatedAllVariants,
        isLoading: false,
      });

      if (typeof window !== "undefined") {
        const channel = new BroadcastChannel("paisapos-demo-sync");
        channel.postMessage({
          type: "SYNC_PRODUCT_UPDATE",
          payload: { products: updatedProducts, variants: updatedAllVariants }
        });
        channel.close();
      }
      return true;
    }

    try {
      // 1. Update product details in Supabase
      const { error: prodError } = await supabase
        .from("products")
        .update({
          name,
          category,
          low_stock_threshold: lowStockThreshold,
        })
        .eq("id", productId);

      if (prodError) throw prodError;

      // 2. Delete variants from Supabase
      if (deletedVariantIds.length > 0) {
        const { error: delError } = await supabase
          .from("product_variants")
          .delete()
          .in("id", deletedVariantIds);

        if (delError) throw delError;
      }

      // 3. Update or Insert variants and inventory
      for (const v of variantsData) {
        if (v.id) {
          // Update existing variant
          const { error: varUpdateError } = await supabase
            .from("product_variants")
            .update({
              size: v.size,
              color: v.color,
              sku: v.sku,
              price: v.price,
            })
            .eq("id", v.id);

          if (varUpdateError) throw varUpdateError;

          // Upsert inventory stock level
          const { error: invUpdateError } = await supabase
            .from("inventory")
            .upsert(
              {
                variant_id: v.id,
                quantity: v.stock,
              },
              {
                onConflict: "variant_id",
              }
            );

          if (invUpdateError) throw invUpdateError;
        } else {
          // Insert new variant
          const { data: dbVar, error: varInsertError } = await supabase
            .from("product_variants")
            .insert({
              product_id: productId,
              size: v.size,
              color: v.color,
              sku: v.sku,
              price: v.price,
            })
            .select()
            .single();

          if (varInsertError) throw varInsertError;

          // Insert stock into inventory table
          const { error: invInsertError } = await supabase
            .from("inventory")
            .insert({
              variant_id: dbVar.id,
              quantity: v.stock,
            });

          if (invInsertError) throw invInsertError;
        }
      }

      // 4. Reload local memory cache
      await get().fetchStoreData();
      return true;
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error("Error updating product:", errMsg);
      set({ errorMsg: "Failed to update product: " + errMsg, isLoading: false });
      return false;
    }
  },

  // -----------------------------------------------------------------------
  // DIRECT STOCK ADJUSTMENT
  // -----------------------------------------------------------------------
  updateStockDirect: async (variantId: string, newStock: number): Promise<boolean> => {
    const { isDemoMode, variants } = get();
    set({ isLoading: true, errorMsg: null });

    if (isDemoMode) {
      const updatedVariants = variants.map(v => (v.id === variantId ? { ...v, stock: newStock } : v));
      set({
        variants: updatedVariants,
        isLoading: false,
      });

      if (typeof window !== "undefined") {
        const channel = new BroadcastChannel("paisapos-demo-sync");
        channel.postMessage({
          type: "SYNC_STOCK_DIRECT",
          payload: { variants: updatedVariants }
        });
        channel.close();
      }
      return true;
    }

    try {
      const { error } = await supabase
        .from("inventory")
        .update({ quantity: newStock, updated_at: new Date().toISOString() })
        .eq("variant_id", variantId);

      if (error) throw error;

      await get().fetchStoreData();
      return true;
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error("Error updating stock directly:", errMsg);
      set({ errorMsg: "Failed to save stock adjustment: " + errMsg, isLoading: false });
      return false;
    }
  },
});
