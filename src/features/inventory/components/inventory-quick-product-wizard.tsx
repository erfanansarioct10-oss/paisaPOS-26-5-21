"use client";

import type { Dispatch, FormEvent, SetStateAction } from "react";
import { AlertTriangle, Loader2, Package, Sparkles, X } from "lucide-react";
import type { GeneratedVariant } from "@/features/inventory/components/inventory-ui-types";

type InventoryQuickProductWizardProps = {
  basePrice: number;
  baseStock: number;
  canManageCatalog: boolean;
  category: string;
  colorInput: string;
  errorMsg: string | null;
  generatedVariants: GeneratedVariant[];
  isLoading: boolean;
  isOpen: boolean;
  lowStockThreshold: number;
  onClose: () => void;
  onSave: (event: FormEvent) => void | Promise<void>;
  onUpdateGeneratedCell: (index: number, key: keyof GeneratedVariant, value: string | number) => void;
  prodName: string;
  setBasePrice: Dispatch<SetStateAction<number>>;
  setBaseStock: Dispatch<SetStateAction<number>>;
  setCategory: Dispatch<SetStateAction<string>>;
  setColorInput: Dispatch<SetStateAction<string>>;
  setLowStockThreshold: Dispatch<SetStateAction<number>>;
  setProdName: Dispatch<SetStateAction<string>>;
  setSizeInput: Dispatch<SetStateAction<string>>;
  sizeInput: string;
};

export function InventoryQuickProductWizard({
  basePrice,
  baseStock,
  canManageCatalog,
  category,
  colorInput,
  errorMsg,
  generatedVariants,
  isLoading,
  isOpen,
  lowStockThreshold,
  onClose,
  onSave,
  onUpdateGeneratedCell,
  prodName,
  setBasePrice,
  setBaseStock,
  setCategory,
  setColorInput,
  setLowStockThreshold,
  setProdName,
  setSizeInput,
  sizeInput,
}: InventoryQuickProductWizardProps) {
  if (!isOpen || !canManageCatalog) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-xl w-full max-w-xl flex flex-col shadow-lg max-h-[92vh] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h3 className="font-outfit font-extrabold text-lg text-foreground">
              Quick Product Wizard
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
                  id="wizard-product-title"
                  type="text"
                  required
                  maxLength={150}
                  placeholder="e.g. Oversized Linen Shirt"
                  value={prodName}
                  onChange={(event) => setProdName(event.target.value)}
                  className="block w-full px-3 h-11 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 shadow-sm"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Category
                </label>
                <select
                  id="wizard-product-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="block w-full px-3 h-11 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-white cursor-pointer shadow-sm"
                >
                  {Array.from(new Set([
                    "Outerwear", "Bottoms", "Tops", "Traditional", "Accessories",
                    ...(category ? [category] : []),
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
                id="wizard-low-stock-threshold"
                type="number"
                required
                min={1}
                value={lowStockThreshold || ""}
                onKeyPress={(event) => { if (event.key === "." || event.key === "-") event.preventDefault(); }}
                onChange={(event) => {
                  const val = event.target.value === "" ? 0 : Math.max(0, Math.floor(Number(event.target.value)));
                  setLowStockThreshold(val);
                }}
                onBlur={() => {
                  if (lowStockThreshold < 1) setLowStockThreshold(1);
                }}
                className="block w-full px-3 h-11 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-white shadow-sm"
              />
            </div>

            <div className="border border-dashed border-border bg-muted/20 rounded-xl p-4 space-y-3.5">
              <div className="flex items-center gap-1.5 text-xs text-primary font-bold uppercase tracking-wider">
                <Package className="w-4 h-4 shrink-0" />
                <span>Bulk Variant Generator Matrix</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Sizes (comma separated)
                  </label>
                  <input
                    id="wizard-sizes-input"
                    type="text"
                    placeholder="e.g. S, M, L"
                    value={sizeInput}
                    onChange={(event) => setSizeInput(event.target.value)}
                    className="block w-full px-3 h-11 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 text-sm shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Colors (comma separated)
                  </label>
                  <input
                    id="wizard-colors-input"
                    type="text"
                    placeholder="e.g. Blue, Black"
                    value={colorInput}
                    onChange={(event) => setColorInput(event.target.value)}
                    className="block w-full px-3 h-11 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 text-sm shadow-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Default Price (NPR)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={basePrice || ""}
                    onKeyPress={(event) => { if (event.key === "-") event.preventDefault(); }}
                    onChange={(event) => {
                      const val = event.target.value === "" ? 0 : Math.max(0, Number(event.target.value));
                      setBasePrice(val);
                    }}
                    className="block w-full px-3 h-11 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-sm shadow-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Default Initial Stock
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={baseStock || ""}
                    onKeyPress={(event) => { if (event.key === "." || event.key === "-") event.preventDefault(); }}
                    onChange={(event) => {
                      const val = event.target.value === "" ? 0 : Math.max(0, Math.floor(Number(event.target.value)));
                      setBaseStock(val);
                    }}
                    className="block w-full px-3 h-11 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-sm shadow-sm font-semibold"
                  />
                </div>
              </div>
            </div>

            {generatedVariants.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Verify Generated Combinations ({generatedVariants.length})
                </p>
                <div className="border border-border rounded-lg overflow-hidden max-h-[190px] overflow-y-auto overflow-x-auto bg-white dark:bg-slate-950 overscroll-contain">
                  <table className="w-full min-w-[500px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-border/80 bg-slate-100 dark:bg-slate-900 text-slate-500 font-semibold uppercase tracking-wider sticky top-0 z-10">
                        <th className="px-3 py-2">Combination</th>
                        <th className="px-3 py-2">SKU (Auto-Generated)</th>
                        <th className="px-3 py-2" style={{ width: "110px" }}>Price (Rs.)</th>
                        <th className="px-3 py-2 text-center" style={{ width: "90px" }}>Stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-900">
                      {generatedVariants.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-100/50 dark:hover:bg-slate-900/40">
                          <td className="px-3 py-1.5 font-medium text-slate-900 dark:text-white">
                            {item.size} / {item.color}
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              id={`wizard-variant-sku-${idx}`}
                              type="text"
                              maxLength={100}
                              value={item.sku}
                              onChange={(event) => onUpdateGeneratedCell(idx, "sku", event.target.value)}
                              className="w-full px-2 h-9 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-mono text-[11px] text-slate-900 dark:text-white shadow-inner"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              id={`wizard-variant-price-${idx}`}
                              type="number"
                              min={0}
                              value={item.price || ""}
                              onKeyPress={(event) => { if (event.key === "-") event.preventDefault(); }}
                              onChange={(event) => {
                                const val = event.target.value === "" ? 0 : Math.max(0, Number(event.target.value));
                                onUpdateGeneratedCell(idx, "price", val);
                              }}
                              className="w-full px-2 h-9 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-bold text-slate-900 dark:text-white text-right shadow-inner"
                            />
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <input
                              id={`wizard-variant-stock-${idx}`}
                              type="number"
                              min={0}
                              value={item.stock || ""}
                              onKeyPress={(event) => { if (event.key === "." || event.key === "-") event.preventDefault(); }}
                              onChange={(event) => {
                                const val = event.target.value === "" ? 0 : Math.max(0, Math.floor(Number(event.target.value)));
                                onUpdateGeneratedCell(idx, "stock", val);
                              }}
                              className="w-full px-2 h-9 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-semibold text-slate-900 dark:text-white text-center shadow-inner"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
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
              disabled={isLoading || generatedVariants.length === 0}
              className="flex-1 h-11 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:opacity-95 shadow transition-all disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <span>Create Product ({generatedVariants.length})</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
