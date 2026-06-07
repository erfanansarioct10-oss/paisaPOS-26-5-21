import "server-only";

import { SpanStatusCode, trace, type Span } from "@opentelemetry/api";
import { writeLog } from "@/server/logging/logger";

type TimedOperationKind = "server_action" | "supabase_rpc" | "db_query";

type TimedOperationOptions = {
  kind: TimedOperationKind;
  name: string;
  slowThresholdMs?: number;
  metadata?: Record<string, unknown>;
};

const DEFAULT_SLOW_THRESHOLD_MS: Record<TimedOperationKind, number> = {
  server_action: 1_000,
  supabase_rpc: 500,
  db_query: 250,
};

function operationCategory(kind: TimedOperationKind) {
  return `${kind.toUpperCase()}_TIMING`;
}

function failureCategory(kind: TimedOperationKind) {
  return `${kind.toUpperCase()}_FAILED`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message?: unknown }).message ?? "Unknown error");
  }
  return String(error ?? "Unknown error");
}

function setSpanAttributes(span: Span, metadata: Record<string, unknown>) {
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      span.setAttribute(`paisapos.${key}`, value);
    }
  }
}

export async function timeOperation<T>(
  options: TimedOperationOptions,
  operation: () => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer("paisapos.application");
  const spanName = `${options.kind}.${options.name}`;

  return tracer.startActiveSpan(spanName, async (span) => {
    const start = Date.now();
    const metadata = {
      operationName: options.name,
      operationKind: options.kind,
      ...options.metadata,
    };

    setSpanAttributes(span, metadata);

    try {
      const result = await operation();
      const durationMs = Date.now() - start;
      const slowThresholdMs = options.slowThresholdMs ?? DEFAULT_SLOW_THRESHOLD_MS[options.kind];
      const level = durationMs >= slowThresholdMs ? "WARN" : "INFO";

      span.setAttribute("paisapos.duration_ms", durationMs);
      span.setStatus({ code: SpanStatusCode.OK });

      await writeLog(level, operationCategory(options.kind), `${options.name} completed in ${durationMs}ms`, {
        ...metadata,
        durationMs,
        slowThresholdMs,
      });

      return result;
    } catch (error) {
      const durationMs = Date.now() - start;
      const errorMessage = getErrorMessage(error);

      span.recordException(error instanceof Error ? error : new Error(errorMessage));
      span.setAttribute("paisapos.duration_ms", durationMs);
      span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });

      await writeLog("ERROR", failureCategory(options.kind), `${options.name} failed in ${durationMs}ms`, {
        ...metadata,
        durationMs,
        errorMessage,
      });

      throw error;
    } finally {
      span.end();
    }
  });
}

export function timeServerAction<T>(
  name: string,
  metadata: Record<string, unknown>,
  operation: () => Promise<T>,
): Promise<T> {
  return timeOperation(
    {
      kind: "server_action",
      name,
      metadata,
    },
    operation,
  );
}

export function timeSupabaseRpc<T>(
  rpcName: string,
  metadata: Record<string, unknown>,
  operation: () => Promise<T>,
): Promise<T> {
  return timeOperation(
    {
      kind: "supabase_rpc",
      name: rpcName,
      metadata,
    },
    operation,
  );
}
