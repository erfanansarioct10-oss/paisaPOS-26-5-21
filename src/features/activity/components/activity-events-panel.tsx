import type { ActivityEventsDTO } from "@/server/supabase/dal";
import { ActivityEmptyState } from "./activity-empty-state";
import { ActivityEventCards } from "./activity-event-cards";
import { ActivityEventTable } from "./activity-event-table";
import { ActivityPagination } from "./activity-pagination";

type ActivityEventsPanelProps = {
  activity: ActivityEventsDTO;
};

export function ActivityEventsPanel({ activity }: ActivityEventsPanelProps) {
  if (activity.events.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        <ActivityEmptyState />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <ActivityEventTable events={activity.events} />
      <ActivityEventCards events={activity.events} />
      <ActivityPagination activity={activity} />
    </div>
  );
}
