"use client";

import { Clock3, KeyRound } from "lucide-react";
import type { ActivePrivilegeDelegation } from "@/lib/store/types";
import { formatStaffPrivilege } from "@/lib/staff-capabilities";

type InventoryDelegationNoticeProps = {
  delegation: ActivePrivilegeDelegation;
};

export function InventoryDelegationNotice({ delegation }: InventoryDelegationNoticeProps) {
  const isInventory = delegation.scope === "inventory.adjust";
  const containerClass = isInventory
    ? "border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-200"
    : "border-sky-500/20 bg-sky-500/10 text-sky-800 dark:text-sky-200";

  return (
    <div className={`flex flex-col gap-2 rounded-lg border px-4 py-3 text-xs shadow-sm sm:flex-row sm:items-center sm:justify-between ${containerClass}`}>
      <div className="flex items-center gap-2 font-semibold">
        <KeyRound className="h-4 w-4 shrink-0" />
        <span>Temporary access: {formatStaffPrivilege(delegation.scope)}</span>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] font-medium">
        <Clock3 className="h-3.5 w-3.5 shrink-0" />
        <span>
          Until {new Date(delegation.expires_at).toLocaleTimeString("en-NP", {
            timeZone: "Asia/Kathmandu",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}
