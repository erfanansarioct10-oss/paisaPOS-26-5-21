import { z } from "zod";

const syncCheckoutSchema = z.object({
  invoices: z.array(z.any()),
  variants: z.array(z.any()),
  invoiceItems: z.array(z.any()),
});

const syncStockDirectSchema = z.object({
  variants: z.array(z.any()),
});

const syncProductSchema = z.object({
  products: z.array(z.any()),
  variants: z.array(z.any()),
});

export const broadcastMessageSchema = z.object({
  type: z.enum([
    "SYNC_CHECKOUT",
    "SYNC_STOCK_DIRECT",
    "SYNC_PRODUCT_ADD",
    "SYNC_PRODUCT_DELETE",
    "SYNC_PRODUCT_UPDATE"
  ]),
  payload: z.any(),
  token: z.string()
});

export function getSyncToken() {
  if (typeof document === 'undefined') return '';
  let token = document.cookie.split('; ').find(row => row.startsWith('paisapos_sync_token='))?.split('=')[1];
  if (!token) {
    token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    document.cookie = `paisapos_sync_token=${token}; path=/; SameSite=Lax; Secure`;
  }
  return token;
}

export function verifyAndDecryptBroadcast(event: MessageEvent) {
  const parsed = broadcastMessageSchema.safeParse(event.data);
  if (!parsed.success) {
    console.error("Invalid broadcast message format:", parsed.error);
    return null;
  }

  const { type, payload, token } = parsed.data;

  // Validate the secret token
  if (token !== getSyncToken()) {
    console.error("Broadcast sync token verification failed.");
    return null;
  }

  // Validate payload structures based on type
  if (type === "SYNC_CHECKOUT") {
    if (!syncCheckoutSchema.safeParse(payload).success) return null;
  } else if (type === "SYNC_STOCK_DIRECT") {
    if (!syncStockDirectSchema.safeParse(payload).success) return null;
  } else if (
    type === "SYNC_PRODUCT_ADD" ||
    type === "SYNC_PRODUCT_DELETE" ||
    type === "SYNC_PRODUCT_UPDATE"
  ) {
    if (!syncProductSchema.safeParse(payload).success) return null;
  }

  return { type, payload };
}
