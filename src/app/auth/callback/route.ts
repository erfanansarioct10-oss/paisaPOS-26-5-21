import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { callbackLimiter } from "@/server/rate-limit/rate-limiter";
import { sanitizeString, validateRedirectPath } from "@/lib/security";
import { getTrustedClientIp } from "@/server/network/client-ip";
import { logRawServerError } from "@/server/logging/error-logging";

function callbackErrorRedirect(
  origin: string,
  reason: string,
  details: Record<string, string | undefined> = {},
) {
  const url = new URL("/auth/callback-error", origin);
  url.searchParams.set("reason", reason);

  for (const [key, value] of Object.entries(details)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const { searchParams, origin } = requestUrl;

  try {
    const code = sanitizeString(searchParams.get("code") || "");
    const type = sanitizeString(searchParams.get("type") || "");
    const next = validateRedirectPath(searchParams.get("next"), "/dashboard");

    if (!code) {
      return callbackErrorRedirect(origin, "missing_code", { next, type });
    }

    const clientIp = await getTrustedClientIp(request);
    const rateLimitResult = await callbackLimiter.check(`callback:${clientIp}`);
    if (!rateLimitResult.success) {
      const retryAfter = Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000);
      const response = callbackErrorRedirect(origin, "rate_limited");
      response.headers.set("Retry-After", String(retryAfter));
      return response;
    }

    const cookieStore = await cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // May be called in a read-only context.
          }
        },
      },
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      await logRawServerError("AUTH_CALLBACK_EXCHANGE_FAILED", "Auth callback exchange failed", error);
      return callbackErrorRedirect(origin, "exchange_failed");
    }

    if (type === "recovery") {
      return NextResponse.redirect(new URL("/auth/update-password", origin));
    }

    return NextResponse.redirect(new URL(next, origin));
  } catch (error: unknown) {
    await logRawServerError("AUTH_CALLBACK_UNEXPECTED", "Auth callback route failed unexpectedly", error);
    return callbackErrorRedirect(origin, "exchange_failed");
  }
}
