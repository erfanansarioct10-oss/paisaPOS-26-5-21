import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { callbackLimiter } from "@/lib/rate-limiter";
import { sanitizeString, validateRedirectPath } from "@/lib/security";
import { getTrustedClientIp } from "@/lib/network";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = sanitizeString(searchParams.get("code") || "");
  const type = sanitizeString(searchParams.get("type") || "");
  const next = validateRedirectPath(searchParams.get("next"), "/dashboard");

  if (!code) {
    // No code provided — redirect to login
    return NextResponse.redirect(new URL("/", origin));
  }

  // IP-scoped rate limiting: 10 callback attempts per minute
  const clientIp = await getTrustedClientIp(request);
  const rateLimitResult = await callbackLimiter.check(`callback:${clientIp}`);
  if (!rateLimitResult.success) {
    const retryAfter = Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      }
    );
  }

  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: Record<string, unknown>) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          cookieStore.set({ name, value, ...options } as any);
        } catch {
          // Ignore — may be called in a read-only context
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

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("Auth callback error:", error.message);
    return NextResponse.redirect(new URL("/", origin));
  }

  // Password recovery flow → send to update-password page
  if (type === "recovery") {
    return NextResponse.redirect(new URL("/auth/update-password", origin));
  }

  // Email verification or other flows → send to intended destination
  return NextResponse.redirect(new URL(next, origin));
}
