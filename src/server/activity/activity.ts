import "server-only";

import { writeLog } from "@/server/logging/logger";
import {
  getSupabaseAdminClient,
  type ActivityEventInsert,
} from "@/server/supabase/admin-supabase";
import { getRequestObservabilityContext } from "@/server/observability/request-context";
import type { Json } from "@/shared/supabase/database.types";

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

function requireCleanText(value: string | null | undefined, label: string, maxLength = MAX_TEXT_LENGTH) {
  const cleaned = cleanText(value ?? "", maxLength);
  if (!cleaned) {
    throw new Error(`Activity event ${label} is required.`);
  }
  return cleaned;
}

function redactString(value: string) {
  return cleanText(value.replace(EMAIL_PATTERN, "[redacted-email]"), 1_000);
}

function redactValue(value: unknown, depth: number): Json {
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
): { [key: string]: Json } {
  const redacted = Object.fromEntries(
    Object.entries(metadata).slice(0, 50).map(([key, value]) => {
      const cleanKey = cleanText(key, 100);
      if (SENSITIVE_KEY_PATTERN.test(cleanKey)) {
        return [cleanKey, "[redacted]"];
      }
      return [cleanKey, redactValue(value, depth)];
    }),
  ) as { [key: string]: Json };

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
    store_id: requireCleanText(input.storeId, "store id", 80),
    actor_user_id: requireCleanText(input.actor.id, "actor id", 80),
    actor_name: cleanText(input.actor.name || "Unknown user", 150),
    actor_email: input.actor.email ? cleanText(input.actor.email, 254) : null,
    actor_role: actorRole,
    privilege_source: input.privilegeSource ?? defaultPrivilegeSource(actorRole),
    delegation_id: input.delegationId ?? null,
    action: requireCleanText(input.action, "action", 80),
    action_scope: input.actionScope ?? null,
    target_type: requireCleanText(input.targetType, "target type", 80),
    target_id: input.targetId ?? null,
    target_label: input.targetLabel ? cleanText(input.targetLabel, 150) : null,
    summary: requireCleanText(input.summary, "summary", 500),
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
  const requestContext = await getRequestObservabilityContext();
  const payload = {
    ...buildActivityEventPayload(input),
    request_id: requestContext.requestId,
  };

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
