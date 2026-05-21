// =========================================================================
// PaisaPOS — Inventory (Products & Variants) Slice
// =========================================================================

import type { AppState, Product, ProductVariant } from "./types";
import { upsertProductAction, deleteProductAction, adjustStockAction } from "@/app/actions";
import { getSyncToken } from "@/lib/broadcast";

function mapProductError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("duplicate key value violates unique constraint") || msg.toLowerCase().includes("sku already exists") || msg.toLowerCase().includes("unique constraint")) {
    return "Failed to save product: A variant with this SKU already exists.";
  }
  if (msg.toLowerCase().includes("unauthorized") || msg.toLowerCase().includes("unauthenticated")) {
    return "Failed to save product: Unauthorized action.";
  }
  return "Failed to save product. Please check the inputs and try again.";
}

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
          payload: { products: newProducts, variants: newAllVariants },
          token: getSyncToken()
        });
        channel.close();
      }
      return true;
    }

    try {
      await upsertProductAction({
        productId: null,
        name,
        category,
        lowStockThreshold,
        deletedVariantIds: [],
        variants: variantData.map(v => ({
          size: v.size,
          color: v.color,
          sku: v.sku,
          price: v.price,
          stock: v.stock,
        })),
      });

      // Refresh store data to keep in complete sync
      await get().fetchStoreData();

      // Broadcast changes using signed BroadcastChannel payloads
      if (typeof window !== "undefined") {
        const channel = new BroadcastChannel("paisapos-demo-sync");
        channel.postMessage({
          type: "SYNC_PRODUCT_ADD",
          payload: { products: get().products, variants: get().variants },
          token: getSyncToken()
        });
        channel.close();
      }

      return true;
    } catch (e: unknown) {
      const errMsg = mapProductError(e);
      console.error("Error creating product:", e);
      set({ errorMsg: errMsg, isLoading: false });
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
          payload: { products: newProducts, variants: newAllVariants },
          token: getSyncToken()
        });
        channel.close();
      }
      return true;
    }

    try {
      await deleteProductAction(productId);

      await get().fetchStoreData();

      // Broadcast changes using signed BroadcastChannel payloads
      if (typeof window !== "undefined") {
        const channel = new BroadcastChannel("paisapos-demo-sync");
        channel.postMessage({
          type: "SYNC_PRODUCT_DELETE",
          payload: { products: get().products, variants: get().variants },
          token: getSyncToken()
        });
        channel.close();
      }

      return true;
    } catch (e: unknown) {
      const errMsg = mapProductError(e);
      console.error("Error deleting product:", e);
      set({ errorMsg: errMsg, isLoading: false });
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
          payload: { products: updatedProducts, variants: updatedAllVariants },
          token: getSyncToken()
        });
        channel.close();
      }
      return true;
    }

    try {
      await upsertProductAction({
        productId,
        name,
        category,
        lowStockThreshold,
        deletedVariantIds,
        variants: variantsData.map(v => ({
          id: v.id,
          size: v.size,
          color: v.color,
          sku: v.sku,
          price: v.price,
          stock: v.stock,
        })),
      });

      // Reload local memory cache
      await get().fetchStoreData();

      // Broadcast changes using signed BroadcastChannel payloads
      if (typeof window !== "undefined") {
        const channel = new BroadcastChannel("paisapos-demo-sync");
        channel.postMessage({
          type: "SYNC_PRODUCT_UPDATE",
          payload: { products: get().products, variants: get().variants },
          token: getSyncToken()
        });
        channel.close();
      }

      return true;
    } catch (e: unknown) {
      const errMsg = mapProductError(e);
      console.error("Error updating product:", e);
      set({ errorMsg: errMsg, isLoading: false });
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
          payload: { variants: updatedVariants },
          token: getSyncToken()
        });
        channel.close();
      }
      return true;
    }

    try {
      await adjustStockAction(variantId, newStock);

      await get().fetchStoreData();

      // Broadcast changes using signed BroadcastChannel payloads
      if (typeof window !== "undefined") {
        const channel = new BroadcastChannel("paisapos-demo-sync");
        channel.postMessage({
          type: "SYNC_STOCK_DIRECT",
          payload: { variants: get().variants },
          token: getSyncToken()
        });
        channel.close();
      }

      return true;
    } catch (e: unknown) {
      const errMsg = mapProductError(e);
      console.error("Error updating stock directly:", e);
      set({ errorMsg: "Failed to save stock adjustment: " + errMsg, isLoading: false });
      return false;
    }
  },
});
