import { describe, expect, test } from "vitest";
import {
  decodeActivityCursor,
  encodeActivityCursor,
  formatActivityAction,
  normalizeActivityFilters,
} from "../dal";

describe("activity timeline DAL helpers", () => {
  test("normalizes activity filters to safe bounded query values", () => {
    const filters = normalizeActivityFilters({
      q: " checkout, created % _ ",
      actor: "not-a-uuid",
      action: "product.created",
      result: "failure",
      from: "2026-05-25",
      to: "bad-date",
      cursor: "opaque-cursor",
      limit: "500",
    });

    expect(filters).toEqual({
      search: "checkout created _",
      actorId: "",
      action: "product.created",
      result: "failure",
      fromDate: "2026-05-25",
      toDate: "",
      cursor: "opaque-cursor",
      limit: 100,
    });
  });

  test("encodes and decodes cursor pagination tokens", () => {
    const cursor = encodeActivityCursor({
      id: "11111111-1111-4111-8111-111111111111",
      occurredAt: "2026-05-25T11:43:32.000Z",
    });

    expect(decodeActivityCursor(cursor)).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      occurredAt: "2026-05-25T11:43:32.000Z",
    });
    expect(decodeActivityCursor("not-json")).toBeNull();
  });

  test("formats known and fallback activity action labels", () => {
    expect(formatActivityAction("checkout.created")).toBe("Checkout Created");
    expect(formatActivityAction("custom.event_name")).toBe("Custom Event Name");
  });
});
