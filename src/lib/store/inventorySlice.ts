// =========================================================================
// PaisaPOS — Inventory (Products & Variants) Slice
// =========================================================================

import type { AppState } from "./types";
import { upsertProductAction, deleteProductAction, adjustStockAction } from "@/app/actions";

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
    const { store } = get();
    if (!store) return false;

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      set({ errorMsg: "Operation failed: Internet connection is offline." });
      return false;
    }

    set({ isLoading: true, errorMsg: null });

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

      return true;
    } catch (e: unknown) {
      const errMsg = mapProductError(e);
      console.error("Error creating product:", e);
      set({ errorMsg: errMsg });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  // -----------------------------------------------------------------------
  // DELETE PRODUCT
  // -----------------------------------------------------------------------
  deleteProduct: async (productId: string): Promise<boolean> => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      set({ errorMsg: "Operation failed: Internet connection is offline." });
      return false;
    }

    set({ errorMsg: null });

    const previousProducts = get().products;
    const previousVariants = get().variants;

    // Optimistic Update: instantly filter out product & variants from UI
    set({
      products: previousProducts.filter(p => p.id !== productId),
      variants: previousVariants.filter(v => v.product_id !== productId),
    });

    try {
      await deleteProductAction(productId);

      // Background sync to verify/refresh cache
      get().fetchStoreData();

      return true;
    } catch (e: unknown) {
      const errMsg = mapProductError(e);
      console.error("Error deleting product:", e);
      
      // Rollback to original state on failure
      set({
        products: previousProducts,
        variants: previousVariants,
        errorMsg: errMsg,
      });
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
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      set({ errorMsg: "Operation failed: Internet connection is offline." });
      return false;
    }

    set({ isLoading: true, errorMsg: null });

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

      return true;
    } catch (e: unknown) {
      const errMsg = mapProductError(e);
      console.error("Error updating product:", e);
      set({ errorMsg: errMsg });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  // -----------------------------------------------------------------------
  // DIRECT STOCK ADJUSTMENT
  // -----------------------------------------------------------------------
  updateStockDirect: async (variantId: string, newStock: number): Promise<boolean> => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      set({ errorMsg: "Operation failed: Internet connection is offline." });
      return false;
    }

    set({ errorMsg: null });

    const previousVariants = get().variants;

    // Optimistic Update: instantly update stock count for this variant in UI
    set({
      variants: previousVariants.map(v =>
        v.id === variantId ? { ...v, stock: newStock } : v
      ),
    });

    // Track pending updates & requests
    const currentRequests = get().pendingStockRequests[variantId] ?? 0;
    const nextOriginals = { ...get().originalStockLevels };
    if (currentRequests === 0) {
      const currentVariant = previousVariants.find(v => v.id === variantId);
      nextOriginals[variantId] = currentVariant?.stock ?? 0;
    }

    set({
      pendingStockRequests: {
        ...get().pendingStockRequests,
        [variantId]: currentRequests + 1,
      },
      pendingStockUpdates: {
        ...get().pendingStockUpdates,
        [variantId]: newStock,
      },
      originalStockLevels: nextOriginals,
    });

    try {
      await adjustStockAction(variantId, newStock);

      // Background sync to verify/refresh cache
      get().fetchStoreData();

      return true;
    } catch (e: unknown) {
      const errMsg = mapProductError(e);
      console.error("Error updating stock directly:", e);
      
      // Revert stock level of this variant to the original stock level only if it is the last pending request
      const activeReqs = get().pendingStockRequests[variantId] ?? 0;
      if (activeReqs <= 1) {
        const origStock = get().originalStockLevels[variantId] ?? newStock;
        set({
          variants: get().variants.map(v =>
            v.id === variantId ? { ...v, stock: origStock } : v
          ),
          errorMsg: "Failed to save stock adjustment: " + errMsg,
        });
      } else {
        set({
          errorMsg: "Failed to save stock adjustment: " + errMsg,
        });
      }
      return false;
    } finally {
      const currentReqs = get().pendingStockRequests[variantId] ?? 1;
      const nextRequests = { ...get().pendingStockRequests };
      const nextUpdates = { ...get().pendingStockUpdates };
      const nextOriginalsFinal = { ...get().originalStockLevels };

      if (currentReqs <= 1) {
        delete nextRequests[variantId];
        delete nextUpdates[variantId];
        delete nextOriginalsFinal[variantId];
      } else {
        nextRequests[variantId] = currentReqs - 1;
      }

      set({
        pendingStockRequests: nextRequests,
        pendingStockUpdates: nextUpdates,
        originalStockLevels: nextOriginalsFinal,
      });
    }
  },
});
