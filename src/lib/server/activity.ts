import "server-only";

import { writeLog } from "@/lib/logger";
import {
  getSupabaseAdminClient,
  type ActivityEventInsert,
} from "@/lib/server/admin-supabase";

type ActivityRole = "owner" | "cashier";
type ActivityResult = "success" | "failure";
type PrivilegeSource = "owner_role" | "cashier_role" | "delegation" | "system";
type ActivityScope =
  | "checkout.create"
  | "catalog.manage"
  | "inventory.adjust"
  | "store.settings"
  | "reports.export"
  | "invoice.correct"
  | "staff.manage";

type ActivityActor = {
  id: string;
  name: string;
  email?: string;
  role?: ActivityRole;
};

export type ActivityEventInput = {
  storeId: string;
  actor: ActivityActor;
  action: string;
  targetType: string;
  result: ActivityResult;
  privilegeSource?: PrivilegeSource;
  actionScope?: ActivityScope;
  targetId?: string | null;
  targetLabel?: string | null;
  delegationId?: string | null;
  summary: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  errorCode?: string | null;
};

type ActivityInsertPayload = ActivityEventInsert;

const SENSITIVE_KEY_PATTERN = /(password|token|secret|key|cookie|session|authorization|otp|refresh|access|phone|email)/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const MAX_TEXT_LENGTH = 500;
const MAX_METADATA_JSON_LENGTH = 8_000;
const MAX_DEPTH = 4;

function cleanText(value: string, maxLength = MAX_TEXT_LENGTH) {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function redactString(value: string) {
  return cleanText(value.replace(EMAIL_PATTERN, "[redacted-email]"), 1_000);
}

function redactValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) {
    return "[redacted-depth]";
  }

  if (typeof value === "string") {
    return redactString(value);
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => redactValue(item, depth + 1));
  }

  if (typeof value === "object") {
    return redactActivityMetadata(value as Record<string, unknown>, depth + 1);
  }

  return String(value);
}

export function redactActivityMetadata(
  metadata: Record<string, unknown> = {},
  depth = 0,
): Record<string, unknown> {
  const redacted = Object.fromEntries(
    Object.entries(metadata).slice(0, 50).map(([key, value]) => {
      const cleanKey = cleanText(key, 100);
      if (SENSITIVE_KEY_PATTERN.test(cleanKey)) {
        return [cleanKey, "[redacted]"];
      }
      return [cleanKey, redactValue(value, depth)];
    }),
  );

  const serialized = JSON.stringify(redacted);
  if (serialized.length <= MAX_METADATA_JSON_LENGTH) {
    return redacted;
  }

  return {
    truncated: true,
    originalLength: serialized.length,
  };
}

function normalizeRole(role?: ActivityRole): ActivityRole {
  return role === "owner" ? "owner" : "cashier";
}

function defaultPrivilegeSource(actorRole: ActivityRole): PrivilegeSource {
  return actorRole === "owner" ? "owner_role" : "cashier_role";
}

export function buildActivityEventPayload(input: ActivityEventInput): ActivityInsertPayload {
  const actorRole = normalizeRole(input.actor.role);

  return {
    store_id: input.storeId,
    actor_user_id: input.actor.id,
    actor_name: cleanText(input.actor.name || "Unknown user", 150),
    actor_email: input.actor.email ? cleanText(input.actor.email, 254) : null,
    actor_role: actorRole,
    privilege_source: input.privilegeSource ?? defaultPrivilegeSource(actorRole),
    delegation_id: input.delegationId ?? null,
    action: cleanText(input.action, 80),
    action_scope: input.actionScope ?? null,
    target_type: cleanText(input.targetType, 80),
    target_id: input.targetId ?? null,
    target_label: input.targetLabel ? cleanText(input.targetLabel, 150) : null,
    summary: cleanText(input.summary, 500),
    before_state: input.beforeState ? redactActivityMetadata(input.beforeState) : null,
    after_state: input.afterState ? redactActivityMetadata(input.afterState) : null,
    metadata: redactActivityMetadata(input.metadata),
    result: input.result,
    error_code: input.errorCode ? cleanText(input.errorCode, 100) : null,
  };
}

export async function recordActivityEvent(
  input: ActivityEventInput,
  options: { strict?: boolean } = {},
) {
  const payload = buildActivityEventPayload(input);

  try {
    const adminClient = getSupabaseAdminClient();
    const { error } = await adminClient.from("activity_events").insert(payload);

    if (error) {
      throw new Error(error.message);
    }

    return { ok: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown activity logging error";

    await writeLog("ERROR", "ACTIVITY_EVENT_WRITE_FAILED", "Failed to persist activity event", {
      action: payload.action,
      storeId: payload.store_id,
      actorUserId: payload.actor_user_id,
      errorMessage,
    });

    if (options.strict) {
      throw error;
    }

    return { ok: false, error: errorMessage };
  }
}
