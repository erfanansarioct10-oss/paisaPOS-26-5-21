import Link from "next/link";
import type { ActivityEventsDTO } from "@/server/supabase/dal";
import { ChevronRight } from "lucide-react";
import { buildActivityHref } from "./activity-log-utils";

type ActivityPaginationProps = {
  activity: ActivityEventsDTO;
};

export function ActivityPagination({ activity }: ActivityPaginationProps) {
  const { filters } = activity;

  return (
    <div className="flex flex-col gap-3 border-t border-border bg-muted/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">Showing newest matching activity first.</p>
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
  );
}
