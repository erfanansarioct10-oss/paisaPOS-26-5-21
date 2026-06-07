import type { ActivityEventDTO } from "@/server/supabase/dal";
import { KeyRound } from "lucide-react";

type ActivityDelegationBadgeProps = {
  event: ActivityEventDTO;
};

export function ActivityDelegationBadge({ event }: ActivityDelegationBadgeProps) {
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
