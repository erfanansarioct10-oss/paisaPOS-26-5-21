// =========================================================================
// PaisaPOS — Unified Store Barrel
// Composes domain slices into a single Zustand store.
// All consumers import from this file — no API changes required.
// =========================================================================

import { create } from "zustand";
import type { AppState } from "./types";
import { createAuthSlice } from "@/features/auth/state/auth-slice";
import { createInventorySlice } from "@/features/inventory/state/inventory-slice";
import { createCartSlice } from "@/features/billing/state/cart-slice";

// Re-export all types for backward compatibility
export type {
  StoreMetadata,
  Profile,
  Product,
  ProductVariant,
  InventoryItem,
  CartItem,
  Invoice,
  InvoiceItem,
  AppState,
} from "./types";

// Compose all slices into the unified store
export const useAppStore = create<AppState>((set, get) => ({
  ...createAuthSlice(set, get),
  ...createInventorySlice(set, get),
  ...createCartSlice(set, get),
}));
