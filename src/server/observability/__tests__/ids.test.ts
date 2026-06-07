import { describe, expect, test } from "vitest";
import {
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
  getOrCreateRequestId,
  getTraceIdFromTraceparent,
  normalizeRequestId,
} from "../ids";

const validRequestId = "11111111-1111-4111-8111-111111111111";

describe("observability request identifiers", () => {
  test("accepts only UUID request identifiers", () => {
    expect(normalizeRequestId(validRequestId.toUpperCase())).toBe(validRequestId);
    expect(normalizeRequestId("not-a-safe-request-id")).toBeNull();
    expect(normalizeRequestId("x".repeat(65))).toBeNull();
  });

  test("creates a request id when inbound headers are missing or untrusted", () => {
    const headers = new Headers({
      [REQUEST_ID_HEADER]: "spoofed",
      [CORRELATION_ID_HEADER]: validRequestId,
    });

    expect(getOrCreateRequestId(headers)).toBe(validRequestId);
    expect(normalizeRequestId(getOrCreateRequestId(new Headers()))).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  test("extracts the OpenTelemetry trace id from traceparent", () => {
    expect(getTraceIdFromTraceparent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01")).toBe(
      "4bf92f3577b34da6a3ce929d0e0e4736",
    );
    expect(getTraceIdFromTraceparent("invalid")).toBeNull();
  });
});
