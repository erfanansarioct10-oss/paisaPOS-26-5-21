import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ActivityLogPage from "@/features/activity/components/activity-log-page";
import {
  getActivityEventsDTO,
  type ActivityEventFilterInput,
} from "@/server/supabase/dal";
import { PermissionDeniedError, requirePrivilege } from "@/server/auth/permissions";

export const metadata: Metadata = {
  title: "Activity Log | PaisaPOS",
};

type ActivityPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function requireActivityPageContext() {
  try {
    return await requirePrivilege("activity.read");
  } catch (error: unknown) {
    if (error instanceof PermissionDeniedError) {
      redirect("/dashboard");
    }
    throw error;
  }
}

export default async function ActivityPage({ searchParams }: ActivityPageProps) {
  const context = await requireActivityPageContext();
  const params = await searchParams;
  const activity = await getActivityEventsDTO(params as ActivityEventFilterInput, context);

  return <ActivityLogPage activity={activity} />;
}
