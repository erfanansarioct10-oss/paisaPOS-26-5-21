import "server-only";

import { headers } from "next/headers";
import type { NextRequest } from "next/server";

/**
 * Clean and extract a single client IP address from a comma-separated proxy chain header.
 */
export function extractFirstIp(forwardedFor: string | null): string | null {
  if (!forwardedFor) return null;
  const firstIp = forwardedFor.split(",")[0]?.trim();
  return sanitizeIp(firstIp);
}

function sanitizeIp(ip: string | null): string | null {
  if (!ip) return null;
  const normalized = ip.trim();
  if (normalized.length > 64) return null;
  if (!/^[a-z0-9:.\-]+$/i.test(normalized)) return null;
  return normalized;
}

function shouldTrustProxyHeaders(): boolean {
  if (process.env.TRUST_PROXY_HEADERS === "true") return true;
  if (process.env.TRUST_PROXY_HEADERS === "false") return false;
  return process.env.VERCEL === "1" || process.env.NODE_ENV !== "production";
}

/**
 * Retrieve the trusted client IP address in both serverless API / action contexts and middleware / edge environments.
 * Prioritizes the reverse-proxy-overwritten 'x-real-ip' to prevent header spoofing.
 */
export async function getTrustedClientIp(req?: NextRequest): Promise<string> {
  if (!shouldTrustProxyHeaders()) {
    return "unknown";
  }

  if (req) {
    return sanitizeIp(req.headers.get("x-real-ip"))
      || extractFirstIp(req.headers.get("x-forwarded-for"))
      || "unknown";
  }

  try {
    const head = await headers();
    return sanitizeIp(head.get("x-real-ip"))
      || extractFirstIp(head.get("x-forwarded-for"))
      || "unknown";
  } catch {
    return "unknown";
  }
}
