import type { InvoiceItem, Product, ProductVariant } from "@/lib/store/types";

type FetchInvoiceItems = (invoiceId: string) => Promise<InvoiceItem[]>;

type ResolveReceiptInvoiceItemsInput = {
  fetchInvoiceItems: FetchInvoiceItems;
  invoiceId: string;
  invoiceItemsByInvoiceId: Record<string, InvoiceItem[]>;
  products: Product[];
  variants: ProductVariant[];
};

export async function resolveReceiptInvoiceItems({
  fetchInvoiceItems,
  invoiceId,
  invoiceItemsByInvoiceId,
  products,
  variants,
}: ResolveReceiptInvoiceItemsInput): Promise<InvoiceItem[]> {
  const cachedItems = invoiceItemsByInvoiceId[invoiceId] ?? [];
  const items = cachedItems.length > 0 ? cachedItems : await fetchInvoiceItems(invoiceId);

  return hydrateReceiptInvoiceItems(items, products, variants);
}

export function hydrateReceiptInvoiceItems(
  items: InvoiceItem[],
  products: Product[],
  variants: ProductVariant[],
): InvoiceItem[] {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const variantsById = new Map(variants.map((variant) => [variant.id, variant]));

  return items.map((item) => {
    if (!item.variant_id) {
      return {
        ...item,
        product_name: item.custom_name ?? "Custom Item",
        size: "-",
        color: "-",
      };
    }

    const variant = variantsById.get(item.variant_id);
    const product = variant ? productsById.get(variant.product_id) : undefined;

    return {
      ...item,
      product_name: product?.name ?? "Clothing Item",
      size: variant?.size ?? "-",
      color: variant?.color ?? "-",
    };
  });
}
