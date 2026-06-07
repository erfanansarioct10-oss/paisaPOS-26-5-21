import "server-only";

import { writeLog } from "@/server/logging/logger";

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message?: unknown }).message ?? "Unknown server error");
  }
  return String(error ?? "Unknown server error");
}

export async function logRawServerError(
  category: string,
  message: string,
  error: unknown,
  metadata: Record<string, unknown> = {},
) {
  await writeLog("ERROR", category, message, {
    ...metadata,
    errorMessage: errorMessage(error),
  });
}
