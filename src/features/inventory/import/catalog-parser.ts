import { sanitizeString, sanitizeCSVCell } from "@/lib/security";

export interface ParsedVariant {
  size: string;
  color: string;
  sku: string;
  price: number;
  stock: number;
}

export interface ParsedProduct {
  name: string;
  category: string;
  lowStockThreshold: number;
  variants: ParsedVariant[];
}

export interface ImportError {
  row: number;
  field: string;
  message: string;
}

export interface ImportWarning {
  row: number;
  field: string;
  message: string;
}

export interface ParsedImport {
  products: ParsedProduct[];
  errors: ImportError[];
  warnings: ImportWarning[];
  stats: {
    totalRows: number;
    validRows: number;
    errorRows: number;
    productCount: number;
    variantCount: number;
  };
}

const COLUMN_MAPPINGS: Record<string, string[]> = {
  name: ["product name", "name", "product", "item name", "item", "title"],
  category: ["category", "cat", "type"],
  size: ["size"],
  color: ["color", "colour"],
  price: ["price", "unit price", "mrp", "rate"],
  stock: ["stock", "quantity", "qty", "initial stock"],
  sku: ["sku", "sku code", "item code", "barcode"],
  lowStockThreshold: ["low stock threshold", "alert limit", "reorder level"],
};

const STANDARD_CATEGORIES = new Set([
  "outerwear",
  "bottoms",
  "tops",
  "traditional",
  "accessories",
]);

/**
 * Standard CSV line parser supporting double-quote escapes.
 */
export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // Skip the escaped double quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Full CSV text parser supporting quoted multi-line fields.
 */
export function parseCSVText(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++; // Skip escaped double quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = "";
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = "";
      if (currentRow.length > 0 && !currentRow.every(cell => cell === "")) {
        rows.push(currentRow);
      }
      currentRow = [];
      if (char === '\r' && nextChar === '\n') {
        i++; // Skip LF in CRLF
      }
    } else {
      currentField += char;
    }
  }

  // Handle final row and field
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.length > 0 && !currentRow.every(cell => cell === "")) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Normalizes headers and returns a mapping of standard field names to their index in the row.
 */
export function matchHeaders(headers: string[]): Record<string, number> {
  const matched: Record<string, number> = {};
  
  headers.forEach((header, index) => {
    const cleanHeader = header.toLowerCase().trim();
    for (const [field, aliases] of Object.entries(COLUMN_MAPPINGS)) {
      if (aliases.includes(cleanHeader)) {
        matched[field] = index;
        break;
      }
    }
  });
  
  return matched;
}

/**
 * Strips currency symbols, thousands separators, and spaces.
 */
export function cleanNumericString(str: string): string {
  return str
    .replace(/rs\.?/gi, "")
    .replace(/npr/gi, "")
    .replace(/,/g, "")
    .trim();
}

/**
 * Auto-generates a standard SKU using product details.
 */
export function generateAutoSKU(productName: string, color: string, size: string): string {
  let cleanName = productName
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
    
  // Fallback if the name is pure Unicode (Nepali text, etc.)
  if (cleanName.length < 2) {
    let codeHash = 0;
    for (let j = 0; j < productName.length; j++) {
      codeHash = (codeHash << 5) - codeHash + productName.charCodeAt(j);
      codeHash |= 0; // Convert to 32-bit integer
    }
    cleanName = "I" + Math.abs(codeHash).toString(36).toUpperCase();
  }

  const prefix = cleanName.slice(0, 4);
  const skuSize = size.toUpperCase().replace(/\s/g, "");
  const skuColor = color.toUpperCase().slice(0, 3).replace(/\s/g, "");
  return `${prefix}-${skuColor}-${skuSize}`;
}

/**
 * Core Catalog File Parser
 */
export async function parseCatalogFile(file: File): Promise<ParsedImport> {
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("File size exceeds the maximum limit of 5MB.");
  }

  const errors: ImportError[] = [];
  const warnings: ImportWarning[] = [];
  const stats = {
    totalRows: 0,
    validRows: 0,
    errorRows: 0,
    productCount: 0,
    variantCount: 0,
  };

  let rawRows: string[][] = [];
  const fileType = file.name.split(".").pop()?.toLowerCase();

  if (fileType === "xlsx") {
    const { readSheet } = await import("read-excel-file/browser");
    const sheetData = await readSheet(file, 1);
    rawRows = sheetData.map((row) =>
      row.map((cell) => cell === null || cell === undefined ? "" : String(cell).trim())
    );
  } else if (fileType === "csv") {
    const text = await file.text();
    rawRows = parseCSVText(text);
  } else {
    throw new Error("Unsupported file format. Please upload a .csv or .xlsx catalog.");
  }

  if (rawRows.length === 0) {
    throw new Error("The file is empty.");
  }

  const headers = rawRows[0] || [];
  const headerMap = matchHeaders(headers);

  // Validate required headers
  const requiredFields = ["name", "category", "size", "color", "price", "stock"];
  const missingFields = requiredFields.filter((field) => headerMap[field] === undefined);

  if (missingFields.length > 0) {
    const userFriendlyMissing = missingFields
      .map((f) => f.charAt(0).toUpperCase() + f.slice(1))
      .join(", ");
    throw new Error(`Missing required catalog column headers: ${userFriendlyMissing}. Please use the template.`);
  }

  const uniqueSkusInFile = new Set<string>();
  const productGroupMap = new Map<string, ParsedProduct>();

  // Process rows (starting from row index 1 to skip headers)
  for (let i = 1; i < rawRows.length; i++) {
    const row = rawRows[i];
    if (!row || row.length === 0 || row.every((cell) => cell === "")) {
      continue; // Skip empty rows silently
    }

    stats.totalRows++;

    const getVal = (field: string): string => {
      const idx = headerMap[field];
      return idx !== undefined && row[idx] !== undefined ? row[idx].trim() : "";
    };

    const rawName = sanitizeCSVCell(getVal("name"));
    const rawCategory = sanitizeCSVCell(getVal("category"));
    const rawSize = sanitizeCSVCell(getVal("size"));
    const rawColor = sanitizeCSVCell(getVal("color"));
    const rawPriceStr = sanitizeString(getVal("price"));
    const rawStockStr = sanitizeString(getVal("stock"));
    const rawSku = sanitizeCSVCell(getVal("sku"));
    const rawThresholdStr = sanitizeString(getVal("lowStockThreshold"));

    const rowNumber = i + 1; // 1-indexed spreadsheet row number

    // Required Field Validations
    if (!rawName) {
      errors.push({ row: rowNumber, field: "Product Name", message: "Product Title is required." });
      stats.errorRows++;
      continue;
    }
    if (!rawSize) {
      errors.push({ row: rowNumber, field: "Size", message: "Size is required." });
      stats.errorRows++;
      continue;
    }
    if (!rawColor) {
      errors.push({ row: rowNumber, field: "Color", message: "Color is required." });
      stats.errorRows++;
      continue;
    }

    // Number conversions and validations
    const cleanPriceStr = cleanNumericString(rawPriceStr);
    const price = cleanPriceStr === "" ? NaN : Number(cleanPriceStr);
    if (rawPriceStr === "" || isNaN(price) || price < 0) {
      errors.push({ row: rowNumber, field: "Price", message: "Price must be a valid non-negative number." });
      stats.errorRows++;
      continue;
    }

    const cleanStockStr = cleanNumericString(rawStockStr);
    const stock = cleanStockStr === "" ? NaN : Number(cleanStockStr);
    if (rawStockStr === "" || isNaN(stock) || !Number.isInteger(stock) || stock < 0) {
      errors.push({ row: rowNumber, field: "Stock", message: "Stock must be a valid non-negative integer." });
      stats.errorRows++;
      continue;
    }

    let lowStockThreshold = 5;
    if (rawThresholdStr !== "") {
      const parsedThreshold = Number(rawThresholdStr);
      if (!isNaN(parsedThreshold) && Number.isInteger(parsedThreshold) && parsedThreshold >= 0) {
        lowStockThreshold = parsedThreshold;
      } else {
        warnings.push({ row: rowNumber, field: "Low Stock Threshold", message: "Invalid threshold value. Defaulting to 5." });
      }
    }

    // Standard warnings & truncations
    let name = rawName;
    if (name.length > 150) {
      name = name.slice(0, 150);
      warnings.push({ row: rowNumber, field: "Product Name", message: "Name exceeded 150 characters and was truncated." });
    }

    const category = rawCategory || "Tops";
    if (!STANDARD_CATEGORIES.has(category.toLowerCase())) {
      warnings.push({ row: rowNumber, field: "Category", message: `"${category}" is not standard. It will be imported but may require UI category matching.` });
    }

    // SKU Generation & Unique constraints
    let sku = rawSku;
    if (!sku) {
      const baseSku = generateAutoSKU(name, rawColor, rawSize);
      sku = baseSku;
      let collisionCounter = 0;
      while (uniqueSkusInFile.has(sku.toUpperCase())) {
        collisionCounter++;
        sku = `${baseSku}-${collisionCounter}`;
      }
    } else {
      sku = sku.toUpperCase().replace(/[^A-Z0-9-_]/g, "");
      if (sku.length > 100) {
        sku = sku.slice(0, 100);
        warnings.push({ row: rowNumber, field: "SKU", message: "SKU code exceeded 100 characters and was truncated." });
      }
    }

    const upperSku = sku.toUpperCase();
    if (uniqueSkusInFile.has(upperSku)) {
      errors.push({ row: rowNumber, field: "SKU", message: `Duplicate SKU code "${sku}" found within the uploaded catalog file.` });
      stats.errorRows++;
      continue;
    }
    uniqueSkusInFile.add(upperSku);

    // Grouping into Product object
    const groupKey = `${name.toLowerCase().trim()}|${category.toLowerCase().trim()}`;
    let product = productGroupMap.get(groupKey);

    if (!product) {
      product = {
        name,
        category,
        lowStockThreshold,
        variants: [],
      };
      productGroupMap.set(groupKey, product);
    }

    product.variants.push({
      size: rawSize,
      color: rawColor,
      sku,
      price,
      stock,
    });

    stats.validRows++;
    stats.variantCount++;
  }

  stats.productCount = productGroupMap.size;

  return {
    products: Array.from(productGroupMap.values()),
    errors,
    warnings,
    stats,
  };
}
