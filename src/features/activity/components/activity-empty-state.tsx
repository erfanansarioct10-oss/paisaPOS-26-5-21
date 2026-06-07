import { ShieldAlert } from "lucide-react";

export function ActivityEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <ShieldAlert className="w-12 h-12 text-muted-foreground mb-3 opacity-30" />
      <h3 className="text-base font-bold text-foreground">No Activity Matches</h3>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
        The current filters did not return owner-visible activity.
      </p>
    </div>
  );
}
