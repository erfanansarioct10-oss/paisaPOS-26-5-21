export interface GeneratedVariant {
  size: string;
  color: string;
  sku: string;
  price: number;
  stock: number;
}

export interface EditVariant {
  id?: string;
  size: string;
  color: string;
  sku: string;
  price: number;
  stock: number;
}

export type InventoryImportStep = 1 | 2 | 3 | 4;

export interface InventoryImportResults {
  succeededCount: number;
  failedProducts: Array<{ name: string; error: string }>;
}
