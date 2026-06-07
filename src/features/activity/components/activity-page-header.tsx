import { Activity } from "lucide-react";

type ActivityPageHeaderProps = {
  storeName: string;
  shownCount: number;
  successCount: number;
  failureCount: number;
};

type ActivityStatProps = {
  label: string;
  value: number;
  className: string;
  labelClassName: string;
};

function ActivityStat({ label, value, className, labelClassName }: ActivityStatProps) {
  return (
    <div className={`min-w-24 rounded-lg border px-3 py-2.5 ${className}`}>
      <p className={`text-[10px] font-bold uppercase tracking-wider ${labelClassName}`}>{label}</p>
      <p className="mt-0.5 text-lg font-black text-foreground tabular-nums">{value}</p>
    </div>
  );
}

export function ActivityPageHeader({ storeName, shownCount, successCount, failureCount }: ActivityPageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h1 className="font-outfit font-extrabold text-2xl sm:text-3xl text-foreground tracking-tight flex items-center gap-2.5">
          <Activity className="w-7 h-7 text-primary" />
          Activity Log
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          Store activity for <span className="font-semibold text-foreground">{storeName}</span>.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center">
        <ActivityStat
          label="Shown"
          value={shownCount}
          className="border-border bg-card"
          labelClassName="text-muted-foreground"
        />
        <ActivityStat
          label="Success"
          value={successCount}
          className="border-emerald-500/20 bg-emerald-500/5"
          labelClassName="text-emerald-600 dark:text-emerald-400"
        />
        <ActivityStat
          label="Failed"
          value={failureCount}
          className="border-red-500/20 bg-red-500/5"
          labelClassName="text-red-600 dark:text-red-400"
        />
      </div>
    </div>
  );
}
