import type { Instrumentation } from "next";
import { registerOTel } from "@vercel/otel";
import {
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
  TRACEPARENT_HEADER,
  getTraceIdFromTraceparent,
  normalizeRequestId,
} from "@/server/observability/ids";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

function redactString(value: string): string {
  return value.replace(EMAIL_PATTERN, "[redacted-email]");
}

function getHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function register() {
  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME || "paisapos",
  });
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const requestError = error instanceof Error ? error : new Error(String(error));
  const requestId =
    normalizeRequestId(getHeaderValue(request.headers, REQUEST_ID_HEADER)) ??
    normalizeRequestId(getHeaderValue(request.headers, CORRELATION_ID_HEADER)) ??
    "unknown";
  const traceId = getTraceIdFromTraceparent(getHeaderValue(request.headers, TRACEPARENT_HEADER)) ?? "unknown";
  const digest = (requestError as Error & { digest?: string }).digest;

  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "ERROR",
    category: "NEXT_REQUEST_ERROR",
    message: redactString(requestError.message),
    requestId,
    traceId,
    digest: digest ?? null,
    method: request.method,
    path: request.path,
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    renderSource: context.renderSource,
    revalidateReason: context.revalidateReason ?? null,
  }));
};
