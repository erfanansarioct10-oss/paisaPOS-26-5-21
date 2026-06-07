export const REQUEST_ID_HEADER = "x-request-id";
export const CORRELATION_ID_HEADER = "x-correlation-id";
export const REQUEST_PATH_HEADER = "x-request-path";
export const REQUEST_METHOD_HEADER = "x-request-method";
export const TRACEPARENT_HEADER = "traceparent";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRACEPARENT_PATTERN = /^[0-9a-f]{2}-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}(?:-.*)?$/i;

export function createRequestId(): string {
  return crypto.randomUUID();
}

export function normalizeRequestId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > 64) {
    return null;
  }

  return UUID_PATTERN.test(trimmed) ? trimmed.toLowerCase() : null;
}

export function getOrCreateRequestId(headers: Headers): string {
  return (
    normalizeRequestId(headers.get(REQUEST_ID_HEADER)) ??
    normalizeRequestId(headers.get(CORRELATION_ID_HEADER)) ??
    createRequestId()
  );
}

export function getTraceIdFromTraceparent(value: string | null | undefined): string | null {
  const match = value?.trim().match(TRACEPARENT_PATTERN);
  return match?.[1]?.toLowerCase() ?? null;
}
