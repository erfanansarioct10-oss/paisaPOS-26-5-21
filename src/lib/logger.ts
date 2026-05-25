import { headers } from "next/headers";

const SENSITIVE_KEY_PATTERN = /(password|token|secret|key|cookie|session|authorization|otp|refresh|access)/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

function redactString(value: string): string {
  return value.replace(EMAIL_PATTERN, "[redacted-email]");
}

function redactMetadata(metadata: Record<string, unknown> = {}): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        return [key, "[redacted]"];
      }
      if (typeof value === "string") {
        return [key, redactString(value)];
      }
      return [key, value];
    })
  );
}

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
    message: redactString(message),
    ip,
    userAgent,
    ...redactMetadata(metadata),
  };

  // Stringify to ensure atomic, single-line log emission for cloud logging routers
  console.log(JSON.stringify(logPayload));
}
