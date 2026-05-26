import { describe, expect, test } from "vitest";
import { buildActivityEventPayload, redactActivityMetadata } from "../activity";

describe("activity event helper", () => {
  test("redacts sensitive metadata keys and email-shaped values", () => {
    const redacted = redactActivityMetadata({
      accessToken: "secret-token",
      customerPhone: "9800000000",
      note: "Invite sent to mina@example.com",
      nested: {
        password: "hunter2",
        safeValue: "SKU-TEE-BLK-M",
      },
    });

    expect(redacted.accessToken).toBe("[redacted]");
    expect(redacted.customerPhone).toBe("[redacted]");
    expect(redacted.note).toBe("Invite sent to [redacted-email]");
    expect(redacted.nested).toEqual({
      password: "[redacted]",
      safeValue: "SKU-TEE-BLK-M",
    });
  });

  test("builds a bounded insert payload with actor snapshot and default privilege source", () => {
    const payload = buildActivityEventPayload({
      storeId: "11111111-1111-4111-8111-111111111111",
      actor: {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Mina Tamang\n",
        email: "mina@example.com",
        role: "owner",
      },
      action: "store.updated",
      actionScope: "store.settings",
      targetType: "store",
      targetId: "11111111-1111-4111-8111-111111111111",
      targetLabel: "KTM Boutique",
      result: "success",
      summary: "Mina updated store settings.",
      metadata: {
        changedFields: ["name"],
      },
    });

    expect(payload).toMatchObject({
      store_id: "11111111-1111-4111-8111-111111111111",
      actor_user_id: "22222222-2222-4222-8222-222222222222",
      actor_name: "Mina Tamang",
      actor_email: "mina@example.com",
      actor_role: "owner",
      privilege_source: "owner_role",
      action: "store.updated",
      action_scope: "store.settings",
      target_type: "store",
      result: "success",
    });
  });

  test("stores delegation id and privilege source when present", () => {
    const payload = buildActivityEventPayload({
      storeId: "11111111-1111-4111-8111-111111111111",
      actor: {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Cashier",
        role: "cashier",
      },
      action: "inventory.adjusted",
      actionScope: "inventory.adjust",
      privilegeSource: "delegation",
      delegationId: "33333333-3333-4333-8333-333333333333",
      targetType: "variant",
      result: "success",
      summary: "Cashier adjusted stock with delegated access.",
    });

    expect(payload).toMatchObject({
      privilege_source: "delegation",
      delegation_id: "33333333-3333-4333-8333-333333333333",
    });
  });
});
