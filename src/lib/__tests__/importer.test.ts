import { describe, test, expect } from "vitest";
import {
  parseCSVLine,
  matchHeaders,
  generateAutoSKU,
  parseCatalogFile,
} from "../importer";

describe("importer unit tests", () => {
  describe("parseCSVLine", () => {
    test("should parse simple comma-separated values", () => {
      const line = "Oversized Linen Shirt,Tops,S,Black,1500,10,OVER-BLK-S";
      expect(parseCSVLine(line)).toEqual([
        "Oversized Linen Shirt",
        "Tops",
        "S",
        "Black",
        "1500",
        "10",
        "OVER-BLK-S",
      ]);
    });

    test("should support double-quote escapes containing commas", () => {
      const line = '"Linen Shirt, Oversized",Tops,S,Black,1500,10';
      expect(parseCSVLine(line)).toEqual([
        "Linen Shirt, Oversized",
        "Tops",
        "S",
        "Black",
        "1500",
        "10",
      ]);
    });

    test("should support escaped quotes within quotes", () => {
      const line = '"Shirt ""Premium""",Tops,S,Black,1500,10';
      expect(parseCSVLine(line)).toEqual([
        'Shirt "Premium"',
        "Tops",
        "S",
        "Black",
        "1500",
        "10",
      ]);
    });
  });

  describe("matchHeaders", () => {
    test("should match exact standard header names", () => {
      const headers = ["Product Name", "Category", "Size", "Color", "Price", "Stock", "SKU", "Low Stock Threshold"];
      const mapping = matchHeaders(headers);
      expect(mapping.name).toBe(0);
      expect(mapping.category).toBe(1);
      expect(mapping.size).toBe(2);
      expect(mapping.color).toBe(3);
      expect(mapping.price).toBe(4);
      expect(mapping.stock).toBe(5);
      expect(mapping.sku).toBe(6);
      expect(mapping.lowStockThreshold).toBe(7);
    });

    test("should match forgivable column aliases case-insensitively", () => {
      const headers = ["Item Name", "Cat", "Size", "Colour", "MRP", "QTY", "Barcode", "Reorder Level"];
      const mapping = matchHeaders(headers);
      expect(mapping.name).toBe(0);
      expect(mapping.category).toBe(1);
      expect(mapping.size).toBe(2);
      expect(mapping.color).toBe(3);
      expect(mapping.price).toBe(4);
      expect(mapping.stock).toBe(5);
      expect(mapping.sku).toBe(6);
      expect(mapping.lowStockThreshold).toBe(7);
    });
  });

  describe("generateAutoSKU", () => {
    test("should generate valid SKU based on product info", () => {
      const name = "Oversized Linen Shirt";
      const color = "Black";
      const size = "M";
      // Prefix: OVER (first 4 letters)
      // Color suffix: BLA (slice first 3 letters)
      // Size: M
      expect(generateAutoSKU(name, color, size)).toBe("OVER-BLA-M");
    });

    test("should handle alphanumeric clean-up correctly", () => {
      const name = "T-Shirt (V-Neck)";
      const color = "Olive Green";
      const size = "XL";
      // Prefix: TSHI (non-alphanumeric filtered: TShirtVNeck -> first 4: TSHI)
      // Color suffix: OLI (slice first 3 letters of Olive Green: OLI)
      // Size: XL
      expect(generateAutoSKU(name, color, size)).toBe("TSHI-OLI-XL");
    });
  });

  describe("parseCatalogFile - CSV integration tests", () => {
    test("should throw error for empty files", async () => {
      const file = new File([""], "empty.csv", { type: "text/csv" });
      await expect(parseCatalogFile(file)).rejects.toThrow("The file is empty.");
    });

    test("should throw error for missing required headers", async () => {
      const csvContent = "Product Name,Size,Color,Price,Stock\nShirt,S,Black,1000,5";
      const file = new File([csvContent], "missing_headers.csv", { type: "text/csv" });
      await expect(parseCatalogFile(file)).rejects.toThrow("Missing required catalog column headers: Category");
    });

    test("should parse and group valid product variant combinations successfully", async () => {
      const csvContent = `Product Name,Category,Size,Color,Price,Stock,SKU,Low Stock Threshold
Oversized Linen Shirt,Tops,S,Black,1500,10,OVER-BLK-S,3
Oversized Linen Shirt,Tops,M,Black,1500,15,OVER-BLK-M,3
Oversized Linen Shirt,Tops,L,Black,1500,12,OVER-BLK-L,3
Baggy Cargo Pants,Bottoms,28,Olive,2200,5,CARG-OLI-28,5
Baggy Cargo Pants,Bottoms,30,Olive,2200,8,CARG-OLI-30,5
`;
      const file = new File([csvContent], "valid_catalog.csv", { type: "text/csv" });
      const result = await parseCatalogFile(file);

      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.stats.totalRows).toBe(5);
      expect(result.stats.validRows).toBe(5);
      expect(result.stats.productCount).toBe(2);
      expect(result.stats.variantCount).toBe(5);

      // Verify Group 1: Oversized Linen Shirt
      const product1 = result.products.find((p) => p.name === "Oversized Linen Shirt");
      expect(product1).toBeDefined();
      expect(product1?.category).toBe("Tops");
      expect(product1?.lowStockThreshold).toBe(3);
      expect(product1?.variants).toHaveLength(3);
      expect(product1?.variants[0]).toEqual({
        size: "S",
        color: "Black",
        sku: "OVER-BLK-S",
        price: 1500,
        stock: 10,
      });

      // Verify Group 2: Baggy Cargo Pants
      const product2 = result.products.find((p) => p.name === "Baggy Cargo Pants");
      expect(product2).toBeDefined();
      expect(product2?.category).toBe("Bottoms");
      expect(product2?.lowStockThreshold).toBe(5);
      expect(product2?.variants).toHaveLength(2);
    });

    test("should report row validation errors and continue processing", async () => {
      const csvContent = `Product Name,Category,Size,Color,Price,Stock
,Tops,S,Black,1500,10
Oversized Linen Shirt,Tops,,Black,1500,10
Oversized Linen Shirt,Tops,S,,1500,10
Oversized Linen Shirt,Tops,S,Black,-200,10
Oversized Linen Shirt,Tops,S,Black,1500,abc
Oversized Linen Shirt,Tops,S,Black,1500,5.5
Oversized Linen Shirt,Tops,S,Black,1500,10
`;
      const file = new File([csvContent], "invalid_rows.csv", { type: "text/csv" });
      const result = await parseCatalogFile(file);

      expect(result.errors).toHaveLength(6);
      expect(result.stats.totalRows).toBe(7);
      expect(result.stats.validRows).toBe(1);
      expect(result.stats.errorRows).toBe(6);
      expect(result.products).toHaveLength(1);

      // Verify exact error messages
      expect(result.errors[0]).toEqual({ row: 2, field: "Product Name", message: "Product Title is required." });
      expect(result.errors[1]).toEqual({ row: 3, field: "Size", message: "Size is required." });
      expect(result.errors[2]).toEqual({ row: 4, field: "Color", message: "Color is required." });
      expect(result.errors[3]).toEqual({ row: 5, field: "Price", message: "Price must be a valid non-negative number." });
      expect(result.errors[4]).toEqual({ row: 6, field: "Stock", message: "Stock must be a valid non-negative integer." });
      expect(result.errors[5]).toEqual({ row: 7, field: "Stock", message: "Stock must be a valid non-negative integer." });
    });

    test("should report warning for unknown category and truncate long strings", async () => {
      const veryLongName = "A".repeat(200);
      const csvContent = `Product Name,Category,Size,Color,Price,Stock
Oversized Linen Shirt,Dresses,S,Black,1500,10
${veryLongName},Tops,S,Black,1500,10
`;
      const file = new File([csvContent], "warnings.csv", { type: "text/csv" });
      const result = await parseCatalogFile(file);

      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(2);
      expect(result.stats.validRows).toBe(2);

      // Warning 1: Unknown Category
      expect(result.warnings[0]).toEqual({
        row: 2,
        field: "Category",
        message: '"Dresses" is not standard. It will be imported but may require UI category matching.',
      });

      // Warning 2: Truncated Title
      expect(result.warnings[1].field).toBe("Product Name");
      expect(result.warnings[1].message).toContain("truncated");
      expect(result.products[1].name).toHaveLength(150);
    });

    test("should catch duplicate SKUs inside the file as blocking errors", async () => {
      const csvContent = `Product Name,Category,Size,Color,Price,Stock,SKU
Oversized Linen Shirt,Tops,S,Black,1500,10,DUPLICATE-SKU-1
Baggy Cargo Pants,Bottoms,M,Blue,2000,5,DUPLICATE-SKU-1
`;
      const file = new File([csvContent], "duplicate_skus.csv", { type: "text/csv" });
      const result = await parseCatalogFile(file);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        row: 3,
        field: "SKU",
        message: 'Duplicate SKU code "DUPLICATE-SKU-1" found within the uploaded catalog file.',
      });
      expect(result.stats.errorRows).toBe(1);
      expect(result.stats.validRows).toBe(1);
    });

    test("should successfully parse prices and stocks with currency formatting, symbols, and commas", async () => {
      const csvContent = `Product Name,Category,Size,Color,Price,Stock
Nepal Hoodie,Tops,M,Black,"Rs. 1,500.50","1,000"
Nepal Cargo,Bottoms,L,Green,"NPR 2,500",250
`;
      const file = new File([csvContent], "formatted_numbers.csv", { type: "text/csv" });
      const result = await parseCatalogFile(file);

      expect(result.errors).toHaveLength(0);
      expect(result.stats.validRows).toBe(2);

      const product1 = result.products.find(p => p.name === "Nepal Hoodie");
      expect(product1).toBeDefined();
      expect(product1?.variants[0].price).toBe(1500.5);
      expect(product1?.variants[0].stock).toBe(1000);

      const product2 = result.products.find(p => p.name === "Nepal Cargo");
      expect(product2?.variants[0].price).toBe(2500);
      expect(product2?.variants[0].stock).toBe(250);
    });

    test("should safely generate unique auto SKUs for Nepali / pure Unicode product names", () => {
      const name1 = "कुर्ता सुरुवाल";
      const name2 = "मखमली जुत्ता";
      
      const sku1 = generateAutoSKU(name1, "Black", "M");
      const sku2 = generateAutoSKU(name2, "Black", "M");
      
      expect(sku1).not.toBe("-BLA-M");
      expect(sku1).toContain("-BLA-M");
      expect(sku2).not.toBe("-BLA-M");
      expect(sku2).toContain("-BLA-M");
      expect(sku1).not.toBe(sku2); // Verify collision is avoided!
    });
  });
});
