import type { ActivityEventDTO } from "@/server/supabase/dal";
import { Tag, UserRound } from "lucide-react";
import { ActivityDelegationBadge } from "./activity-delegation-badge";
import { formatDateTime, formatRole, resultBadge, targetLabel } from "./activity-log-utils";

type ActivityEventCardsProps = {
  events: ActivityEventDTO[];
};

export function ActivityEventCards({ events }: ActivityEventCardsProps) {
  return (
    <div className="lg:hidden divide-y divide-border">
      {events.map((event) => {
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
                <ActivityDelegationBadge event={event} />
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
  );
}
