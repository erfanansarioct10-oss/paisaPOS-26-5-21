import Link from "next/link";
import type { ActivityEventsDTO } from "@/server/supabase/dal";
import { Clock3, Filter, Search, UserRound } from "lucide-react";
import { formatRole } from "./activity-log-utils";

type ActivityFiltersProps = {
  activity: ActivityEventsDTO;
};

export function ActivityFilters({ activity }: ActivityFiltersProps) {
  const { filters } = activity;
  const hasSelectedActor = Boolean(filters.actorId) && !activity.actors.some((actor) => actor.id === filters.actorId);

  return (
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
              {hasSelectedActor && filters.actorId && <option value={filters.actorId}>Selected actor</option>}
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
  );
}
