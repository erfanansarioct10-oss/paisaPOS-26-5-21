"use client";

import type { Dispatch, FormEvent, SetStateAction } from "react";
import { AlertTriangle, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import type { EditVariant } from "@/features/inventory/components/inventory-ui-types";

type InventoryEditProductModalProps = {
  canManageCatalog: boolean;
  deletedVariantIds: string[];
  editCategory: string;
  editLowStock: number;
  editName: string;
  editVariants: EditVariant[];
  errorMsg: string | null;
  isLoading: boolean;
  isOpen: boolean;
  onAddCustomVariant: () => void;
  onClose: () => void;
  onSave: (event: FormEvent) => void | Promise<void>;
  setDeletedVariantIds: Dispatch<SetStateAction<string[]>>;
  setEditCategory: Dispatch<SetStateAction<string>>;
  setEditLowStock: Dispatch<SetStateAction<number>>;
  setEditName: Dispatch<SetStateAction<string>>;
  setEditVariants: Dispatch<SetStateAction<EditVariant[]>>;
};

export function InventoryEditProductModal({
  canManageCatalog,
  deletedVariantIds,
  editCategory,
  editLowStock,
  editName,
  editVariants,
  errorMsg,
  isLoading,
  isOpen,
  onAddCustomVariant,
  onClose,
  onSave,
  setDeletedVariantIds,
  setEditCategory,
  setEditLowStock,
  setEditName,
  setEditVariants,
}: InventoryEditProductModalProps) {
  if (!isOpen || !canManageCatalog) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-xl w-full max-w-2xl flex flex-col shadow-lg max-h-[92vh] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-primary animate-pulse" />
            <h3 className="font-outfit font-extrabold text-lg text-foreground">
              Edit Product & Variants
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus:outline-none hover:bg-secondary transition-all"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSave} className="flex-grow flex flex-col overflow-hidden min-h-0">
          <div className="flex-1 overflow-y-auto p-5 space-y-4 overscroll-contain">
            {errorMsg && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg p-3.5 text-xs flex items-start gap-2.5 shrink-0 animate-shake">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Product Title *
                </label>
                <input
                  type="text"
                  required
                  maxLength={150}
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  className="block w-full px-3 h-11 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-slate-900 dark:text-white shadow-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Category
                </label>
                <select
                  value={editCategory}
                  onChange={(event) => setEditCategory(event.target.value)}
                  className="block w-full px-3 h-11 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-white cursor-pointer shadow-sm"
                >
                  {Array.from(new Set([
                    "Outerwear", "Bottoms", "Tops", "Traditional", "Accessories",
                    ...(editCategory ? [editCategory] : []),
                  ])).map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Low Stock Threshold (Alert Limit)
              </label>
              <input
                type="number"
                required
                min={1}
                value={editLowStock || ""}
                onKeyPress={(event) => { if (event.key === "." || event.key === "-") event.preventDefault(); }}
                onChange={(event) => {
                  const val = event.target.value === "" ? 0 : Math.max(0, Math.floor(Number(event.target.value)));
                  setEditLowStock(val);
                }}
                onBlur={() => {
                  if (editLowStock < 1) setEditLowStock(1);
                }}
                className="block w-full px-3 h-11 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-white shadow-sm"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Product Variants ({editVariants.length})
                </p>
                <button
                  type="button"
                  onClick={onAddCustomVariant}
                  className="inline-flex items-center gap-1.5 px-4 h-11 bg-secondary text-foreground hover:bg-secondary/80 text-xs font-semibold rounded-lg border border-border transition-all active:scale-[0.98]"
                >
                  <Plus className="w-3.5 h-3.5 animate-bounce" />
                  <span>Add Custom Variant</span>
                </button>
              </div>

              <div className="border border-border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto overflow-x-auto bg-white dark:bg-slate-950 overscroll-contain">
                <table className="w-full min-w-[600px] text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border/80 bg-slate-100 dark:bg-slate-900 text-slate-500 font-semibold uppercase tracking-wider sticky top-0 z-10">
                      <th className="px-3 py-2.5">Size</th>
                      <th className="px-3 py-2.5">Color</th>
                      <th className="px-3 py-2.5">SKU</th>
                      <th className="px-3 py-2.5" style={{ width: "110px" }}>Price (Rs.)</th>
                      <th className="px-3 py-2.5 text-center" style={{ width: "90px" }}>Stock</th>
                      <th className="px-3 py-2.5 text-center" style={{ width: "60px" }}></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-900">
                    {editVariants.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-100/50 dark:hover:bg-slate-900/40">
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            required
                            maxLength={50}
                            value={item.size}
                            onChange={(event) => {
                              const newVars = [...editVariants];
                              newVars[idx].size = event.target.value;
                              setEditVariants(newVars);
                            }}
                            className="w-full px-2 h-11 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-medium text-slate-900 dark:text-white text-xs shadow-inner"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            required
                            maxLength={50}
                            value={item.color}
                            onChange={(event) => {
                              const newVars = [...editVariants];
                              newVars[idx].color = event.target.value;
                              setEditVariants(newVars);
                            }}
                            className="w-full px-2 h-11 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-medium text-slate-900 dark:text-white text-xs shadow-inner"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            required
                            maxLength={100}
                            value={item.sku}
                            onChange={(event) => {
                              const newVars = [...editVariants];
                              newVars[idx].sku = event.target.value;
                              setEditVariants(newVars);
                            }}
                            className="w-full px-2 h-11 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-mono text-[11px] text-slate-900 dark:text-white shadow-inner"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            required
                            min={0}
                            value={item.price || ""}
                            onKeyPress={(event) => { if (event.key === "-") event.preventDefault(); }}
                            onChange={(event) => {
                              const val = event.target.value === "" ? 0 : Math.max(0, Number(event.target.value));
                              const newVars = [...editVariants];
                              newVars[idx].price = val;
                              setEditVariants(newVars);
                            }}
                            className="w-full px-2 h-11 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-bold text-slate-900 dark:text-white text-right text-xs shadow-inner"
                          />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="number"
                            required
                            min={0}
                            value={item.stock || ""}
                            onKeyPress={(event) => { if (event.key === "." || event.key === "-") event.preventDefault(); }}
                            onChange={(event) => {
                              const val = event.target.value === "" ? 0 : Math.max(0, Math.floor(Number(event.target.value)));
                              const newVars = [...editVariants];
                              newVars[idx].stock = val;
                              setEditVariants(newVars);
                            }}
                            className="w-full px-2 h-11 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-semibold text-slate-900 dark:text-white text-center text-xs shadow-inner"
                          />
                        </td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              if (item.id) {
                                setDeletedVariantIds([...deletedVariantIds, item.id]);
                              }
                              setEditVariants(editVariants.filter((_, i) => i !== idx));
                            }}
                            className="w-11 h-11 flex items-center justify-center text-red-500 hover:bg-red-500/10 rounded transition-all"
                            title="Delete Variant"
                          >
                            <Trash2 className="w-4 h-4 animate-pulse" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex gap-3 px-5 py-4 border-t border-border bg-card shrink-0 z-20">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 flex items-center justify-center border border-border text-sm font-semibold rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || editVariants.length === 0}
              className="flex-1 h-11 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:opacity-95 shadow transition-all disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
