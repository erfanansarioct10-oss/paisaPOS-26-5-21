"use server";

import {
  updateProfileAction as updateProfileActionImpl,
  updateProfileFormAction as updateProfileFormActionImpl,
  updateStoreAction as updateStoreActionImpl,
  updateStoreFormAction as updateStoreFormActionImpl,
  updateSecurityPinAction as updateSecurityPinActionImpl,
  updateSecurityPinFormAction as updateSecurityPinFormActionImpl,
} from "@/app/actions";

export async function updateStoreAction(...args: Parameters<typeof updateStoreActionImpl>) {
  return updateStoreActionImpl(...args);
}

export async function updateProfileAction(...args: Parameters<typeof updateProfileActionImpl>) {
  return updateProfileActionImpl(...args);
}

export async function updateStoreFormAction(...args: Parameters<typeof updateStoreFormActionImpl>) {
  return updateStoreFormActionImpl(...args);
}

export async function updateProfileFormAction(...args: Parameters<typeof updateProfileFormActionImpl>) {
  return updateProfileFormActionImpl(...args);
}

export async function updateSecurityPinAction(...args: Parameters<typeof updateSecurityPinActionImpl>) {
  return updateSecurityPinActionImpl(...args);
}

export async function updateSecurityPinFormAction(...args: Parameters<typeof updateSecurityPinFormActionImpl>) {
  return updateSecurityPinFormActionImpl(...args);
}

