import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { writeLog } from '@/server/logging/logger'
import { globalLimiter, isBlockedBot } from '@/server/rate-limit/rate-limiter'
import { getTrustedClientIp } from '@/server/network/client-ip'
import {
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
  REQUEST_METHOD_HEADER,
  REQUEST_PATH_HEADER,
  getOrCreateRequestId,
} from '@/server/observability/ids'

const isProd = process.env.NODE_ENV === "production";

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const cspHeader = buildCspHeader(nonce);
  const requestHeaders = new Headers(request.headers);
  const requestId = getOrCreateRequestId(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspHeader);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);
  requestHeaders.set(CORRELATION_ID_HEADER, requestId);
  requestHeaders.set(REQUEST_METHOD_HEADER, request.method);
  requestHeaders.set(REQUEST_PATH_HEADER, request.nextUrl.pathname);

  // -----------------------------------------------------------------------
  // 0. Extract client identifiers for abuse detection
  // -----------------------------------------------------------------------
  const clientIp = await getTrustedClientIp(request);
  const userAgent = request.headers.get("user-agent") || "";
  const { pathname } = request.nextUrl;
  const withRequestHeaders = (nextResponse: NextResponse) =>
    withSecurityHeaders(nextResponse, cspHeader, requestId);
  const isAuthCallback = pathname === "/auth/callback";
  const isHealthCheck = request.nextUrl.pathname === "/api/health";
  const automationBypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const hasAutomationBypass = Boolean(
    automationBypassSecret &&
    request.headers.get("x-vercel-protection-bypass") === automationBypassSecret
  );

  // -----------------------------------------------------------------------
  // 1. Force HTTPS redirect for non-localhost environments in production
  // -----------------------------------------------------------------------
  const proto = request.headers.get("x-forwarded-proto");
  const host = request.headers.get("host") || "";
  const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1");

  if (proto === "http" && !isLocalhost) {
    const httpsUrl = request.nextUrl.clone();
    httpsUrl.protocol = "https:";
    await writeLog("INFO", "HTTPS_REDIRECT", `Redirected HTTP request to HTTPS for host ${host}`);
    return withRequestHeaders(NextResponse.redirect(httpsUrl, 301));
  }

  // -----------------------------------------------------------------------
  // 2. Bot / automated scraper fingerprint detection
  // -----------------------------------------------------------------------
  if (!isHealthCheck && isBlockedBot(userAgent)) {
    await writeLog("SECURITY", "BOT_BLOCKED", `Blocked bot request from IP: ${clientIp}`, {
      ip: clientIp,
      userAgent,
      path: request.nextUrl.pathname,
    });
    return withRequestHeaders(NextResponse.json(
      { error: "Forbidden" },
      { status: 403, headers: { "X-Blocked-Reason": "automated-client" } }
    ));
  }

  // -----------------------------------------------------------------------
  // 3. Global IP-scoped rate limiting (30 req / 10 sec)
  // -----------------------------------------------------------------------
  const rateLimitResult = isHealthCheck || hasAutomationBypass
    ? { success: true, remaining: globalLimiter.maxRequests, resetAt: Date.now() + globalLimiter.windowMs }
    : await globalLimiter.check(`global:${clientIp}`);

  if (!rateLimitResult.success) {
    const retryAfterSeconds = Math.ceil(
      (rateLimitResult.resetAt - Date.now()) / 1000
    );
    await writeLog("SECURITY", "RATE_LIMIT_GLOBAL", `Global rate limit exceeded for IP: ${clientIp}`, {
      ip: clientIp,
      path: request.nextUrl.pathname,
      retryAfter: retryAfterSeconds,
    });
    if (isAuthCallback) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/callback-error";
      url.search = "?reason=rate_limited";
      const response = NextResponse.redirect(url);
      response.headers.set("Retry-After", String(retryAfterSeconds));
      return withRequestHeaders(response);
    }
    return withRequestHeaders(NextResponse.json(
      { error: "Too many requests. Please slow down." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSeconds),
          "X-RateLimit-Limit": String(globalLimiter.maxRequests),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(rateLimitResult.resetAt),
        },
      }
    ));
  }

  // -----------------------------------------------------------------------
  // 4. Build initial response (will be replaced by Supabase cookie logic)
  // -----------------------------------------------------------------------
  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
  response.headers.set("Content-Security-Policy", cspHeader);
  response.headers.set("X-Request-Id", requestId);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    const { pathname } = request.nextUrl
    const protectedRoutes = ['/dashboard', '/billing', '/inventory', '/invoices', '/settings', '/staff', '/activity']
    const isProtectedRoute = protectedRoutes.some(
      route => pathname === route || pathname.startsWith(route + '/')
    )
    if (isProtectedRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      url.search = ''
      return withRequestHeaders(NextResponse.redirect(url))
    }
    return addRateLimitHeaders(response, rateLimitResult.remaining, requestId)
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, responseHeaders) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request: {
              headers: requestHeaders,
            },
          })
          response.headers.set("Content-Security-Policy", cspHeader)
          Object.entries(responseHeaders).forEach(([key, value]) => {
            response.headers.set(key, value)
          })
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
          response.headers.set("X-Request-Id", requestId)
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protect all authenticated paths
  const protectedRoutes = ['/dashboard', '/billing', '/inventory', '/invoices', '/settings', '/staff', '/activity']
  const isProtectedRoute = protectedRoutes.some(
    route => pathname === route || pathname.startsWith(route + '/')
  )
  // Auth callback and password reset routes must be accessible without a session
  const isAuthRoute = pathname.startsWith('/auth/')
  if (isProtectedRoute && !isAuthRoute) {
    if (!user) {
      // Unauthenticated, redirect to home page
      const url = request.nextUrl.clone()
      url.pathname = '/'
      url.search = ''
      await writeLog("SECURITY", "UNAUTHORIZED_REDIRECT", `Redirected unauthenticated access attempt from protected route: ${pathname}`, {
        attemptedPath: pathname,
      });
      return withRequestHeaders(NextResponse.redirect(url))
    }
  }

  if (isHiddenAdminProbe(pathname)) {
    await writeLog("SECURITY", "HIDDEN_ROUTE_PROBE", `Hidden/admin route probe: ${pathname}`, {
      attemptedPath: pathname,
      ip: clientIp,
      userAgent,
    });
  }

  // Redirect authenticated users away from / (login page) to /dashboard
  if (pathname === '/') {
    if (user) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      url.search = ''
      return withRequestHeaders(NextResponse.redirect(url))
    }
  }

  return addRateLimitHeaders(response, rateLimitResult.remaining, requestId)
}

function buildCspHeader(nonce: string): string {
  const csp = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProd ? "" : " 'unsafe-eval'"};
    script-src-elem 'self' 'nonce-${nonce}';
    script-src-attr 'none';
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data:;
    font-src 'self' data:;
    connect-src 'self' https://*.supabase.co wss://*.supabase.co${isProd ? "" : " http://127.0.0.1:54321 ws://127.0.0.1:54321 http://localhost:54321 ws://localhost:54321"};
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    ${isProd ? "upgrade-insecure-requests;" : ""}
  `;

  return csp.replace(/\s{2,}/g, " ").trim();
}

function withSecurityHeaders(response: NextResponse, cspHeader: string, requestId?: string): NextResponse {
  response.headers.set("Content-Security-Policy", cspHeader);
  if (requestId) {
    response.headers.set("X-Request-Id", requestId);
  }
  return response;
}

function isHiddenAdminProbe(pathname: string): boolean {
  const normalized = pathname.toLowerCase();
  return normalized === "/admin" ||
    normalized.startsWith("/admin/") ||
    normalized === "/owner" ||
    normalized.startsWith("/owner/") ||
    normalized === "/superadmin" ||
    normalized.startsWith("/superadmin/") ||
    normalized === "/internal" ||
    normalized.startsWith("/internal/") ||
    normalized === "/debug" ||
    normalized.startsWith("/debug/") ||
    normalized === "/api/admin" ||
    normalized.startsWith("/api/admin/") ||
    normalized === "/api/private" ||
    normalized.startsWith("/api/private/");
}

// ---------------------------------------------------------------------------
// Helper: Attach rate limit headers to outgoing responses
// ---------------------------------------------------------------------------
function addRateLimitHeaders(
  response: NextResponse,
  remaining: number,
  requestId?: string,
): NextResponse {
  response.headers.set("X-RateLimit-Limit", String(globalLimiter.maxRequests));
  response.headers.set("X-RateLimit-Remaining", String(remaining));
  if (requestId) {
    response.headers.set("X-Request-Id", requestId);
  }
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images, icons, manifest files etc.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
