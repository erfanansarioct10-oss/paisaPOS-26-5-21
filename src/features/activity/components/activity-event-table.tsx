import type { ActivityEventDTO } from "@/server/supabase/dal";
import { ActivityDelegationBadge } from "./activity-delegation-badge";
import { formatDateTime, formatRole, resultBadge, targetLabel } from "./activity-log-utils";

type ActivityEventTableProps = {
  events: ActivityEventDTO[];
};

export function ActivityEventTable({ events }: ActivityEventTableProps) {
  return (
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
          {events.map((event) => {
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
                  <ActivityDelegationBadge event={event} />
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
                <td className="px-5 py-4 text-sm text-foreground max-w-md">{event.summary}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
