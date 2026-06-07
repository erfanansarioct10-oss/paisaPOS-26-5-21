import "server-only";

import { trace } from "@opentelemetry/api";
import { headers } from "next/headers";
import {
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
  REQUEST_METHOD_HEADER,
  REQUEST_PATH_HEADER,
  TRACEPARENT_HEADER,
  createRequestId,
  getTraceIdFromTraceparent,
  normalizeRequestId,
} from "@/server/observability/ids";

export type RequestObservabilityContext = {
  requestId: string;
  correlationId: string;
  traceId: string | null;
  spanId: string | null;
  method: string;
  path: string;
};

export async function getRequestObservabilityContext(): Promise<RequestObservabilityContext> {
  let requestId = createRequestId();
  let correlationId = requestId;
  let traceId: string | null = null;
  let spanId: string | null = null;
  let method = "unknown";
  let path = "unknown";

  const activeSpanContext = trace.getActiveSpan()?.spanContext();
  if (activeSpanContext) {
    traceId = activeSpanContext.traceId;
    spanId = activeSpanContext.spanId;
  }

  try {
    const head = await headers();
    requestId =
      normalizeRequestId(head.get(REQUEST_ID_HEADER)) ??
      normalizeRequestId(head.get(CORRELATION_ID_HEADER)) ??
      requestId;
    correlationId =
      normalizeRequestId(head.get(CORRELATION_ID_HEADER)) ??
      requestId;
    traceId = traceId ?? getTraceIdFromTraceparent(head.get(TRACEPARENT_HEADER));
    method = head.get(REQUEST_METHOD_HEADER) ?? method;
    path = head.get(REQUEST_PATH_HEADER) ?? path;
  } catch {
    // Build tasks and non-request server utilities do not have request headers.
  }

  return {
    requestId,
    correlationId,
    traceId,
    spanId,
    method,
    path,
  };
}
