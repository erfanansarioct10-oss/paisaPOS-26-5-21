"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";
import {
  parseCatalogFile,
  type ParsedImport,
  type ParsedProduct,
} from "@/features/inventory/import/catalog-parser";
import type {
  InventoryImportResults,
  InventoryImportStep,
} from "@/features/inventory/components/inventory-ui-types";

type InventoryImportWizardProps = {
  bulkImportProducts: (
    parsedProducts: ParsedProduct[],
    onProgress?: (current: number, total: number) => void,
  ) => Promise<InventoryImportResults>;
  canManageCatalog: boolean;
  isOpen: boolean;
  onClose: () => void;
};

export function InventoryImportWizard({
  bulkImportProducts,
  canManageCatalog,
  isOpen,
  onClose,
}: InventoryImportWizardProps) {
  const [importStep, setImportStep] = useState<InventoryImportStep>(1);
  const [parsedImportData, setParsedImportData] = useState<ParsedImport | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<InventoryImportResults | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileParsingError, setFileParsingError] = useState<string | null>(null);

  if (!isOpen || !canManageCatalog) return null;

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

  const handleCatalogFile = async (file: File) => {
    try {
      const parsed = await parseCatalogFile(file);
      setParsedImportData(parsed);
      setImportStep(2);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to parse spreadsheet catalog.";
      setFileParsingError(errorMsg);
    }
  };

  const handleImportProducts = async () => {
    if (!parsedImportData) return;

    setImportStep(3);
    setImportProgress(0);
    const results = await bulkImportProducts(parsedImportData.products, (current, total) => {
      const percent = Math.round((current / total) * 100);
      setImportProgress(percent);
    });
    setImportResults(results);
    setImportStep(4);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-xl w-full max-w-4xl flex flex-col shadow-lg max-h-[92vh] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            <h3 className="font-outfit font-extrabold text-lg text-foreground">
              Bulk Catalog Importer Wizard
            </h3>
          </div>
          {importStep !== 3 && (
            <button
              onClick={onClose}
              className="w-11 h-11 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground focus:outline-none hover:bg-secondary transition-all"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="flex-grow flex flex-col overflow-y-auto min-h-0 p-5 bg-slate-50/30 dark:bg-slate-950/20 overscroll-contain scrollbar-thin">
          {importStep === 1 && (
            <div className="flex-1 flex flex-col justify-center max-w-xl mx-auto w-full space-y-5 py-6">
              <div className="text-center space-y-1">
                <h4 className="font-outfit font-bold text-lg text-foreground">Upload your spreadsheet</h4>
                <p className="text-xs text-muted-foreground">CSV and Excel (.xlsx) file formats are fully supported</p>
              </div>

              <div
                onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragging(false);
                  setFileParsingError(null);
                  const file = event.dataTransfer.files?.[0];
                  if (file) {
                    void handleCatalogFile(file);
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
                  onChange={(event) => {
                    setFileParsingError(null);
                    const file = event.target.files?.[0];
                    if (file) {
                      void handleCatalogFile(file);
                    }
                  }}
                />
              </div>

              {fileParsingError && (
                <div className="bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl p-4 text-xs flex items-start gap-2.5 animate-shake shrink-0">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{fileParsingError}</span>
                </div>
              )}

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

              <div className="border border-border bg-card/60 p-4 rounded-xl text-left space-y-2 text-xs shadow-inner shrink-0">
                <span className="block font-bold text-[10px] uppercase text-muted-foreground tracking-wider">
                  Forgiving Header Alias Column Guide
                </span>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Our system automatically matches your spreadsheet column headers. The following aliases are accepted for required fields:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[11px] font-mono mt-1 text-foreground">
                  <div>â€¢ Name $\rightarrow$ <span className="text-muted-foreground">Product, Item Name, Title</span></div>
                  <div>â€¢ Price $\rightarrow$ <span className="text-muted-foreground">Rate, MRP, Unit Price</span></div>
                  <div>â€¢ Category $\rightarrow$ <span className="text-muted-foreground">Cat, Type</span></div>
                  <div>â€¢ Stock $\rightarrow$ <span className="text-muted-foreground">Quantity, Qty, Initial Stock</span></div>
                  <div>â€¢ Size $\rightarrow$ <span className="text-muted-foreground">Size (exact matching)</span></div>
                  <div>â€¢ Color $\rightarrow$ <span className="text-muted-foreground">Colour</span></div>
                </div>
              </div>
            </div>
          )}

          {importStep === 2 && parsedImportData && (
            <div className="flex-grow flex flex-col sm:overflow-hidden min-h-0 space-y-4">
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

              <div className="flex-1 border border-border bg-card rounded-xl overflow-hidden flex flex-col min-h-0 shadow-sm">
                <div className="bg-slate-100 dark:bg-slate-900 px-4 py-2.5 border-b border-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-left shrink-0">
                  Catalog Review & Grouping Directory
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-border overscroll-contain bg-white dark:bg-slate-950">
                  {parsedImportData.products.length === 0 ? (
                    <div className="text-center p-8 text-xs text-muted-foreground">No valid products to display.</div>
                  ) : (
                    parsedImportData.products.map((product, idx) => (
                      <div key={`p-group-${idx}`} className="group-preview">
                        <details className="group">
                          <summary className="flex justify-between items-center px-4 py-3.5 hover:bg-muted/10 cursor-pointer transition-colors text-left outline-none list-none [&::-webkit-details-marker]:hidden">
                            <div className="flex items-center gap-3">
                              <ChevronRight className="w-4 h-4 text-muted-foreground group-open:rotate-90 transition-transform shrink-0" />
                              <div>
                                <span className="block text-sm font-semibold text-foreground leading-tight">{product.name}</span>
                                <span className="block text-[10px] text-muted-foreground mt-0.5 leading-normal">
                                  Category: <strong className="text-foreground">{product.category}</strong> | Alert Limit: {product.lowStockThreshold}
                                </span>
                              </div>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-secondary text-muted-foreground font-bold shrink-0">
                              {product.variants.length} Variant{product.variants.length > 1 ? "s" : ""}
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
                                {product.variants.map((variant, variantIdx) => (
                                  <tr key={`v-${variantIdx}`} className="hover:bg-muted/20">
                                    <td className="py-2 font-bold">{variant.sku}</td>
                                    <td className="py-2 text-muted-foreground font-sans">{variant.size}</td>
                                    <td className="py-2 text-muted-foreground font-sans">{variant.color}</td>
                                    <td className="py-2 font-bold text-right">Rs. {variant.price.toLocaleString()}</td>
                                    <td className="py-2 text-center font-bold">{variant.stock}</td>
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
                  onClick={() => {
                    void handleImportProducts();
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

          {importStep === 3 && (
            <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full space-y-6 text-center py-10">
              <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto opacity-80" />
              <div className="space-y-2">
                <h4 className="font-outfit font-bold text-lg text-foreground">Importing Catalog...</h4>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  Uploading product listings, variants, and stock balances. Please do not close or refresh this tab.
                </p>
              </div>

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

              <div className="flex flex-col sm:flex-row gap-3 w-full shrink-0">
                {importResults.failedProducts.length > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      const failedNames = new Set(importResults.failedProducts.map((fail) => fail.name));
                      const retryList = parsedImportData?.products.filter((product) => failedNames.has(product.name)) || [];

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
                    setImportStep(1);
                    onClose();
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
  );
}
