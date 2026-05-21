"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAppStore } from "@/lib/store/useAppStore";
import {
  Package,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Sparkles,
  X,
  Loader2,
  AlertTriangle,
} from "lucide-react";

export default function InventoryTab() {
  const {
    products,
    variants,
    addProduct,
    deleteProduct,
    updateStockDirect,
    isLoading,
    errorMsg,
  } = useAppStore();

  const [isOpen, setIsOpen] = useState(false);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  // Form Fields for new Product
  const [prodName, setProdName] = useState("");
  const [category, setCategory] = useState("Tops");
  const [lowStockThreshold, setLowStockThreshold] = useState(5);

  // Bulk Variant inputs
  const [sizeInput, setSizeInput] = useState("S, M, L");
  const [colorInput, setColorInput] = useState("Black, White");
  const [basePrice, setBasePrice] = useState(1500);
  const [baseStock, setBaseStock] = useState(10);

  // Auto generated variants grid
  interface GeneratedVariant {
    size: string;
    color: string;
    sku: string;
    price: number;
    stock: number;
  }
  const [generatedVariants, setGeneratedVariants] = useState<GeneratedVariant[]>([]);

  // Toggle row expansion
  const toggleRow = (prodId: string) => {
    setExpandedProduct(expandedProduct === prodId ? null : prodId);
  };

  // Run bulk matrix generation when inputs or triggers change
  const generateMatrix = useCallback(() => {
    if (!prodName) return;

    // Clean inputs
    const sizes = sizeInput
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const colors = colorInput
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    // Create unique SKU prefix (uppercase, first 4 letters of product name)
    const prefix = prodName
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 4)
      .toUpperCase();

    const matrix: GeneratedVariant[] = [];
    sizes.forEach((size) => {
      colors.forEach((color) => {
        const skuSize = size.toUpperCase().replace(/\s/g, "");
        const skuColor = color.toUpperCase().slice(0, 3).replace(/\s/g, "");
        const sku = `${prefix}-${skuColor}-${skuSize}`;

        matrix.push({
          size,
          color,
          sku,
          price: basePrice,
          stock: baseStock,
        });
      });
    });

    setGeneratedVariants(matrix);
  }, [prodName, sizeInput, colorInput, basePrice, baseStock]);

  // Re-generate matrix automatically when bulk inputs change
  useEffect(() => {
    if (prodName && isOpen) {
      const timer = setTimeout(() => {
        generateMatrix();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [prodName, isOpen, generateMatrix]);

  // Adjust a cell value in the generated variants list
  const updateGeneratedCell = (index: number, key: keyof GeneratedVariant, value: string | number) => {
    setGeneratedVariants(
      generatedVariants.map((item, idx) =>
        idx === index ? { ...item, [key]: value } : item
      )
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!prodName || generatedVariants.length === 0) return;

    const success = await addProduct(
      prodName,
      category,
      lowStockThreshold,
      generatedVariants
    );

    if (success) {
      // Clear forms, close modal
      setProdName("");
      setSizeInput("S, M, L");
      setColorInput("Black, White");
      setBasePrice(1500);
      setBaseStock(10);
      setGeneratedVariants([]);
      setIsOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* PAGE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-outfit font-extrabold text-2xl sm:text-3xl text-foreground tracking-tight">
            Inventory Management
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Add clothing items, track stock quantities, and generate variant matrices.
          </p>
        </div>

        <button
          onClick={() => setIsOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:opacity-95 shadow transition-all active:scale-[0.99]"
        >
          <Plus className="w-4 h-4" />
          <span>Add Product</span>
        </button>
      </div>

      {/* ERROR STRIP */}
      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl p-4 text-sm flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* PRODUCTS DIRECTORY */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="w-12 h-12 text-muted-foreground mb-3 opacity-30 animate-pulse" />
            <h3 className="text-base font-bold text-foreground">No Products Tracked</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
              Your inventory is empty. Click &quot;Add Product&quot; to quickly generate size and color variants in seconds.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {products.map((p) => {
              const productVariants = variants.filter((v) => v.product_id === p.id);
              const isExpanded = expandedProduct === p.id;

              // Calculate aggregated values
              const totalStock = productVariants.reduce((sum, v) => sum + (v.stock ?? 0), 0);
              const activeLowStock = productVariants.filter(
                (v) => (v.stock ?? 0) <= p.low_stock_threshold
              ).length;

              return (
                <div key={p.id} className="transition-all">
                  {/* PRODUCT MASTER ROW */}
                  <div
                    onClick={() => toggleRow(p.id)}
                    className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-muted/10 transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="p-1 text-muted-foreground hover:bg-secondary rounded">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-semibold text-sm sm:text-base text-foreground leading-tight truncate">
                          {p.name}
                        </span>
                        <span className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 font-mono">
                          Category: {p.category} | Alert limit: {p.low_stock_threshold}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-5 shrink-0 text-xs sm:text-sm">
                      {/* STOCK LEVEL INDICATOR */}
                      <div className="text-right">
                        <span className="font-bold text-foreground">
                          {totalStock} items
                        </span>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          across {productVariants.length} variants
                        </p>
                      </div>

                      {/* WARNING BADGES */}
                      {activeLowStock > 0 && (
                        <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/10">
                          {activeLowStock} Warnings
                        </span>
                      )}

                      {/* QUICK DELETE */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Are you sure you want to delete ${p.name}?`)) {
                            deleteProduct(p.id);
                          }
                        }}
                        className="p-2 border border-transparent hover:border-red-500/20 text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                        title="Delete Product"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* EXPANDED VARIANTS SUBTABLE */}
                  {isExpanded && (
                    <div className="bg-muted/30 border-t border-border px-4 py-3 sm:px-5">
                      
                      {/* DESKTOP TABLE VIEW */}
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
                            {productVariants.map((v) => {
                              const isLowStock = (v.stock ?? 0) <= p.low_stock_threshold;
                              return (
                                <tr key={v.id} className="hover:bg-muted/40 transition-colors">
                                  <td className="py-2.5 font-mono text-foreground font-bold pr-4">
                                    {v.sku}
                                  </td>
                                  <td className="py-2.5 text-foreground pr-4">{v.size}</td>
                                  <td className="py-2.5 text-foreground pr-4">{v.color}</td>
                                  <td className="py-2.5 text-foreground font-bold pr-4">
                                    Rs. {v.price.toLocaleString()}
                                  </td>
                                  <td className="py-2.5 text-center">
                                    {/* INLINE STOCK ADJUSTMENT CONTROLS */}
                                    <div className="inline-flex items-center border border-border bg-card rounded-md shadow-sm">
                                      <button
                                        onClick={() => updateStockDirect(v.id, Math.max(0, (v.stock ?? 0) - 1))}
                                        className="px-2 py-1 hover:bg-secondary text-muted-foreground hover:text-foreground font-extrabold focus:outline-none transition-colors border-r border-border"
                                      >
                                        -
                                      </button>
                                      <span className={`px-3 py-1 font-bold font-mono text-center text-xs ${isLowStock ? "text-amber-500 font-extrabold" : "text-foreground"}`}>
                                        {v.stock ?? 0}
                                      </span>
                                      <button
                                        onClick={() => updateStockDirect(v.id, (v.stock ?? 0) + 1)}
                                        className="px-2 py-1 hover:bg-secondary text-muted-foreground hover:text-foreground font-extrabold focus:outline-none transition-colors border-l border-border"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* MOBILE CARD VIEW */}
                      <div className="block sm:hidden space-y-3">
                        {productVariants.map((v) => {
                          const isLowStock = (v.stock ?? 0) <= p.low_stock_threshold;
                          return (
                            <div key={v.id} className="p-3 bg-card border border-border/60 rounded-xl space-y-3.5 shadow-sm">
                              <div className="flex justify-between items-start">
                                <span className="font-mono text-foreground font-bold text-xs">{v.sku}</span>
                                <span className="text-[10px] px-2 py-0.5 rounded bg-secondary text-muted-foreground font-bold font-sans">
                                  Size {v.size} / {v.color}
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-xs pt-1 border-t border-border/40">
                                <span className="font-bold text-foreground">Rs. {v.price.toLocaleString()}</span>
                                
                                {/* 44x44px Touch Target Compliant Adjustment Strip */}
                                <div className="inline-flex items-center border border-border bg-slate-950 rounded-lg shadow-sm">
                                  <button
                                    onClick={() => updateStockDirect(v.id, Math.max(0, (v.stock ?? 0) - 1))}
                                    className="w-11 h-11 flex items-center justify-center hover:bg-slate-900 text-muted-foreground hover:text-foreground font-extrabold text-sm focus:outline-none transition-colors border-r border-border"
                                  >
                                    -
                                  </button>
                                  <span className={`w-10 text-center font-bold font-mono text-xs ${isLowStock ? "text-amber-500 font-extrabold" : "text-white"}`}>
                                    {v.stock ?? 0}
                                  </span>
                                  <button
                                    onClick={() => updateStockDirect(v.id, (v.stock ?? 0) + 1)}
                                    className="w-11 h-11 flex items-center justify-center hover:bg-slate-900 text-muted-foreground hover:text-foreground font-extrabold text-sm focus:outline-none transition-colors border-l border-border"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* QUICK ADD MODAL WITH MATRIX BUILDER */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-xl w-full max-w-xl flex flex-col shadow-lg max-h-[92vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <h3 className="font-outfit font-extrabold text-lg text-foreground">
                  Quick Product Wizard
                </h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded text-muted-foreground hover:text-foreground focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Product Info Section */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Product Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Oversized Linen Shirt"
                    value={prodName}
                    onChange={(e) => setProdName(e.target.value)}
                    className="block w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-white placeholder-slate-600"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="block w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm focus:outline-none focus:border-primary text-white"
                  >
                    <option value="Outerwear">Outerwear</option>
                    <option value="Bottoms">Bottoms</option>
                    <option value="Tops">Tops</option>
                    <option value="Traditional">Traditional</option>
                    <option value="Accessories">Accessories</option>
                  </select>
                </div>
              </div>

              {/* Alert Limit */}
              <div>
                <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Low Stock Threshold (Alert Limit)
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  value={lowStockThreshold}
                  onChange={(e) => setLowStockThreshold(Number(e.target.value))}
                  className="block w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-sm focus:outline-none focus:border-primary text-white"
                />
              </div>

              {/* Matrix Creator Banner */}
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
                      type="text"
                      placeholder="e.g. S, M, L"
                      value={sizeInput}
                      onChange={(e) => setSizeInput(e.target.value)}
                      className="block w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                      Colors (comma separated)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Blue, Black"
                      value={colorInput}
                      onChange={(e) => setColorInput(e.target.value)}
                      className="block w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white"
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
                      value={basePrice}
                      onChange={(e) => setBasePrice(Number(e.target.value))}
                      className="block w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                      Default Initial Stock
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={baseStock}
                      onChange={(e) => setBaseStock(Number(e.target.value))}
                      className="block w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Generated matrix table */}
              {generatedVariants.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Verify Generated Combinations ({generatedVariants.length})
                  </p>
                  <div className="border border-border rounded-lg overflow-hidden max-h-[190px] overflow-y-auto bg-slate-950">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-border/80 bg-slate-900 text-slate-500 font-semibold uppercase tracking-wider sticky top-0">
                          <th className="px-3 py-2">Combination</th>
                          <th className="px-3 py-2">SKU (Auto-Generated)</th>
                          <th className="px-3 py-2" style={{ width: "90px" }}>Price (Rs.)</th>
                          <th className="px-3 py-2 text-center" style={{ width: "80px" }}>Stock</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900">
                        {generatedVariants.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/40">
                            <td className="px-3 py-1.5 font-medium text-white">
                              {item.size} / {item.color}
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="text"
                                value={item.sku}
                                onChange={(e) => updateGeneratedCell(idx, "sku", e.target.value)}
                                className="w-full px-2 py-0.5 bg-slate-900 border border-slate-800 rounded font-mono text-[11px] text-white"
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                type="number"
                                min={0}
                                value={item.price}
                                onChange={(e) => updateGeneratedCell(idx, "price", Number(e.target.value))}
                                className="w-full px-2 py-0.5 bg-slate-900 border border-slate-800 rounded font-bold text-white text-right"
                              />
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <input
                                type="number"
                                min={0}
                                value={item.stock}
                                onChange={(e) => updateGeneratedCell(idx, "stock", Number(e.target.value))}
                                className="w-full px-2 py-0.5 bg-slate-900 border border-slate-800 rounded font-semibold text-white text-center"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-3 border-t border-border bg-card">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="flex-1 px-4 py-2 border border-border text-sm font-semibold rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading || generatedVariants.length === 0}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:opacity-95 shadow transition-all disabled:opacity-50"
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
      )}
    </div>
  );
}
