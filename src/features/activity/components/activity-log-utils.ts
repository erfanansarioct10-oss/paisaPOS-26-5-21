import type { ActivityEventDTO, ActivityEventsDTO } from "@/server/supabase/dal";
import { CheckCircle2, type LucideIcon, XCircle } from "lucide-react";

export type ActivityResultBadge = {
  label: string;
  className: string;
  icon: LucideIcon;
};

export function buildActivityHref(activity: ActivityEventsDTO, cursor?: string | null) {
  const params = new URLSearchParams();
  const { filters } = activity;

  if (filters.search) params.set("q", filters.search);
  if (filters.actorId) params.set("actor", filters.actorId);
  if (filters.action) params.set("action", filters.action);
  if (filters.result !== "all") params.set("result", filters.result);
  if (filters.fromDate) params.set("from", filters.fromDate);
  if (filters.toDate) params.set("to", filters.toDate);
  if (cursor) params.set("cursor", cursor);

  const query = params.toString();
  return query ? `/activity?${query}` : "/activity";
}

export function formatDateTime(value: string) {
  try {
    return new Date(value).toLocaleString("en-NP", {
      timeZone: "Asia/Kathmandu",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

export function formatRole(role: ActivityEventDTO["actorRole"]) {
  if (role === "owner") return "Owner";
  if (role === "cashier") return "Cashier";
  return "Unknown";
}

export function resultBadge(event: ActivityEventDTO): ActivityResultBadge {
  if (event.result === "success") {
    return {
      label: "Success",
      className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      icon: CheckCircle2,
    };
  }

  return {
    label: "Failed",
    className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
    icon: XCircle,
  };
}

export function targetLabel(event: ActivityEventDTO) {
  if (event.targetLabel) return event.targetLabel;
  return event.targetId ? `${event.targetType} ${event.targetId.slice(0, 8)}` : event.targetType;
}
