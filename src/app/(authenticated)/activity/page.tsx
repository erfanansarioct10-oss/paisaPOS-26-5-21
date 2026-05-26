import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ActivityLogPage from "@/components/activity-log-page";
import {
  getActivityEventsDTO,
  requireTenantContext,
  type ActivityEventFilterInput,
} from "@/lib/server/dal";
import { canUsePrivilege } from "@/lib/server/permissions";

export const metadata: Metadata = {
  title: "Activity Log | PaisaPOS",
};

type ActivityPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ActivityPage({ searchParams }: ActivityPageProps) {
  const context = await requireTenantContext();
  if (!canUsePrivilege(context.user, "activity.read")) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const activity = await getActivityEventsDTO(params as ActivityEventFilterInput);

  return <ActivityLogPage activity={activity} />;
}
