import { headers } from "next/headers";
import type { NextRequest } from "next/server";

/**
 * Clean and extract a single client IP address from a comma-separated proxy chain header.
 */
export function extractFirstIp(forwardedFor: string | null): string | null {
  if (!forwardedFor) return null;
  const firstIp = forwardedFor.split(",")[0]?.trim();
  return firstIp || null;
}

/**
 * Retrieve the trusted client IP address in both serverless API / action contexts and middleware / edge environments.
 * Prioritizes the reverse-proxy-overwritten 'x-real-ip' to prevent header spoofing.
 */
export async function getTrustedClientIp(req?: NextRequest): Promise<string> {
  if (req) {
    return req.headers.get("x-real-ip")
      || extractFirstIp(req.headers.get("x-forwarded-for"))
      || "unknown";
  }

  try {
    const head = await headers();
    return head.get("x-real-ip")
      || extractFirstIp(head.get("x-forwarded-for"))
      || "unknown";
  } catch {
    return "unknown";
  }
}
