"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAppStore, type Product, type ProductVariant } from "@/lib/store/useAppStore";
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
  Pencil,
} from "lucide-react";

export default function InventoryTab() {
  const {
    products,
    variants,
    addProduct,
    deleteProduct,
    updateProduct,
    updateStockDirect,
    isLoading,
    errorMsg,
  } = useAppStore();

  const [isOpen, setIsOpen] = useState(false);

  // Auto-open Quick Product Wizard if redirected with ?add=true query param
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("add") === "true") {
        // Defer updating state to avoid synchronous cascading renders inside effect
        setTimeout(() => {
          setIsOpen(true);
        }, 0);
        // Clear param from URL without reload for premium feel
        const newUrl = window.location.pathname;
        window.history.replaceState({ path: newUrl }, "", newUrl);
      }
    }
  }, []);

  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  // Form Fields for new Product
  const [prodName, setProdName] = useState("");
  const [category, setCategory] = useState("Tops");
  const [lowStockThreshold, setLowStockThreshold] = useState(5);

  // Edit Product Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("Tops");
  const [editLowStock, setEditLowStock] = useState(5);

  interface EditVariant {
    id?: string;
    size: string;
    color: string;
    sku: string;
    price: number;
    stock: number;
  }
  const [editVariants, setEditVariants] = useState<EditVariant[]>([]);
  const [deletedVariantIds, setDeletedVariantIds] = useState<string[]>([]);

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

  const handleOpenEdit = (p: Product, prodVariants: ProductVariant[]) => {
    setEditProductId(p.id);
    setEditName(p.name);
    setEditCategory(p.category);
    setEditLowStock(p.low_stock_threshold);
    setEditVariants(
      prodVariants.map((v) => ({
        id: v.id,
        size: v.size,
        color: v.color,
        sku: v.sku,
        price: v.price,
        stock: v.stock ?? 0,
      }))
    );
    setDeletedVariantIds([]);
    setIsEditOpen(true);
  };

  const handleAddCustomVariant = () => {
    const prefix = editName
      ? editName
          .replace(/[^a-zA-Z0-9]/g, "")
          .slice(0, 4)
          .toUpperCase()
      : "VAR";
    const newSku = `${prefix}-VAR-${Date.now().toString().slice(-4)}`;

    setEditVariants([
      ...editVariants,
      {
        size: "M",
        color: "Black",
        sku: newSku,
        price: editVariants[0]?.price ?? 1500,
        stock: 10,
      },
    ]);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProductId || !editName || editVariants.length === 0) return;

    const invalid = editVariants.some(
      (v) => !v.size || !v.color || !v.sku || v.price < 0 || v.stock < 0
    );
    if (invalid) {
      alert("All variants must have size, color, sku, and non-negative price/stock values.");
      return;
    }

    const success = await updateProduct(
      editProductId,
      editName,
      editCategory,
      editLowStock,
      editVariants,
      deletedVariantIds
    );

    if (success) {
      setIsEditOpen(false);
      setEditProductId(null);
      setEditVariants([]);
      setDeletedVariantIds([]);
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
                    className="px-4 py-3.5 sm:px-5 sm:py-4 cursor-pointer hover:bg-muted/10 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
                      {/* LEFT/TOP: PRODUCT INFO */}
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="p-1 text-muted-foreground hover:bg-secondary rounded shrink-0 mt-0.5">
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-sm sm:text-base text-foreground leading-tight truncate block">
                              {p.name}
                            </span>
                            
                            {/* Mobile-only Action Buttons */}
                            <div className="flex sm:hidden items-center gap-1 shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenEdit(p, productVariants);
                                }}
                                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all"
                                title="Edit Product & Variants"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`Are you sure you want to delete ${p.name}?`)) {
                                    deleteProduct(p.id);
                                  }
                                }}
                                className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                title="Delete Product"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          
                          <div className="text-[10px] sm:text-xs text-muted-foreground font-mono flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span>Category: <strong className="text-foreground font-medium">{p.category}</strong></span>
                            <span className="text-slate-700 hidden sm:inline">|</span>
                            <span>Alert limit: <strong className="text-foreground font-medium">{p.low_stock_threshold}</strong></span>
                          </div>
                        </div>
                      </div>

                      {/* RIGHT/BOTTOM: STOCK & ACTIONS */}
                      <div className="flex items-center justify-between sm:justify-end gap-4 border-t border-border/40 sm:border-0 pt-2.5 sm:pt-0">
                        {/* STOCK LEVEL INDICATOR */}
                        <div className="text-left sm:text-right shrink-0">
                          <span className="font-bold text-foreground text-xs sm:text-sm">
                            {totalStock} items
                          </span>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            across {productVariants.length} variants
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* WARNING BADGES */}
                          {activeLowStock > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-500 border border-amber-500/10">
                              {activeLowStock} Warning{activeLowStock > 1 ? "s" : ""}
                            </span>
                          )}

                          {/* Desktop-only Action Buttons */}
                          <div className="hidden sm:flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEdit(p, productVariants);
                              }}
                              className="p-2 border border-transparent hover:border-slate-500/20 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all"
                              title="Edit Product & Variants"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
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
                      </div>
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
          <div className="bg-card border border-border rounded-xl w-full max-w-xl flex flex-col shadow-lg max-h-[92vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <h3 className="font-outfit font-extrabold text-lg text-foreground">
                  Quick Product Wizard
                </h3>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-11 h-11 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus:outline-none hover:bg-secondary transition-all"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Wrapper */}
            <form onSubmit={handleSave} className="flex-grow flex flex-col overflow-hidden min-h-0">
              {/* Scrollable body with keyboard boundaries */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 overscroll-contain">
                {/* Product Info Section */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                      Product Title *
                    </label>
                    <input
                      type="text"
                      required
                      maxLength={150}
                      placeholder="e.g. Oversized Linen Shirt"
                      value={prodName}
                      onChange={(e) => setProdName(e.target.value)}
                      className="block w-full px-3 h-11 bg-slate-950 border border-slate-800 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-white placeholder-slate-600 shadow-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                      Category
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="block w-full px-3 h-11 bg-slate-950 border border-slate-800 rounded-lg text-sm focus:outline-none focus:border-primary text-white cursor-pointer shadow-sm"
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
                    value={lowStockThreshold || ""}
                    onKeyPress={(e) => { if (e.key === "." || e.key === "-") e.preventDefault(); }}
                    onChange={(e) => {
                      const val = e.target.value === "" ? 0 : Math.max(0, Math.floor(Number(e.target.value)));
                      setLowStockThreshold(val);
                    }}
                    onBlur={() => {
                      if (lowStockThreshold < 1) setLowStockThreshold(1);
                    }}
                    className="block w-full px-3 h-11 bg-slate-950 border border-slate-800 rounded-lg text-sm focus:outline-none focus:border-primary text-white shadow-sm"
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
                        className="block w-full px-3 h-11 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm shadow-sm"
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
                        className="block w-full px-3 h-11 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm shadow-sm"
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
                        onKeyPress={(e) => { if (e.key === "-") e.preventDefault(); }}
                        onChange={(e) => {
                          const val = e.target.value === "" ? 0 : Math.max(0, Number(e.target.value));
                          setBasePrice(val);
                        }}
                        className="block w-full px-3 h-11 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm shadow-sm font-bold"
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
                        onKeyPress={(e) => { if (e.key === "." || e.key === "-") e.preventDefault(); }}
                        onChange={(e) => {
                          const val = e.target.value === "" ? 0 : Math.max(0, Math.floor(Number(e.target.value)));
                          setBaseStock(val);
                        }}
                        className="block w-full px-3 h-11 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm shadow-sm font-semibold"
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
                    <div className="border border-border rounded-lg overflow-hidden max-h-[190px] overflow-y-auto overflow-x-auto bg-slate-950 overscroll-contain">
                      <table className="w-full min-w-[500px] text-left text-xs">
                        <thead>
                          <tr className="border-b border-border/80 bg-slate-900 text-slate-500 font-semibold uppercase tracking-wider sticky top-0 z-10">
                            <th className="px-3 py-2">Combination</th>
                            <th className="px-3 py-2">SKU (Auto-Generated)</th>
                            <th className="px-3 py-2" style={{ width: "110px" }}>Price (Rs.)</th>
                            <th className="px-3 py-2 text-center" style={{ width: "90px" }}>Stock</th>
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
                                  maxLength={100}
                                  value={item.sku}
                                  onChange={(e) => updateGeneratedCell(idx, "sku", e.target.value)}
                                  className="w-full px-2 h-9 bg-slate-900 border border-slate-800 rounded font-mono text-[11px] text-white shadow-inner"
                                />
                              </td>
                              <td className="px-3 py-1.5">
                                <input
                                  type="number"
                                  min={0}
                                  value={item.price || ""}
                                  onKeyPress={(e) => { if (e.key === "-") e.preventDefault(); }}
                                  onChange={(e) => {
                                    const val = e.target.value === "" ? 0 : Math.max(0, Number(e.target.value));
                                    updateGeneratedCell(idx, "price", val);
                                  }}
                                  className="w-full px-2 h-9 bg-slate-900 border border-slate-800 rounded font-bold text-white text-right shadow-inner"
                                />
                              </td>
                              <td className="px-3 py-1.5 text-center">
                                <input
                                  type="number"
                                  min={0}
                                  value={item.stock || ""}
                                  onKeyPress={(e) => { if (e.key === "." || e.key === "-") e.preventDefault(); }}
                                  onChange={(e) => {
                                    const val = e.target.value === "" ? 0 : Math.max(0, Math.floor(Number(e.target.value)));
                                    updateGeneratedCell(idx, "stock", val);
                                  }}
                                  className="w-full px-2 h-9 bg-slate-900 border border-slate-800 rounded font-semibold text-white text-center shadow-inner"
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

              {/* Sticky Action Footer */}
              <div className="flex gap-3 px-5 py-4 border-t border-border bg-card shrink-0 z-20">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
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
      )}

      {/* EDIT PRODUCT MODAL */}
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl flex flex-col shadow-lg max-h-[92vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Pencil className="w-5 h-5 text-primary animate-pulse" />
                <h3 className="font-outfit font-extrabold text-lg text-foreground">
                  Edit Product & Variants
                </h3>
              </div>
              <button
                onClick={() => setIsEditOpen(false)}
                className="w-11 h-11 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus:outline-none hover:bg-secondary transition-all"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Wrapper */}
            <form onSubmit={handleSaveEdit} className="flex-grow flex flex-col overflow-hidden min-h-0">
              {/* Scrollable body with keyboard boundaries */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 overscroll-contain">
                {/* Product Info Section */}
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
                      onChange={(e) => setEditName(e.target.value)}
                      className="block w-full px-3 h-11 bg-slate-950 border border-slate-800 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-white shadow-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                      Category
                    </label>
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className="block w-full px-3 h-11 bg-slate-950 border border-slate-800 rounded-lg text-sm focus:outline-none focus:border-primary text-white cursor-pointer shadow-sm"
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
                    value={editLowStock || ""}
                    onKeyPress={(e) => { if (e.key === "." || e.key === "-") e.preventDefault(); }}
                    onChange={(e) => {
                      const val = e.target.value === "" ? 0 : Math.max(0, Math.floor(Number(e.target.value)));
                      setEditLowStock(val);
                    }}
                    onBlur={() => {
                      if (editLowStock < 1) setEditLowStock(1);
                    }}
                    className="block w-full px-3 h-11 bg-slate-950 border border-slate-800 rounded-lg text-sm focus:outline-none focus:border-primary text-white shadow-sm"
                  />
                </div>

                {/* Variants Editor Grid */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Product Variants ({editVariants.length})
                    </p>
                    <button
                      type="button"
                      onClick={handleAddCustomVariant}
                      className="inline-flex items-center gap-1.5 px-4 h-11 bg-secondary text-foreground hover:bg-secondary/80 text-xs font-semibold rounded-lg border border-border transition-all active:scale-[0.98]"
                    >
                      <Plus className="w-3.5 h-3.5 animate-bounce" />
                      <span>Add Custom Variant</span>
                    </button>
                  </div>

                  <div className="border border-border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto overflow-x-auto bg-slate-950 overscroll-contain">
                    <table className="w-full min-w-[600px] text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-border/80 bg-slate-900 text-slate-500 font-semibold uppercase tracking-wider sticky top-0 z-10">
                          <th className="px-3 py-2.5">Size</th>
                          <th className="px-3 py-2.5">Color</th>
                          <th className="px-3 py-2.5">SKU</th>
                          <th className="px-3 py-2.5" style={{ width: "110px" }}>Price (Rs.)</th>
                          <th className="px-3 py-2.5 text-center" style={{ width: "90px" }}>Stock</th>
                          <th className="px-3 py-2.5 text-center" style={{ width: "60px" }}></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900">
                        {editVariants.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/40">
                            {/* Size */}
                            <td className="px-2 py-2">
                              <input
                                type="text"
                                required
                                maxLength={50}
                                value={item.size}
                                onChange={(e) => {
                                  const newVars = [...editVariants];
                                  newVars[idx].size = e.target.value;
                                  setEditVariants(newVars);
                                }}
                                className="w-full px-2 h-11 bg-slate-900 border border-slate-800 rounded font-medium text-white text-xs shadow-inner"
                              />
                            </td>
                            {/* Color */}
                            <td className="px-2 py-2">
                              <input
                                type="text"
                                required
                                maxLength={50}
                                value={item.color}
                                onChange={(e) => {
                                  const newVars = [...editVariants];
                                  newVars[idx].color = e.target.value;
                                  setEditVariants(newVars);
                                }}
                                className="w-full px-2 h-11 bg-slate-900 border border-slate-800 rounded font-medium text-white text-xs shadow-inner"
                              />
                            </td>
                            {/* SKU */}
                            <td className="px-2 py-2">
                              <input
                                type="text"
                                required
                                maxLength={100}
                                value={item.sku}
                                onChange={(e) => {
                                  const newVars = [...editVariants];
                                  newVars[idx].sku = e.target.value;
                                  setEditVariants(newVars);
                                }}
                                className="w-full px-2 h-11 bg-slate-900 border border-slate-800 rounded font-mono text-[11px] text-white shadow-inner"
                              />
                            </td>
                            {/* Price */}
                            <td className="px-2 py-2">
                              <input
                                type="number"
                                required
                                min={0}
                                value={item.price || ""}
                                onKeyPress={(e) => { if (e.key === "-") e.preventDefault(); }}
                                onChange={(e) => {
                                  const val = e.target.value === "" ? 0 : Math.max(0, Number(e.target.value));
                                  const newVars = [...editVariants];
                                  newVars[idx].price = val;
                                  setEditVariants(newVars);
                                }}
                                className="w-full px-2 h-11 bg-slate-900 border border-slate-800 rounded font-bold text-white text-right text-xs shadow-inner"
                              />
                            </td>
                            {/* Stock */}
                            <td className="px-2 py-2 text-center">
                              <input
                                type="number"
                                required
                                min={0}
                                value={item.stock || ""}
                                onKeyPress={(e) => { if (e.key === "." || e.key === "-") e.preventDefault(); }}
                                onChange={(e) => {
                                  const val = e.target.value === "" ? 0 : Math.max(0, Math.floor(Number(e.target.value)));
                                  const newVars = [...editVariants];
                                  newVars[idx].stock = val;
                                  setEditVariants(newVars);
                                }}
                                className="w-full px-2 h-11 bg-slate-900 border border-slate-800 rounded font-semibold text-white text-center text-xs shadow-inner"
                              />
                            </td>
                            {/* Trash / Delete Row */}
                            <td className="px-2 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  if (item.id) {
                                    // Mark existing variant for deletion
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

              {/* Sticky Action Footer */}
              <div className="flex gap-3 px-5 py-4 border-t border-border bg-card shrink-0 z-20">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
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
      )}
    </div>
  );
}
