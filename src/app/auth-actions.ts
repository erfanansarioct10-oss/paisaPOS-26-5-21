"use server";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { writeLog } from "@/lib/logger";
import { loginLimiter, loginIpLimiter, signupLimiter, passwordResetLimiter, enforceRateLimit, getClientIp } from "@/lib/rate-limiter";
import { sanitizeString, formatZodError, getFriendlyErrorMessage } from "@/lib/security";

const authSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const signupSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .refine(
      (val) => /[a-z]/.test(val) && /[A-Z]/.test(val) && /\d/.test(val),
      "Password must contain at least one lowercase letter, one uppercase letter, and one number."
    ),
  fullName: z.string().min(1, "Full name is required").max(100).transform(sanitizeString),
  storeName: z.string().min(1, "Store name is required").max(100).transform(sanitizeString),
});

async function getSupabaseServerClient() {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: Record<string, unknown>) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cookieStore.set({ name, value, ...options } as any);
        } catch {
          // Ignore in read-only environment context
        }
      },
      remove(name: string, options: Record<string, unknown>) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cookieStore.set({ name, value: "", ...options } as any);
        } catch {
          // Ignore
        }
      },
    },
  });
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

    // 1. Account-scoped rate limiting: 5 login attempts per 15 minutes per email
    await enforceRateLimit(loginLimiter, `login:${email}`, "LOGIN");

    // 2. IP-scoped abuse protection: 30 login attempts per 15 minutes per IP
    await enforceRateLimit(loginIpLimiter, `login_ip:${ip}`, "LOGIN");

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

    // Create immediate database success log
    try {
      await supabase.from("audit_logs").insert({
        store_id: null, // Resolves to user's store via RLS if appropriate, or keeps null
        user_id: data.user.id,
        operation: "AUTH_LOGIN_SUCCESS",
        affected_entity: `User ID: ${data.user.id}`,
        result: "SUCCESS",
      });
    } catch (dbErr) {
      console.error("Failed to record successful login to audit logs table:", dbErr);
    }

    return { success: true, user: data.user };
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

    // 1. Sign up the user
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          store_name: storeName,
        },
      },
    });

    if (signUpError) {
      await writeLog("SECURITY", "AUTH_SIGNUP_FAILURE", `Failed sign up attempt for email: ${email}`, {
        email,
        errorMessage: signUpError.message,
      });
      return { error: getFriendlyErrorMessage(signUpError.message) };
    }

    if (!signUpData.user) {
      return { error: "Registration failed. Please check your credentials." };
    }

    // 2. Perform the onboarding store registration RPC
    const { data: storeId, error: onboardingError } = await supabase.rpc("register_store_and_user", {
      p_full_name: fullName,
      p_store_name: storeName,
    });

    if (onboardingError) {
      await writeLog("SECURITY", "AUTH_ONBOARDING_FAILURE", `Failed onboarding store registration for user ${signUpData.user.id}`, {
        userId: signUpData.user.id,
        email,
        errorMessage: onboardingError.message,
      });
      return { error: getFriendlyErrorMessage(onboardingError.message) };
    }

    // Log successful onboarding
    await writeLog("SECURITY", "AUTH_SIGNUP_SUCCESS", `Store registered successfully: "${storeName}" (User: ${email})`, {
      userId: signUpData.user.id,
      storeId,
      email,
    });

    return { success: true, user: signUpData.user, storeId };
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
    const emailSchema = z.string().email("Invalid email address");
    const validation = emailSchema.safeParse(email);
    if (!validation.success) {
      return { error: formatZodError(validation.error) };
    }

    const cleanEmail = validation.data;

    // Server-side IP rate limit: 3 password resets per 15 minutes per IP
    const ip = await getClientIp();
    await enforceRateLimit(passwordResetLimiter, `reset_password:${ip}`, "RESET_PASSWORD");

    const supabase = await getSupabaseServerClient();

    // Canonical origin resolution: use APP_URL env var, fallback to Vercel, then headers in development
    let origin = process.env.APP_URL;
    if (!origin && process.env.NEXT_PUBLIC_VERCEL_URL) {
      origin = `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
    }
    if (!origin && process.env.NODE_ENV !== "production") {
      const headersList = await headers();
      const host = headersList.get("host") || "localhost:3000";
      const proto = headersList.get("x-forwarded-proto") || "http";
      origin = `${proto}://${host}`;
    }
    if (!origin) {
      origin = "https://paisa-pos-26-5-21.vercel.app"; // Production fallback
    }

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: `${origin}/auth/callback?type=recovery`,
    });

    if (error) {
      await writeLog("SECURITY", "AUTH_PASSWORD_RESET_FAILURE", `Failed reset request for email: ${cleanEmail}`, {
        email: cleanEmail,
        errorMessage: error.message,
      });
      return { error: getFriendlyErrorMessage(error.message) };
    }

    await writeLog("SECURITY", "AUTH_PASSWORD_RESET_SUCCESS", `Password reset link sent to: ${cleanEmail}`);
    return { success: true };
  } catch (err: unknown) {
    return { error: getFriendlyErrorMessage(err) };
  }
}
