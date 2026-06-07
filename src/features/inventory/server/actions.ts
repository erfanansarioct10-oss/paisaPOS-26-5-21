"use server";

import {
  adjustStockAction as adjustStockActionImpl,
  bulkUpsertProductsAction as bulkUpsertProductsActionImpl,
  deleteProductAction as deleteProductActionImpl,
  toggleProductFavoriteAction as toggleProductFavoriteActionImpl,
  upsertProductAction as upsertProductActionImpl,
} from "@/app/actions";

export async function upsertProductAction(...args: Parameters<typeof upsertProductActionImpl>) {
  return upsertProductActionImpl(...args);
}

export async function bulkUpsertProductsAction(...args: Parameters<typeof bulkUpsertProductsActionImpl>) {
  return bulkUpsertProductsActionImpl(...args);
}

export async function deleteProductAction(...args: Parameters<typeof deleteProductActionImpl>) {
  return deleteProductActionImpl(...args);
}

export async function adjustStockAction(...args: Parameters<typeof adjustStockActionImpl>) {
  return adjustStockActionImpl(...args);
}

export async function toggleProductFavoriteAction(...args: Parameters<typeof toggleProductFavoriteActionImpl>) {
  return toggleProductFavoriteActionImpl(...args);
}
