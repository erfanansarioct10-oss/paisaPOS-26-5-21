"use client";

import {
  ChevronDown,
  ChevronRight,
  Package,
  Pencil,
  Star,
  Trash2,
} from "lucide-react";
import type { Product, ProductVariant } from "@/lib/store/useAppStore";
import { InventoryStockControl } from "@/features/inventory/components/inventory-stock-control";

type InventoryProductDirectoryProps = {
  canAdjustInventory: boolean;
  canManageCatalog: boolean;
  expandedProduct: string | null;
  onDeleteProduct: (productId: string) => void | Promise<boolean>;
  onEditProduct: (product: Product, variants: ProductVariant[]) => void;
  onShowConfirm: (
    title: string,
    message: string,
    onConfirm: () => void,
    type?: "info" | "warning" | "danger",
    confirmText?: string,
    cancelText?: string,
  ) => void;
  onToggleFavorite: (productId: string, isFavorite: boolean) => void | Promise<boolean>;
  onToggleRow: (productId: string) => void;
  onUpdateStock: (variantId: string, newStock: number) => void | Promise<boolean>;
  products: Product[];
  variants: ProductVariant[];
};

export function InventoryProductDirectory({
  canAdjustInventory,
  canManageCatalog,
  expandedProduct,
  onDeleteProduct,
  onEditProduct,
  onShowConfirm,
  onToggleFavorite,
  onToggleRow,
  onUpdateStock,
  products,
  variants,
}: InventoryProductDirectoryProps) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      {products.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Package className="w-12 h-12 text-muted-foreground mb-3 opacity-30 animate-pulse" />
          <h3 className="text-base font-bold text-foreground">No Products Tracked</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
            {canManageCatalog
              ? "Your inventory is empty. Click \"Add Product\" to quickly generate size and color variants in seconds."
              : "Your inventory is empty. Owner-created products will appear here once catalog setup begins."}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {products.map((product) => {
            const productVariants = variants.filter((variant) => variant.product_id === product.id);
            const isExpanded = expandedProduct === product.id;
            const totalStock = productVariants.reduce((sum, variant) => sum + (variant.stock ?? 0), 0);
            const activeLowStock = productVariants.filter(
              (variant) => (variant.stock ?? 0) <= product.low_stock_threshold,
            ).length;

            return (
              <div key={product.id} className="transition-all">
                <div
                  onClick={() => onToggleRow(product.id)}
                  className="px-4 py-3.5 sm:px-5 sm:py-4 cursor-pointer hover:bg-muted/10 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="p-1 text-muted-foreground hover:bg-secondary rounded shrink-0 mt-0.5">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-semibold text-sm sm:text-base text-foreground leading-tight truncate block">
                              {product.name}
                            </span>
                            {canManageCatalog && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onToggleFavorite(product.id, !product.is_favorite);
                                }}
                                className="p-1 text-slate-400 dark:text-slate-600 hover:text-amber-500 rounded-md transition-all active:scale-95 shrink-0"
                                title={product.is_favorite ? "Remove from Favorites" : "Add to Favorites"}
                              >
                                <Star
                                  className={`w-3.5 h-3.5 ${
                                    product.is_favorite
                                      ? "fill-amber-500 text-amber-500"
                                      : "text-slate-400 dark:text-slate-600 hover:text-amber-500"
                                  }`}
                                />
                              </button>
                            )}
                          </div>

                          {canManageCatalog && (
                            <div className="flex sm:hidden items-center gap-1 shrink-0">
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onEditProduct(product, productVariants);
                                }}
                                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all"
                                title="Edit Product & Variants"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onShowConfirm(
                                    "Delete Product",
                                    `Are you sure you want to delete ${product.name}? This will also delete all its variants and inventory stock levels.`,
                                    () => {
                                      void onDeleteProduct(product.id);
                                    },
                                    "danger",
                                    "Delete",
                                    "Cancel",
                                  );
                                }}
                                className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                title="Delete Product"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="text-[10px] sm:text-xs text-muted-foreground font-mono flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span>Category: <strong className="text-foreground font-medium">{product.category}</strong></span>
                          <span className="text-slate-700 hidden sm:inline">|</span>
                          <span>Alert limit: <strong className="text-foreground font-medium">{product.low_stock_threshold}</strong></span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 border-t border-border/40 sm:border-0 pt-2.5 sm:pt-0">
                      <div className="text-left sm:text-right shrink-0">
                        <span className="font-bold text-foreground text-xs sm:text-sm">
                          {totalStock} items
                        </span>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          across {productVariants.length} variants
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {activeLowStock > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/10">
                            {activeLowStock} Warning{activeLowStock > 1 ? "s" : ""}
                          </span>
                        )}

                        {canManageCatalog && (
                          <div className="hidden sm:flex items-center gap-1">
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                onEditProduct(product, productVariants);
                              }}
                              className="p-2 border border-transparent hover:border-slate-500/20 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all"
                              title="Edit Product & Variants"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                onShowConfirm(
                                  "Delete Product",
                                  `Are you sure you want to delete ${product.name}? This will also delete all its variants and inventory stock levels.`,
                                  () => {
                                    void onDeleteProduct(product.id);
                                  },
                                  "danger",
                                  "Delete",
                                  "Cancel",
                                );
                              }}
                              className="p-2 border border-transparent hover:border-red-500/20 text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                              title="Delete Product"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="bg-muted/30 border-t border-border px-4 py-3 sm:px-5">
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-border/60 text-slate-500 font-semibold uppercase tracking-wider">
                            <th className="py-2 pr-4">Variant SKU</th>
                            <th className="py-2 pr-4">Size</th>
                            <th className="py-2 pr-4">Color</th>
                            <th className="py-2 pr-4">Price (NPR)</th>
                            <th className="py-2 text-center" style={{ width: "130px" }}>Stock Level</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {productVariants.map((variant) => (
                            <tr key={variant.id} className="hover:bg-muted/40 transition-colors">
                              <td className="py-2.5 font-mono text-foreground font-bold pr-4">
                                {variant.sku}
                              </td>
                              <td className="py-2.5 text-foreground pr-4">{variant.size}</td>
                              <td className="py-2.5 text-foreground pr-4">{variant.color}</td>
                              <td className="py-2.5 text-foreground font-bold pr-4">
                                Rs. {variant.price.toLocaleString()}
                              </td>
                              <td className="py-2.5 text-center">
                                <InventoryStockControl
                                  canAdjustInventory={canAdjustInventory}
                                  lowStockThreshold={product.low_stock_threshold}
                                  mode="desktop"
                                  onUpdateStock={onUpdateStock}
                                  variant={variant}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="block sm:hidden space-y-3">
                      {productVariants.map((variant) => (
                        <div key={variant.id} className="p-3 bg-card border border-border/60 rounded-xl space-y-3.5 shadow-sm">
                          <div className="flex justify-between items-start">
                            <span className="font-mono text-foreground font-bold text-xs">{variant.sku}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-secondary text-muted-foreground font-bold font-sans">
                              Size {variant.size} / {variant.color}
                            </span>
                          </div>
                          <div className="flex justify-between items-center text-xs pt-1 border-t border-border/40">
                            <span className="font-bold text-foreground">Rs. {variant.price.toLocaleString()}</span>
                            <InventoryStockControl
                              canAdjustInventory={canAdjustInventory}
                              lowStockThreshold={product.low_stock_threshold}
                              mode="mobile"
                              onUpdateStock={onUpdateStock}
                              variant={variant}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
