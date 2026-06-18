"use server";

import {
  loginAction as loginActionImpl,
  requestPasswordResetAction as requestPasswordResetActionImpl,
  signupAction as signupActionImpl,
  updatePasswordAction as updatePasswordActionImpl,
  verifySignupTokenAction as verifySignupTokenActionImpl,
  verifyPasswordResetCodeAction as verifyPasswordResetCodeActionImpl,
  resetPasswordWithTokenAction as resetPasswordWithTokenActionImpl,
} from "@/app/auth-actions";

export async function loginAction(...args: Parameters<typeof loginActionImpl>) {
  return loginActionImpl(...args);
}

export async function signupAction(...args: Parameters<typeof signupActionImpl>) {
  return signupActionImpl(...args);
}

export async function requestPasswordResetAction(...args: Parameters<typeof requestPasswordResetActionImpl>) {
  return requestPasswordResetActionImpl(...args);
}

export async function updatePasswordAction(...args: Parameters<typeof updatePasswordActionImpl>) {
  return updatePasswordActionImpl(...args);
}

export async function verifySignupTokenAction(...args: Parameters<typeof verifySignupTokenActionImpl>) {
  return verifySignupTokenActionImpl(...args);
}

export async function verifyPasswordResetCodeAction(...args: Parameters<typeof verifyPasswordResetCodeActionImpl>) {
  return verifyPasswordResetCodeActionImpl(...args);
}

export async function resetPasswordWithTokenAction(...args: Parameters<typeof resetPasswordWithTokenActionImpl>) {
  return resetPasswordWithTokenActionImpl(...args);
}
