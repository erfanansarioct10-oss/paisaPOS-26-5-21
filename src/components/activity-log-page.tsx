"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store/useAppStore";
import type { ActivityEventDTO, ActivityEventsDTO } from "@/lib/server/dal";
import {
  Activity,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Filter,
  KeyRound,
  Search,
  ShieldAlert,
  Tag,
  UserRound,
  XCircle,
} from "lucide-react";

type ActivityLogPageProps = {
  activity: ActivityEventsDTO;
};

function buildActivityHref(activity: ActivityEventsDTO, cursor?: string | null) {
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

function formatDateTime(value: string) {
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

function formatRole(role: ActivityEventDTO["actorRole"]) {
  if (role === "owner") return "Owner";
  if (role === "cashier") return "Cashier";
  return "Unknown";
}

function resultBadge(event: ActivityEventDTO) {
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

function targetLabel(event: ActivityEventDTO) {
  if (event.targetLabel) return event.targetLabel;
  return event.targetId ? `${event.targetType} ${event.targetId.slice(0, 8)}` : event.targetType;
}

function DelegationBadge({ event }: { event: ActivityEventDTO }) {
  if (event.privilegeSource !== "delegation") {
    return null;
  }

  return (
    <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
      <KeyRound className="h-3 w-3" />
      Delegated{event.delegationId ? ` #${event.delegationId.slice(0, 8)}` : ""}
    </span>
  );
}

export default function ActivityLogPage({ activity }: ActivityLogPageProps) {
  const { setTab } = useAppStore();
  const { filters } = activity;
  const successCount = activity.events.filter((event) => event.result === "success").length;
  const failureCount = activity.events.length - successCount;
  const hasSelectedActor = filters.actorId && !activity.actors.some((actor) => actor.id === filters.actorId);

  useEffect(() => {
    setTab("activity");
  }, [setTab]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="font-outfit font-extrabold text-2xl sm:text-3xl text-foreground tracking-tight flex items-center gap-2.5">
            <Activity className="w-7 h-7 text-primary" />
            Activity Log
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Store activity for <span className="font-semibold text-foreground">{activity.storeName}</span>.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center">
          <div className="min-w-24 rounded-lg border border-border bg-card px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Shown</p>
            <p className="mt-0.5 text-lg font-black text-foreground tabular-nums">{activity.events.length}</p>
          </div>
          <div className="min-w-24 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Success</p>
            <p className="mt-0.5 text-lg font-black text-foreground tabular-nums">{successCount}</p>
          </div>
          <div className="min-w-24 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">Failed</p>
            <p className="mt-0.5 text-lg font-black text-foreground tabular-nums">{failureCount}</p>
          </div>
        </div>
      </div>

      <form action="/activity" className="bg-card border border-border rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
          <div className="relative xl:col-span-2">
            <label htmlFor="activity-search" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                id="activity-search"
                name="q"
                defaultValue={filters.search}
                type="search"
                placeholder="Actor, action, entity, summary"
                className="block h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 shadow-sm transition-all placeholder-slate-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-slate-800 dark:bg-slate-950 dark:text-white dark:placeholder-slate-600"
              />
            </div>
          </div>

          <div>
            <label htmlFor="activity-actor" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              Actor
            </label>
            <div className="relative">
              <UserRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <select
                id="activity-actor"
                name="actor"
                defaultValue={filters.actorId}
                className="block h-11 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-slate-800 dark:bg-slate-950 dark:text-white"
              >
                <option value="">All actors</option>
                {hasSelectedActor && <option value={filters.actorId}>Selected actor</option>}
                {activity.actors.map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    {actor.name} ({formatRole(actor.role)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="activity-action" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              Event
            </label>
            <div className="relative">
              <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <select
                id="activity-action"
                name="action"
                defaultValue={filters.action}
                className="block h-11 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-slate-800 dark:bg-slate-950 dark:text-white"
              >
                <option value="">All events</option>
                {activity.actions.map((action) => (
                  <option key={action.action} value={action.action}>
                    {action.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="activity-result" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              Result
            </label>
            <select
              id="activity-result"
              name="result"
              defaultValue={filters.result}
              className="block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            >
              <option value="all">All results</option>
              <option value="success">Success</option>
              <option value="failure">Failed</option>
            </select>
          </div>

          <div>
            <label htmlFor="activity-from" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              From
            </label>
            <input
              id="activity-from"
              name="from"
              defaultValue={filters.fromDate}
              type="date"
              className="block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            />
          </div>

          <div>
            <label htmlFor="activity-to" className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
              To
            </label>
            <input
              id="activity-to"
              name="to"
              defaultValue={filters.toDate}
              type="date"
              className="block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary dark:border-slate-800 dark:bg-slate-950 dark:text-white"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Clock3 className="w-3.5 h-3.5" />
            <span>Nepal time</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/activity"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-xs font-semibold text-muted-foreground transition-all hover:bg-secondary hover:text-foreground"
            >
              Clear
            </Link>
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow transition-all hover:opacity-95"
            >
              <Filter className="w-3.5 h-3.5" />
              <span>Apply</span>
            </button>
          </div>
        </div>
      </form>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {activity.events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <ShieldAlert className="w-12 h-12 text-muted-foreground mb-3 opacity-30" />
            <h3 className="text-base font-bold text-foreground">No Activity Matches</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              The current filters did not return owner-visible activity.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/20 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <th className="px-5 py-3">Time</th>
                    <th className="px-5 py-3">Actor</th>
                    <th className="px-5 py-3">Event</th>
                    <th className="px-5 py-3">Entity</th>
                    <th className="px-5 py-3">Result</th>
                    <th className="px-5 py-3">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {activity.events.map((event) => {
                    const badge = resultBadge(event);
                    const BadgeIcon = badge.icon;

                    return (
                      <tr key={event.id} className="hover:bg-muted/10 transition-colors">
                        <td className="px-5 py-4 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(event.occurredAt)}
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-semibold text-foreground leading-normal">{event.actorName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{formatRole(event.actorRole)}</p>
                          <DelegationBadge event={event} />
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-semibold text-foreground leading-normal">{event.actionLabel}</p>
                          {event.actionScope && <p className="text-xs text-muted-foreground mt-0.5">{event.actionScope}</p>}
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-sm font-semibold text-foreground leading-normal">{targetLabel(event)}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{event.targetType}</p>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${badge.className}`}>
                            <BadgeIcon className="w-3.5 h-3.5" />
                            {badge.label}
                          </span>
                          {event.errorCode && <p className="text-[10px] text-muted-foreground mt-1 font-mono">{event.errorCode}</p>}
                        </td>
                        <td className="px-5 py-4 text-sm text-foreground max-w-md">
                          {event.summary}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="lg:hidden divide-y divide-border">
              {activity.events.map((event) => {
                const badge = resultBadge(event);
                const BadgeIcon = badge.icon;

                return (
                  <div key={event.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">{event.actionLabel}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(event.occurredAt)}</p>
                      </div>
                      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge.className}`}>
                        <BadgeIcon className="w-3 h-3" />
                        {badge.label}
                      </span>
                    </div>

                    <p className="text-sm text-foreground leading-normal">{event.summary}</p>

                    <div className="grid grid-cols-2 gap-3 text-xs border-t border-border/60 pt-3">
                      <div>
                        <p className="text-muted-foreground font-medium flex items-center gap-1.5">
                          <UserRound className="w-3.5 h-3.5" />
                          Actor
                        </p>
                        <p className="font-semibold text-foreground truncate mt-1">{event.actorName}</p>
                        <p className="text-[10px] text-muted-foreground">{formatRole(event.actorRole)}</p>
                        <DelegationBadge event={event} />
                      </div>
                      <div>
                        <p className="text-muted-foreground font-medium flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5" />
                          Entity
                        </p>
                        <p className="font-semibold text-foreground truncate mt-1">{targetLabel(event)}</p>
                        <p className="text-[10px] text-muted-foreground">{event.targetType}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 border-t border-border bg-muted/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Showing newest matching activity first.
              </p>
              <div className="flex items-center gap-2">
                {filters.cursor && (
                  <Link
                    href={buildActivityHref(activity)}
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-4 text-xs font-semibold text-muted-foreground transition-all hover:bg-secondary hover:text-foreground"
                  >
                    Newest
                  </Link>
                )}
                {activity.nextCursor && (
                  <Link
                    href={buildActivityHref(activity, activity.nextCursor)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 text-xs font-semibold text-muted-foreground transition-all hover:bg-secondary hover:text-foreground"
                  >
                    <span>Older</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
            </div>
          </>
        )}
      </div>

    </div>
  );
}
