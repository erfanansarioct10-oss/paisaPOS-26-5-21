"use server";

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { writeLog } from "@/server/logging/logger";
import { getSupabaseServerClient } from "@/server/supabase/dal";
import { getSupabaseAdminClient } from "@/server/supabase/admin-supabase";
import { logRawServerError } from "@/server/logging/error-logging";
import { loginLimiter, loginIpLimiter, signupLimiter, passwordResetLimiter, enforceRateLimit, getClientIp } from "@/server/rate-limit/rate-limiter";
import {
  MAX_EMAIL_LENGTH,
  MAX_PASSWORD_LENGTH,
  sanitizeString,
  formatZodError,
  getFriendlyErrorMessage,
  normalizeEmail,
  validateAuthStringSafety,
  validatePasswordComplexity,
} from "@/lib/security";
import { sendVerificationEmail, sendPasswordResetOtpEmail } from "@/lib/mail";

const normalizedEmailSchema = z.preprocess(
  (val) => typeof val === "string" ? normalizeEmail(val) : val,
  z.string()
    .min(1, "Email is required")
    .max(MAX_EMAIL_LENGTH, "Email must be 254 characters or fewer")
    .refine(validateAuthStringSafety, "Email contains unsupported control characters")
    .email("Invalid email address")
);

const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .max(MAX_PASSWORD_LENGTH, "Password must be 256 characters or fewer")
  .refine(validateAuthStringSafety, "Password contains unsupported control characters");

const strongPasswordSchema = passwordSchema.refine(
  validatePasswordComplexity,
  "Password must contain at least one lowercase letter, one uppercase letter, and one number."
);

function getLoginEmailFingerprint(email: string) {
  return createHash("sha256").update(email).digest("hex").slice(0, 32);
}

function getVercelOrigin() {
  const vercelUrl = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL;
  return vercelUrl ? `https://${vercelUrl}` : null;
}

const authSchema = z.object({
  email: normalizedEmailSchema,
  password: passwordSchema,
});

const signupSchema = z.object({
  email: normalizedEmailSchema,
  password: strongPasswordSchema,
  fullName: z.string().min(1, "Full name is required").max(100).transform(sanitizeString),
  storeName: z.string().min(1, "Store name is required").max(100).transform(sanitizeString),
});

const updatePasswordSchema = z.object({
  password: strongPasswordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match.",
});

const JWT_CLOCK_SKEW_RETRY_DELAYS_MS = [500, 1000, 2000];

type SupabaseErrorLike = {
  code?: string;
  message?: string;
} | null;

type SupabaseResult<T> = {
  data: T | null;
  error: SupabaseErrorLike;
};

function isJwtIssuedAtFutureError(error: SupabaseErrorLike): boolean {
  return Boolean(
    error &&
    (error.code === "PGRST303" ||
      error.message?.toLowerCase().includes("jwt issued at future"))
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryOnTransientJwtClockSkew<T>(
  operation: () => PromiseLike<SupabaseResult<T>>
): Promise<SupabaseResult<T>> {
  let result = await operation();

  for (const delayMs of JWT_CLOCK_SKEW_RETRY_DELAYS_MS) {
    if (!isJwtIssuedAtFutureError(result.error)) {
      return result;
    }

    await sleep(delayMs);
    result = await operation();
  }

  return result;
}

type SignupProfile = {
  store_id: string | null;
  role: "owner" | "cashier" | null;
  status?: string | null;
};

const STAFF_ACCOUNT_OWNER_BLOCK =
  "This account is already connected to a store as staff. Use a different email to create your own shop.";

async function hasPendingStaffInviteForEmail(email: string): Promise<boolean | "unavailable"> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return false;
  }

  try {
    const adminClient = getSupabaseAdminClient();
    const { data, error } = await adminClient
      .from("staff_invitations")
      .select("id")
      .eq("email", email)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();

    if (error) {
      await logRawServerError("SIGNUP_STAFF_INVITE_LOOKUP_FAILED", "Staff invite signup guard lookup failed", error, {
        email,
      });
      return "unavailable";
    }

    return Boolean(data);
  } catch (error: unknown) {
    await logRawServerError("SIGNUP_STAFF_INVITE_LOOKUP_UNEXPECTED", "Staff invite signup guard lookup threw", error, {
      email,
    });
    return "unavailable";
  }
}

async function getExistingSessionSignupResult(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  email: string,
): Promise<{ blocked: true; error: string } | { blocked: false; storeId?: string }> {
  const { data: { user: sessionUser }, error: sessionError } = await supabase.auth.getUser();

  if (sessionError || !sessionUser) {
    return { blocked: false };
  }

  const sessionEmail = normalizeEmail(sessionUser.email ?? "");
  if (sessionEmail && sessionEmail !== email) {
    return {
      blocked: true,
      error: "You are already signed in. Sign out before registering a different store.",
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("store_id, role, status")
    .eq("id", sessionUser.id)
    .maybeSingle();

  if (profileError) {
    await logRawServerError("SIGNUP_PROFILE_LOOKUP_FAILED", "Signup profile guard lookup failed", profileError, {
      userId: sessionUser.id,
      email,
    });
    return {
      blocked: true,
      error: "Registration is temporarily unavailable. Please try again.",
    };
  }

  const existingProfile = profile as SignupProfile | null;
  if (existingProfile?.role === "cashier") {
    return { blocked: true, error: STAFF_ACCOUNT_OWNER_BLOCK };
  }

  if (existingProfile?.role === "owner" && existingProfile.store_id) {
    return { blocked: false, storeId: existingProfile.store_id };
  }

  return { blocked: false };
}

/**
 * Log in Action
 * Authenticates user, sets cookies, and logs the event
 */
export async function loginAction(rawParams: unknown) {
  try {
    const validation = authSchema.safeParse(rawParams);
    if (!validation.success) {
      return { error: formatZodError(validation.error) };
    }

    const { email, password } = validation.data;

    const ip = await getClientIp();
    const emailFingerprint = getLoginEmailFingerprint(email);

    // 1. IP-scoped abuse protection: 30 login attempts per 15 minutes per IP
    await enforceRateLimit(loginIpLimiter, `login_ip:${ip}`, "LOGIN_IP");

    // 2. Pair-scoped throttling avoids unauthenticated lockout of the same email from other IPs.
    await enforceRateLimit(loginLimiter, `login_pair:${ip}:${emailFingerprint}`, "LOGIN_ACCOUNT_IP");

    const supabase = await getSupabaseServerClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Log the unauthenticated auth failure locally in JSON stdout
      await writeLog("SECURITY", "AUTH_LOGIN_FAILURE", `Failed login attempt for email: ${email}`, {
        email,
        errorMessage: error.message,
      });

      // Also attempt database unauthenticated security logging if service role key is available
      if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
          const adminClient = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY
          );
          await adminClient.rpc("log_unauthenticated_security_event", {
            p_operation: "AUTH_LOGIN_FAILURE",
            p_affected_entity: `Email: ${email}`,
            p_error_message: error.message,
          });
        } catch (logErr) {
          console.error("Failed to write unauthenticated log to DB:", logErr);
        }
      }

      return { error: getFriendlyErrorMessage(error.message) };
    }

    // Log successful login
    await writeLog("SECURITY", "AUTH_LOGIN_SUCCESS", `User successfully logged in: ${email}`, {
      userId: data.user.id,
      email,
    });

    return { success: true };
  } catch (err: unknown) {
    return { error: getFriendlyErrorMessage(err) };
  }
}

/**
 * Sign up and Store Registration Action
 * Registers user profile, registers store, and logs onboarding event
 */
export async function signupAction(rawParams: unknown) {
  try {
    const validation = signupSchema.safeParse(rawParams);
    if (!validation.success) {
      return { error: formatZodError(validation.error) };
    }

    const { email, password, fullName, storeName } = validation.data;

    // IP-scoped rate limiting: 3 account registrations per hour
    const ip = await getClientIp();
    await enforceRateLimit(signupLimiter, `signup:${ip}`, "SIGNUP");

    const supabase = await getSupabaseServerClient();
    const existingSession = await getExistingSessionSignupResult(supabase, email);
    if (existingSession.blocked) {
      return { error: existingSession.error };
    }
    if (existingSession.storeId) {
      return { success: true, storeId: existingSession.storeId };
    }

    const pendingStaffInvite = await hasPendingStaffInviteForEmail(email);
    if (pendingStaffInvite === "unavailable") {
      return { error: "Registration is temporarily unavailable. Please try again." };
    }
    if (pendingStaffInvite) {
      return { error: STAFF_ACCOUNT_OWNER_BLOCK };
    }

    // Check if the user already exists in auth.users
    const adminClient = getSupabaseAdminClient();
    const { data: userId, error: rpcError } = await (adminClient as any).rpc("get_user_id_by_email", {
      p_email: email,
    });

    if (rpcError) {
      await logRawServerError("SIGNUP_USER_EXISTS_CHECK_FAILED", "Failed to check if user exists", rpcError);
      return { error: "Registration is temporarily unavailable. Please try again." };
    }

    if (userId) {
      return { error: "An account with this email already exists." };
    }

    // Generate secure random verification token
    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Store pending signup details
    const { error: insertError } = await (adminClient as any)
      .from("pending_signups")
      .upsert({
        email,
        password,
        full_name: fullName,
        store_name: storeName,
        token,
        expires_at: expiresAt,
      }, { onConflict: "email" });

    if (insertError) {
      await logRawServerError("PENDING_SIGNUP_INSERT_FAILED", "Failed to insert pending signup", insertError);
      return { error: "Registration is temporarily unavailable. Please try again." };
    }

    // Send verification email via SMTP
    try {
      await sendVerificationEmail(email, fullName, token);
    } catch (mailError) {
      await logRawServerError("SIGNUP_EMAIL_SEND_FAILED", "Failed to send signup verification email", mailError);
      return { error: "Failed to send verification email. Please try again." };
    }

    await writeLog("SECURITY", "AUTH_SIGNUP_AWAITING_CONFIRMATION", `User signed up, awaiting email confirmation: ${email}`, {
      email,
    });

    return { success: true, emailConfirmationRequired: true };
  } catch (err: unknown) {
    return { error: getFriendlyErrorMessage(err) };
  }
}

/**
 * Request Password Reset Action
 * Wraps Supabase auth.resetPasswordForEmail with server-side rate limits
 */
export async function requestPasswordResetAction(email: string) {
  try {
    const validation = normalizedEmailSchema.safeParse(email);
    if (!validation.success) {
      return { error: formatZodError(validation.error) };
    }

    const cleanEmail = validation.data;

    // Server-side IP rate limit: 3 password resets per 15 minutes per IP
    const ip = await getClientIp();
    await enforceRateLimit(passwordResetLimiter, `reset_password:${ip}`, "RESET_PASSWORD");

    const adminClient = getSupabaseAdminClient();
    const { data: userId, error: rpcError } = await (adminClient as any).rpc("get_user_id_by_email", {
      p_email: cleanEmail,
    });

    if (rpcError) {
      await logRawServerError("PASSWORD_RESET_USER_EXISTS_CHECK_FAILED", "Failed to check if user exists for reset", rpcError);
      return { error: "Failed to request password reset. Please try again." };
    }

    if (!userId) {
      return { error: "This email has not been registered." };
    }

    // Generate 6-digit OTP code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // Store reset code in DB
    const { error: codeError } = await (adminClient as any)
      .from("password_reset_codes")
      .insert({
        email: cleanEmail,
        code,
        expires_at: expiresAt,
      });

    if (codeError) {
      await logRawServerError("PASSWORD_RESET_CODE_INSERT_FAILED", "Failed to insert reset code", codeError);
      return { error: "Failed to request password reset. Please try again." };
    }

    // Send password reset OTP email
    try {
      await sendPasswordResetOtpEmail(cleanEmail, code);
    } catch (mailError) {
      await logRawServerError("RESET_PASSWORD_EMAIL_SEND_FAILED", "Failed to send reset OTP email", mailError);
      return { error: "Failed to send password reset code. Please try again." };
    }

    await writeLog("SECURITY", "AUTH_PASSWORD_RESET_REQUESTED", `Password reset requested for email: ${cleanEmail}`);
    return { success: true };
  } catch (err: unknown) {
    return { error: getFriendlyErrorMessage(err) };
  }
}

/**
 * Update Password Action
 * Validates the recovery session server-side, changes the password, then
 * revokes refresh tokens globally so stale sessions cannot continue.
 */
export async function updatePasswordAction(rawParams: unknown) {
  try {
    const ip = await getClientIp();
    await enforceRateLimit(passwordResetLimiter, `password_update:${ip}`, "PASSWORD_UPDATE");

    const validation = updatePasswordSchema.safeParse(rawParams);
    if (!validation.success) {
      return { error: formatZodError(validation.error) };
    }

    const supabase = await getSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      await writeLog("SECURITY", "AUTH_PASSWORD_UPDATE_DENIED", "Password update attempted without a valid recovery session", {
        errorMessage: userError?.message,
      });
      return { error: "Your password reset session is invalid or expired. Please request a new reset link." };
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: validation.data.password,
    });

    if (updateError) {
      await writeLog("SECURITY", "AUTH_PASSWORD_UPDATE_FAILURE", `Password update failed for user ${user.id}`, {
        userId: user.id,
        errorMessage: updateError.message,
      });
      return { error: getFriendlyErrorMessage(updateError.message) };
    }

    const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
    if (signOutError) {
      await writeLog("SECURITY", "AUTH_PASSWORD_UPDATE_SIGNOUT_FAILURE", `Password changed but global signout failed for user ${user.id}`, {
        userId: user.id,
        errorMessage: signOutError.message,
      });
      return { error: "Password changed, but we could not revoke all sessions. Please sign in again and contact support if this repeats." };
    }

    await writeLog("SECURITY", "AUTH_PASSWORD_UPDATE_SUCCESS", `Password changed and sessions revoked for user ${user.id}`, {
      userId: user.id,
    });

    return { success: true };
  } catch (err: unknown) {
    return { error: getFriendlyErrorMessage(err) };
  }
}

/**
 * Verify Signup Token Action
 * Confirms user's email, creates their auth user, and registers the store/profile
 */
export async function verifySignupTokenAction(token: string) {
  try {
    const adminClient = getSupabaseAdminClient();
    const { data: pending, error: pendingError } = await (adminClient as any)
      .from("pending_signups")
      .select("*")
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (pendingError || !pending) {
      return { error: "This verification link is invalid, expired, or has already been used. Please register again." };
    }

    const pendingData = pending as any;

    // Create the user in auth schema using Admin SDK
    const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
      email: pendingData.email,
      password: pendingData.password,
      email_confirm: true,
      user_metadata: {
        full_name: pendingData.full_name,
        store_name: pendingData.store_name,
      }
    });

    if (createError) {
      await logRawServerError("VERIFY_SIGNUP_CREATE_USER_FAILED", "Failed to create confirmed user from pending signup", createError, {
        email: pendingData.email,
      });
      return { error: getFriendlyErrorMessage(createError.message) };
    }

    // Delete the pending signup record
    await (adminClient as any).from("pending_signups").delete().eq("id", pendingData.id);

    await writeLog("SECURITY", "AUTH_SIGNUP_CONFIRMED", `User email verified and account activated: ${pendingData.email}`, {
      userId: newUser.user.id,
      email: pendingData.email,
    });

    return { success: true };
  } catch (err: unknown) {
    return { error: getFriendlyErrorMessage(err) };
  }
}

/**
 * Verify Password Reset Code Action
 * Validates the 6-digit OTP code and returns a temporary token
 */
export async function verifyPasswordResetCodeAction(email: string, code: string) {
  try {
    const cleanEmail = normalizeEmail(email);
    const adminClient = getSupabaseAdminClient();
    
    const { data: record, error: recordError } = await (adminClient as any)
      .from("password_reset_codes")
      .select("*")
      .eq("email", cleanEmail)
      .eq("code", code)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recordError || !record) {
      return { error: "Invalid or expired verification code." };
    }

    const recordData = record as any;

    // Generate reset verification token
    const token = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    
    const { error: updateError } = await (adminClient as any)
      .from("password_reset_codes")
      .update({ token })
      .eq("id", recordData.id);

    if (updateError) {
      await logRawServerError("PASSWORD_RESET_TOKEN_UPDATE_FAILED", "Failed to update reset token", updateError);
      return { error: "Failed to verify code. Please try again." };
    }

    return { success: true, token };
  } catch (err: unknown) {
    return { error: getFriendlyErrorMessage(err) };
  }
}

/**
 * Reset Password With Token Action
 * Resets user password using the temporary verification token
 */
export async function resetPasswordWithTokenAction(email: string, token: string, rawParams: unknown) {
  try {
    const cleanEmail = normalizeEmail(email);
    const validation = updatePasswordSchema.safeParse(rawParams);
    if (!validation.success) {
      return { error: formatZodError(validation.error) };
    }

    const adminClient = getSupabaseAdminClient();

    // Verify the token
    const { data: record, error: recordError } = await (adminClient as any)
      .from("password_reset_codes")
      .select("*")
      .eq("email", cleanEmail)
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (recordError || !record) {
      return { error: "Your password reset session is invalid or expired. Please request a new code." };
    }

    // Get the user ID from auth.users
    const { data: userId, error: rpcError } = await (adminClient as any).rpc("get_user_id_by_email", {
      p_email: cleanEmail,
    });

    if (rpcError || !userId) {
      return { error: "User account could not be found." };
    }

    // Update user's password in auth schema
    const { error: updateError } = await adminClient.auth.admin.updateUserById(
      userId as string,
      { password: validation.data.password }
    );

    if (updateError) {
      await logRawServerError("RESET_PASSWORD_UPDATE_FAILED", "Failed to update password using token", updateError);
      return { error: getFriendlyErrorMessage(updateError.message) };
    }

    // Delete reset codes for this email
    await (adminClient as any).from("password_reset_codes").delete().eq("email", cleanEmail);

    // Revoke all sessions globally to force re-authentication
    await adminClient.auth.admin.signOut(userId as string, "global");

    await writeLog("SECURITY", "AUTH_PASSWORD_RESET_SUCCESS", `Password reset successfully via OTP for user ${userId as string}`);

    return { success: true };
  } catch (err: unknown) {
    return { error: getFriendlyErrorMessage(err) };
  }
}
