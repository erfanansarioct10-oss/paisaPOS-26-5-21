import type { Invoice, Product, ProductVariant } from "@/lib/store/types";

type BuildDashboardMetricsInput = {
  invoices: Invoice[];
  products: Product[];
  variants: ProductVariant[];
  now?: Date;
};

export type DashboardMetrics = {
  lowStockCount: number;
  lowStockVariants: ProductVariant[];
  outOfStockCount: number;
  productCount: number;
  todayInvoicesCount: number;
  todaySalesSum: number;
  variantCount: number;
};

export function buildDashboardMetrics({
  invoices,
  products,
  variants,
  now = new Date(),
}: BuildDashboardMetricsInput): DashboardMetrics {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const todayInvoices = invoices.filter((invoice) => new Date(invoice.created_at) >= todayStart);
  const lowStockVariants = variants.filter((variant) => {
    const parent = productsById.get(variant.product_id);
    const threshold = parent?.low_stock_threshold ?? 5;
    const stock = variant.stock ?? 0;
    return stock <= threshold;
  });

  return {
    lowStockCount: lowStockVariants.length,
    lowStockVariants,
    outOfStockCount: variants.filter((variant) => (variant.stock ?? 0) === 0).length,
    productCount: products.length,
    todayInvoicesCount: todayInvoices.length,
    todaySalesSum: todayInvoices.reduce((sum, invoice) => sum + invoice.total_amount, 0),
    variantCount: variants.length,
  };
}
