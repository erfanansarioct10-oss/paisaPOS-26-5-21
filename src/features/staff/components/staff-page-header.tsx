"use client";

import { UsersRound } from "lucide-react";
import type { StaffManagementDTO } from "@/server/supabase/dal";

type StaffPageHeaderProps = {
  staffManagement: StaffManagementDTO;
};

export function StaffPageHeader({ staffManagement }: StaffPageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h1 className="font-outfit font-extrabold text-2xl sm:text-3xl text-foreground tracking-tight flex items-center gap-2.5">
          <UsersRound className="w-7 h-7 text-primary" />
          Staff
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
          Staff access for <span className="font-semibold text-foreground">{staffManagement.storeName}</span>.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
        <div className="min-w-28 rounded-lg border border-border bg-card px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Active</p>
          <p className="mt-0.5 text-lg font-black text-foreground tabular-nums">{staffManagement.counts.activeCashiers}</p>
        </div>
        <div className="min-w-28 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">Pending</p>
          <p className="mt-0.5 text-lg font-black text-foreground tabular-nums">{staffManagement.counts.pendingInvites}</p>
        </div>
        <div className="min-w-28 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">Suspended</p>
          <p className="mt-0.5 text-lg font-black text-foreground tabular-nums">{staffManagement.counts.suspendedCashiers}</p>
        </div>
        <div className="min-w-28 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Access</p>
          <p className="mt-0.5 text-lg font-black text-foreground tabular-nums">{staffManagement.counts.activeDelegations}</p>
        </div>
      </div>
    </div>
  );
}
