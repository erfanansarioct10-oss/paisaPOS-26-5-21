import { headers } from "next/headers";

/**
 * Structured Security & Error Logger for PaisaPOS (Server-Side Only)
 * Writes structured JSON payloads to standard output, fully compatible with Vercel Log Drains.
 */
export async function writeLog(
  level: "INFO" | "WARN" | "ERROR" | "SECURITY",
  category: string,
  message: string,
  metadata?: Record<string, unknown>
) {
  let ip = "unknown";
  let userAgent = "unknown";

  try {
    const head = await headers();
    ip = head.get("x-forwarded-for") || head.get("x-real-ip") || "unknown";
    userAgent = head.get("user-agent") || "unknown";
  } catch {
    // Graceful fallback when executing outside of active HTTP request contexts (e.g. build time, cron tasks)
  }

  const logPayload = {
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    ip,
    userAgent,
    ...metadata,
  };

  // Stringify to ensure atomic, single-line log emission for cloud logging routers
  console.log(JSON.stringify(logPayload));
}
