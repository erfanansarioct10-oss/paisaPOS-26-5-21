"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAppStore, type Product, type ProductVariant } from "@/lib/store/useAppStore";
import { getStaffCapabilities, hasActiveDelegatedPrivilege } from "@/lib/staff-capabilities";
import { InventoryConfirmDialog, type InventoryConfirmDialogState } from "@/features/inventory/components/inventory-confirm-dialog";
import { InventoryDelegationNotice } from "@/features/inventory/components/inventory-delegation-notice";
import { InventoryEditProductModal } from "@/features/inventory/components/inventory-edit-product-modal";
import { InventoryErrorStrip } from "@/features/inventory/components/inventory-error-strip";
import { InventoryImportWizard } from "@/features/inventory/components/inventory-import-wizard";
import { InventoryPageHeader } from "@/features/inventory/components/inventory-page-header";
import { InventoryProductDirectory } from "@/features/inventory/components/inventory-product-directory";
import { InventoryQuickProductWizard } from "@/features/inventory/components/inventory-quick-product-wizard";
import type { EditVariant, GeneratedVariant } from "@/features/inventory/components/inventory-ui-types";

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
  const activeCatalogDelegation = activeDelegations.find((delegation) =>
    hasActiveDelegatedPrivilege(user, "catalog.manage", [delegation]),
  );
  const activeInventoryDelegation = activeDelegations.find((delegation) =>
    hasActiveDelegatedPrivilege(user, "inventory.adjust", [delegation]),
  );
  const canManageCatalog = capabilities.canManageCatalog || Boolean(activeCatalogDelegation);
  const canAdjustInventory = capabilities.canAdjustInventory || Boolean(activeInventoryDelegation);

  const [isOpen, setIsOpen] = useState(false);
  const [isImportWizardOpen, setIsImportWizardOpen] = useState(false);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<InventoryConfirmDialogState>({
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
    cancelText?: string,
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

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("add") === "true") {
        if (canManageCatalog) {
          setTimeout(() => {
            setIsOpen(true);
          }, 0);
        }

        const newUrl = window.location.pathname;
        window.history.replaceState({ path: newUrl }, "", newUrl);
      }
    }
  }, [canManageCatalog]);

  const [prodName, setProdName] = useState("");
  const [category, setCategory] = useState("Tops");
  const [lowStockThreshold, setLowStockThreshold] = useState(5);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("Tops");
  const [editLowStock, setEditLowStock] = useState(5);
  const [editVariants, setEditVariants] = useState<EditVariant[]>([]);
  const [deletedVariantIds, setDeletedVariantIds] = useState<string[]>([]);

  useEffect(() => {
    clearError();
  }, [isOpen, isEditOpen, clearError]);

  const [sizeInput, setSizeInput] = useState("S, M, L");
  const [colorInput, setColorInput] = useState("Black, White");
  const [basePrice, setBasePrice] = useState(1500);
  const [baseStock, setBaseStock] = useState(10);
  const [generatedVariants, setGeneratedVariants] = useState<GeneratedVariant[]>([]);

  const toggleRow = (productId: string) => {
    setExpandedProduct(expandedProduct === productId ? null : productId);
  };

  const generateMatrix = useCallback(() => {
    if (!prodName) return;

    const sizes = sizeInput
      .split(",")
      .map((size) => size.trim())
      .filter((size) => size.length > 0);
    const colors = colorInput
      .split(",")
      .map((color) => color.trim())
      .filter((color) => color.length > 0);

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

  useEffect(() => {
    if (prodName && isOpen) {
      const timer = setTimeout(() => {
        generateMatrix();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [prodName, isOpen, generateMatrix]);

  const updateGeneratedCell = (index: number, key: keyof GeneratedVariant, value: string | number) => {
    setGeneratedVariants(
      generatedVariants.map((item, idx) =>
        idx === index ? { ...item, [key]: value } : item,
      ),
    );
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();

    // Guard against double-submission from Enter key while save is in flight
    if (isLoading) return;
    if (!prodName || generatedVariants.length === 0) return;

    // Enforce low stock threshold minimum validation (minimum 1)
    const validatedThreshold = Math.max(1, lowStockThreshold || 1);

    const success = await addProduct(
      prodName,
      category,
      validatedThreshold,
      generatedVariants,
    );

    if (success) {
      setProdName("");
      setSizeInput("S, M, L");
      setColorInput("Black, White");
      setBasePrice(1500);
      setBaseStock(10);
      setGeneratedVariants([]);
      setIsOpen(false);
    }
  };

  const handleOpenEdit = (product: Product, productVariants: ProductVariant[]) => {
    setEditProductId(product.id);
    setEditName(product.name);
    setEditCategory(product.category);
    setEditLowStock(product.low_stock_threshold);
    setEditVariants(
      productVariants.map((variant) => ({
        id: variant.id,
        size: variant.size,
        color: variant.color,
        sku: variant.sku,
        price: variant.price,
        stock: variant.stock ?? 0,
      })),
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

  const handleSaveEdit = async (event: FormEvent) => {
    event.preventDefault();

    // Guard against double-submission from Enter key while save is in flight
    if (isLoading) return;
    if (!editProductId || !editName || editVariants.length === 0) return;

    const invalid = editVariants.some(
      (variant) => !variant.size || !variant.color || !variant.sku || variant.price < 0 || variant.stock < 0,
    );
    if (invalid) {
      handleShowConfirm(
        "Validation Error",
        "All variants must have size, color, sku, and non-negative price/stock values.",
        () => {},
        "warning",
        "OK",
      );
      return;
    }

    const success = await updateProduct(
      editProductId,
      editName,
      editCategory,
      Math.max(1, editLowStock || 1),
      editVariants,
      deletedVariantIds,
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
      <InventoryPageHeader
        canManageCatalog={canManageCatalog}
        onAddProduct={() => setIsOpen(true)}
        onImportCatalog={() => setIsImportWizardOpen(true)}
      />

      <InventoryErrorStrip errorMsg={errorMsg} />

      {activeInventoryDelegation && <InventoryDelegationNotice delegation={activeInventoryDelegation} />}
      {activeCatalogDelegation && <InventoryDelegationNotice delegation={activeCatalogDelegation} />}

      <InventoryProductDirectory
        canAdjustInventory={canAdjustInventory}
        canManageCatalog={canManageCatalog}
        expandedProduct={expandedProduct}
        onDeleteProduct={deleteProduct}
        onEditProduct={handleOpenEdit}
        onShowConfirm={handleShowConfirm}
        onToggleFavorite={toggleProductFavorite}
        onToggleRow={toggleRow}
        onUpdateStock={updateStockDirect}
        products={products}
        variants={variants}
      />

      <InventoryQuickProductWizard
        basePrice={basePrice}
        baseStock={baseStock}
        canManageCatalog={canManageCatalog}
        category={category}
        colorInput={colorInput}
        errorMsg={errorMsg}
        generatedVariants={generatedVariants}
        isLoading={isLoading}
        isOpen={isOpen}
        lowStockThreshold={lowStockThreshold}
        onClose={() => setIsOpen(false)}
        onSave={handleSave}
        onUpdateGeneratedCell={updateGeneratedCell}
        prodName={prodName}
        setBasePrice={setBasePrice}
        setBaseStock={setBaseStock}
        setCategory={setCategory}
        setColorInput={setColorInput}
        setLowStockThreshold={setLowStockThreshold}
        setProdName={setProdName}
        setSizeInput={setSizeInput}
        sizeInput={sizeInput}
      />

      <InventoryEditProductModal
        canManageCatalog={canManageCatalog}
        deletedVariantIds={deletedVariantIds}
        editCategory={editCategory}
        editLowStock={editLowStock}
        editName={editName}
        editVariants={editVariants}
        errorMsg={errorMsg}
        isLoading={isLoading}
        isOpen={isEditOpen}
        onAddCustomVariant={handleAddCustomVariant}
        onClose={() => setIsEditOpen(false)}
        onSave={handleSaveEdit}
        setDeletedVariantIds={setDeletedVariantIds}
        setEditCategory={setEditCategory}
        setEditLowStock={setEditLowStock}
        setEditName={setEditName}
        setEditVariants={setEditVariants}
      />

      <InventoryConfirmDialog
        dialog={confirmDialog}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
      />

      {isImportWizardOpen && (
        <InventoryImportWizard
          bulkImportProducts={bulkImportProducts}
          canManageCatalog={canManageCatalog}
          isOpen={isImportWizardOpen}
          onClose={() => setIsImportWizardOpen(false)}
        />
      )}
    </div>
  );
}
