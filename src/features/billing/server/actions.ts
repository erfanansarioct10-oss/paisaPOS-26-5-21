"use server";

import { checkoutAction as checkoutActionImpl } from "@/app/actions";

export async function checkoutAction(...args: Parameters<typeof checkoutActionImpl>) {
  return checkoutActionImpl(...args);
}
