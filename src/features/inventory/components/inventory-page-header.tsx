"use client";

import { Download, Plus } from "lucide-react";

type InventoryPageHeaderProps = {
  canManageCatalog: boolean;
  onAddProduct: () => void;
  onImportCatalog: () => void;
};

export function InventoryPageHeader({
  canManageCatalog,
  onAddProduct,
  onImportCatalog,
}: InventoryPageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 className="font-outfit font-extrabold text-2xl sm:text-3xl text-foreground tracking-tight">
          Inventory Management
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          Add clothing items, track stock quantities, and generate variant matrices.
        </p>
      </div>

      {canManageCatalog && (
        <div className="flex items-center gap-2">
          <button
            onClick={onImportCatalog}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-card hover:bg-muted text-foreground border border-border text-sm font-semibold rounded-lg shadow-sm transition-all active:scale-[0.99] cursor-pointer"
          >
            <Download className="w-4 h-4 rotate-180 text-muted-foreground" />
            <span>Import Catalog</span>
          </button>

          <button
            onClick={onAddProduct}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:opacity-95 shadow transition-all active:scale-[0.99]"
          >
            <Plus className="w-4 h-4" />
            <span>Add Product</span>
          </button>
        </div>
      )}
    </div>
  );
}
