// =========================================================================
// PaisaPOS — Inventory (Products & Variants) Slice
// =========================================================================

import type { AppState } from "@/lib/store/types";
import { upsertProductAction, deleteProductAction, adjustStockAction, toggleProductFavoriteAction, bulkUpsertProductsAction } from "@/features/inventory/server/actions";

function mapProductError(e: unknown): string {
  let msg = "";
  if (e instanceof Error) {
    msg = e.message;
  } else if (e && typeof e === "object") {
    if ("message" in e && typeof e.message === "string") {
      msg = e.message;
    } else if ("error" in e && typeof e.error === "string") {
      msg = e.error;
    } else {
      msg = String(e);
    }
  } else {
    msg = String(e);
  }

  const lowercaseMsg = msg.toLowerCase();
  if (
    lowercaseMsg.includes("invalid product details") ||
    lowercaseMsg.includes("invalid bulk products details")
  ) {
    return msg;
  }
  if (
    lowercaseMsg.includes("too many requests") ||
    lowercaseMsg.includes("rate limit") ||
    lowercaseMsg.includes("please try again")
  ) {
    return msg;
  }
  if (
    lowercaseMsg.includes("duplicate key") ||
    lowercaseMsg.includes("sku already exists") ||
    lowercaseMsg.includes("unique constraint") ||
    lowercaseMsg.includes("product_variants_store_sku_key") ||
    lowercaseMsg.includes("product_variants_sku_key")
  ) {
    return "Failed to save product: A variant with this SKU already exists.";
  }
  if (lowercaseMsg.includes("unauthorized") || lowercaseMsg.includes("unauthenticated")) {
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

  toggleProductFavorite: async (productId: string, isFavorite: boolean): Promise<boolean> => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      set({ errorMsg: "Operation failed: Internet connection is offline." });
      return false;
    }

    set({ errorMsg: null });

    const previousProducts = get().products;

    // Optimistic Update: instantly update favorite status for this product in UI
    set({
      products: previousProducts.map(p =>
        p.id === productId ? { ...p, is_favorite: isFavorite } : p
      ),
    });

    // Track pending updates & requests
    const currentRequests = get().pendingFavoriteRequests[productId] ?? 0;
    const nextOriginals = { ...get().originalFavoriteLevels };
    if (currentRequests === 0) {
      const currentProduct = previousProducts.find(p => p.id === productId);
      nextOriginals[productId] = currentProduct?.is_favorite ?? false;
    }

    set({
      pendingFavoriteRequests: {
        ...get().pendingFavoriteRequests,
        [productId]: currentRequests + 1,
      },
      pendingFavoriteUpdates: {
        ...get().pendingFavoriteUpdates,
        [productId]: isFavorite,
      },
      originalFavoriteLevels: nextOriginals,
    });

    try {
      await toggleProductFavoriteAction(productId, isFavorite);

      // Background sync to verify/refresh cache
      await get().fetchStoreData();

      return true;
    } catch (e: unknown) {
      const errMsg = mapProductError(e);
      console.error("Error toggling product favorite:", e);
      
      // Revert favorite status only if it is the last pending request
      const activeReqs = get().pendingFavoriteRequests[productId] ?? 0;
      if (activeReqs <= 1) {
        const origFav = get().originalFavoriteLevels[productId] ?? isFavorite;
        set({
          products: get().products.map(p =>
            p.id === productId ? { ...p, is_favorite: origFav } : p
          ),
          errorMsg: "Failed to update favorite status: " + errMsg,
        });
      } else {
        set({
          errorMsg: "Failed to update favorite status: " + errMsg,
        });
      }
      return false;
    } finally {
      const currentReqs = get().pendingFavoriteRequests[productId] ?? 1;
      const nextRequests = { ...get().pendingFavoriteRequests };
      const nextUpdates = { ...get().pendingFavoriteUpdates };
      const nextOriginalsFinal = { ...get().originalFavoriteLevels };

      if (currentReqs <= 1) {
        delete nextRequests[productId];
        delete nextUpdates[productId];
        delete nextOriginalsFinal[productId];
      } else {
        nextRequests[productId] = currentReqs - 1;
      }

      set({
        pendingFavoriteRequests: nextRequests,
        pendingFavoriteUpdates: nextUpdates,
        originalFavoriteLevels: nextOriginalsFinal,
      });
    }
  },

  // -----------------------------------------------------------------------
  // BULK CATALOG IMPORTER BATCH OPERATIONS
  // -----------------------------------------------------------------------
  bulkImportProducts: async (
    parsedProducts: Array<{
      name: string;
      category: string;
      lowStockThreshold: number;
      variants: Array<{
        size: string;
        color: string;
        sku: string;
        price: number;
        stock: number;
      }>;
    }>,
    onProgress?: (current: number, total: number) => void
  ): Promise<{
    succeededCount: number;
    failedProducts: Array<{ name: string; error: string }>;
    failedChunkError?: string;
    skippedRemainder?: string[];
  }> => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      set({ errorMsg: "Operation failed: Internet connection is offline." });
      return {
        succeededCount: 0,
        failedProducts: parsedProducts.map(p => ({
          name: p.name,
          error: "Internet connection is offline.",
        })),
      };
    }

    set({ isLoading: true, errorMsg: null, isImporting: true });

    let succeededCount = 0;
    const failedProducts: Array<{ name: string; error: string }> = [];
    let failedChunkError: string | undefined = undefined;
    let skippedRemainder: string[] | undefined = undefined;
    const total = parsedProducts.length;

    if (onProgress) {
      onProgress(0, total);
    }

    try {
      const payloads = parsedProducts.map(p => ({
        productId: null,
        name: p.name,
        category: p.category,
        lowStockThreshold: p.lowStockThreshold,
        deletedVariantIds: [],
        variants: p.variants.map(v => ({
          size: v.size,
          color: v.color,
          sku: v.sku,
          price: v.price,
          stock: v.stock,
        })),
      }));

      const result = await bulkUpsertProductsAction(payloads);
      succeededCount = result.succeededCount;
      failedProducts.push(...result.failedProducts);
      failedChunkError = result.failedChunkError;
      skippedRemainder = result.skippedRemainder;

    } catch (e: unknown) {
      console.error("Error bulk importing products:", e);
      let errorMsg = "Unknown error occurred.";
      if (e instanceof Error) {
        errorMsg = e.message;
      } else if (e && typeof e === "object" && "message" in e && typeof e.message === "string") {
        errorMsg = e.message;
      }

      const lowerError = errorMsg.toLowerCase();
      const isNetworkError =
        lowerError.includes("network") ||
        lowerError.includes("fetch failed") ||
        lowerError.includes("failed to fetch") ||
        lowerError.includes("connection dropped") ||
        lowerError.includes("failed to connect") ||
        lowerError.includes("offline") ||
        lowerError.includes("econnrefused") ||
        lowerError.includes("cors");

      parsedProducts.forEach(p => {
        failedProducts.push({
          name: p.name,
          error: isNetworkError
            ? `Import skipped due to network disconnection: ${errorMsg}`
            : `Database operation failed: ${errorMsg}`,
        });
      });
    }

    if (onProgress) {
      onProgress(total, total);
    }

    // Reactivate real-time listeners
    set({ isImporting: false });

    // Single consolidated database-client synchronization
    try {
      await get().fetchStoreData();
    } catch (syncError: unknown) {
      console.error("Synchronizing store data post-import failed:", syncError);
    } finally {
      set({ isLoading: false });
    }

    return {
      succeededCount,
      failedProducts,
      failedChunkError,
      skippedRemainder,
    };
  },
});
