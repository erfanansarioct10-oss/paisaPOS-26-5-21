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
  Star,
  Download,
  Upload,
  CheckCircle,
  RefreshCw,
  KeyRound,
  Clock3,
} from "lucide-react";
import { parseCatalogFile, type ParsedImport } from "@/lib/importer";
import { formatStaffPrivilege, getStaffCapabilities, hasActiveDelegatedPrivilege } from "@/lib/staff-capabilities";

export default function InventoryTab() {
  const {
    user,
    activeDelegations,
    products,
    variants,
    addProduct,
    deleteProduct,
    updateProduct,
    updateStockDirect,
    toggleProductFavorite,
    isLoading,
    errorMsg,
    clearError,
    bulkImportProducts,
  } = useAppStore();

  const capabilities = getStaffCapabilities(user);
  const activeInventoryDelegation = activeDelegations.find((delegation) =>
    hasActiveDelegatedPrivilege(user, "inventory.adjust", [delegation]),
  );
  const canManageCatalog = capabilities.canManageCatalog;
  const canAdjustInventory = capabilities.canAdjustInventory || Boolean(activeInventoryDelegation);

  const [isOpen, setIsOpen] = useState(false);

  // Custom Confirm/Alert Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type: "info" | "warning" | "danger";
    confirmText?: string;
    cancelText?: string;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    type: "warning",
  });

  const handleShowConfirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    type: "info" | "warning" | "danger" = "warning",
    confirmText = "Confirm",
    cancelText?: string
  ) => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      onConfirm,
      type,
      confirmText,
      cancelText,
    });
  };

  // Auto-open Quick Product Wizard if redirected with ?add=true query param
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("add") === "true") {
        if (canManageCatalog) {
          // Defer updating state to avoid synchronous cascading renders inside effect
          setTimeout(() => {
            setIsOpen(true);
          }, 0);
        }
        // Clear param from URL without reload for premium feel
        const newUrl = window.location.pathname;
        window.history.replaceState({ path: newUrl }, "", newUrl);
      }
    }
  }, [canManageCatalog]);

  // Bulk Catalog Importer Wizard State
  const [isImportWizardOpen, setIsImportWizardOpen] = useState(false);
  const [importStep, setImportStep] = useState<1 | 2 | 3 | 4>(1);
  const [parsedImportData, setParsedImportData] = useState<ParsedImport | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<{
    succeededCount: number;
    failedProducts: Array<{ name: string; error: string }>;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileParsingError, setFileParsingError] = useState<string | null>(null);

  const downloadCSVTemplate = () => {
    const headers = "Product Name,Category,Size,Color,Price,Stock,SKU,Low Stock Threshold\n";
    const row1 = "Oversized Linen Shirt,Tops,S,Black,1500,10,,5\n";
    const row2 = "Oversized Linen Shirt,Tops,M,Black,1500,15,,5\n";
    const row3 = "Baggy Cargo Pants,Bottoms,30,Olive,2200,8,,3\n";
    const csvContent = headers + row1 + row2 + row3;
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "PaisaPOS_Catalog_Template.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

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

  // Automatically clear any active errors when opening/closing product modals
  useEffect(() => {
    clearError();
  }, [isOpen, isEditOpen, clearError]);

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
      handleShowConfirm(
        "Validation Error",
        "All variants must have size, color, sku, and non-negative price/stock values.",
        () => {},
        "warning",
        "OK"
      );
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

        {canManageCatalog && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setImportStep(1);
                setParsedImportData(null);
                setImportResults(null);
                setFileParsingError(null);
                setIsImportWizardOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-card hover:bg-muted text-foreground border border-border text-sm font-semibold rounded-lg shadow-sm transition-all active:scale-[0.99] cursor-pointer"
            >
              <Download className="w-4 h-4 rotate-180 text-muted-foreground" />
              <span>Import Catalog</span>
            </button>

            <button
              onClick={() => setIsOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:opacity-95 shadow transition-all active:scale-[0.99]"
            >
              <Plus className="w-4 h-4" />
              <span>Add Product</span>
            </button>
          </div>
        )}
      </div>

      {/* ERROR STRIP */}
      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl p-4 text-sm flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {activeInventoryDelegation && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 shadow-sm dark:text-amber-200 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <KeyRound className="h-4 w-4 shrink-0" />
            <span>Temporary access: {formatStaffPrivilege("inventory.adjust")}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-medium">
            <Clock3 className="h-3.5 w-3.5 shrink-0" />
            <span>
              Until {new Date(activeInventoryDelegation.expires_at).toLocaleTimeString("en-NP", {
                timeZone: "Asia/Kathmandu",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
      )}

      {/* PRODUCTS DIRECTORY */}
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
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-semibold text-sm sm:text-base text-foreground leading-tight truncate block">
                                {p.name}
                              </span>
                              {canManageCatalog && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleProductFavorite(p.id, !p.is_favorite);
                                  }}
                                  className="p-1 text-slate-400 dark:text-slate-600 hover:text-amber-500 rounded-md transition-all active:scale-95 shrink-0"
                                  title={p.is_favorite ? "Remove from Favorites" : "Add to Favorites"}
                                >
                                  <Star
                                    className={`w-3.5 h-3.5 ${
                                      p.is_favorite
                                        ? "fill-amber-500 text-amber-500"
                                        : "text-slate-400 dark:text-slate-600 hover:text-amber-500"
                                    }`}
                                  />
                                </button>
                              )}
                            </div>
                            
                            {/* Mobile-only Action Buttons */}
                            {canManageCatalog && (
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
                                    handleShowConfirm(
                                      "Delete Product",
                                      `Are you sure you want to delete ${p.name}? This will also delete all its variants and inventory stock levels.`,
                                      () => deleteProduct(p.id),
                                      "danger",
                                      "Delete",
                                      "Cancel"
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
                          {canManageCatalog && (
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
                                  handleShowConfirm(
                                    "Delete Product",
                                    `Are you sure you want to delete ${p.name}? This will also delete all its variants and inventory stock levels.`,
                                    () => deleteProduct(p.id),
                                    "danger",
                                    "Delete",
                                    "Cancel"
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
                                    {canAdjustInventory ? (
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
                                    ) : (
                                      <span className={`inline-flex min-w-14 justify-center rounded-md border border-border bg-card px-3 py-1 font-bold font-mono text-xs ${isLowStock ? "text-amber-500 font-extrabold" : "text-foreground"}`}>
                                        {v.stock ?? 0}
                                      </span>
                                    )}
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
                                {canAdjustInventory ? (
                                  <div className="inline-flex items-center border border-border bg-slate-50 dark:bg-slate-950 rounded-lg shadow-sm">
                                    <button
                                      onClick={() => updateStockDirect(v.id, Math.max(0, (v.stock ?? 0) - 1))}
                                      className="w-11 h-11 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-900 text-muted-foreground hover:text-foreground font-extrabold text-sm focus:outline-none transition-colors border-r border-border"
                                    >
                                      -
                                    </button>
                                    <span className={`w-10 text-center font-bold font-mono text-xs ${isLowStock ? "text-amber-500 font-extrabold" : "text-slate-900 dark:text-white"}`}>
                                      {v.stock ?? 0}
                                    </span>
                                    <button
                                      onClick={() => updateStockDirect(v.id, (v.stock ?? 0) + 1)}
                                      className="w-11 h-11 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-900 text-muted-foreground hover:text-foreground font-extrabold text-sm focus:outline-none transition-colors border-l border-border"
                                    >
                                      +
                                    </button>
                                  </div>
                                ) : (
                                  <span className={`inline-flex h-11 min-w-12 items-center justify-center rounded-lg border border-border bg-slate-50 px-3 font-bold font-mono text-xs dark:bg-slate-950 ${isLowStock ? "text-amber-500 font-extrabold" : "text-slate-900 dark:text-white"}`}>
                                    {v.stock ?? 0}
                                  </span>
                                )}
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
      {isOpen && canManageCatalog && (
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
                {/* Modal Error Strip */}
                {errorMsg && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg p-3.5 text-xs flex items-start gap-2.5 shrink-0 animate-shake">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {/* Product Info Section */}
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
                      onChange={(e) => setProdName(e.target.value)}
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
                      onChange={(e) => setCategory(e.target.value)}
                      className="block w-full px-3 h-11 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-white cursor-pointer shadow-sm"
                    >
                      {Array.from(new Set([
                        "Outerwear", "Bottoms", "Tops", "Traditional", "Accessories",
                        ...(category ? [category] : [])
                      ])).map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Alert Limit */}
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
                    onKeyPress={(e) => { if (e.key === "." || e.key === "-") e.preventDefault(); }}
                    onChange={(e) => {
                      const val = e.target.value === "" ? 0 : Math.max(0, Math.floor(Number(e.target.value)));
                      setLowStockThreshold(val);
                    }}
                    onBlur={() => {
                      if (lowStockThreshold < 1) setLowStockThreshold(1);
                    }}
                    className="block w-full px-3 h-11 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-white shadow-sm"
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
                        id="wizard-sizes-input"
                        type="text"
                        placeholder="e.g. S, M, L"
                        value={sizeInput}
                        onChange={(e) => setSizeInput(e.target.value)}
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
                        onChange={(e) => setColorInput(e.target.value)}
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
                        onKeyPress={(e) => { if (e.key === "-") e.preventDefault(); }}
                        onChange={(e) => {
                          const val = e.target.value === "" ? 0 : Math.max(0, Number(e.target.value));
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
                        onKeyPress={(e) => { if (e.key === "." || e.key === "-") e.preventDefault(); }}
                        onChange={(e) => {
                          const val = e.target.value === "" ? 0 : Math.max(0, Math.floor(Number(e.target.value)));
                          setBaseStock(val);
                        }}
                        className="block w-full px-3 h-11 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-white text-sm shadow-sm font-semibold"
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
                                  onChange={(e) => updateGeneratedCell(idx, "sku", e.target.value)}
                                  className="w-full px-2 h-9 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-mono text-[11px] text-slate-900 dark:text-white shadow-inner"
                                />
                              </td>
                              <td className="px-3 py-1.5">
                                <input
                                  id={`wizard-variant-price-${idx}`}
                                  type="number"
                                  min={0}
                                  value={item.price || ""}
                                  onKeyPress={(e) => { if (e.key === "-") e.preventDefault(); }}
                                  onChange={(e) => {
                                    const val = e.target.value === "" ? 0 : Math.max(0, Number(e.target.value));
                                    updateGeneratedCell(idx, "price", val);
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
                                  onKeyPress={(e) => { if (e.key === "." || e.key === "-") e.preventDefault(); }}
                                  onChange={(e) => {
                                    const val = e.target.value === "" ? 0 : Math.max(0, Math.floor(Number(e.target.value)));
                                    updateGeneratedCell(idx, "stock", val);
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
      {isEditOpen && canManageCatalog && (
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
                {/* Modal Error Strip */}
                {errorMsg && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg p-3.5 text-xs flex items-start gap-2.5 shrink-0 animate-shake">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

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
                      className="block w-full px-3 h-11 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-slate-900 dark:text-white shadow-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                      Category
                    </label>
                    <select
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className="block w-full px-3 h-11 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-white cursor-pointer shadow-sm"
                    >
                      {Array.from(new Set([
                        "Outerwear", "Bottoms", "Tops", "Traditional", "Accessories",
                        ...(editCategory ? [editCategory] : [])
                      ])).map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
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
                    className="block w-full px-3 h-11 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:border-primary text-slate-900 dark:text-white shadow-sm"
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
                                className="w-full px-2 h-11 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-medium text-slate-900 dark:text-white text-xs shadow-inner"
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
                                className="w-full px-2 h-11 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-medium text-slate-900 dark:text-white text-xs shadow-inner"
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
                                className="w-full px-2 h-11 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-mono text-[11px] text-slate-900 dark:text-white shadow-inner"
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
                                className="w-full px-2 h-11 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-bold text-slate-900 dark:text-white text-right text-xs shadow-inner"
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
                                className="w-full px-2 h-11 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded font-semibold text-slate-900 dark:text-white text-center text-xs shadow-inner"
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

      {/* CUSTOM CONFIRM/ALERT DIALOG MODAL */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-xl w-full max-w-md flex flex-col shadow-2xl overflow-hidden scale-in-95 duration-200 animate-in zoom-in-95">
            {/* Modal Header/Icon */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-slate-100/40 dark:bg-slate-900/30">
              {confirmDialog.type === "danger" ? (
                <div className="p-2 bg-red-500/10 rounded-lg text-red-500 shrink-0">
                  <Trash2 className="w-5 h-5 animate-bounce" />
                </div>
              ) : confirmDialog.type === "warning" ? (
                <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500 shrink-0">
                  <AlertTriangle className="w-5 h-5 animate-pulse" />
                </div>
              ) : (
                <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
              )}
              <h3 className="font-outfit font-extrabold text-base text-foreground">
                {confirmDialog.title}
              </h3>
            </div>

            {/* Modal Content */}
            <div className="p-5 text-sm text-muted-foreground leading-relaxed">
              {confirmDialog.message}
            </div>

            {/* Modal Actions */}
            <div className="flex gap-3 px-5 py-4 border-t border-border bg-slate-50/50 dark:bg-slate-950/20">
              {confirmDialog.cancelText && (
                <button
                  type="button"
                  onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                  className="flex-1 h-11 flex items-center justify-center border border-border text-sm font-semibold rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-all active:scale-[0.98]"
                >
                  {confirmDialog.cancelText}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                  confirmDialog.onConfirm();
                }}
                className={`flex-1 h-11 flex items-center justify-center text-sm font-semibold rounded-lg transition-all active:scale-[0.98] ${
                  confirmDialog.type === "danger"
                    ? "bg-red-600 text-white hover:bg-red-500"
                    : confirmDialog.type === "warning"
                    ? "bg-amber-600 text-white hover:bg-amber-500"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                {confirmDialog.confirmText || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK CATALOG IMPORT WIZARD */}
      {isImportWizardOpen && canManageCatalog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-xl w-full max-w-4xl flex flex-col shadow-lg max-h-[92vh] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary" />
                <h3 className="font-outfit font-extrabold text-lg text-foreground">
                  Bulk Catalog Importer Wizard
                </h3>
              </div>
              {importStep !== 3 && (
                <button
                  onClick={() => setIsImportWizardOpen(false)}
                  className="w-11 h-11 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus:outline-none hover:bg-secondary transition-all"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Content Body */}
            <div className="flex-grow flex flex-col overflow-y-auto min-h-0 p-5 bg-slate-50/30 dark:bg-slate-950/20 overscroll-contain scrollbar-thin">
              {/* STEP 1: UPLOAD FILE */}
              {importStep === 1 && (
                <div className="flex-1 flex flex-col justify-center max-w-xl mx-auto w-full space-y-5 py-6">
                  <div className="text-center space-y-1">
                    <h4 className="font-outfit font-bold text-lg text-foreground">Upload your spreadsheet</h4>
                    <p className="text-xs text-muted-foreground">CSV and Excel (.xlsx) file formats are fully supported</p>
                  </div>

                  {/* Drag and Drop Zone */}
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={async (e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      setFileParsingError(null);
                      const file = e.dataTransfer.files?.[0];
                      if (file) {
                        try {
                          const parsed = await parseCatalogFile(file);
                          setParsedImportData(parsed);
                          setImportStep(2);
                        } catch (err: unknown) {
                          const errorMsg = err instanceof Error ? err.message : "Failed to parse spreadsheet catalog.";
                          setFileParsingError(errorMsg);
                        }
                      }
                    }}
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                      isDragging
                        ? "border-primary bg-primary/5 scale-[0.99]"
                        : "border-border hover:border-slate-400 dark:hover:border-slate-600 bg-card hover:bg-muted/10"
                    }`}
                    onClick={() => document.getElementById("catalog-file-input")?.click()}
                  >
                    <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-60 animate-pulse" />
                    <span className="block text-sm font-semibold text-foreground">
                      Drag and drop your file here, or <strong className="text-primary font-bold">browse</strong>
                    </span>
                    <span className="block text-[10px] text-muted-foreground mt-1">Maximum file size: 5MB</span>
                    <input
                      id="catalog-file-input"
                      type="file"
                      accept=".csv,.xlsx"
                      className="hidden"
                      onChange={async (e) => {
                        setFileParsingError(null);
                        const file = e.target.files?.[0];
                        if (file) {
                          try {
                            const parsed = await parseCatalogFile(file);
                            setParsedImportData(parsed);
                            setImportStep(2);
                          } catch (err: unknown) {
                            const errorMsg = err instanceof Error ? err.message : "Failed to parse spreadsheet catalog.";
                            setFileParsingError(errorMsg);
                          }
                        }
                      }}
                    />
                  </div>

                  {/* Parsing Error Box */}
                  {fileParsingError && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl p-4 text-xs flex items-start gap-2.5 animate-shake shrink-0">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{fileParsingError}</span>
                    </div>
                  )}

                  {/* Action Banner */}
                  <div className="flex flex-col sm:flex-row items-center justify-between border border-border bg-card p-4 rounded-xl gap-4 shadow-sm shrink-0">
                    <div className="flex items-center gap-3">
                      <Download className="w-5 h-5 text-primary shrink-0" />
                      <div className="text-left">
                        <span className="block text-xs font-semibold text-foreground leading-tight">Need a sample file?</span>
                        <span className="block text-[10px] text-muted-foreground mt-0.5">Download our pre-formatted catalog template</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={downloadCSVTemplate}
                      className="w-full sm:w-auto px-4 h-10 bg-primary text-primary-foreground text-xs font-semibold rounded-lg shadow hover:opacity-95 transition-all cursor-pointer shrink-0"
                    >
                      Download CSV Template
                    </button>
                  </div>

                  {/* Alias Column Guide */}
                  <div className="border border-border bg-card/60 p-4 rounded-xl text-left space-y-2 text-xs shadow-inner shrink-0">
                    <span className="block font-bold text-[10px] uppercase text-muted-foreground tracking-wider">
                      Forgiving Header Alias Column Guide
                    </span>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">
                      Our system automatically matches your spreadsheet column headers. The following aliases are accepted for required fields:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] font-mono mt-1 text-foreground">
                      <div>• Name $\rightarrow$ <span className="text-muted-foreground">Product, Item Name, Title</span></div>
                      <div>• Price $\rightarrow$ <span className="text-muted-foreground">Rate, MRP, Unit Price</span></div>
                      <div>• Category $\rightarrow$ <span className="text-muted-foreground">Cat, Type</span></div>
                      <div>• Stock $\rightarrow$ <span className="text-muted-foreground">Quantity, Qty, Initial Stock</span></div>
                      <div>• Size $\rightarrow$ <span className="text-muted-foreground">Size (exact matching)</span></div>
                      <div>• Color $\rightarrow$ <span className="text-muted-foreground">Colour</span></div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: PREVIEW grouped products & validation reports */}
              {importStep === 2 && parsedImportData && (
                <div className="flex-grow flex flex-col sm:overflow-hidden min-h-0 space-y-4">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
                    <div className="border border-border bg-card p-3 rounded-xl text-center shadow-sm">
                      <span className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Rows Checked</span>
                      <strong className="block text-lg font-bold text-foreground mt-0.5">{parsedImportData.stats.totalRows}</strong>
                    </div>
                    <div className="border border-border bg-card p-3 rounded-xl text-center shadow-sm">
                      <span className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Products Found</span>
                      <strong className="block text-lg font-bold text-foreground mt-0.5">{parsedImportData.stats.productCount}</strong>
                    </div>
                    <div className="border border-border bg-card p-3 rounded-xl text-center shadow-sm">
                      <span className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Variants Count</span>
                      <strong className="block text-lg font-bold text-foreground mt-0.5">{parsedImportData.stats.variantCount}</strong>
                    </div>
                    <div className="border border-border bg-card p-3 rounded-xl text-center shadow-sm">
                      <span className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Blocking Errors</span>
                      <strong className={`block text-lg font-bold mt-0.5 ${parsedImportData.errors.length > 0 ? "text-red-500 animate-pulse" : "text-emerald-500"}`}>
                        {parsedImportData.errors.length}
                      </strong>
                    </div>
                  </div>

                  {/* Errors / Warnings List Box */}
                  {(parsedImportData.errors.length > 0 || parsedImportData.warnings.length > 0) && (
                    <div className="border border-border bg-card p-4 rounded-xl space-y-2 shrink-0 max-h-[140px] overflow-y-auto overscroll-contain shadow-inner">
                      <span className="block font-bold text-[10px] uppercase text-amber-500 tracking-wider">
                        File Validation Logs ({parsedImportData.errors.length + parsedImportData.warnings.length})
                      </span>
                      <div className="space-y-1.5 text-left text-xs font-mono leading-normal">
                        {parsedImportData.errors.map((err, idx) => (
                          <div key={`err-${idx}`} className="text-red-500 flex items-start gap-1.5 leading-tight">
                            <span className="shrink-0 font-bold bg-red-500/10 px-1 rounded text-[10px]">Row {err.row}</span>
                            <span><strong>[{err.field}]:</strong> {err.message}</span>
                          </div>
                        ))}
                        {parsedImportData.warnings.map((warn, idx) => (
                          <div key={`warn-${idx}`} className="text-amber-500 flex items-start gap-1.5 leading-tight">
                            <span className="shrink-0 font-bold bg-amber-500/10 px-1 rounded text-[10px]">Row {warn.row}</span>
                            <span><strong>[{warn.field}]:</strong> {warn.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Product Group Accordion list */}
                  <div className="flex-1 border border-border bg-card rounded-xl overflow-hidden flex flex-col min-h-0 shadow-sm">
                    <div className="bg-slate-100 dark:bg-slate-900 px-4 py-2.5 border-b border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-left shrink-0">
                      Catalog Review & Grouping Directory
                    </div>
                    <div className="flex-1 overflow-y-auto divide-y divide-border overscroll-contain bg-white dark:bg-slate-950">
                      {parsedImportData.products.length === 0 ? (
                        <div className="text-center p-8 text-xs text-muted-foreground">No valid products to display.</div>
                      ) : (
                        parsedImportData.products.map((p, idx) => (
                          <div key={`p-group-${idx}`} className="group-preview">
                            <details className="group">
                              <summary className="flex justify-between items-center px-4 py-3.5 hover:bg-muted/10 cursor-pointer transition-colors text-left outline-none list-none [&::-webkit-details-marker]:hidden">
                                <div className="flex items-center gap-3">
                                  <ChevronRight className="w-4 h-4 text-muted-foreground group-open:rotate-90 transition-transform shrink-0" />
                                  <div>
                                    <span className="block text-sm font-semibold text-foreground leading-tight">{p.name}</span>
                                    <span className="block text-[10px] text-muted-foreground mt-0.5 leading-normal">
                                      Category: <strong className="text-foreground">{p.category}</strong> | Alert Limit: {p.lowStockThreshold}
                                    </span>
                                  </div>
                                </div>
                                <span className="text-[10px] px-2 py-0.5 rounded bg-secondary text-muted-foreground font-bold shrink-0">
                                  {p.variants.length} Variant{p.variants.length > 1 ? "s" : ""}
                                </span>
                              </summary>
                              
                              <div className="bg-slate-50/50 dark:bg-slate-900/10 border-t border-border px-4 py-3 overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse min-w-[500px]">
                                  <thead>
                                    <tr className="border-b border-border/60 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                                      <th className="py-1.5 pr-4">Variant SKU</th>
                                      <th className="py-1.5 pr-4">Size</th>
                                      <th className="py-1.5 pr-4">Color</th>
                                      <th className="py-1.5 pr-4 text-right">Price (NPR)</th>
                                      <th className="py-1.5 pr-4 text-center">Initial Stock</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-border/40 font-mono text-[11px] text-foreground">
                                    {p.variants.map((v, vIdx) => (
                                      <tr key={`v-${vIdx}`} className="hover:bg-muted/20">
                                        <td className="py-2 font-bold">{v.sku}</td>
                                        <td className="py-2 text-muted-foreground font-sans">{v.size}</td>
                                        <td className="py-2 text-muted-foreground font-sans">{v.color}</td>
                                        <td className="py-2 font-bold text-right">Rs. {v.price.toLocaleString()}</td>
                                        <td className="py-2 text-center font-bold">{v.stock}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </details>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => setImportStep(1)}
                      className="flex-1 h-11 flex items-center justify-center border border-border text-sm font-semibold rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-all cursor-pointer"
                    >
                      Upload Different File
                    </button>
                    <button
                      type="button"
                      disabled={parsedImportData.errors.length > 0 || parsedImportData.products.length === 0}
                      onClick={async () => {
                        setImportStep(3);
                        setImportProgress(0);
                        const results = await bulkImportProducts(parsedImportData.products, (current, total) => {
                          const percent = Math.round((current / total) * 100);
                          setImportProgress(percent);
                        });
                        setImportResults(results);
                        setImportStep(4);
                      }}
                      className="flex-1 h-11 flex items-center justify-center gap-1.5 bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:opacity-95 shadow transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {parsedImportData.errors.length > 0 ? (
                        <span>Resolve Errors to Import</span>
                      ) : (
                        <span>Import {parsedImportData.stats.productCount} Products</span>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: PROGRESS SCREEN */}
              {importStep === 3 && (
                <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full space-y-6 text-center py-10">
                  <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto opacity-80" />
                  <div className="space-y-2">
                    <h4 className="font-outfit font-bold text-lg text-foreground">Importing Catalog...</h4>
                    <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                      Uploading product listings, variants, and stock balances. Please do not close or refresh this tab.
                    </p>
                  </div>

                  {/* Touch targets compliant 44px height wrapper progress bar */}
                  <div className="h-11 flex items-center shrink-0 w-full px-4 border border-border bg-card rounded-xl shadow-inner">
                    <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
                      <div
                        className="bg-primary h-3 rounded-full transition-all duration-300 shadow-sm"
                        style={{ width: `${importProgress}%` }}
                      ></div>
                    </div>
                  </div>
                  <strong className="block text-sm font-mono text-foreground font-bold">{importProgress}% Completed</strong>
                </div>
              )}

              {/* STEP 4: RESULTS REPORT SCREEN */}
              {importStep === 4 && importResults && (
                <div className="flex-1 flex flex-col justify-center max-w-xl mx-auto w-full space-y-5 py-6">
                  <div className="text-center space-y-2">
                    <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-full w-fit mx-auto animate-bounce">
                      <CheckCircle className="w-10 h-10" />
                    </div>
                    <h4 className="font-outfit font-bold text-lg text-foreground">Import Processing Completed</h4>
                    <p className="text-xs text-muted-foreground">
                      The catalog batch file has been committed to the inventory database.
                    </p>
                  </div>

                  {/* Stats card */}
                  <div className="grid grid-cols-2 gap-3 border border-border bg-card p-4 rounded-xl text-center shadow-sm shrink-0">
                    <div>
                      <span className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Succeeded Products</span>
                      <strong className="block text-2xl font-bold text-emerald-500 mt-1">{importResults.succeededCount}</strong>
                    </div>
                    <div className="border-l border-border">
                      <span className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Failed Products</span>
                      <strong className={`block text-2xl font-bold mt-1 ${importResults.failedProducts.length > 0 ? "text-red-500 animate-pulse" : "text-muted-foreground"}`}>
                        {importResults.failedProducts.length}
                      </strong>
                    </div>
                  </div>

                  {/* Failure logs details */}
                  {importResults.failedProducts.length > 0 && (
                    <div className="border border-border bg-card p-4 rounded-xl space-y-2 shrink-0 max-h-[160px] overflow-y-auto overscroll-contain text-left shadow-inner">
                      <span className="block font-bold text-[10px] uppercase text-red-500 tracking-wider">
                        Failed Items Details ({importResults.failedProducts.length})
                      </span>
                      <div className="space-y-1.5 text-xs font-mono leading-normal">
                        {importResults.failedProducts.map((fail, idx) => (
                          <div key={`fail-${idx}`} className="text-red-500 flex items-start gap-2 leading-tight">
                            <span className="shrink-0 font-bold bg-red-500/10 px-1.5 py-0.5 rounded text-[10px]">{idx + 1}</span>
                            <span><strong>[{fail.name}]:</strong> {fail.error}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action completion button */}
                  <div className="flex flex-col sm:flex-row gap-3 w-full shrink-0">
                    {importResults.failedProducts.length > 0 && (
                      <button
                        type="button"
                        onClick={async () => {
                          const failedNames = new Set(importResults.failedProducts.map(f => f.name));
                          const retryList = parsedImportData?.products.filter(p => failedNames.has(p.name)) || [];
                          
                          setImportStep(3);
                          setImportProgress(0);
                          const results = await bulkImportProducts(retryList, (current, total) => {
                            const percent = Math.round((current / total) * 100);
                            setImportProgress(percent);
                          });
                          setImportResults(results);
                          setImportStep(4);
                        }}
                        className="flex-grow flex-1 h-11 flex items-center justify-center gap-1.5 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-500 shadow transition-all cursor-pointer font-sans"
                      >
                        <RefreshCw className="w-4 h-4 shrink-0 animate-spin-slow" />
                        <span>Retry Remaining ({importResults.failedProducts.length})</span>
                      </button>
                    )}
                    
                    <button
                      type="button"
                      onClick={() => {
                        setIsImportWizardOpen(false);
                        setImportStep(1);
                      }}
                      className="flex-grow flex-1 h-11 flex items-center justify-center bg-primary text-primary-foreground text-sm font-semibold rounded-lg hover:opacity-95 shadow transition-all cursor-pointer font-sans"
                    >
                      Finish & View Inventory
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
