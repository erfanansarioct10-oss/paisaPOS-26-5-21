import { Activity, Loader2 } from "lucide-react";

export default function ActivityLoading() {
  return (
    <div className="flex min-h-[320px] items-center justify-center px-4 py-10">
      <div className="flex items-center gap-3 text-sm font-semibold text-muted-foreground">
        <Activity className="h-4 w-4 text-primary" />
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>Loading activity...</span>
      </div>
    </div>
  );
}
