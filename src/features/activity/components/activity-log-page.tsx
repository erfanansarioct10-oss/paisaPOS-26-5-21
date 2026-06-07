"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store/useAppStore";
import type { ActivityEventsDTO } from "@/server/supabase/dal";
import { ActivityEventsPanel } from "./activity-events-panel";
import { ActivityFilters } from "./activity-filters";
import { ActivityPageHeader } from "./activity-page-header";

type ActivityLogPageProps = {
  activity: ActivityEventsDTO;
};

export default function ActivityLogPage({ activity }: ActivityLogPageProps) {
  const setTab = useAppStore((state) => state.setTab);
  const successCount = activity.events.filter((event) => event.result === "success").length;
  const failureCount = activity.events.length - successCount;

  useEffect(() => {
    setTab("activity");
  }, [setTab]);

  return (
    <div className="space-y-6">
      <ActivityPageHeader
        storeName={activity.storeName}
        shownCount={activity.events.length}
        successCount={successCount}
        failureCount={failureCount}
      />
      <ActivityFilters activity={activity} />
      <ActivityEventsPanel activity={activity} />
    </div>
  );
}
